/** 候选目录完整性清单；校验完整性不代表兼容性或允许安装。 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertRealDirectory, listRegularFiles, readBoundedFile, safeRelative, sha256 } from '../safe-io.mjs';

const MANIFEST = 'candidate-integrity.json';
const STATUS = 'candidate-status.json';
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const LIMITS = { maxFiles: 2048, maxDepth: 16, maxTotalBytes: 64 * 1024 * 1024 };
const STATUS_CONTENT = JSON.stringify({ installable: false, verified: false, reason: 'candidate-not-install-verified' }, null, 2) + '\n';

async function readRegularFile(root, relative) {
  if (!safeRelative(relative)) throw new Error('完整性清单含非法路径');
  return readBoundedFile(path.join(root, ...relative.split('/')), MAX_FILE_BYTES);
}

/** 精确比对文件集、长度和哈希；绝不代表候选允许安装。 */
export async function validateCandidateDirectory(directory, expectedApp) {
  const root = await assertRealDirectory(directory, '需要候选目录绝对路径');
  const manifestBytes = await readRegularFile(root, MANIFEST);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); } catch { throw new Error('完整性清单JSON无效'); }
  if (manifest.schemaVersion !== 1 || !['cursor', 'claude'].includes(manifest.app) || (expectedApp && manifest.app !== expectedApp) || manifest.installable !== false || manifest.integrityVerified !== true || manifest.applicationVerified !== false || !Array.isArray(manifest.files)) throw new Error('完整性清单状态或应用不匹配');
  const expected = new Map();
  for (const file of manifest.files) {
    if (!file || !safeRelative(file.path) || [MANIFEST, STATUS].includes(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256) || expected.has(file.path)) throw new Error('完整性清单条目无效');
    expected.set(file.path, file);
  }
  const actual = await listRegularFiles(root, LIMITS);
  const expectedPaths = [...expected.keys(), MANIFEST, STATUS].sort();
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expectedPaths)) throw new Error('候选目录文件与清单不一致');
  const checked = [];
  for (const [relative, entry] of expected) {
    const bytes = await readRegularFile(root, relative);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`候选文件校验失败：${relative}`);
    checked.push(relative);
  }
  if (!(await readRegularFile(root, STATUS)).equals(Buffer.from(STATUS_CONTENT))) throw new Error('候选状态标记缺失或被修改');
  return { valid: true, integrityVerified: true, applicationVerified: false, installable: false, app: manifest.app, files: checked.length };
}

/** 读取已校验的候选载荷；校验前后清单摘要相同才返回，忽略清单与状态文件。 */
export async function readCandidatePayload(directory, expectedApp) {
  const before = await validateCandidateDirectory(directory, expectedApp);
  const root = await assertRealDirectory(directory, '需要候选目录绝对路径');
  const manifestBytes = await readRegularFile(root, MANIFEST);
  const manifestHash = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const files = new Map();
  for (const entry of manifest.files) {
    const bytes = await readRegularFile(root, entry.path);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`候选文件校验失败：${entry.path}`);
    files.set(entry.path, bytes);
  }
  const after = await validateCandidateDirectory(directory, expectedApp);
  const latestManifest = await readRegularFile(root, MANIFEST);
  if (before.app !== after.app || sha256(latestManifest) !== manifestHash) throw new Error('读取期间候选版本发生变化');
  return { app: before.app, manifestHash, files };
}

/** 暂存完整候选，校验后以同卷目录重命名发布；失败时清理本次私有暂存目录。 */
export async function publishCandidate(parentDirectory, prefix, app, files) {
  if (!path.isAbsolute(parentDirectory) || !['cursor', 'claude'].includes(app) || !/^[a-z]+-$/.test(prefix) || !files || typeof files !== 'object' || Array.isArray(files)) throw new Error('候选发布参数无效');
  const parent = path.resolve(parentDirectory);
  await mkdir(parent, { recursive: true });
  const stagingRoot = path.join(parent, '.staging');
  await mkdir(stagingRoot, { recursive: true });
  const stage = await mkdtemp(path.join(stagingRoot, `${prefix}`));
  const output = path.join(parent, path.basename(stage));
  try {
    const entries = Object.entries(files);
    if (entries.some(([relative, data]) => !safeRelative(relative) || [MANIFEST, STATUS].includes(relative) || typeof data !== 'string')) throw new Error('候选文件路径或内容无效');
    for (const [relative, content] of entries) {
      const target = path.join(stage, ...relative.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, { flag: 'wx' });
    }
    await writeFile(path.join(stage, STATUS), STATUS_CONTENT, { flag: 'wx' });
    const inventory = [];
    for (const relative of entries.map(([name]) => name).sort()) {
      const bytes = await readFile(path.join(stage, ...relative.split('/')));
      inventory.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    }
    const manifest = { schemaVersion: 1, app, installable: false, integrityVerified: true, applicationVerified: false, files: inventory };
    await writeFile(path.join(stage, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await validateCandidateDirectory(stage, app);
    await rename(stage, output);
    await validateCandidateDirectory(output, app);
    return output;
  } catch (error) {
    const resolvedStage = path.resolve(stage);
    if (path.dirname(resolvedStage) === stagingRoot && path.basename(resolvedStage).startsWith(prefix)) await rm(resolvedStage, { recursive: true, force: true });
    throw error;
  }
}
