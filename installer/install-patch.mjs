/**
 * 四处补丁的纯文本变换：输入字符串、输出字符串，不读写磁盘，便于单测。
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

/**
 * 从 text[at] 起读一个完整的 JSON 值，返回 [原文, 结束下标]；读不出来返回 null。
 * 不能只认带引号的字符串：真实的 locale 可能是 null，认不出就会走到「插入」分支而造出重复键。
 */
function readJsonValue(text, at) {
  const rest = text.slice(at);
  const string = /^"(?:[^"\\]|\\.)*"/.exec(rest);
  if (string) return [string[0], at + string[0].length];
  const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(rest);
  if (literal) return [literal[0], at + literal[0].length];
  if (rest[0] !== '{' && rest[0] !== '[') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return [rest.slice(0, i + 1), at + i + 1];
    }
  }
  return null;
}

/** 找到最外层那个 locale 字段的值区间。返回 null 表示没有这个字段。 */
function locateLocaleValue(text) {
  LOCALE_KEY.lastIndex = 0;
  let match;
  while ((match = LOCALE_KEY.exec(text)) !== null) {
    if (!isTopLevel(text, match.index)) continue;
    const after = match.index + match[0].length;
    const colon = /^\s*:\s*/.exec(text.slice(after));
    if (!colon) continue;
    const at = after + colon[0].length;
    const found = readJsonValue(text, at);
    if (found) return { at, end: found[1], raw: found[0] };
  }
  return null;
}

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
  const found = locateLocaleValue(text);
  return found ? JSON.parse(found.raw) : null;
}

/**
 * 文本级改写 locale 一个字段，其余字节原样保留（这个配置对象里还有大量无关字段，
 * 整文件重排会把它们的格式一起动掉）。字段不存在时在最外层对象开头补一个。
 * 返回 null 表示这段文本不是可改的对象。
 */
export function setLocale(text, value) {
  const encoded = JSON.stringify(value);
  const found = locateLocaleValue(text);
  if (found) {
    return {
      text: `${text.slice(0, found.at)}${encoded}${text.slice(found.end)}`,
      mode: 'replaced',
      previous: JSON.parse(found.raw)
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
