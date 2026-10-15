/**
 * 安装编排：复制副本 → 三处补丁 → 写 locale → 建快捷方式 → 落状态。
 * 所有原件在改动前先进 revert/，任何一步失败都不会留下半改状态（补丁全部走临时文件 + rename）。
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { patchHtml, patchWhitelist, buildCatalog, serializeCatalog, setLocale } from './install-patch.mjs';
import {
  HTML_FILES,
  README_NAME,
  REL_ASSETS_DIR,
  REL_BASE_CATALOG,
  REL_I18N_DIR,
  SHORTCUT_NAME,
  STATE_NAME,
  TARGET_LOCALE
} from './install-plan.mjs';

const SKIP_COPY_DIR = 'microsoft.system.package.metadata';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const nowIso = () => new Date().toISOString();

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true });
}

function toWindows(directory) {
  return path.win32.normalize(directory);
}

/** 写文件走「临时名 → rename」，避免中断时留下截断的文件。 */
export function writeFileAtomic(file, content) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

/** 备份到 revert/files/<相对路径>，同一条相对路径重复备份只保留第一次（第一次才是原件）。 */
export function backupFile(packageRoot, relative, revertRoot) {
  const target = path.join(revertRoot, 'files', ...relative.split('/'));
  if (existsSync(target)) return target;
  ensureDirectory(path.dirname(target));
  copyFileSync(path.join(packageRoot, ...relative.split('/')), target);
  return target;
}

/**
 * 整包复制。robocopy 退出码 < 8 为成功（1 = 有文件被复制，属正常）。
 * 只排除 microsoft.system.package.metadata：它是 WindowsApps 的元数据目录，副本不需要，
 * 且其中的文件带包身份信息，留着反而多一份可疑面。
 */
export function copyPackage(sourceRoot, destinationRoot, { log = () => {} } = {}) {
  const staging = `${destinationRoot}.staging-${Date.now().toString(36)}`;
  rmSync(staging, { recursive: true, force: true });
  ensureDirectory(path.dirname(staging));
  log(`正在复制官方程序文件（约 700 MB，首次约需 30 秒）…`);
  const result = spawnSync('robocopy.exe', [
    toWindows(sourceRoot),
    toWindows(staging),
    '/E',
    '/COPY:DAT',
    '/DCOPY:DAT',
    '/R:1',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/XD',
    toWindows(path.join(sourceRoot, SKIP_COPY_DIR))
  ], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw new Error(`无法执行 robocopy：${result.error.message}`);
  if (result.status >= 8) throw new Error(`复制副本失败（robocopy 退出码 ${result.status}）：${(result.stderr || '').trim()}`);

  const executable = path.join(staging, 'app', 'claude.exe');
  if (!existsSync(executable)) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error('复制结果里没有 app\\claude.exe，官方包结构可能已变');
  }
  if (existsSync(destinationRoot)) rmSync(destinationRoot, { recursive: true, force: true });
  renameSync(staging, destinationRoot);
  return destinationRoot;
}

/**
 * 用新版官方文件刷新旧副本，保留 profile/（用户数据）不动。补丁产物随后全部重建。
 * 必须用 /MIR（=/E /PURGE）而不是 /E：前端资源文件名带构建哈希，升级后旧文件不在新官方包里，
 * 只覆盖不清理的话，上一版那个已打补丁的 shared-*.js 会留在副本里，白名单锚点变成 4 处而卡住安装。
 * package/ 里只有官方副本与补丁产物，没有用户数据（profile/ 与 revert/ 是它的同级目录）。
 */
