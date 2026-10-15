/**
 * 一键安装器入口。用法：node install-cli.mjs <install|verify|restore>
 * 退出码：0 成功（或本来就没改动）｜1 条件不满足（如译文表过期）｜2 用法错误或异常。
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '../project/backend/safe-io.mjs';
import {
  APP_DIR,
  MIN_COVERAGE,
  README_NAME,
  TARGET_LOCALE,
  WHITELIST_EXPECTED,
  findWhitelistTargets,
  inspectHtmlFiles,
  locateOfficialPackage,
  measureCoverage,
  readBaseCatalog,
  readSourceIdentity,
  readState,
  resolvePaths
} from './install-plan.mjs';
import {
  applyPatches,
  copyPackage,
  createShortcuts,
  digest,
  ensureDirectory,
  refreshPackage,
  removeShortcuts,
  writeLauncher,
  writeLocale,
  writeReadme,
  writeState
} from './install-apply.mjs';
import { readLocale } from './install-patch.mjs';
import { restoreAll } from './install-restore.mjs';

const HERE = import.meta.dirname;
const TABLE_PATH = path.join(HERE, 'translations', `${TARGET_LOCALE}.overrides.json`);
const README_TEMPLATE_PATH = path.join(HERE, README_NAME);
const SCHEMA_VERSION = 1;

const log = message => process.stdout.write(`${message}\n`);

function fail(message, code = 2) {
  process.stderr.write(`\n[失败] ${message}\n`);
  process.exitCode = code;
}

function loadTable() {
  if (!existsSync(TABLE_PATH)) throw new Error(`缺少译文表：${TABLE_PATH}`);
  const bytes = readFileSync(TABLE_PATH);
  const data = JSON.parse(bytes.toString('utf8'));
  return { sha256: digest(bytes), entries: Object.keys(data).length, data };
}

function loadReadmeTemplate() {
  if (!existsSync(README_TEMPLATE_PATH)) return `${TARGET_LOCALE}\n`;
  return readFileSync(README_TEMPLATE_PATH, 'utf8');
}

/** 状态文件里记录的补丁产物是否都还在、且哈希一致。任一不符即视为需要重装。 */
function patchedIntact(packageRoot, state) {
  if (!state?.patched) return false;
  for (const [relative, expected] of Object.entries(state.patched)) {
    const file = path.join(packageRoot, ...relative.split('/'));
    if (!existsSync(file)) return false;
    if (sha256(readFileSync(file)) !== expected) return false;
  }
  return true;
}

function gateWhitelist(appRoot) {
  const targets = findWhitelistTargets(appRoot);
  const total = targets.reduce((sum, target) => sum + target.count, 0);
  if (targets.every(target => target.alreadyLocalized)) {
    return { ok: true, alreadyLocalized: true, total, targets };
  }
  if (total !== WHITELIST_EXPECTED) {
    throw new Error(
      `语言白名单锚点在 shared-*.js 里出现 ${total} 处（预期 ${WHITELIST_EXPECTED} 处），`
      + '官方前端构建结构可能已变，为避免改坏应用本次不安装'
    );
  }
  return { ok: true, alreadyLocalized: false, total, targets };
}

async function install() {
  const paths = resolvePaths();
  const table = loadTable();
  const source = locateOfficialPackage();
  log(`官方 Claude Desktop：${source.version}`);
  log(`位置：${source.packageRoot}`);

  const baseCatalog = readBaseCatalog(source.packageRoot);
  const coverage = measureCoverage(baseCatalog, table.data);
  log(`译文覆盖：${coverage.matched} / ${coverage.baseKeys}（${(coverage.ratio * 100).toFixed(2)}%）`);
  if (coverage.extra) log(`译文表里有 ${coverage.extra} 条键不在当前官方词典中（官方已删除的旧键，不影响使用）`);
  if (coverage.ratio < MIN_COVERAGE) {
    fail(`译文覆盖率 ${(coverage.ratio * 100).toFixed(2)}% 低于要求的 ${(MIN_COVERAGE * 100).toFixed(0)}%，`
      + '说明译文表相对当前官方版本已过期，本次不安装。请更新译文表后重试。', 1);
    return;
  }

  const identity = await readSourceIdentity(source.packageRoot);
  const state = readState(paths.statePath);
  if (state
    && state.sourceIdentitySha256 === identity.identitySha256
    && state.tableSha256 === table.sha256
    && patchedIntact(paths.packageRoot, state)) {
    log('\n已安装且为最新版本，未做任何改动。');
    return;
  }

  ensureDirectory(paths.installRoot);
  ensureDirectory(paths.revertRoot);
  ensureDirectory(paths.profileRoot);

  // 结构门禁先对官方源做一次，且在任何改动之前：官方前端若改了结构，副本与备份都必须原样留着
  gateWhitelist(path.join(source.packageRoot, APP_DIR));

  let pristine = false;
  if (!existsSync(paths.packageRoot)) {
    copyPackage(source.packageRoot, paths.packageRoot, { log });
    pristine = true;
  } else if (!state || state.sourceIdentitySha256 !== identity.identitySha256) {
    refreshPackage(source.packageRoot, paths.packageRoot, {
      log,
      reason: state ? 'updated' : 'no-record'
    });
    pristine = true;
  }

  const gate = gateWhitelist(paths.appRoot);
  if (gate.alreadyLocalized) log('官方前端已自带中文语言项，跳过白名单改写');
  // 门禁过了才丢弃旧备份：门禁失败时副本没改、备份也还在，此时才能如实说「本次不安装」
  if (pristine) rmSync(path.join(paths.revertRoot, 'files'), { recursive: true, force: true });

  const { patched, added } = applyPatches({
    packageRoot: paths.packageRoot,
    baseCatalog,
    overrides: table.data,
    revertRoot: paths.revertRoot,
    log
  });

  const locale = writeLocale({ configPath: paths.configPath, revertRoot: paths.revertRoot, log });
  writeLauncher(paths.launcherPath);
  log(`已生成启动器：${paths.launcherPath}`);
  const shortcuts = createShortcuts({
    launcherPath: paths.launcherPath,
    installRoot: paths.installRoot,
    executable: path.join(paths.packageRoot, 'app', 'claude.exe'),
    log
  });
  writeReadme(paths.readmePath, loadReadmeTemplate(), {
    安装目录: paths.installRoot,
    安装器目录: HERE,
    官方版本: source.version,
    安装日期: new Date().toLocaleString('zh-CN'),
    译文条数: coverage.matched,
    覆盖率: `${(coverage.ratio * 100).toFixed(2)}%`
  });
  writeState(paths.statePath, {
    schemaVersion: SCHEMA_VERSION,
    installedAt: state?.installedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceVersion: source.version,
    sourceIdentitySha256: identity.identitySha256,
    tableSha256: table.sha256,
    tableEntries: table.entries,
    coverage: Number(coverage.ratio.toFixed(6)),
    patched,
    added,
    locale: { path: paths.configPath, previous: locale.previous },
    shortcuts,
    revertRoot: paths.revertRoot
  });

  log('\n安装完成。双击桌面的「Claude 中文版」即可启动。');
  log(`还原方式：node "${path.join(HERE, 'install-cli.mjs')}" restore`);
}

