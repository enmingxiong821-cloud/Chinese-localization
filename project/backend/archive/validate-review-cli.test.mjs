import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishCandidate } from './candidate-artifacts.mjs';
import { loadReviewSource, draftFor, assertSameCandidateVersion } from './review-decisions.mjs';

const run = promisify(execFile);
const CLI = fileURLToPath(new URL('./validate-review-cli.mjs', import.meta.url));

async function fixture() {
  const parent = await mkdtemp(path.join(tmpdir(), 'review-cli-'));
  return publishCandidate(parent, 'claude-', 'claude', {
    'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 0 } }, { counts: { unchanged: 0 } }] }),
    'desktop.review.json': JSON.stringify([{ key: 'k', source: 'Hello {0}', target: '你好 {0}', status: 'review', origin: 'fixture' }]),
    'frontend.review.json': '[]',
    'desktop.zh-CN.json': JSON.stringify({ k: '你好 {0}' }),
    'frontend.zh-CN.json': '{}'
  });
}

async function invoke(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('草稿生成绑定当前清单哈希且默认全未审核', async () => {
  const candidate = await fixture();
  const source = await loadReviewSource(candidate);
  const draftPath = path.join(path.dirname(candidate), 'review.json');
  await writeFile(draftPath, JSON.stringify(draftFor(source), null, 2));
  const freshSource = await loadReviewSource(candidate);
  assert.equal(freshSource.manifestHash, source.manifestHash);
  const written = JSON.parse(await readFile(draftPath, 'utf8'));
  assert.equal(written.candidateManifestSha256, source.manifestHash);
  assert.equal(written.entries[0].decision, 'unreviewed');
});

test('版本比较函数在清单哈希变化时拒绝', async () => {
  const source = await loadReviewSource(await fixture());
  const latest = { manifestHash: '0'.repeat(64) };
  assert.notEqual(source.manifestHash, latest.manifestHash);
  assert.throws(() => assertSameCandidateVersion(source, latest), /校验期间候选版本发生变化/);
});

test('实际CLI对合法草稿退出0并报告不可安装', async () => {
  const candidate = await fixture();
  const draftPath = path.join(path.dirname(candidate), 'valid.json');
  await writeFile(draftPath, JSON.stringify(draftFor(await loadReviewSource(candidate)), null, 2));
  const result = await invoke([candidate, draftPath]);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.valid, true);
  assert.equal(payload.installable, false);
  assert.equal(payload.applicationVerified, false);
  assert.deepEqual(payload.counts, { unreviewed: 1, approved: 0, rejected: 0, deferred: 0 });
});

test('实际CLI对占位符缺失的批准项退出2', async () => {
  const candidate = await fixture();
  const draft = draftFor(await loadReviewSource(candidate));
  draft.entries[0].decision = 'approved';
  draft.entries[0].target = '你好';
  const draftPath = path.join(path.dirname(candidate), 'bad.json');
  await writeFile(draftPath, JSON.stringify(draft, null, 2));
  const result = await invoke([candidate, draftPath]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /protected-token-mismatch/);
  assert.equal(JSON.parse(result.stderr).installable, false);
});

test('实际CLI对参数不足或相对路径退出2', async () => {
  const candidate = await fixture();
  assert.equal((await invoke([])).code, 2);
  assert.equal((await invoke([candidate])).code, 2);
  assert.equal((await invoke(['relative', path.join(candidate, 'x.json')])).code, 2);
});
