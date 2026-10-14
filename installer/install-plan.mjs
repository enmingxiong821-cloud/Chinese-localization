/**
 * 安装器共用的定位与判据：官方包在哪、副本装到哪、什么情况下必须拒绝安装。
 * 这里不做任何写入，全部是只读探测与纯计算，便于单测。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readInstallIdentity } from '../project/backend/install-identity.mjs';
import { sha256 } from '../project/backend/safe-io.mjs';

export const INSTALL_DIR_NAME = 'Claude-zh';
export const APP_DIR = 'app';
/** 副本专属 userData 的目录名。与官方版完全分开，因此单实例锁互不冲突，可同时运行。 */
export const USER_DATA_DIR_NAME = 'Claude';
export const REL_I18N_DIR = 'resources/ion-dist/i18n';
export const REL_ASSETS_DIR = 'resources/ion-dist/assets/v1';
export const REL_BASE_CATALOG = 'resources/ion-dist/i18n/en-US.json';
export const BASE_LOCALE = 'en-US';
export const TARGET_LOCALE = 'zh-Hans';
export const HTML_FILES = Object.freeze(['index.html', 'frame-shell.html', 'frame-connect.html', 'frame-manage.html']);

/**
 * 目录白名单数组的锚点。刻意只锚定「以 en-US、de-DE 开头」到「以 id-ID 结尾」，
 * 不写死整段：官方日后增删语种时这里仍能命中，真命中不了就让门禁拒绝，而不是猜着改。
 */
export const LOCALE_ARRAY = /\["en-US","de-DE"[^\]]*\]/g;
export const WHITELIST_FILE_PREFIX = 'shared-';
export const WHITELIST_EXPECTED = 2;

/** 覆盖率低于此值就拒绝安装，避免装出一个大面积回落英文的半成品。 */
export const MIN_COVERAGE = 0.95;

/** 注入到 html 的片段：注册 zh-Hans 目录，并把 SPA 语言钉在 localStorage 里。 */
export const CATALOG_HASH = '0d22dfc5.5c7b1caa.17de78f4';
export const HTML_INJECT = `<meta name="i18n-catalogs" data-i18n-catalogs="${TARGET_LOCALE}:${CATALOG_HASH}">`
  + `<script>try{localStorage.setItem("spa:locale","${TARGET_LOCALE}")}catch(e){}</script>`;
export const HTML_ANCHOR = /<meta charset="[^"]*">/i;

export const SHORTCUT_NAME = 'Claude 中文版.lnk';
export const LAUNCHER_NAME = '启动.cmd';
export const README_NAME = '说明.txt';
export const STATE_NAME = '.install-state.json';
export const REVERT_LOCALE_NAME = 'config-locale.json';

/** 副本各处的绝对路径。只做拼接与环境变量校验，不创建任何目录。 */
export function resolvePaths(environment = process.env) {
  const localAppData = environment.LOCALAPPDATA;
  if (typeof localAppData !== 'string' || !path.isAbsolute(localAppData)) {
    throw new Error('缺少可用的 LOCALAPPDATA 环境变量，无法确定安装位置');
  }
  const installRoot = path.join(localAppData, INSTALL_DIR_NAME);
  const packageRoot = path.join(installRoot, 'package');
  const profileRoot = path.join(installRoot, 'profile');
  const userDataRoot = path.join(profileRoot, USER_DATA_DIR_NAME);
  const revertRoot = path.join(installRoot, 'revert');
  return {
    installRoot,
    packageRoot,
    appRoot: path.join(packageRoot, APP_DIR),
    profileRoot,
    userDataRoot,
    configPath: path.join(userDataRoot, 'config.json'),
    revertRoot,
    launcherPath: path.join(installRoot, LAUNCHER_NAME),
    readmePath: path.join(installRoot, README_NAME),
    statePath: path.join(installRoot, STATE_NAME),
    localeSidecarPath: path.join(revertRoot, REVERT_LOCALE_NAME)
  };
}

/**
 * 官方包根只能靠 Get-AppxPackage 拿：C:\Program Files\WindowsApps 本身不允许枚举，
 * 但包目录内部可读，无需提权。
 */
