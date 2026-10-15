/** 人工文案审核记录；审核结果仅供后续处理，不授权修改或安装应用。 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readCandidatePayload, validateCandidateDirectory } from './candidate-artifacts.mjs';
import { validateTranslation } from './translation-quality.mjs';

const decisions = new Set(['unreviewed', 'approved', 'rejected', 'deferred']);
const MAX_TARGET_LENGTH = 10000;
export const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
export const rowId = parts => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/** 仅从已校验候选生成身份；原文冲突项不允许单键批准。 */
export async function loadReviewSource(directory) {
  const { app } = await validateCandidateDirectory(directory);
  const load = async name => JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  const manifestHash = createHash('sha256').update(await readFile(path.join(directory, 'candidate-integrity.json'))).digest('hex');
  const sections = [];
  if (app === 'cursor') {
    const report = await load('coverage.json');
    const pending = await load('pending.json');
    if (!Array.isArray(pending) || !Number.isSafeInteger(report?.coverage?.accepted)) throw new Error('Cursor 审核清单格式无效');
    sections.push({ name: 'pending', title: 'Cursor 待处理条目', summary: `接受唯一键 ${report.coverage.accepted}；待处理 ${pending.length}。不等于界面覆盖率。已接受条目的原文未随候选保存，本页不伪造其双语对照。`, rows: pending.map(entry => {
      if (typeof entry?.module !== 'string' || typeof entry.key !== 'string' || typeof entry.source !== 'string' || typeof entry.reason !== 'string' || (entry.sources !== undefined && (!Array.isArray(entry.sources) || !entry.sources.every(value => typeof value === 'string')))) throw new Error('Cursor 条目格式无效');
      return { id: rowId([app, 'pending', entry.module, entry.key]), key: `${entry.module} / ${entry.key}`, source: entry.source, displaySource: entry.sources ? entry.sources.join('\n---\n') : entry.source, proposedTarget: '', reason: entry.reason, canApprove: entry.reason !== 'source-conflict' };
    }) });
  } else {
    const report = await load('report.json');
    for (const [index, name] of ['desktop', 'frontend'].entries()) {
      const review = await load(`${name}.review.json`);
      const translation = await load(`${name}.zh-CN.json`);
      const unchanged = report?.resources?.[index]?.counts?.unchanged;
      if (!Array.isArray(review) || !translation || typeof translation !== 'object' || Array.isArray(translation) || !Number.isSafeInteger(unchanged)) throw new Error('Claude 审核清单格式无效');
      sections.push({ name, title: name === 'desktop' ? 'Claude 桌面候选' : 'Claude 前端候选', summary: `候选 ${review.length} 条；原文保留 ${unchanged} 条。逐页语境尚未审核。`, rows: review.map(entry => {
        if (typeof entry?.key !== 'string' || typeof entry.source !== 'string' || typeof entry.target !== 'string' || typeof entry.status !== 'string' || typeof entry.origin !== 'string') throw new Error('Claude 条目格式无效');
        if (!Object.hasOwn(translation, entry.key) || translation[entry.key] !== entry.target) throw new Error('Claude 审核条目与候选资源不一致');
        return { id: rowId([app, name, entry.key]), key: entry.key, source: entry.source, displaySource: entry.source, proposedTarget: entry.target, reason: `${entry.status} / ${entry.origin}`, canApprove: true };
      }) });
    }
  }
  const rows = sections.flatMap(section => section.rows);
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('审核条目身份重复');
  await validateCandidateDirectory(directory, app);
  const source = { app, manifestHash, sections, rows };
  draftFor(source);
  return source;
}

