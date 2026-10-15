import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalog,
  patchHtml,
  patchWhitelist,
  readLocale,
  serializeCatalog,
  setLocale
} from './install-patch.mjs';

const ARRAY = '["en-US","de-DE","es-ES","fr-FR","id-ID"]';

test('buildCatalog 只覆盖底座已有的键，未命中键保留英文', () => {
  const base = { a: 'Alpha', b: 'Beta' };
  const { catalog, applied } = buildCatalog(base, { a: '甲', c: '丙' });
  assert.deepEqual(catalog, { a: '甲', b: 'Beta' });
  assert.equal(applied, 1);
});

test('buildCatalog 保留底座的键序', () => {
  const base = { z: 'Z', a: 'A' };
  const { catalog } = buildCatalog(base, { a: '甲' });
  assert.deepEqual(Object.keys(catalog), ['z', 'a']);
});

test('serializeCatalog 用两空格缩进', () => {
  assert.equal(serializeCatalog({ a: '甲' }), '{\n  "a": "甲"\n}');
});

test('patchWhitelist 两处各追加一次 zh-Hans', () => {
  const source = `var w_=${ARRAY};var M_=${ARRAY};`;
  const result = patchWhitelist(source);
  assert.equal(result.count, 2);
  assert.equal(result.appended, 2);
  assert.equal(result.text, `var w_=["en-US","de-DE","es-ES","fr-FR","id-ID","zh-Hans"];var M_=["en-US","de-DE","es-ES","fr-FR","id-ID","zh-Hans"];`);
});

test('patchWhitelist 已含 zh-Hans 时幂等', () => {
  const once = patchWhitelist(`x=${ARRAY};y=${ARRAY};`).text;
  const twice = patchWhitelist(once);
  assert.equal(twice.appended, 0);
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once);
  assert.equal((twice.text.match(/"zh-Hans"/g) || []).length, 2);
});

test('patchWhitelist 锚点不匹配时不做任何改动', () => {
  const source = 'var w_=["en-US","ja-JP"];';
  const result = patchWhitelist(source);
  assert.equal(result.count, 0);
  assert.equal(result.text, source);
});

test('patchHtml 插在 charset 之后且保持其余字节', () => {
  const source = '<head><meta charset="UTF-8"><meta name="viewport" content="w"></head>';
  const result = patchHtml(source, '<INJECT>');
  assert.equal(result.text, '<head><meta charset="UTF-8"><INJECT><meta name="viewport" content="w"></head>');
  assert.equal(result.changed, true);
});

test('patchHtml 幂等', () => {
  const source = '<head><meta charset="utf-8"><meta name="i18n-catalogs" data-i18n-catalogs="zh-Hans:x.y.z"></head>';
  const result = patchHtml(source, '<INJECT>');
  assert.equal(result.alreadyDone, true);
  assert.equal(result.text, source);
});

test('patchHtml 没有 charset 锚点时报告未命中', () => {
  const result = patchHtml('<head><title>t</title></head>', '<INJECT>');
  assert.equal(result.anchored, false);
  assert.equal(result.changed, false);
});

test('readLocale 读最外层 locale', () => {
  assert.equal(readLocale('{\n  "locale": "en-US",\n  "x": 1\n}'), 'en-US');
});

test('readLocale 忽略嵌套的 locale', () => {
  assert.equal(readLocale('{\n  "inner": { "locale": "fr-FR" }\n}'), null);
});

test('setLocale 只改值，其余字节不动', () => {
  const source = '{\n  "locale": "en-US",\n  "x": 1\n}\n';
  const result = setLocale(source, 'zh-Hans');
  assert.equal(result.mode, 'replaced');
  assert.equal(result.previous, 'en-US');
  assert.equal(result.text, '{\n  "locale": "zh-Hans",\n  "x": 1\n}\n');
});

test('setLocale 不碰嵌套的同名字段', () => {
  const source = '{\n  "inner": { "locale": "fr-FR" },\n  "locale": "en-US"\n}';
  const result = setLocale(source, 'zh-Hans');
  assert.equal(result.text, '{\n  "inner": { "locale": "fr-FR" },\n  "locale": "zh-Hans"\n}');
});

test('setLocale 字段缺失时在开头补一个', () => {
  const result = setLocale('{\n  "x": 1\n}', 'zh-Hans');
  assert.equal(result.mode, 'inserted');
  assert.equal(result.previous, null);
  assert.deepEqual(JSON.parse(result.text), { locale: 'zh-Hans', x: 1 });
});

test('setLocale 把 null 值就地替换掉，不造出重复键', () => {
  const source = '{\n  "locale": null,\n  "x": 1\n}';
  const result = setLocale(source, 'zh-Hans');
  assert.equal(result.mode, 'replaced');
  assert.deepEqual(JSON.parse(result.text), { locale: 'zh-Hans', x: 1 });
  assert.equal(result.text.match(/"locale"/g).length, 1, '重复键会让 JSON.parse 取到旧值，语言设置静默失效');
});

test('readLocale 读得出非字符串的 locale', () => {
  assert.equal(readLocale('{ "locale": null }'), null);
  assert.equal(readLocale('{ "locale": 1 }'), 1);
});

test('setLocale 字段缺失且空对象时不留下多余逗号', () => {
  const result = setLocale('{}', 'zh-Hans');
  assert.equal(result.text, '{"locale":"zh-Hans"}');
  assert.deepEqual(JSON.parse(result.text), { locale: 'zh-Hans' });
});

test('setLocale 返回值可被 JSON.parse 还原为期望对象', () => {
  const source = '{"locale":"en-US","a":{"b":[1,2,"loc\\"ale"]}}';
  const result = setLocale(source, 'zh-Hans');
  assert.deepEqual(JSON.parse(result.text), { locale: 'zh-Hans', a: { b: [1, 2, 'loc"ale'] } });
});
