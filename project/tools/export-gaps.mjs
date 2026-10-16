/**
 * 第 1 步：导出缺口。把「官方词典里有、译文表里没有」的键切成若干批 JSONL，交给翻译。
 *
 * 用法：node project/tools/export-gaps.mjs [工作目录]
 *   省略工作目录时在系统临时目录新建一个并打印路径。
 *
 * 产出（都在工作目录里，**不进仓库**）：
 *   meta.json    官方版本号、底座键数、缺口数
 *   jin<N>.jsonl 每行 { i, k, en }：序号、哈希键、英文原文
 *
 * 英文原文只落在工作目录，仓库里只存 { 哈希键: 中文 }。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateOfficialPackage, readBaseCatalog } from '../../installer/install-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BATCHES = 4;
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : fs.mkdtempSync(path.join(os.tmpdir(), 'claude-zh-gap-'));

const TABLE = path.join(REPO, 'installer', 'translations', 'zh-Hans.overrides.json');
const table = JSON.parse(fs.readFileSync(TABLE, 'utf8'));

const loc = locateOfficialPackage();
const base = readBaseCatalog(loc.packageRoot);
const missing = Object.keys(base).filter(key => !(key in table)).map(key => ({ key, en: base[key] }));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'meta.json'),
  `${JSON.stringify({ officialVersion: loc.version, baseKeys: Object.keys(base).length, missing: missing.length }, null, 2)}\n`
);

const per = Math.ceil(missing.length / BATCHES) || 1;
for (let b = 0; b < BATCHES; b += 1) {
  const slice = missing.slice(b * per, (b + 1) * per);
  if (!slice.length) continue;
  const lines = slice.map((item, n) => JSON.stringify({ i: b * per + n + 1, k: item.key, en: item.en }));
  fs.writeFileSync(path.join(OUT, `jin${b + 1}.jsonl`), `${lines.join('\n')}\n`, 'utf8');
  console.log(`jin${b + 1}.jsonl  ${slice.length} 条`);
}

console.log(`官方 ${loc.version} ｜ 底座 ${Object.keys(base).length} 键 ｜ 缺口 ${missing.length} 条`);
console.log(`工作目录 ${OUT}`);
