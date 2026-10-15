/**
 * 语言资源枚举与缺口报告（层 B 桌面壳 + 层 C 前端 SPA）。
 * 只读：不改安装目录、不改 locale、不碰 asar。骨架生成只产出候选，不安装。
 */
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { hashFile, readBoundedFile, sha256 } from '../safe-io.mjs';
import { locateAppRoot } from '../scanner.mjs';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_LOCALE_FILES = 256;
const BOM = /^\uFEFF/;

export const SHELL_DIR = 'resources';
export const FRONTEND_DIR = 'resources/ion-dist/i18n';
export const BASE_LOCALE = 'en-US';

/** 伪本地化标记。出现即证明该字符串来自注入的资源文件，而非 bundle 里的英文。 */
export const PROBE_MARKER = '[ZH] ';

/** URL、绝对路径、锚点、扩展名开头的一律不动。 */
const NOT_DISPLAY_PREFIX = /^(https?:\/\/|\/|[A-Za-z]:[\\/]|#|\.)/;
/** 纯数字、日期、分隔符。 */
const NOT_DISPLAY_ONLY = /^[\d\s.,:%/-]+$/;

/**
 * 保守判据：只标记"看起来是展示文本"的值。
 * 既没有空格、又不以大写字母开头的（`asc`、`left`、`en-US`）多半是枚举、路由或比较键，
 * 改了会破坏行为，一律跳过。宁可漏标几个按钮，不可改坏一处逻辑。
 */
export function looksLikeDisplayText(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 2 || text.length > 120) return false;
  if (NOT_DISPLAY_PREFIX.test(text) || NOT_DISPLAY_ONLY.test(text)) return false;
  if (!/\s/.test(text) && !/^[A-Z]/.test(text)) return false;
  return true;
}

/**
 * 给疑似展示文本加标记前缀，其余值原样保留（包括非字符串值）。
 * `__proto__` 这类键名必须用 defineProperty：直接赋值会改到原型上。
 */
export function pseudolocalize(values, marker = PROBE_MARKER) {
  if (typeof marker !== 'string' || marker.length === 0) throw new Error('标记不能为空');
  const output = {};
  let marked = 0;
  for (const [key, value] of Object.entries(values)) {
    const next = looksLikeDisplayText(value) ? marker + value : value;
    if (next !== value) marked += 1;
    Object.defineProperty(output, key, { value: next, enumerable: true, writable: true, configurable: true });
  }
  return { values: output, marked, skipped: Object.keys(values).length - marked };
}

/** 顶层 *.json；不递归。资源目录里混着 asar、vhdx、exe，递归枚举会被预算直接打回。 */
async function listTopLevelJsonFiles(root, relativeDir) {
  const entries = await readdir(path.join(root, ...relativeDir.split('/')), { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`语言资源不是普通文件：${relativeDir}/${entry.name}`);
    names.push(entry.name);
  }
  if (names.length > MAX_LOCALE_FILES) throw new Error(`语言资源文件数超过 ${MAX_LOCALE_FILES}`);
  return names.sort();
}

/** de-DE.overrides.json → { locale: 'de-DE', kind: 'overrides' } */
function classify(name) {
  if (name.endsWith('.overrides.json')) return { locale: name.slice(0, -'.overrides.json'.length), kind: 'overrides' };
  return { locale: name.slice(0, -'.json'.length), kind: 'base' };
}

async function readJsonAsset(root, relative) {
  const bytes = await readBoundedFile(path.join(root, ...relative.split('/')), MAX_FILE_BYTES);
  let json;
  try { json = JSON.parse(bytes.toString('utf8').replace(BOM, '')); } catch { throw new Error(`语言资源JSON无效：${relative}`); }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) throw new Error(`语言资源不是键值对象：${relative}`);
  const keys = Object.keys(json).sort();
  return { bytes: bytes.length, sha256: sha256(bytes), keys, nonString: keys.filter(key => typeof json[key] !== 'string').length };
}

async function enumerateShell(root) {
  const locales = [];
  for (const name of await listTopLevelJsonFiles(root, SHELL_DIR)) {
    const relative = `${SHELL_DIR}/${name}`;
    const { bytes, sha256: digest } = await hashFile(path.join(root, ...relative.split('/')), MAX_FILE_BYTES);
    locales.push({ locale: classify(name).locale, path: relative, bytes, sha256: digest });
  }
  return { dir: SHELL_DIR, locales };
}