export function refreshPackage(sourceRoot, destinationRoot, { log = () => {}, reason = 'updated' } = {}) {
  const refreshMessages = {
    'no-record': '没有可用的安装记录，正在用官方文件重建副本…',
    damaged: '副本里的补丁文件与安装记录不符，正在用官方文件重建副本…',
    updated: '检测到 Claude 已更新，正在用新版官方文件刷新副本…'
  };
  log(refreshMessages[reason] ?? refreshMessages.updated);
  const result = spawnSync('robocopy.exe', [
    toWindows(sourceRoot),
    toWindows(destinationRoot),
    '/MIR',
    '/COPY:DAT',
    '/DCOPY:DAT',
    '/R:1',
    '/W:1',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/XD',
    toWindows(path.join(sourceRoot, SKIP_COPY_DIR))
  ], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw new Error(`无法执行 robocopy：${result.error.message}`);
  if (result.status >= 8) throw new Error(`刷新副本失败（robocopy 退出码 ${result.status}）：${(result.stderr || '').trim()}`);
}

const relativeOf = (appRoot, file) => path.relative(path.dirname(appRoot), file).split(path.sep).join('/');

/**
 * 三处补丁。返回 patched 映射（相对包根 → 新文件 sha256）与新增文件列表。
 * catalogIsOriginal 由调用方按**官方源包**判定：副本里的 zh-Hans.json 在重复安装时是上一轮的
 * 补丁产物，若拿副本当依据，就会被备份成「原件」，还原时反把旧中文词典写回去。
 */
export function applyPatches({
  packageRoot,
  baseCatalog,
  overrides,
  revertRoot,
  log = () => {},
  catalogIsOriginal = false
}) {
  const appRoot = path.join(packageRoot, 'app');
  const patched = {};
  const added = [];

  const catalogTarget = path.join(appRoot, ...REL_BASE_CATALOG.split('/'));
  const enUsText = readFileSync(catalogTarget, 'utf8');
  const baseParsed = JSON.parse(enUsText);
  const { catalog, applied } = buildCatalog(baseParsed, overrides);
  const zhPath = path.join(appRoot, ...REL_I18N_DIR.split('/'), `${TARGET_LOCALE}.json`);
  const zhText = serializeCatalog(catalog);
  const zhRelative = relativeOf(appRoot, zhPath);
  // 官方若某天自带 zh-Hans.json，先备份：还原时它是官方原件，不能当补丁产物删掉
  if (catalogIsOriginal) {
    backupFile(packageRoot, zhRelative, revertRoot);
  } else {
    // 官方源没有这个文件，备份里的同名文件只可能是上一轮安装留下的补丁产物，
    // 留着会让「还原」把旧词典写回副本——还原路径上这是假成功，必须清掉
    rmSync(path.join(revertRoot, 'files', ...zhRelative.split('/')), { force: true });
  }
  writeFileAtomic(zhPath, zhText);
  if (!catalogIsOriginal) added.push(zhRelative);
  patched[zhRelative] = digest(Buffer.from(zhText, 'utf8'));
  log(`已生成中文词典 ${TARGET_LOCALE}.json（覆盖 ${applied} 条）`);

  const assetsDir = path.join(appRoot, ...REL_ASSETS_DIR.split('/'));
  if (!existsSync(assetsDir)) throw new Error(`副本缺少前端资源目录：${REL_ASSETS_DIR}`);
  const bundles = [];
  for (const name of readdirSync(assetsDir)) {
    if (!name.startsWith('shared-') || !name.endsWith('.js')) continue;
    const file = path.join(assetsDir, name);
    const source = readFileSync(file, 'utf8');
    const result = patchWhitelist(source);
    if (result.count === 0) continue;
    bundles.push({ file, result });
  }
  if (!bundles.length) throw new Error('未在 shared-*.js 里找到语言白名单数组，前端构建结构可能已变');
  for (const { file, result } of bundles) {
    const relative = relativeOf(appRoot, file);
    backupFile(packageRoot, relative, revertRoot);
    if (result.changed) writeFileAtomic(file, result.text);
    assertJavaScript(file);
    patched[relative] = digest(readFileSync(file));
  }
  log(`已注册中文语言到 ${bundles.length} 个前端包`);

  const htmlChanged = [];
  for (const name of HTML_FILES) {
    const file = path.join(appRoot, 'resources', 'ion-dist', name);
    if (!existsSync(file)) throw new Error(`副本缺少前端页面：resources/ion-dist/${name}`);
    const relative = relativeOf(appRoot, file);
    const { text, changed, anchored, alreadyDone } = patchHtml(readFileSync(file, 'utf8'));
    if (!alreadyDone && !anchored) throw new Error(`${name} 里找不到 <meta charset>，无法注入语言设置`);
    if (changed) {
      backupFile(packageRoot, relative, revertRoot);
      writeFileAtomic(file, text);
      htmlChanged.push(name);
    }
    patched[relative] = digest(readFileSync(file));
  }
  log(`已注入前端页面语言设置（${htmlChanged.length} 个文件）`);

  return { patched, added };
}

/** 语法自检：改过的 js 必须能被 Node 解析，否则宁可装不上也不能让应用白屏。 */
function assertJavaScript(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`补丁后的脚本语法校验失败：${path.basename(file)}\n${(result.stderr || '').trim()}`);
}