export function locateOfficialPackage(runner = runPowerShell) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$p = Get-AppxPackage -Name Claude* | Where-Object { -not $_.IsResourcePackage -and -not $_.IsFramework } | Sort-Object Version -Descending | Select-Object -First 1',
    'if (-not $p) { exit 3 }',
    'Write-Output ($p.Version.ToString() + "|" + $p.InstallLocation)'
  ].join('; ');
  const result = runner(script);
  if (result.status === 3) throw new Error('未找到官方 Claude Desktop 安装，请先安装官方版本再运行本工具');
  if (result.status !== 0) throw new Error(`查询官方安装失败：${(result.stderr || '').trim() || `PowerShell 退出码 ${result.status}`}`);
  const [version, installLocation] = String(result.stdout).trim().split('|');
  if (!version || !installLocation || !path.isAbsolute(installLocation) || !existsSync(installLocation)) {
    throw new Error(`官方安装位置不可用：${installLocation || '(空)'}`);
  }
  return { version, packageRoot: path.resolve(installLocation) };
}

function runPowerShell(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' });
  if (result.error) throw new Error(`无法执行 PowerShell：${result.error.message}`);
  return result;
}

/** 读官方基线词典的键集。译文表要挂在这个键空间上，键漂移就是版本漂移。 */
export function readBaseCatalog(packageRoot) {
  const file = path.join(packageRoot, APP_DIR, ...REL_BASE_CATALOG.split('/'));
  if (!existsSync(file)) throw new Error(`官方包缺少基线词典：${REL_BASE_CATALOG}`);
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('基线词典不是键值对象');
  return parsed;
}

/** 译文表与基线键空间的交集大小，以及表里多出来的键（官方删过的旧键）。 */
export function measureCoverage(baseCatalog, overrides) {
  const baseKeys = Object.keys(baseCatalog);
  const matched = baseKeys.filter(key => Object.prototype.hasOwnProperty.call(overrides, key)).length;
  const extra = Object.keys(overrides).filter(key => !Object.prototype.hasOwnProperty.call(baseCatalog, key)).length;
  return { baseKeys: baseKeys.length, matched, extra, ratio: baseKeys.length ? matched / baseKeys.length : 0 };
}

/** 在副本里找出承载语言白名单的 bundle，并数出锚点出现次数。 */
export function findWhitelistTargets(appRoot) {
  const dir = path.join(appRoot, ...REL_ASSETS_DIR.split('/'));
  if (!existsSync(dir)) throw new Error(`副本缺少前端资源目录：${REL_ASSETS_DIR}`);
  const candidates = readdirSync(dir).filter(name => name.startsWith(WHITELIST_FILE_PREFIX) && name.endsWith('.js'));
  if (!candidates.length) throw new Error(`未找到 ${WHITELIST_FILE_PREFIX}*.js，前端构建结构可能已变`);
  const targets = [];
  for (const name of candidates) {
    const relative = `${REL_ASSETS_DIR}/${name}`;
    const source = readFileSync(path.join(appRoot, ...relative.split('/')), 'utf8');
    const matches = source.match(LOCALE_ARRAY);
    if (!matches) continue;
    targets.push({ relative, count: matches.length, alreadyLocalized: matches.every(match => match.includes(`"${TARGET_LOCALE}"`)) });
  }
  return targets;
}

/** 副本里四个 html 是否都还在，以及是否已经注入过。 */
export function inspectHtmlFiles(appRoot) {
  return HTML_FILES.map(name => {
    const relative = `resources/ion-dist/${name}`;
    const file = path.join(appRoot, ...relative.split('/'));
    if (!existsSync(file)) return { relative, present: false, injected: false };
    const source = readFileSync(file, 'utf8');
    return { relative, present: true, injected: source.includes('data-i18n-catalogs'), anchored: HTML_ANCHOR.test(source) };
  });
}

/** 官方安装的指纹，用来判断"要不要重装副本"。 */
export async function readSourceIdentity(packageRoot) {
  const identity = await readInstallIdentity(packageRoot);
  return { identitySha256: identity.identitySha256, packageVersion: identity.packageVersion };
}

export function readState(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

export const tableDigest = text => sha256(Buffer.from(text, 'utf8'));
