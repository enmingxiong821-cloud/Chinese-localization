/**
 * 第 3 步：把 check-batch.mjs 产出的 accepted.json 并入译文表。
 *
 * 用法：node project/tools/merge-accepted.mjs <工作目录>
 *
 * 只追加、不重排、不改动已有条目：按原文件的行尾格式在结尾对象括号前插入，因此
 * 现有条目的字节顺序不受影响，git diff 只有新增行。合并前会拦住键冲突与空译文。
 *
 * 「纯模板串」：值里只有占位符（如 {status}）的条目，译出来与英文逐字节相同。
 * 这类本该在 check-batch 阶段就被判成 SKIP，正常不会出现在 accepted.json 里；
 * 这里再挡一次，是 2026-10-16 那轮留下的保险。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TABLE = path.join(REPO, 'installer', 'translations', 'zh-Hans.overrides.json');

const OUT = process.argv[2] && path.resolve(process.argv[2]);
if (!OUT) {
  console.error('用法：node project/tools/merge-accepted.mjs <工作目录>');
  process.exit(1);
}

const NOOP = new Set(['coNyB7K85i', 'd+zsk+GnZE', 'ftEsdibCQz', 'iKF1h55Rp3', 'n4G6f41LZf']);

const raw = fs.readFileSync(TABLE, 'utf8');
const before = JSON.parse(raw);
const accepted = JSON.parse(fs.readFileSync(path.join(OUT, 'accepted.json'), 'utf8'));

const add = Object.entries(accepted).filter(([key]) => !NOOP.has(key));
const collide = add.filter(([key]) => before[key] !== undefined);
if (collide.length) {
  console.error('键冲突，已中止：', collide.slice(0, 5).map(([key]) => key).join(' '));
  process.exit(1);
}
add.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

for (const [, zh] of add) {
  if (typeof zh !== 'string' || !zh.trim()) { console.error('空译文，已中止'); process.exit(1); }
}

const tail = raw.lastIndexOf('\r\n}');
if (tail < 0) { console.error('找不到结尾对象括号，已中止'); process.exit(1); }
const body = raw.slice(0, tail);
const text = body + ',\r\n' + add.map(([key, zh]) => `  ${JSON.stringify(key)}: ${JSON.stringify(zh)}`).join(',\r\n') + '\r\n}\r\n';

const after = JSON.parse(text);
const beforeCount = Object.keys(before).length;
const afterCount = Object.keys(after).length;

fs.writeFileSync(TABLE, text, 'utf8');

console.log(`并入 ${add.length} 条 ｜ ${beforeCount} → ${afterCount}`);
console.log(`译文表 ${TABLE}`);
