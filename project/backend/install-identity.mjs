/**
 * 安装标识：把「哪一台机器上的哪一个安装」压缩成可比对的一段指纹。
 * 版本或关键文件一变，标识就变，写入门禁据此拒绝。
 * 标识内不含任何绝对路径，因此同一版本在不同机器上得到相同值。
 */
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { assertRealDirectory, hashFile, readBoundedFile, safeRelative, sha256 } from './safe-io.mjs';
import { locateAppRoot } from './scanner.mjs';

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_KEY_FILE_BYTES = 512 * 1024 * 1024;

/**
 * 参与标识的关键文件，路径相对 Electron 应用根。
 * 不含本项目将来会写入的文件（如 ion-dist/i18n/zh-Hans.json），
 * 否则打一次补丁就把标识改掉，恢复时反而认不出来。
 */
export const DEFAULT_KEY_FILES = Object.freeze([
  'resources/app.asar',
  'resources/en-US.json',
  'resources/zh-Hans.json',
  'resources/ion-dist/i18n/en-US.json'
]);

const XML_ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/**
 * 反转义属性值。单趟扫描是关键：&amp;quot; 必须还原成字面量 &quot; 而不是 "，
 * 否则发布者字符串会随实体写法变化，标识也就不稳。
 */
function unescapeXml(value) {
  return value.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (match, name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)));
    return XML_ENTITIES[lower];
  });
}

/** AppxManifest.xml 只按已知属性取字段，不做通用 XML 解析；取不到就留 null 交给门禁拒绝。 */
function readIdentityAttributes(xml) {
  const tag = /<Identity\b[^>]*>/i.exec(xml)?.[0];
  if (!tag) throw new Error('AppxManifest.xml 缺少 Identity 元素');
  const attr = name => {
    const raw = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag)?.[1];
    return raw === undefined ? null : unescapeXml(raw);
  };
  return {
    packageName: attr('Name'),
    packageVersion: attr('Version'),
    publisher: attr('Publisher'),
    architecture: attr('ProcessorArchitecture')
  };
}

/** 单个关键文件的指纹；不存在与不可读分别标记，不抛错，由调用方决定是否算失败。 */
export async function fingerprintFile(appRoot, relative) {
  const full = path.join(appRoot, ...relative.split('/'));
  try {
    const info = await lstat(full);
    if (info.isSymbolicLink() || !info.isFile()) return { path: relative, status: 'not-a-regular-file' };
    const { bytes, sha256: digest } = await hashFile(full, MAX_KEY_FILE_BYTES);
    return { path: relative, status: 'hashed', bytes, sha256: digest };
  } catch (error) {
    return { path: relative, status: error.code === 'ENOENT' ? 'missing' : 'unreadable', code: error.code || 'IO_ERROR' };
  }
}

export async function readInstallIdentity(packageRoot, keyFiles = DEFAULT_KEY_FILES) {
  const root = await assertRealDirectory(packageRoot, '需要安装包根绝对路径');
  if (!Array.isArray(keyFiles) || keyFiles.some(relative => !safeRelative(relative))) throw new Error('关键文件路径非法');
  const xml = (await readBoundedFile(path.join(root, 'AppxManifest.xml'), MAX_MANIFEST_BYTES)).toString('utf8');
  const attributes = readIdentityAttributes(xml);
  const appRoot = await locateAppRoot(root);
  const files = [];
  for (const relative of keyFiles) files.push(await fingerprintFile(appRoot, relative));
  files.sort((left, right) => left.path.localeCompare(right.path));
  // appRoot 只作为可读信息返回，不参与标识：绝对路径进哈希会让标识随安装位置漂移。
  const core = { schemaVersion: 1, ...attributes, files };
  return { ...core, appRoot, identitySha256: sha256(Buffer.from(JSON.stringify(core), 'utf8')) };
}

/** 标识只有在包字段齐全且每个关键文件都成功哈希时才算完整。 */
export function identityComplete(identity) {
  return Boolean(identity)
    && typeof identity.packageName === 'string' && identity.packageName.length > 0
    && typeof identity.packageVersion === 'string' && identity.packageVersion.length > 0
    && Array.isArray(identity.files) && identity.files.length > 0
    && identity.files.every(file => file.status === 'hashed');
}

export function compareIdentity(expected, actual) {
  if (!identityComplete(expected) || !identityComplete(actual)) throw new Error('安装标识不完整，拒绝比对');
  if (expected.identitySha256 !== actual.identitySha256) {
    const drifted = actual.files
      .filter(file => expected.files.find(other => other.path === file.path)?.sha256 !== file.sha256)
      .map(file => file.path);
    throw new Error(`安装版本或关键文件已变化，拒绝写入${drifted.length ? `：${drifted.join('、')}` : ''}`);
  }
  return true;
}