/** 只改共享配置里的 locale 一个字段，旧值单独记一份 sidecar（不整文件备份，避免带出凭据）。 */
export function writeLocale({ configPath, revertRoot, locale = TARGET_LOCALE, log = () => {} }) {
  const sidecar = path.join(revertRoot, 'config-locale.json');
  ensureDirectory(revertRoot);
  if (!existsSync(configPath)) {
    ensureDirectory(path.dirname(configPath));
    writeFileAtomic(sidecar, `${JSON.stringify({ configPath, existed: false, previous: null }, null, 2)}\n`);
    writeFileAtomic(configPath, `${JSON.stringify({ locale }, null, 2)}\n`);
    log('已创建 Claude 配置文件并写入中文语言设置');
    return { previous: null, created: true };
  }
  const original = readFileSync(configPath, 'utf8');
  const result = setLocale(original, locale);
  if (!result) throw new Error('Claude 配置文件不是可解析的 JSON 对象，未做改动');
  if (!existsSync(sidecar)) {
    writeFileAtomic(sidecar, `${JSON.stringify({ configPath, existed: true, previous: result.previous }, null, 2)}\n`);
  }
  if (result.previous === locale) return { previous: result.previous, created: false };
  writeFileAtomic(configPath, result.text);
  log(`已把界面语言设为中文（原值：${result.previous ?? '未设置'}）`);
  return { previous: result.previous, created: false };
}

const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;

/** 桌面与开始菜单各建一个快捷方式，指向副本启动器。 */
export function createShortcuts({ launcherPath, installRoot, executable, log = () => {} }) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$ws = New-Object -ComObject WScript.Shell',
    `$target = ${psQuote(toWindows(launcherPath))}`,
    `$work = ${psQuote(toWindows(installRoot))}`,
    `$icon = ${psQuote(`${toWindows(executable)},0`)}`,
    `$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))`,
    `foreach ($d in $dirs) { $p = Join-Path $d ${psQuote(SHORTCUT_NAME)}; $lnk = $ws.CreateShortcut($p); $lnk.TargetPath = $target; $lnk.WorkingDirectory = $work; $lnk.IconLocation = $icon; $lnk.Description = 'Claude Desktop 中文版'; $lnk.Save(); Write-Output $p }`
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw new Error(`无法执行 PowerShell：${result.error.message}`);
  if (result.status !== 0) throw new Error(`创建快捷方式失败：${(result.stderr || '').trim() || `退出码 ${result.status}`}`);
  const created = String(result.stdout).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  log(`已创建快捷方式 ${created.length} 个`);
  return created;
}

export function removeShortcuts(shortcuts, { log = () => {} } = {}) {
  let removed = 0;
  for (const file of shortcuts) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
      removed += 1;
    }
  }
  if (removed) log(`已删除快捷方式 ${removed} 个`);
  return removed;
}

export function writeLauncher(launcherPath) {
  const content = [
    '@echo off',
    'chcp 65001 >nul',
    'rem 副本使用自己的 LOCALAPPDATA 与独立的 userData，单实例锁与官方版分开，两者可同时运行。',
    'rem 官方版的数据完全不受影响；副本是独立配置，首次启动需在副本内登录一次。',
    'set "LOCALAPPDATA=%~dp0profile"',
    'if not exist "%~dp0profile\\Claude" mkdir "%~dp0profile\\Claude"',
    'start "" "%~dp0package\\app\\claude.exe" --user-data-dir="%~dp0profile\\Claude"',
    ''
  ].join('\r\n');
  writeFileAtomic(launcherPath, content);
  return launcherPath;
}

export function writeReadme(readmePath, template, values) {
  // 键是中文，不能用 \w（只含 [A-Za-z0-9_]），否则占位符一个都替换不掉
  const text = template.replace(/\{\{([^{}]+)\}\}/g, (whole, key) => (key in values ? String(values[key]) : whole));
  writeFileAtomic(readmePath, text);
  return readmePath;
}

export function writeState(statePath, state) {
  writeFileAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return statePath;
}

export { digest, ensureDirectory, README_NAME, STATE_NAME };
