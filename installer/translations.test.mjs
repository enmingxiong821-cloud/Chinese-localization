import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const table = JSON.parse(
  readFileSync(new URL('./translations/zh-Hans.overrides.json', import.meta.url), 'utf8')
);

// 品牌名、产品名与模型名一律保留官方英文原文，不译。这些键是从表里剔除过的，
// 列在这里是为了挡住将来重新合并上游译文包时再被带回来。
const BRAND_KEYS = {
  LftgYRq5hB: 'Anthropic',
  'vCeNCCZA+t': 'Bash',
  'sS42/B0p76': 'Chrome',
  '/5QNPTXJM2': 'Haiku',
  '19jg7N7dJK': 'Sonnet',
  lDLuhpAPUD: 'Opus',
  wDQllQfqj7: 'JetBrains',
  XLcCrGQnFu: 'Linear',
  'TAdJClZA/A': 'Notion',
  Z9SEbF2UCN: 'OAuth',
  OqRO5NHy0c: 'PowerPoint',
  '/Z1NW3qKj6': 'Python',
  sjzDbuQbES: 'Slack',
  'm5CvOs/NyD': 'TikTok',
  '5M+YdqOWGS': 'URL',
  bWjdfaXOzU: 'URL',
  XnimdQTczU: 'Windows',
  kkjl2vQekD: 'Max',
  xwEc8KM8zK: 'API',
  'K+aAq20s6w': 'Amazon Bedrock',
  c1LGvG2F3D: 'Claude Opus 4',
  UfB5Krvt4G: 'Windows (x64)',
  t0clKd0XbN: 'Windows (arm64)',
};

test('译文表顶层是扁平对象，值均为非空字符串', () => {
  assert.equal(Array.isArray(table), false);
  for (const [key, value] of Object.entries(table)) {
    assert.equal(typeof value, 'string', `键 ${key} 的值不是字符串`);
    assert.ok(value.length > 0, `键 ${key} 的值是空串`);
  }
});

test('品牌名与模型名不被译成中文，回落官方英文原文', () => {
  const violated = Object.entries(BRAND_KEYS)
    .filter(([key]) => Object.hasOwn(table, key))
    .map(([key, name]) => `${name}（键 ${key} → ${table[key]}）`);
  assert.deepEqual(violated, [], `以下品牌/模型名不应出现在译文表里：\n${violated.join('\n')}`);
});
