/**
 * 还原：把 revert/files 下的原件逐字节写回副本、删掉新增的词典、还原 locale、删掉快捷方式。
 * 官方安装自始至终没被动过，所以这里完全不触碰 WindowsApps。
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { removeShortcuts, writeFileAtomic } from './install-apply.mjs';
import { setLocale } from './install-patch.mjs';
import { REL_I18N_DIR, TARGET_LOCALE } from './install-plan.mjs';

function walkFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

/**
 * 把备份里的原件写回副本。返回还原的文件数与缺失列表。
 * 备份目录整个不存在时额外返回 noBackup：调用方要结合安装记录判断这是「本来就没打过补丁」
 * 还是「原件丢了」，后者必须报失败，不能顺着 restored:0 说成还原完成。
 */
export function restoreFiles({ packageRoot, revertRoot, log = () => {} }) {
  const backupRoot = path.join(revertRoot, 'files');
  if (!existsSync(backupRoot)) return { restored: 0, missing: [], noBackup: true };
  const missing = [];
  let restored = 0;
  for (const backup of walkFiles(backupRoot)) {
    const relative = path.relative(backupRoot, backup).split(path.sep).join('/');
    const target = path.join(packageRoot, ...relative.split('/'));
    if (!existsSync(path.dirname(target))) {
      missing.push(relative);
      continue;
    }
    copyFileSync(backup, target);
    restored += 1;
    log(`已还原 ${relative}`);
  }
  return { restored, missing };
}

/**
 * 删掉安装时新增的词典文件（原件里本来没有它）。
 * 官方若自带同名词典，它在 revert/files 里有备份、restoreFiles 已经写回去了，这里必须跳过删除。
 */
export function removeAddedCatalog({ packageRoot, revertRoot, log = () => {} }) {
  // 这个相对路径要跟 backupFile 用的一致（相对包根，带 app/ 前缀），否则找不到备份
  const relative = `app/${REL_I18N_DIR}/${TARGET_LOCALE}.json`;
  const file = path.join(packageRoot, ...relative.split('/'));
  if (!existsSync(file)) return false;
  if (revertRoot && existsSync(path.join(revertRoot, 'files', ...relative.split('/')))) {
    log(`${relative} 是官方原件，已由备份写回`);
    return false;
  }
  rmSync(file, { force: true });
  log(`已删除 ${relative}`);
  return true;
}

/** 删掉安装时写进去的 locale 字段。若整个文件都是安装时新建的、现在只剩空壳，就连文件一起删。 */
function dropLocale({ target, createdByInstall, log }) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, 'utf8'));
  } catch {
    return { restored: false, reason: 'not-an-object' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { restored: false, reason: 'not-an-object' };
  }
  if (!('locale' in parsed)) return { restored: false, reason: 'absent-before' };
  delete parsed.locale;
  const name = path.basename(target);
  if (createdByInstall && Object.keys(parsed).length === 0) {
    rmSync(target, { force: true });
    log(`已删除安装时新建的 ${name}`);
    return { restored: true, reason: 'removed-file' };
  }
  writeFileAtomic(target, `${JSON.stringify(parsed, null, 2)}\n`);
  log(`已删除安装时写进 ${name} 的语言设置`);
  return { restored: true, reason: 'removed-key' };
}

/** 把 locale 改回安装前的值。sidecar 里 previous 为 null 表示安装时该字段本就不存在。 */
export function restoreLocale({ configPath, revertRoot, log = () => {} }) {
  const sidecar = path.join(revertRoot, 'config-locale.json');
  if (!existsSync(sidecar)) return { restored: false, reason: 'no-sidecar' };
  const record = JSON.parse(readFileSync(sidecar, 'utf8'));
  const target = record.configPath || configPath;
  // sidecar 是本机可写的文件，不能让它把写入引到别的目录：只认安装时记下的那个配置目录
  if (path.resolve(path.dirname(target)) !== path.resolve(path.dirname(configPath))) {
    return { restored: false, reason: 'path-mismatch' };
  }
  if (!existsSync(target)) return { restored: false, reason: 'config-gone' };
  if (record.previous === null || record.previous === undefined) {
    return dropLocale({ target, createdByInstall: record.existed === false, log });
  }
  const result = setLocale(readFileSync(target, 'utf8'), record.previous);
  if (!result) return { restored: false, reason: 'not-an-object' };
  writeFileAtomic(target, result.text);
  log(`已把界面语言还原为 ${record.previous}`);
  return { restored: true, reason: 'replaced' };
}

export function restoreAll({ paths, state, log = () => {} }) {
  const files = restoreFiles({ packageRoot: paths.packageRoot, revertRoot: paths.revertRoot, log });
  const catalogRemoved = removeAddedCatalog({
    packageRoot: paths.packageRoot,
    revertRoot: paths.revertRoot,
    log
  });
  const locale = restoreLocale({ configPath: paths.configPath, revertRoot: paths.revertRoot, log });
  const shortcuts = state?.shortcuts?.length ? removeShortcuts(state.shortcuts, { log }) : 0;
  if (existsSync(paths.statePath)) rmSync(paths.statePath, { force: true });
  return { ...files, catalogRemoved, locale, shortcuts };
}

export const revertExists = paths => existsSync(path.join(paths.revertRoot, 'files'))
  || existsSync(path.join(paths.revertRoot, 'config-locale.json'));
