/** 按模块及键映射候选语言资源；不修改应用、不打包VSIX、不执行扩展。 */
import { readResourceSet } from '../scanner.mjs';
import { validateTranslation } from './translation-quality.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function mapNls(keys, messages) {
  if (!Array.isArray(keys) || !Array.isArray(messages) || !messages.every(item => typeof item === 'string')) throw new Error('NLS结构不合法');
  const entries = [];
  for (const item of keys) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !item[0] || !Array.isArray(item[1])) throw new Error('NLS模块结构不合法');
    for (const key of item[1]) {
      if (typeof key !== 'string' || !key) throw new Error('NLS键不合法');
      entries.push({ module: item[0], key, source: messages[entries.length] });
    }
  }
  if (entries.length !== messages.length) throw new Error('NLS键与消息数量不一致');
  return entries;
}

export function composePack(entries, base) {
  if (!record(base?.contents)) throw new Error('语言包缺少contents对象');
  const contents = Object.create(null);
  const pending = [];
  let accepted = 0;
  let unchanged = 0;
  let missing = 0;
  let rejected = 0;
  const groups = new Map();
  for (const entry of entries) {
    const identity = JSON.stringify([entry.module, entry.key]);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(entry);
  }
  let conflicts = 0;
  for (const group of groups.values()) {
    const entry = group[0];
    if (group.some(item => item.source !== entry.source)) {
      conflicts++;
      rejected++;
      pending.push({ ...entry, reason: 'source-conflict', sources: [...new Set(group.map(item => item.source))] });
      continue;
    }
    const module = Object.hasOwn(base.contents, entry.module) ? base.contents[entry.module] : null;
    const found = record(module) && Object.hasOwn(module, entry.key);
    const target = found ? module[entry.key] : undefined;
    const quality = found ? validateTranslation(entry.source, target) : { valid: false, reason: 'missing' };
    if (quality.valid) {
      contents[entry.module] ??= Object.create(null);
      contents[entry.module][entry.key] = target;
      accepted++;
      if (quality.unchanged) unchanged++;
    } else {
      if (found) rejected++; else missing++;
      pending.push({ ...entry, reason: quality.reason });
    }
  }
  return {
    translation: { '': ['Derived from Microsoft vscode-loc, MIT License; see THIRD-PARTY-LICENSE.txt.', 'Candidate only: requires semantic and application validation.'], version: '1.0.0', contents },
    pending,
    coverage: { total: groups.size, indexedMessages: entries.length, duplicatePositions: entries.length - groups.size, conflicts, accepted, unchanged, missing, rejected, acceptedRatio: groups.size ? accepted / groups.size : 0, meaning: '唯一键匹配且通过规则校验的比例，不是界面中文覆盖率' }
  };
}

export async function buildCursorCandidate(installRoot, languageRoot) {
  const source = await readResourceSet(installRoot, ['resources/app/package.json', 'resources/app/out/nls.keys.json', 'resources/app/out/nls.messages.json']);
  const language = await readResourceSet(languageRoot, ['package.json', 'translations/main.i18n.json']);
  if ([...source, ...language].some(file => file.status !== 'read')) throw new Error('资源读取不完整，停止生成');
  const baseManifest = language[0].json;
  const contribution = baseManifest?.contributes?.localizations;
  if (baseManifest?.publisher !== 'MS-CEINTL' || baseManifest?.name !== 'vscode-language-pack-zh-hans' || !Array.isArray(contribution) || !contribution.some(item => item.languageId === 'zh-cn' && item.translations?.some(translation => translation.id === 'vscode' && translation.path === './translations/main.i18n.json'))) throw new Error('不是预期的微软简体中文语言包');
  const engine = baseManifest.engines?.vscode;
  if (typeof engine !== 'string' || !/^\^\d+\.\d+\.\d+$/.test(engine)) throw new Error('引擎版本需人工确认');
  const result = composePack(mapNls(source[1].json, source[2].json), language[1].json);
  const fingerprints = [...source, ...language].map(({ path, sha256, bytes }, index) => ({ origin: index < source.length ? 'cursor' : 'language-pack', path, sha256, bytes }));
  return {
    ...result,
    manifest: { name: 'cursor-zh-candidate', displayName: 'Cursor 简体中文候选资源（未验证）', publisher: 'localization-local', version: '0.0.1', private: true, engines: { vscode: engine }, categories: ['Language Packs'], contributes: { localizations: [{ languageId: 'zh-cn', languageName: 'Chinese Simplified', localizedLanguageName: '简体中文（候选）', translations: [{ id: 'vscode', path: './translations/main.i18n.json' }] }] } },
    report: { schemaVersion: 1, status: 'candidate-not-install-verified', cursorVersion: source[0].json?.version ?? null, baseVersion: baseManifest.version, engineRangeInherited: engine, provenance: 'Microsoft/vscode-loc, installed MS-CEINTL Simplified Chinese pack', fingerprints, coverage: result.coverage, notes: ['未复制其他扩展译文。', '同键不证明英文语义未变化，所有译文需要语义和运行时审核。', '未命中和规则拒绝条目不填入英文冒充中文。', '尚未核验Cursor对应VSCode版本与继承引擎范围的兼容性。'] }
  };
}