/**
 * 前端层的 locale 名单与桌面壳层不是同一份：壳层发 43 个，前端只发一个固定子集。
 * 因此「缺 zh-Hans」不是文件没拷进去，而是它根本不在前端发布名单里——报告要把这点说清楚。
 */
async function enumerateFrontend(root) {
  const paths = [];
  const bases = [];
  const overrides = new Map();
  for (const name of await listTopLevelJsonFiles(root, FRONTEND_DIR)) {
    const relative = `${FRONTEND_DIR}/${name}`;
    paths.push(relative);
    const { locale, kind } = classify(name);
    const asset = await readJsonAsset(root, relative);
    if (kind === 'overrides') overrides.set(locale, asset);
    else bases.push({ locale, path: relative, ...asset });
  }
  const dynamic = [];
  for (const name of await listTopLevelJsonFiles(root, `${FRONTEND_DIR}/dynamic`)) {
    const relative = `${FRONTEND_DIR}/dynamic/${name}`;
    paths.push(relative);
    dynamic.push({ locale: classify(name).locale, path: relative, ...await readJsonAsset(root, relative) });
  }
  const base = bases.find(entry => entry.locale === BASE_LOCALE);
  if (!base) throw new Error(`前端层缺少基准语言 ${BASE_LOCALE}，无法比对键集`);
  const baseKeys = new Set(base.keys);
  const shellOfKeys = keys => sha256(Buffer.from(keys.join('\n'), 'utf8'));
  const locales = bases.map(entry => {
    const keys = new Set(entry.keys);
    const dynamicEntry = dynamic.find(item => item.locale === entry.locale);
    const overridesEntry = overrides.get(entry.locale);
    return {
      locale: entry.locale,
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
      keyCount: entry.keys.length,
      nonString: entry.nonString,
      missingFromBase: [...baseKeys].filter(key => !keys.has(key)).length,
      extraVersusBase: [...keys].filter(key => !baseKeys.has(key)).length,
      keySetSha256: shellOfKeys(entry.keys),
      overrides: overridesEntry ? { path: `${FRONTEND_DIR}/${entry.locale}.overrides.json`, bytes: overridesEntry.bytes, sha256: overridesEntry.sha256, keyCount: overridesEntry.keys.length, outsideBase: overridesEntry.keys.filter(key => !baseKeys.has(key)).length } : null,
      dynamic: dynamicEntry ? { path: dynamicEntry.path, bytes: dynamicEntry.bytes, sha256: dynamicEntry.sha256, keyCount: dynamicEntry.keys.length, sharedWithBase: dynamicEntry.keys.filter(key => baseKeys.has(key)).length } : null
    };
  });
  return {
    dir: FRONTEND_DIR,
    baseLocale: BASE_LOCALE,
    basePath: base.path,
    baseBytes: base.bytes,
    baseKeyCount: base.keys.length,
    baseKeySetSha256: shellOfKeys(base.keys),
    baseKeysWithNamespacePrefix: base.keys.filter(key => key.startsWith('++')).length,
    locales,
    paths
  };
}

export async function enumerateLocaleResources(packageRoot, options = {}) {
  const target = options.target ?? 'zh-Hans';
  const appRoot = await locateAppRoot(packageRoot);
  const shell = await enumerateShell(appRoot);
  const frontend = await enumerateFrontend(appRoot);
  const shellLocales = new Set(shell.locales.map(entry => entry.locale));
  const frontendLocales = new Set(frontend.locales.map(entry => entry.locale));
  const present = new Set([...shell.locales.map(entry => entry.path), ...frontend.paths]);
  const required = [
    `${FRONTEND_DIR}/${target}.json`,
    `${FRONTEND_DIR}/${target}.overrides.json`,
    `${FRONTEND_DIR}/dynamic/${target}.json`
  ];
  return {
    schemaVersion: 1,
    target,
    appRoot,
    shell: {
      dir: shell.dir,
      locales: shell.locales.map(entry => entry.locale),
      count: shell.locales.length,
      hasTarget: shellLocales.has(target),
      targetPath: shellLocales.has(target) ? `${SHELL_DIR}/${target}.json` : null,
      files: shell.locales
    },
    frontend: {
      ...frontend,
      hasTarget: frontendLocales.has(target),
      // 壳层有、前端没有的语言，才是前端发布名单的真实缺口
      missingVersusShell: [...shellLocales].filter(locale => !frontendLocales.has(locale)).sort(),
      missingVersusShellCount: [...shellLocales].filter(locale => !frontendLocales.has(locale)).length
    },
    targetFiles: required.map(relative => ({ path: relative, present: present.has(relative) })),
    notes: [
      '前端键名是短哈希，不含语义；译文正确性只能回到页面上审核。',
      `层 C 发布名单是固定子集（${frontend.locales.length} 个），与层 B 的 ${shell.locales.length} 个不是同一份。`,
      'overrides 是主键集的子集，作为订正层，键必须已存在于主键集。',
      '本报告只读，未修改安装目录、locale、asar 或签名。'
    ]
  };
}

