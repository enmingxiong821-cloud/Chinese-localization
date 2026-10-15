import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishCandidate } from './candidate-artifacts.mjs';
import { createCandidateReview, renderReview } from './candidate-review.mjs';

test('报告转义资源内容且不包含可执行脚本', () => {
  const html = renderReview('cursor', [{ title: '<img src=x>', summary: '&', rows: [{ key: '"x"', displaySource: '<script>alert(1)</script>', proposedTarget: '<svg onload=x>', reason: 'missing' }] }]);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;svg onload=x&gt;'), '候选译文列必须真的渲染出内容，字段名写错会静默变空');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes("default-src 'none'"));
});
test('Cursor审核只呈现真实待处理条目', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'candidate-review-'));
  const dir = await publishCandidate(root, 'cursor-', 'cursor', { 'coverage.json': JSON.stringify({ coverage: { accepted: 1 } }), 'pending.json': JSON.stringify([{ module: 'm', key: 'k', source: 'Hello', reason: 'missing' }]) });
  const result = await createCandidateReview(dir);
  assert.equal(result.rows, 1);
  assert.ok(result.html.includes('Hello'));
  await writeFile(path.join(dir, 'pending.json'), '[]');
  await assert.rejects(createCandidateReview(dir), /校验失败/);
});
test('Claude报告包含两组候选及原文保留计数', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'candidate-review-'));
  const dir = await publishCandidate(root, 'claude-', 'claude', { 'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 2 } }, { counts: { unchanged: 3 } }] }), 'desktop.review.json': JSON.stringify([{ key: 'k', source: 'Save', target: '保存', status: 'page-review-required', origin: 'starter-glossary' }]), 'frontend.review.json': '[]', 'desktop.zh-CN.json': JSON.stringify({ k: '保存' }), 'frontend.zh-CN.json': '{}' });
  const result = await createCandidateReview(dir);
  assert.equal(result.rows, 1);
  assert.ok(result.html.includes('保存'));
  assert.ok(result.html.includes('原文保留 3 条'));
});

test('编辑页安全保留译文开头换行', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'candidate-review-newline-'));
  const dir = await publishCandidate(root, 'claude-', 'claude', { 'report.json': JSON.stringify({ resources: [{ counts: { unchanged: 0 } }, { counts: { unchanged: 0 } }] }), 'desktop.review.json': JSON.stringify([{ key: 'k', source: '\nHello', target: '\n你好', status: 'review', origin: 'fixture' }]), 'frontend.review.json': '[]', 'desktop.zh-CN.json': JSON.stringify({ k: '\n你好' }), 'frontend.zh-CN.json': '{}' });
  const result = await createCandidateReview(dir);
  assert.ok(result.html.includes('&#10;你好</textarea>'));
});
