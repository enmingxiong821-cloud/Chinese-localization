import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpDirAsync } from '../tmp-fixtures.mjs';
import { publishCandidate } from './candidate-artifacts.mjs';
import { draftFor, loadReviewSource, mergeApprovedReview, validateReviewDraft } from './review-decisions.mjs';

async function fixture(app, items) {
  const parent = await tmpDirAsync('review-decisions-');
  const files = app === 'cursor'
    ? { 'coverage.json': JSON.stringify({ coverage: { accepted: 1 } }), 'pending.json': JSON.stringify(items) }
    : { 'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 3 } }, { counts: { unchanged: 0 } }] }), 'desktop.review.json': JSON.stringify(items), 'frontend.review.json': '[]', 'desktop.zh-CN.json': JSON.stringify(Object.fromEntries(items.map(item => [item.key, item.target]))), 'frontend.zh-CN.json': '{}' };
  return publishCandidate(parent, `${app}-`, app, files);
}

test('默认草稿全未审核，批准译文不会产生可安装状态', async () => {
  const dir = await fixture('cursor', [{ module: 'm', key: 'k', source: 'Hello {0}', reason: 'missing' }]);
  const source = await loadReviewSource(dir);
  const draft = draftFor(source);
  assert.deepEqual(validateReviewDraft(source, draft).counts, { unreviewed: 1, approved: 0, rejected: 0, deferred: 0 });
  draft.entries[0].decision = 'approved';
  draft.entries[0].target = '你好 {0}';
  assert.deepEqual(validateReviewDraft(source, draft), { valid: true, app: 'cursor', candidateManifestSha256: source.manifestHash, counts: { unreviewed: 0, approved: 1, rejected: 0, deferred: 0 }, allDecided: true, installable: false, applicationVerified: false });
});

test('拒绝占位符缺失、空译文与冲突键批准', async () => {
  const dir = await fixture('cursor', [
    { module: 'm', key: 'a', source: 'Count {0}', reason: 'missing' },
    { module: 'm', key: 'b', source: 'One', sources: ['One', 'Two'], reason: 'source-conflict' }
  ]);
  const source = await loadReviewSource(dir);
  const draft = draftFor(source);
  draft.entries[0].decision = 'approved';
  assert.throws(() => validateReviewDraft(source, draft), /译文校验失败/);
  draft.entries[0].target = '数量';
  assert.throws(() => validateReviewDraft(source, draft), /protected-token-mismatch/);
  draft.entries[0].target = '数量 {0}';
  draft.entries[1].decision = 'approved';
  draft.entries[1].target = '一';
  assert.throws(() => validateReviewDraft(source, draft), /原文冲突项/);
  draft.entries[1].decision = 'deferred';
  assert.equal(validateReviewDraft(source, draft).counts.deferred, 1);
});

test('拒绝版本变化、重复身份、顺序与异常决策', async () => {
  const source = await loadReviewSource(await fixture('claude', [
    { key: 'a', source: 'Save', target: '保存', status: 'page-review-required', origin: 'bundled-zh-Hans' },
    { key: 'b', source: 'Cancel', target: '取消', status: 'page-review-required', origin: 'starter-glossary' }
  ]));
  const draft = draftFor(source);
  assert.equal(draft.entries.length, 2);
  draft.candidateManifestSha256 = '0'.repeat(64);
  assert.throws(() => validateReviewDraft(source, draft), /版本/);
  draft.candidateManifestSha256 = source.manifestHash;
  draft.entries.reverse();
  assert.throws(() => validateReviewDraft(source, draft), /无效/);
  draft.entries.reverse();
  draft.entries[1].id = draft.entries[0].id;
  assert.throws(() => validateReviewDraft(source, draft), /无效/);
  draft.entries[1].id = source.rows[1].id;
  draft.entries[0].decision = 'installed';
  assert.throws(() => validateReviewDraft(source, draft), /无效/);
});

test('候选文件变动后源数据无法读取，不能验证旧审核', async () => {
  const dir = await fixture('claude', [{ key: 'x', source: 'Save', target: '保存', status: 'page-review-required', origin: 'starter-glossary' }]);
  const source = await loadReviewSource(dir);
  assert.equal(validateReviewDraft(source, draftFor(source)).valid, true);
  await writeFile(path.join(dir, 'desktop.review.json'), '[]');
  await assert.rejects(loadReviewSource(dir), /校验失败/);
});

test('源清单拒绝重复身份与格式异常', async () => {
  const dir = await fixture('cursor', [
    { module: 'm', key: 'k', source: 'A', reason: 'missing' },
    { module: 'm', key: 'k', source: 'B', reason: 'missing' }
  ]);
  await assert.rejects(loadReviewSource(dir), /身份重复/);
});

test('Claude审核行必须和候选资源同键同译文', async () => {
  const parent = await tmpDirAsync('review-mismatch-');
  const dir = await publishCandidate(parent, 'claude-', 'claude', {
    'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 0 } }, { counts: { unchanged: 0 } }] }),
    'desktop.review.json': JSON.stringify([{ key: 'k', source: 'Save', target: '保存', status: 'review', origin: 'fixture' }]),
    'frontend.review.json': '[]', 'desktop.zh-CN.json': JSON.stringify({ k: '删除' }), 'frontend.zh-CN.json': '{}'
  });
  await assert.rejects(loadReviewSource(dir), /与候选资源不一致/);
});

test('超过单条和总草稿边界的候选不能生成默认草稿', async () => {
  const one = Array.from({ length: 1 }, (_, i) => ({ module: 'm', key: String(i), source: 'x', reason: 'missing' }));
  const tooLong = await fixture('cursor', one);
  const tooLongRows = await loadReviewSource(tooLong);
  tooLongRows.rows[0].proposedTarget = '译'.repeat(10001);
  assert.throws(() => draftFor(tooLongRows), /长度限制/);
  const many = Array.from({ length: 9000 }, (_, i) => ({ module: 'm', key: String(i), source: 'x'.repeat(1000), reason: 'missing' }));
  const tooLarge = await fixture('cursor', many);
  const largeSource = await loadReviewSource(tooLarge);
  largeSource.rows.forEach(row => { row.proposedTarget = '译'.repeat(1000); });
  assert.throws(() => draftFor(largeSource), /超过8 MiB/);
});

test('Claude仅合并批准译文并保留审计记录，源候选不变', async () => {
  const parent = await tmpDirAsync('review-merge-');
  const dir = await publishCandidate(parent, 'claude-', 'claude', {
    'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 1 } }, { counts: { unchanged: 1 } }] }),
    'desktop.review.json': JSON.stringify([
      { key: 'save', source: 'Save', target: '保存', status: 'review', origin: 'fixture' },
      { key: 'cancel', source: 'Cancel', target: '取消', status: 'review', origin: 'fixture' }
    ]),
    'frontend.review.json': '[]',
    'desktop.zh-CN.json': JSON.stringify({ save: '保存', cancel: '取消' }),
    'frontend.zh-CN.json': '{}'
  });
  const sourceBefore = await readFile(path.join(dir, 'desktop.zh-CN.json'), 'utf8');
  const source = await loadReviewSource(dir);
  const draft = draftFor(source);
  draft.entries[0].decision = 'approved';
  draft.entries[0].target = '保存文件';
  draft.entries[1].decision = 'deferred';
  const result = await mergeApprovedReview(dir, draft);
  assert.equal(JSON.parse(result.files.get('desktop.zh-CN.json').toString()).save, '保存文件');
  assert.equal(JSON.parse(result.files.get('desktop.zh-CN.json').toString()).cancel, '取消');
  assert.deepEqual(JSON.parse(result.files.get('desktop.approved.json').toString()).approved.map(item => item.key), ['save']);
  const audit = JSON.parse(result.files.get('merge-audit.json').toString());
  assert.equal(audit.approved.length, 1);
  assert.equal(audit.decisions.deferred, 1);
  assert.equal(result.installable, false);
  assert.equal(await readFile(path.join(dir, 'desktop.zh-CN.json'), 'utf8'), sourceBefore);
});

test('Cursor回写未实现时拒绝自动合并', async () => {
  const dir = await fixture('cursor', [{ module: 'm', key: 'k', source: 'Save', reason: 'missing' }]);
  const source = await loadReviewSource(dir);
  const draft = draftFor(source);
  draft.entries[0].decision = 'approved';
  draft.entries[0].target = '保存';
  await assert.rejects(mergeApprovedReview(dir, draft), /回写未实现/);
});

test('没有批准项时拒绝生成无效合并结果', async () => {
  const dir = await fixture('claude', [{ key: 'k', source: 'Save', target: '保存', status: 'review', origin: 'fixture' }]);
  const source = await loadReviewSource(dir);
  await assert.rejects(mergeApprovedReview(dir, draftFor(source)).then(result => {
    if (!result.approvedApplied) throw new Error('没有已批准的译文可合并');
  }), /没有已批准的译文可合并/);
});