/**
 * 结构对齐骨架：键与基准语言一一对应，值一律保留英文原文。
 * 这不是译文，只保证结构占位正确；counts.translated 恒为 0。
 */
export async function buildLocaleSkeleton(packageRoot, target = 'zh-Hans') {
  if (typeof target !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*$/.test(target)) throw new Error('目标语言标识非法');
  const appRoot = await locateAppRoot(packageRoot);
  const report = await enumerateLocaleResources(packageRoot, { target });
  if (report.frontend.hasTarget) throw new Error(`前端层已存在 ${target}，骨架会覆盖既有资源，停止`);
  const read = async relative => JSON.parse((await readBoundedFile(path.join(appRoot, ...relative.split('/')), MAX_FILE_BYTES)).toString('utf8').replace(BOM, ''));
  const main = await read(report.frontend.basePath);
  const dynamicPath = `${FRONTEND_DIR}/dynamic/${BASE_LOCALE}.json`;
  const dynamic = await read(dynamicPath);
  const mainKeys = Object.keys(main).sort();
  const dynamicKeys = Object.keys(dynamic).sort();
  const files = {
    [`${FRONTEND_DIR}/${target}.json`]: JSON.stringify(Object.fromEntries(mainKeys.map(key => [key, main[key]])), null, 2) + '\n',
    [`${FRONTEND_DIR}/${target}.overrides.json`]: '{}\n',
    [`${FRONTEND_DIR}/dynamic/${target}.json`]: JSON.stringify(Object.fromEntries(dynamicKeys.map(key => [key, dynamic[key]])), null, 2) + '\n'
  };
  return {
    files,
    counts: { mainKeys: mainKeys.length, dynamicKeys: dynamicKeys.length, overridesKeys: 0, translated: 0 },
    base: { mainPath: report.frontend.basePath, baseKeySetSha256: report.frontend.baseKeySetSha256, dynamicPath },
    report
  };
}

/**
 * 伪本地化探针候选：结构同骨架，但给疑似展示文本加标记前缀。
 *
 * 存在的理由是骨架有个致命缺陷——值全是英文，注入成功与失败在界面上完全一样，
 * 看到英文页面根本无法判断是链路没通还是译文没填。打了标记之后，
 * 界面出现标记即同时证明「locale 切到了目标语言」和「值确实来自本文件」。
 * 顺带暴露哪些界面文本压根不走 catalog（硬编码在 bundle 里）。
 *
 * counts.translated 恒为 0：标记不是译文，这个候选不能当汉化成果。
 */
export async function buildProbeCandidate(packageRoot, target = 'zh-Hans', marker = PROBE_MARKER) {
  const skeleton = await buildLocaleSkeleton(packageRoot, target);
  const main = pseudolocalize(JSON.parse(skeleton.files[`${FRONTEND_DIR}/${target}.json`]), marker);
  const dynamic = pseudolocalize(JSON.parse(skeleton.files[`${FRONTEND_DIR}/dynamic/${target}.json`]), marker);
  return {
    marker,
    files: {
      [`${FRONTEND_DIR}/${target}.json`]: JSON.stringify(main.values, null, 2) + '\n',
      [`${FRONTEND_DIR}/${target}.overrides.json`]: '{}\n',
      [`${FRONTEND_DIR}/dynamic/${target}.json`]: JSON.stringify(dynamic.values, null, 2) + '\n'
    },
    counts: {
      ...skeleton.counts,
      marked: main.marked + dynamic.marked,
      skipped: main.skipped + dynamic.skipped,
      translated: 0
    },
    base: skeleton.base
  };
}