async function verify() {
  const paths = resolvePaths();
  const table = loadTable();
  const source = locateOfficialPackage();
  const baseCatalog = readBaseCatalog(source.packageRoot);
  const coverage = measureCoverage(baseCatalog, table.data);
  const state = readState(paths.statePath);
  const problems = [];

  if (!state) problems.push('未找到安装状态文件，可能尚未安装或安装未完成');
  if (state && state.sourceIdentitySha256 !== (await readSourceIdentity(source.packageRoot)).identitySha256) {
    problems.push('官方 Claude 已更新，副本补丁需要重跑安装');
  }
  if (state && !patchedIntact(paths.packageRoot, state)) problems.push('副本里的补丁文件与记录不一致');
  if (existsSync(paths.appRoot)) {
    for (const html of inspectHtmlFiles(paths.appRoot)) {
      if (!html.present) problems.push(`缺少前端页面 ${html.relative}`);
      else if (!html.injected) problems.push(`${html.relative} 未注入语言设置`);
    }
  } else {
    problems.push('副本目录不存在');
  }

  log(`官方版本：${source.version}`);
  log(`覆盖率：${(coverage.ratio * 100).toFixed(2)}%（${coverage.matched} / ${coverage.baseKeys}）`);
  log(`安装状态：${state ? `${state.sourceVersion}，${state.updatedAt}` : '无'}`);
  log(`副本语言设置：${readCurrentLocale(paths.configPath) ?? '未设置'}`);
  if (problems.length) {
    for (const problem of problems) log(`- ${problem}`);
    fail('校验未通过', 1);
    return;
  }
  log('校验通过：副本补丁完整且与当前官方版本一致。');
}

function readCurrentLocale(configPath) {
  if (!existsSync(configPath)) return null;
  return readLocale(readFileSync(configPath, 'utf8'));
}

async function restore() {
  const paths = resolvePaths();
  const state = readState(paths.statePath);
  // 副本目录不在了，快捷方式和状态文件仍在安装目录里，得照样清掉：
  // 否则桌面上会留一个指向空目录的图标，重装时还被旧状态误导。
  if (!existsSync(paths.packageRoot)) {
    const shortcuts = state?.shortcuts?.length ? removeShortcuts(state.shortcuts, { log }) : 0;
    if (existsSync(paths.statePath)) rmSync(paths.statePath, { force: true });
    fail(`副本目录不存在：${paths.packageRoot}`
      + (shortcuts ? `\n已清理快捷方式 ${shortcuts} 个与安装状态文件。` : ''), 1);
    return;
  }
  const result = restoreAll({ paths, state, log });
  const missing = result.missing ?? [];
  if (missing.length) {
    log(`\n还原不完整：${result.restored} 个原件已写回，${missing.length} 个因副本目录已不存在而无法写回。`);
    for (const relative of missing) log(`- ${relative}`);
    log(`如需彻底清除，直接删除整个目录：${paths.installRoot}`);
    fail('还有原件没能还原', 1);
    return;
  }
  log(`\n还原完成：写回原件 ${result.restored} 个`
    + `${result.catalogRemoved ? '、删除中文词典' : ''}`
    + `${result.locale.restored ? '、副本语言设置还原' : ''}`
    + `${result.shortcuts ? `、删除快捷方式 ${result.shortcuts} 个` : ''}。`);
  log(`如需彻底清除，直接删除整个目录：${paths.installRoot}`);
}

async function main() {
  const [verb] = process.argv.slice(2);
  if (!verb || verb === 'install') return install();
  if (verb === 'verify') return verify();
  if (verb === 'restore') return restore();
  fail(`未知命令：${verb}\n用法：node install-cli.mjs <install|verify|restore>`);
}

main().catch(error => {
  fail(error.message || String(error));
});
