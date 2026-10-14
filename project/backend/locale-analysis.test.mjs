import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLocaleLoader } from './locale-analysis.mjs';

test('识别已观察的字面量集合并去重', () => {
  const result = analyzeLocaleLoader('var a=["en-US","ja-JP"];var b=["en-US","ja-JP"];');
  assert.equal(result.languageLists.length, 1);
  assert.equal(result.chineseListed, false);
  assert.equal(result.status, 'static-evidence-only');
});
test('中文集合与资源路径证据', () => {
  const result = analyzeLocaleLoader('var x=["en-US","zh-Hans"]; const r={base:"/i18n/",dynamic:"/i18n/dynamic/",file:".overrides.json"};');
  assert.equal(result.chineseListed, true);
  assert.equal(result.basePathObserved, true);
  assert.equal(result.dynamicPathObserved, true);
  assert.equal(result.overridesPathObserved, true);
});
test('未识别结构不冒充不支持中文，不执行输入', () => {
  const result = analyzeLocaleLoader('throw new Error("must not execute"); const supported=getLanguages();');
  assert.equal(result.chineseListed, null);
  assert.equal(result.status, 'unrecognized-review-required');
  assert.throws(() => analyzeLocaleLoader(null), TypeError);
});
test('静态白名单不代表排除页面目录中的额外语言', () => {
  const result = analyzeLocaleLoader('var a=["en-US","ja-JP"]; document.querySelector(\'meta[name="i18n-catalogs"]\')?.dataset.i18nCatalogs;');
  assert.equal(result.chineseListed, false);
  assert.equal(result.pageCatalogSourceObserved, true);
});
