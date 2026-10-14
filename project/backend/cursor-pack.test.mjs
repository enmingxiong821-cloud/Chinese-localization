import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNls, composePack } from './cursor-pack.mjs';
import { validateTranslation } from './translation-quality.mjs';
import { readResourceSet } from './scanner.mjs';

test('顺序映射模块及键，保留相同英文不同语境', () => {
  assert.deepEqual(mapNls([['a', ['k']], ['b', ['k']]], ['Open', 'Open']), [ { module: 'a', key: 'k', source: 'Open' }, { module: 'b', key: 'k', source: 'Open' } ]);
});
test('数量错位与非法键拒绝', () => {
  for (const keys of [[['a', [2]]], [['a', ['k']]]]) assert.throws(() => mapNls(keys, ['One', 'Two']));
});
test('占位符允许重排但保护重复次数和图标', () => {
  assert.equal(validateTranslation('Open {0} ({1})', '（{1}）打开 {0}').valid, true);
  assert.equal(validateTranslation('{0} {0}', '{0}').valid, false);
  assert.equal(validateTranslation('$(gear) Settings %1$s', '$(gear) 设置 %1$s').valid, true);
  assert.equal(validateTranslation('$(gear)', '$(设置)').valid, false);
  assert.equal(validateTranslation('${path} {{name}} %s', '${path} {{name}} %d').valid, false);
});
test('标签、换行、空白、过长与ICU必须处理', () => {
  assert.equal(validateTranslation('<b>Hello</b>\n{0}', '<b>你好</b>\n{0}').valid, true);
  assert.equal(validateTranslation('Hi\n', '你好').valid, false);
  assert.equal(validateTranslation('Hello', '  ').valid, false);
  assert.equal(validateTranslation('Hi', '译'.repeat(301)).valid, false);
  assert.equal(validateTranslation('{n, plural, one {one} other {many}}', '{n, plural, one {一个} other {多个}}').reason, 'icu-review-required');
});
test('覆盖率区分接受、不变、缺失与拒绝，不回填原文', () => {
  const entries = mapNls([['m', ['a', 'b', 'c', 'd']]], ['Hello', 'API', '{0}', 'Missing']);
  const result = composePack(entries, { contents: { m: { a: '你好', b: 'API', c: '损坏' } } });
  assert.deepEqual(result.coverage, { total: 4, indexedMessages: 4, duplicatePositions: 0, conflicts: 0, accepted: 2, unchanged: 1, missing: 1, rejected: 1, acceptedRatio: .5, meaning: '唯一键匹配且通过规则校验的比例，不是界面中文覆盖率' });
  assert.equal(result.translation.contents.m.c, undefined);
  assert.equal(result.pending.length, 2);
});
test('原型键作为数据处理，无继承键匹配', () => {
  const result = composePack(mapNls([['__proto__', ['constructor']]], ['Hello']), JSON.parse('{"contents":{"__proto__":{"constructor":"你好"}}}'));
  assert.equal(result.translation.contents.__proto__.constructor, '你好');
  assert.equal({}.polluted, undefined);
  assert.equal(composePack(mapNls([['m', ['toString']]], ['Hello']), { contents: { m: {} } }).coverage.missing, 1);
});
test('空输入和语言包结构', () => {
  assert.equal(composePack([], { contents: {} }).coverage.acceptedRatio, 0);
  assert.throws(() => composePack([], { contents: [] }));
});
test('受控资源入口拒绝路径穿越与绝对路径', async () => {
  for (const relative of ['../x', 'a/../x', '/etc/passwd', 'C:/file', 'a\\b']) await assert.rejects(readResourceSet(process.cwd(), [relative]));
});
test('相同重复键合并，冲突键全部排除', () => {
  const entries = mapNls([['m', ['a', 'a', 'b', 'b']]], ['Same', 'Same', 'One', 'Two']);
  const result = composePack(entries, { contents: { m: { a: '相同', b: '一个' } } });
  assert.equal(result.coverage.total, 2);
  assert.equal(result.coverage.duplicatePositions, 2);
  assert.equal(result.coverage.accepted, 1);
  assert.equal(result.coverage.conflicts, 1);
  assert.equal(result.translation.contents.m.b, undefined);
  assert.deepEqual(result.pending[0].sources, ['One', 'Two']);
});
