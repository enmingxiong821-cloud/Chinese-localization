import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { composeClaudeResource, buildClaudeCandidate } from './claude-candidate.mjs';

test('常用短文案翻译，未知内容完整保留并单独统计', () => {
  const result = composeClaudeResource({ settings: 'Settings', chat: 'New chat', dynamic: 'Hello {name}' });
  assert.equal(result.translation.settings, '设置');
  assert.equal(result.translation.chat, '新建对话');
  assert.equal(result.translation.dynamic, 'Hello {name}');
  assert.deepEqual(result.counts, { total: 3, matched: 2, unchanged: 1, nonString: 0 });
  assert.equal(result.review[0].status, 'page-review-required');
});
test('只精确匹配，不翻译子串或内部标识', () => {
  const result = composeClaudeResource({ a: 'Settings panel', b: 'settings', c: 'Copy {0}', d: '$(gear)' });
  assert.equal(result.counts.matched, 0);
  assert.equal(result.translation.c, 'Copy {0}');
});
test('特殊键保留为数据，不影响对象原型', () => {
  const result = composeClaudeResource(JSON.parse('{"__proto__":"Settings","constructor":"Save"}'));
  assert.equal(result.translation.__proto__, '设置');
  assert.equal(result.translation.constructor, '保存');
  assert.equal(Object.getPrototypeOf(result.translation), null);
});
test('非法结构停止，空资源不虚构覆盖', () => {
  for (const value of [null, [], 'text', { nested: {} }]) assert.throws(() => composeClaudeResource(value));
  assert.equal(composeClaudeResource({}).counts.total, 0);
});
test('不同键同文案分别保留审核条目', () => {
  const result = composeClaudeResource({ a: 'Cancel', b: 'Cancel' });
  assert.equal(result.review.length, 2);
  assert.equal(Object.keys(result.translation).length, 2);
});
test('拒绝相对安装路径', async () => {
  await assert.rejects(buildClaudeCandidate('.'));
});
test('优先原生译文，缺失时回退起始词典', () => {
  const result = composeClaudeResource({ a: 'Preferences', b: 'Save', c: 'API' }, { a: '首选项', c: 'API' });
  assert.equal(result.translation.a, '首选项');
  assert.equal(result.translation.b, '保存');
  assert.equal(result.provenance.nativeAccepted, 1);
  assert.equal(result.provenance.glossaryAccepted, 1);
  assert.equal(result.provenance.nativeUnchanged, 1);
});
test('损坏原生占位符保留原文并报告，非法中文结构拒绝', () => {
  const result = composeClaudeResource({ a: 'Hello {0}', b: 'Save' }, { a: '你好', b: 7 });
  assert.equal(result.translation.a, 'Hello {0}');
  assert.equal(result.translation.b, '保存');
  assert.equal(result.provenance.nativeRejected, 2);
  assert.equal(result.issues.length, 2);
  assert.throws(() => composeClaudeResource({}, []));
});
test('报告英文资源中缺失的原生中文键', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'claude-candidate-'));
  await mkdir(path.join(root, 'resources/ion-dist/i18n'), { recursive: true });
  await writeFile(path.join(root, 'resources/en-US.json'), JSON.stringify({ a: 'Cancel', b: 'Settings', c: 'Only English' }));
  await writeFile(path.join(root, 'resources/zh-Hans.json'), JSON.stringify({ a: '取消' }));
  await writeFile(path.join(root, 'resources/ion-dist/i18n/en-US.json'), JSON.stringify({ x: 'Cancel' }));
  const result = await buildClaudeCandidate(root);
  const desktop = result.resources[0];
  assert.equal(desktop.missingNative.length, 2);
  assert.equal(desktop.missingNative.some(item => item.source === 'Settings'), true);
  assert.equal(result.resources[1].missingNative.length, 0);
});
