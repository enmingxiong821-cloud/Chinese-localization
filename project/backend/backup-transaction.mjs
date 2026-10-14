/**
 * 备份与恢复事务。
 * 本模块只做三件事：只读计划、写出并逐字节复验的备份、恢复计划。
 * 它不向安装目录写任何东西——写回是独立授权步骤，见 buildRestorePlan 的说明。
 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertRealDirectory, listRegularFiles, readBoundedFile, safeRelative, sha256 } from './safe-io.mjs';
import { fingerprintFile, readInstallIdentity } from './install-identity.mjs';

const MANIFEST = 'backup-manifest.json';
const FILES_DIR = 'files';
const MAX_TARGETS = 64;
const MAX_FILE_BYTES = 512 * 1024 * 1024;
const LIMITS = { maxFiles: MAX_TARGETS * 2 + 8, maxDepth: 12, maxTotalBytes: MAX_FILE_BYTES };

const identityCore = identity => ({
  schemaVersion: identity.schemaVersion,
  packageName: identity.packageName,
  packageVersion: identity.packageVersion,
  publisher: identity.publisher,
  architecture: identity.architecture,
  files: identity.files
});

/**
 * 只读计划：读一次完整安装标识与目标文件指纹，不写入任何位置。
 * appRoot 只用于后续备份时定位源文件，不进清单，清单因此与安装位置无关。
 */
export async function planBackup(packageRoot, targetPaths) {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0 || targetPaths.length > MAX_TARGETS) throw new Error(`备份目标数量必须是 1 到 ${MAX_TARGETS}`);
  if (new Set(targetPaths).size !== targetPaths.length) throw new Error('备份目标有重复路径');
  if (targetPaths.some(relative => !safeRelative(relative))) throw new Error('备份目标路径非法');
  const identity = await readInstallIdentity(packageRoot);
  const targets = [...targetPaths].sort();
  // 目标文件按定义不在标识键集里，所以单独取指纹，复用同一个文件级原语。
  const entries = [];
  for (const relative of targets) entries.push(await fingerprintFile(identity.appRoot, relative));
  const core = identityCore(identity);
  if (sha256(Buffer.from(JSON.stringify(core), 'utf8')) !== identity.identitySha256) throw new Error('安装标识自校验失败');
  return { schemaVersion: 1, appRoot: identity.appRoot, identity: { ...core, identitySha256: identity.identitySha256 }, targets, entries };
}

async function readManifest(directory) {
  let manifest;
  try { manifest = JSON.parse((await readBoundedFile(path.join(directory, MANIFEST), 4 * 1024 * 1024)).toString('utf8')); } catch { throw new Error('备份清单缺失或JSON无效'); }
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'install-backup') throw new Error('备份清单版本或类型不匹配');
  if (!Array.isArray(manifest.targets) || !Array.isArray(manifest.files)) throw new Error('备份清单结构无效');
  if (manifest.files.some(file => !safeRelative(file.path) || !['present', 'absent'].includes(file.kind))) throw new Error('备份清单条目无效');
  return manifest;
}

/** 逐字节复验：文件集必须与清单完全一致，present 项长度与哈希都必须吻合。 */
export async function verifyBackup(directory) {
  const root = await assertRealDirectory(directory, '需要备份目录绝对路径');
  const manifest = await readManifest(root);
  const onDisk = await listRegularFiles(path.join(root, FILES_DIR), LIMITS);
  const expected = manifest.files.filter(file => file.kind === 'present').map(file => file.path).sort();
  if (JSON.stringify(onDisk.sort()) !== JSON.stringify(expected)) throw new Error('备份目录文件与清单不一致');
  for (const file of expected) {
    const bytes = await readBoundedFile(path.join(root, FILES_DIR, ...file.split('/')), MAX_FILE_BYTES);
    const entry = manifest.files.find(item => item.path === file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`备份文件校验失败：${file}`);
  }
  const manifestBytes = await readBoundedFile(path.join(root, MANIFEST), 4 * 1024 * 1024);
  return {
    valid: true,
    backupDirectory: root,
    identity: manifest.identity,
    identitySha256: manifest.identity?.identitySha256 ?? null,
    packageName: manifest.identity?.packageName ?? null,
    packageVersion: manifest.identity?.packageVersion ?? null,
    createdAt: manifest.createdAt ?? null,
    targets: manifest.targets,
    files: manifest.files,
    manifestSha256: sha256(manifestBytes)
  };
}

