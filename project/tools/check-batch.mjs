/**
 * 第 2 步：校验译文结果，并产出可直接并入译文表的 accepted.json。
 *
 * 用法：node project/tools/check-batch.mjs <工作目录>
 *   工作目录里要有 export-gaps.mjs 产出的 jin<N>.jsonl，以及翻译回填的 jout<N>.jsonl。
 *   jout<N>.jsonl 每行 { k, zh }，或 { k, skip: "<类别>" } 表示判为保留英文。
 *
 * 判据（任一条不合即计入错误，写进报告）：
 *   占位符根名集一致          少一个多一个都算错
 *   ICU 精确分支 =N 保留      丢掉会让「=2」这类分支退回 other，语义出错
 *   ICU select 分支关键字保留 只对真正的 select 块比对；plural 的 one 按约定本来就要丢
 *   HTML 标签数一致
 *   译文非空、且不含裸制表符／换行
 *   译文与英文逐字节相同 → 应改成 SKIP 而不是翻译
 *   中文汉字：译文若无汉字又不等于英文，说明没翻干净
 *   品牌/模型名键（brand-keys.json）不得被翻
 *   键不得重复、不得超出本批输入、不得已存在于现有译文表
 *
 * 另外列出「可疑 SKIP」：不含品牌/路径特征、且英文只有 ≤3 个词，值得人工复核。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '../..');
const BATCHES = 4;

const OUT = process.argv[2] && path.resolve(process.argv[2]);
if (!OUT) {
  console.error('用法：node project/tools/check-batch.mjs <工作目录>');
  process.exit(1);
}

/** 取出所有 {…} 片段（含嵌套），返回最外层内容列表。 */
function icuBlocks(text) {
  const blocks = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    for (let j = i; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) { blocks.push(text.slice(i, j + 1)); i = j; break; }
      }
    }
  }
  return blocks;
}

/** 占位符根名集合：{name}、{count, plural, …} 都取第一个标识符。 */
function roots(text) {
  const set = new Set();
  for (const block of icuBlocks(text)) {
    const m = /^\{\s*([A-Za-z0-9_]+)/.exec(block);
    if (m) set.add(m[1]);
  }
  return set;
}

const exactBranches = text => new Set([...text.matchAll(/=\d+/g)].map(m => m[0]));
const htmlTags = text => [...text.matchAll(/<\/?[a-zA-Z][^>]*>/g)].map(m => m[0].replace(/\s+/g, ' '));

/** 顶层分支关键字：块内 depth 0 处紧贴 `{` 的那个标识符。 */
function branchKeywords(block) {
  const inner = block.slice(1, -1);
  const set = new Set();
  let depth = 0;
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '{') {
      let j = i - 1;
      while (j >= 0 && /\s/.test(inner[j])) j -= 1;
      const end = j;
      while (j >= 0 && /[A-Za-z0-9_]/.test(inner[j])) j -= 1;
      if (depth === 0 && end > j) set.add(inner.slice(j + 1, end + 1));
      depth += 1;
    } else if (inner[i] === '}') depth -= 1;
  }
  return set;
}

