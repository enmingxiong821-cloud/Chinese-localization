/**
 * 第 4 步：对**已成型的译文表**做独立结构审计（不依赖中间产物），用来给一次补译收尾。
 *
 * 用法：node project/tools/audit-table.mjs
 *
 * 报出：主表覆盖条数、含 ICU plural/select 的条数、中文与英文逐字节相同的条数、
 * 占位符签名不一致、HTML 标签数不一致、printf 变量数不一致，以及动态词典覆盖。
 * 覆盖率与安装门禁另由 installer/install-cli.mjs verify 负责，本脚本不重复那部分。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateOfficialPackage, readBaseCatalog, readDynamicCatalog } from '../../installer/install-plan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = locateOfficialPackage().packageRoot;

const base = readBaseCatalog(pkg);
const dyn = readDynamicCatalog(pkg);
const table = JSON.parse(fs.readFileSync(path.join(REPO, 'installer/translations/zh-Hans.overrides.json'), 'utf8'));
const tableDyn = JSON.parse(fs.readFileSync(path.join(REPO, 'installer/translations/zh-Hans.dynamic.json'), 'utf8'));

function icuBlocks(text) {
  const blocks = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') { depth -= 1; if (depth === 0) { blocks.push(text.slice(i, j + 1)); i = j; break; } }
    }
  }
  return blocks;
}
const roots = t => { const s = new Set(); for (const b of icuBlocks(t)) { const m = /^\{\s*([A-Za-z0-9_]+)/.exec(b); if (m) s.add(m[1]); } return s; };
const tags = t => [...t.matchAll(/<\/?[a-zA-Z][^>]*>/g)].map(m => m[0].replace(/\s+/g, ' '));
const printf = t => [...t.matchAll(/%[sdif@%]|%\d+\$[sdif@]/g)].map(m => m[0]);

const pairs = Object.entries(table).filter(([key]) => Object.prototype.hasOwnProperty.call(base, key));

let icu = 0, same = 0, sameAscii = 0;
const rootMismatch = [], tagMismatch = [], printfMismatch = [];

for (const [key, zh] of pairs) {
  const en = base[key];
  if (/\{[A-Za-z0-9_]+\s*,\s*(plural|select)\b/.test(en)) icu += 1;
  if (zh === en) {
    same += 1;
    if (!/[一-鿿]/.test(zh) && /^[\x20-\x7e]*$/.test(zh)) sameAscii += 1;
  }
  const a = roots(en), b = roots(zh);
  const miss = [...a].filter(x => !b.has(x)), extra = [...b].filter(x => !a.has(x));
  if (miss.length || extra.length) rootMismatch.push(`${key}  英 ${JSON.stringify(en).slice(0, 70)}  中 ${JSON.stringify(zh).slice(0, 70)}`);
  if (tags(en).length !== tags(zh).length) tagMismatch.push(`${key}  ${JSON.stringify(en).slice(0, 60)} / ${JSON.stringify(zh).slice(0, 60)}`);
  const pa = printf(en), pb = printf(zh);
  if (pa.length !== pb.length) printfMismatch.push(`${key}  ${JSON.stringify(en).slice(0, 60)} / ${JSON.stringify(zh).slice(0, 60)}`);
}

const dynPairs = Object.entries(tableDyn).filter(([key]) => Object.prototype.hasOwnProperty.call(dyn, key));

console.log(`主表覆盖 ${pairs.length} 条`);
console.log(`含 ICU plural/select ${icu} 条`);
console.log(`中文与英文逐字节相同 ${same} 条（其中纯 ASCII ${sameAscii}）`);
console.log(`占位符签名不一致 ${rootMismatch.length} 条`); rootMismatch.slice(0, 10).forEach(s => console.log('  ' + s));
console.log(`HTML 标签数不一致 ${tagMismatch.length} 条`); tagMismatch.slice(0, 10).forEach(s => console.log('  ' + s));
console.log(`printf 变量数不一致 ${printfMismatch.length} 条`); printfMismatch.slice(0, 10).forEach(s => console.log('  ' + s));
console.log(`动态表覆盖 ${dynPairs.length} / ${Object.keys(dyn).length}`);