/** 先写暂存目录并自校验，再整体重命名发布；失败只清理本次私有暂存目录。 */
export async function createBackup(plan, destinationRoot) {
  if (!plan || plan.schemaVersion !== 1 || !Array.isArray(plan.entries) || !plan.identity) throw new Error('备份计划无效');
  if (typeof destinationRoot !== 'string' || !path.isAbsolute(destinationRoot)) throw new Error('备份目标根目录必须是绝对路径');
  const appRoot = await assertRealDirectory(plan.appRoot, '需要安装应用根绝对路径');
  const parent = path.resolve(destinationRoot);
  await mkdir(parent, { recursive: true });
  const stagingRoot = path.join(parent, '.staging');
  await mkdir(stagingRoot, { recursive: true });
  const stage = await mkdtemp(path.join(stagingRoot, 'backup-'));
  const output = path.join(parent, path.basename(stage));
  try {
    const files = [];
    let total = 0;
    for (const entry of plan.entries) {
      if (!safeRelative(entry.path)) throw new Error(`备份目标路径非法：${entry.path}`);
      if (entry.status !== 'hashed') { files.push({ path: entry.path, kind: 'absent', status: entry.status }); continue; }
      const bytes = await readBoundedFile(path.join(appRoot, ...entry.path.split('/')), MAX_FILE_BYTES);
      // 计划与备份之间源文件若被改动，宁可失败也不留一份来历不明的副本。
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`备份期间源文件变化：${entry.path}`);
      total += bytes.length;
      if (total > MAX_FILE_BYTES) throw new Error('备份总字节超过限制');
      const target = path.join(stage, FILES_DIR, ...entry.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' });
      files.push({ path: entry.path, kind: 'present', bytes: bytes.length, sha256: sha256(bytes) });
    }
    await mkdir(path.join(stage, FILES_DIR), { recursive: true });
    const manifest = { schemaVersion: 1, kind: 'install-backup', createdAt: new Date().toISOString(), identity: plan.identity, targets: plan.targets, files };
    await writeFile(path.join(stage, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await verifyBackup(stage);
    await rename(stage, output);
    const verified = await verifyBackup(output);
    return { directory: output, manifestSha256: verified.manifestSha256, identitySha256: verified.identitySha256, packageVersion: verified.packageVersion, present: files.filter(file => file.kind === 'present').length, absent: files.filter(file => file.kind === 'absent').length };
  } catch (error) {
    const resolved = path.resolve(stage);
    if (path.dirname(resolved) === stagingRoot && path.basename(resolved).startsWith('backup-')) await rm(resolved, { recursive: true, force: true });
    throw error;
  }
}

/**
 * 恢复计划：只回答「现在能不能恢复、恢复会动哪些文件」。
 * 判定依据是备份之外的关键文件是否仍然原样——目标文件本身此刻应当已是补丁后的值，
 * 与备份必然不同，所以只记录现值供人核对，不作为阻断条件。
 * 返回 executed 恒为 false：真正写回安装目录需要另外的显式授权，本模块不执行。
 */
export async function buildRestorePlan(backupDirectory, currentIdentity) {
  const backup = await verifyBackup(backupDirectory);
  const recorded = backup.identity;
  if (!recorded?.files?.every(file => file.status === 'hashed')) throw new Error('备份未记录完整安装标识，无法恢复');
  if (!currentIdentity?.files?.every(file => file.status === 'hashed')) throw new Error('当前安装标识不完整，拒绝恢复');
  const appRoot = await assertRealDirectory(currentIdentity.appRoot, '当前安装标识缺少可用的应用根路径');
  const targets = new Set(backup.targets);
  const drift = [];
  if (recorded.packageName !== currentIdentity.packageName) drift.push('包名');
  if (recorded.packageVersion !== currentIdentity.packageVersion) drift.push('包版本');
  for (const file of recorded.files.filter(item => !targets.has(item.path))) {
    const now = currentIdentity.files.find(item => item.path === file.path);
    if (!now || now.sha256 !== file.sha256) drift.push(file.path);
  }
  const current = [];
  for (const relative of backup.targets) current.push({ path: relative, ...await fingerprintFile(appRoot, relative) });
  return {
    allowed: drift.length === 0,
    reason: drift.length === 0 ? null : `当前安装与备份记录不一致，恢复前必须人工确认：${drift.join('、')}`,
    executed: false,
    backupDirectory: backup.backupDirectory,
    packageVersion: recorded.packageVersion,
    identitySha256: backup.identitySha256,
    restore: backup.files.filter(file => file.kind === 'present').map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })),
    remove: backup.files.filter(file => file.kind === 'absent').map(file => ({ path: file.path, status: file.status })),
    current,
    notes: ['本计划不执行任何写入。', '恢复写回安装目录需另行显式授权，且应先在副本上演练。']
  };
}