/** 只对真正的 ICU select 块取分支关键字（plural 的 one 本条约定要丢，不参与比对）。 */
const selectKeywords = text => {
  const set = new Set();
  for (const block of icuBlocks(text)) {
    if (!/^\{\s*[A-Za-z0-9_]+\s*,\s*select\s*,/.test(block)) continue;
    for (const k of branchKeywords(block)) set.add(k);
  }
  return set;
};

/** 看起来就是该保留原样的英文：品牌/路径/URL/标识符/纯数字。 */
const looksUntranslatable = en =>
  /^[\s\W\d]*$/.test(en) ||
  /^[\x20-\x7e]*$/.test(en) === false && /[一-鿿]/.test(en) ||
  /^(https?:\/\/|www\.|[\w.+-]+@)/.test(en.trim()) ||
  /^[~/$\\]/.test(en.trim()) ||
  /\.(json|js|mjs|exe|cmd|zip|md|yml|yaml|log|txt|sh|ps1)$/.test(en.trim());

const table = JSON.parse(fs.readFileSync(path.join(REPO, 'installer/translations/zh-Hans.overrides.json'), 'utf8'));
const brandKeys = new Set(JSON.parse(fs.readFileSync(path.join(TOOLS, 'brand-keys.json'), 'utf8')));

let totalErrors = 0;
const summary = [];
const accepted = new Map();
const suspiciousSkips = [];

for (let b = 1; b <= BATCHES; b += 1) {
  const inFile = path.join(OUT, `jin${b}.jsonl`);
  const outFile = path.join(OUT, `jout${b}.jsonl`);
  if (!fs.existsSync(inFile)) { summary.push(`batch${b}: 无输入（缺口不足 4 批时正常）`); continue; }
  if (!fs.existsSync(outFile)) { summary.push(`batch${b}: 结果文件尚未生成`); continue; }

  const source = new Map();
  for (const line of fs.readFileSync(inFile, 'utf8').trim().split('\n')) {
    const o = JSON.parse(line);
    source.set(o.k, o.en);
  }

  const errors = [];
  const seen = new Set();
  let skipped = 0;
  let malformed = 0;

  for (const line of fs.readFileSync(outFile, 'utf8').trim().split('\n')) {
    const before = errors.length;
    let o;
    try { o = JSON.parse(line); } catch { malformed += 1; errors.push(`非法 JSON 行：${line.slice(0, 60)}`); continue; }
    if (!o.k) { errors.push(`缺 k 字段：${line.slice(0, 60)}`); continue; }
    if (!source.has(o.k)) errors.push(`未知键 ${o.k}（不属于本批输入）`);
    if (seen.has(o.k)) errors.push(`重复键 ${o.k}`);
    seen.add(o.k);
    const en = source.get(o.k) ?? '';
    if (o.skip !== undefined) {
      skipped += 1;
      if (!o.skip) errors.push(`skip 未写类别 ${o.k}`);
      if (!looksUntranslatable(en) && en.trim().split(/\s+/).length <= 3 && /^[A-Za-z]/.test(en.trim())) {
        suspiciousSkips.push(`${o.k}\t${JSON.stringify(en)}\t${o.skip}`);
      }
      continue;
    }
    if (typeof o.zh !== 'string') { errors.push(`zh 不是字符串 ${o.k}`); continue; }
    const zh = o.zh;
    if (!zh.trim()) errors.push(`空译文 ${o.k}`);
    const enRoots = roots(en);
    const zhRoots = roots(zh);
    for (const r of enRoots) if (!zhRoots.has(r)) errors.push(`占位符丢失 {${r}} ← ${o.k}`);
    for (const r of zhRoots) if (!enRoots.has(r)) errors.push(`占位符多出 {${r}} ← ${o.k}`);
    for (const e of exactBranches(en)) if (!exactBranches(zh).has(e)) errors.push(`ICU 精确分支 ${e} 丢失 ← ${o.k}`);
    for (const k of selectKeywords(en)) if (!selectKeywords(zh).has(k)) errors.push(`ICU 分支关键字 ${k} 丢失 ← ${o.k}`);
    const enTags = htmlTags(en);
    const zhTags = htmlTags(zh);
    if (enTags.length !== zhTags.length) errors.push(`HTML 标签数不符（英 ${enTags.length} / 中 ${zhTags.length}）← ${o.k}`);
    if (zh === en) errors.push(`译文与英文完全相同（本应 SKIP）← ${o.k}`);
    if (brandKeys.has(o.k)) errors.push(`把品牌/模型名键译了 ← ${o.k}`);
    if (table[o.k] !== undefined) errors.push(`键已在现有译文表里 ← ${o.k}`);
    if (!/[一-鿿]/.test(zh) && zh.trim() !== en.trim()) errors.push(`译文无汉字但又不等于英文 ← ${o.k}`);
    if (errors.length === before) accepted.set(o.k, zh);
  }
  for (const key of source.keys()) if (!seen.has(key)) errors.push(`结果缺少键 ${key}`);

  summary.push(`batch${b}: 输入 ${source.size}，结果行 ${seen.size}${malformed ? `（非法 ${malformed}）` : ''}，译文 ${seen.size - skipped}，SKIP ${skipped}，错误 ${errors.length}`);
  if (errors.length) {
    totalErrors += errors.length;
    console.log(`\n--- batch${b} 前 30 条问题 ---`);
    errors.slice(0, 30).forEach(e => console.log('  ' + e));
  }
}

console.log('\n' + summary.join('\n'));
console.log('错误合计', totalErrors, '｜ 可用译文', accepted.size);

if (suspiciousSkips.length) {
  console.log(`\n--- 值得复核的 SKIP（≤3 个英文词、非路径/URL）共 ${suspiciousSkips.length} 条 ---`);
  suspiciousSkips.slice(0, 60).forEach(s => console.log('  ' + s));
}

if (accepted.size) {
  fs.writeFileSync(
    path.join(OUT, 'accepted.json'),
    `${JSON.stringify(Object.fromEntries([...accepted].sort((a, c) => (a[0] < c[0] ? -1 : 1))), null, 2)}\n`,
    'utf8'
  );
  console.log(`\n已写出 accepted.json（${accepted.size} 条）`);
}