/** 将审核草稿明确批准的译文合并到副本载荷；拒绝、暂缓和未审核条目不写入。 */
export async function mergeApprovedReview(directory, draft) {
  const source = await loadReviewSource(directory);
  const validation = validateReviewDraft(source, draft);
  const payload = await readCandidatePayload(directory, source.app);
  if (payload.manifestHash !== source.manifestHash) throw new Error('合并期间候选版本发生变化');
  const updates = [];
  for (const [index, entry] of draft.entries.entries()) {
    if (entry.decision === 'approved') updates.push({ row: source.rows[index], target: entry.target });
  }
  if (updates.length && source.app === 'cursor') throw new Error('Cursor 回写未实现：pending 已含 module/key 映射，缺的是稳定写回与冲突处理，禁止盲写');
  if (source.app === 'claude') {
    const audit = { schemaVersion: 1, app: source.app, baseCandidateManifestSha256: source.manifestHash, approved: [], decisions: validation.counts, installable: false, applicationVerified: false };
    for (const name of ['desktop', 'frontend']) {
      const resourcePath = `${name}.zh-CN.json`;
      const reviewPath = `${name}.review.json`;
      const resource = JSON.parse(payload.files.get(resourcePath).toString('utf8'));
      const review = JSON.parse(payload.files.get(reviewPath).toString('utf8'));
      const byId = new Map(source.rows.map((row, index) => [row.id, { row, entry: draft.entries[index] }]));
      const touched = [];
      for (const item of review) {
        const id = rowId([source.app, name, item.key]);
        const choice = byId.get(id);
        if (choice?.entry.decision !== 'approved') continue;
        if (resource[item.key] !== item.target) throw new Error(`合并前资源不一致：${name}/${item.key}`);
        const previousTarget = item.target;
        // 用 defineProperty 而非赋值：名为 __proto__ 的键走赋值会命中 Object.prototype 的 setter，静默丢写。
        Object.defineProperty(resource, item.key, { value: choice.entry.target, writable: true, enumerable: true, configurable: true });
        item.target = choice.entry.target;
        item.status = 'human-approved';
        item.origin = 'review-draft';
        touched.push({ key: item.key, source: item.source, from: previousTarget, to: choice.entry.target, reviewerDecision: 'approved' });
      }
      payload.files.set(resourcePath, Buffer.from(JSON.stringify(resource, null, 2) + '\n'));
      payload.files.set(reviewPath, Buffer.from(JSON.stringify(review, null, 2) + '\n'));
      const auditPath = `${name}.approved.json`;
      payload.files.set(auditPath, Buffer.from(JSON.stringify({ schemaVersion: 1, baseCandidateManifestSha256: source.manifestHash, approved: touched, counts: { approved: touched.length } }, null, 2) + '\n'));
      audit.approved.push(...touched.map(item => ({ resource: name, ...item })));
    }
    payload.files.set('merge-audit.json', Buffer.from(JSON.stringify(audit, null, 2) + '\n'));
  }
  const result = { app: source.app, baseCandidateManifestSha256: source.manifestHash, reviewedEntries: validation.counts, approvedApplied: updates.length, installable: false, applicationVerified: false, files: payload.files };
  return result;
}

export function draftFor(source) {
  if (source.rows.some(row => row.proposedTarget.length > MAX_TARGET_LENGTH)) throw new Error('候选译文超出审核草稿长度限制');
  const draft = { schemaVersion: 1, app: source.app, candidateManifestSha256: source.manifestHash,
    entries: source.rows.map(row => ({ id: row.id, decision: 'unreviewed', target: row.proposedTarget })) };
  if (Buffer.byteLength(JSON.stringify(draft, null, 2) + '\n') > MAX_DRAFT_BYTES) throw new Error('候选审核草稿超过8 MiB');
  return draft;
}

export function validateReviewDraft(source, draft) {
  if (!draft || draft.schemaVersion !== 1 || draft.app !== source.app || draft.candidateManifestSha256 !== source.manifestHash || !Array.isArray(draft.entries) || draft.entries.length !== source.rows.length) throw new Error('审核表与候选版本或条目数不匹配');
  const counts = { unreviewed: 0, approved: 0, rejected: 0, deferred: 0 };
  const seen = new Set();
  for (const [index, entry] of draft.entries.entries()) {
    const row = source.rows[index];
    if (!entry || entry.id !== row.id || seen.has(entry.id) || !decisions.has(entry.decision) || typeof entry.target !== 'string' || entry.target.length > MAX_TARGET_LENGTH) throw new Error(`审核表第 ${index + 1} 条无效`);
    seen.add(entry.id);
    if (entry.decision === 'approved') {
      if (!row.canApprove) throw new Error(`原文冲突项不得按单个译文批准：${index + 1}`);
      const quality = validateTranslation(row.source, entry.target);
      if (!quality.valid) throw new Error(`第 ${index + 1} 条译文校验失败：${quality.reason}`);
    }
    counts[entry.decision]++;
  }
  return { valid: true, app: source.app, candidateManifestSha256: source.manifestHash, counts, allDecided: counts.unreviewed === 0, installable: false, applicationVerified: false };
}

export function assertSameCandidateVersion(initial, latest) {
  if (!initial || !latest || initial.manifestHash !== latest.manifestHash) throw new Error('校验期间候选版本发生变化');
  return true;
}
