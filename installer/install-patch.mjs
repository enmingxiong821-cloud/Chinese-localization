/**
 * 三处补丁的纯文本变换：输入字符串、输出字符串，不读写磁盘，便于单测。
 * 全部按"改前先判是否已改过"来写，重复执行不会叠加。
 */
import {
  HTML_ANCHOR,
  HTML_INJECT,
  LOCALE_ARRAY,
  TARGET_LOCALE
} from './install-plan.mjs';

/** 以官方 en-US 词典为底座套用译文表。只覆盖底座已有的键，底座的键序与其余值原样保留。 */
export function buildCatalog(baseCatalog, overrides) {
  const catalog = {};
  let applied = 0;
  for (const key of Object.keys(baseCatalog)) {
    const value = baseCatalog[key];
    const override = overrides[key];
    if (typeof value === 'string' && typeof override === 'string') {
      catalog[key] = override;
      applied += 1;
    } else {
      catalog[key] = value;
    }
  }
  return { catalog, applied };
}

export const serializeCatalog = catalog => JSON.stringify(catalog, null, 2);

/**
 * 给语言白名单数组追加 zh-Hans。锚点已在 install-plan 里定义，这里只保证：
 * 已含 zh-Hans 的不重复追加，并把命中数与追加数报出来给门禁核对。
 */
export function patchWhitelist(source, locale = TARGET_LOCALE) {
  let count = 0;
  let appended = 0;
  const text = source.replace(LOCALE_ARRAY, match => {
    count += 1;
    if (match.includes(`"${locale}"`)) return match;
    appended += 1;
    return `${match.slice(0, -1)},"${locale}"]`;
  });
  return { text, count, appended, changed: appended > 0 };
}

/** 在 <meta charset> 之后插入目录注册与 localStorage 钉语言。已存在则原样返回。 */
export function patchHtml(source, inject = HTML_INJECT) {
  if (source.includes('data-i18n-catalogs')) return { text: source, changed: false, alreadyDone: true };
  const match = HTML_ANCHOR.exec(source);
  if (!match) return { text: source, changed: false, alreadyDone: false, anchored: false };
  const at = match.index + match[0].length;
  return { text: `${source.slice(0, at)}${inject}${source.slice(at)}`, changed: true, alreadyDone: false, anchored: true };
}

const LOCALE_KEY = /"locale"/g;
const LOCALE_VALUE = /^"locale"\s*:\s*("(?:[^"\\]|\\.)*")/;

/** 判断某个下标是否处于最外层对象里（深度 1），避免改到嵌套的同名字段。 */
function isTopLevel(text, index) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < index; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth -= 1;
  }
  return depth === 1;
}

export function readLocale(text) {
  LOCALE_KEY.lastIndex = 0;
  let match;
  while ((match = LOCALE_KEY.exec(text)) !== null) {
    const field = LOCALE_VALUE.exec(text.slice(match.index));
    if (field && isTopLevel(text, match.index)) return JSON.parse(field[1]);
  }
  return null;
}

/**
 * 文本级改写 locale 一个字段，其余字节原样保留（这个文件是官方 app 也在读的共享文件，
 * 整文件重排会把无关内容一起动掉）。字段不存在时在最外层对象开头补一个。
 * 返回 null 表示这段文本不是可改的对象。
 */
export function setLocale(text, value) {
  const encoded = JSON.stringify(value);
  LOCALE_KEY.lastIndex = 0;
  let match;
  while ((match = LOCALE_KEY.exec(text)) !== null) {
    const field = LOCALE_VALUE.exec(text.slice(match.index));
    if (!field || !isTopLevel(text, match.index)) continue;
    const start = match.index + field[0].length - field[1].length;
    const end = start + field[1].length;
    return {
      text: `${text.slice(0, start)}${encoded}${text.slice(end)}`,
      mode: 'replaced',
      previous: JSON.parse(field[1])
    };
  }
  const brace = text.indexOf('{');
  if (brace === -1) return null;
  const rest = text.slice(brace + 1);
  const separator = rest.replace(/^\s*/, '').startsWith('}') ? '' : ',';
  return {
    text: `${text.slice(0, brace + 1)}"locale":${encoded}${separator}${rest}`,
    mode: 'inserted',
    previous: null
  };
}
