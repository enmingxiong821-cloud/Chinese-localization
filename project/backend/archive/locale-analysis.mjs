/** 静态证据分析，不执行目标代码；只识别已观察到的明确模式。 */
export function analyzeLocaleLoader(text) {
  if (typeof text !== 'string') throw new TypeError('需要代码文本');
  const lists = [];
  const seen = new Set();
  for (const match of text.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)=(\["en-US"(?:,"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*")+\])/g)) {
    const locales = JSON.parse(match[2]);
    const signature = JSON.stringify(locales);
    if (!seen.has(signature)) {
      seen.add(signature);
      lists.push({ locales, offset: match.index });
    }
  }
  return {
    schemaVersion: 1,
    status: lists.length ? 'static-evidence-only' : 'unrecognized-review-required',
    languageLists: lists,
    chineseListed: lists.length ? lists.some(list => list.locales.some(locale => /^zh(?:-|$)/i.test(locale))) : null,
    localeStorageKeyObserved: /localStorage\.getItem\(f_\)/.test(text) && /f_="spa:locale"/.test(text),
    basePathObserved: text.includes('base:"/i18n/"'),
    dynamicPathObserved: text.includes('dynamic:"/i18n/dynamic/"'),
    overridesPathObserved: text.includes('.overrides.json'),
    pageCatalogSourceObserved: text.includes('meta[name="i18n-catalogs"]') && text.includes('dataset.i18nCatalogs'),
    notes: ['仅分析字面量，不证明运行时可达性或所有语言来源。', '未识别模式不得推断为没有国际化能力。']
  };
}
