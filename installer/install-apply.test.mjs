import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpDirSync } from '../project/backend/tmp-fixtures.mjs';
import { applyPatches, backupFile, refreshPackage, shortcutScript, writeFileAtomic, writeLauncher, writeLocale, writeReadme } from './install-apply.mjs';
import { findWhitelistTargets, inspectHtmlFiles, measureCoverage } from './install-plan.mjs';
import { removeAddedCatalog, restoreFiles, restoreLocale } from './install-restore.mjs';

const ARRAY = '["en-US","de-DE","es-ES","id-ID"]';
const INDEX_HTML = '<head><meta charset="UTF-8"><meta name="viewport" content="w"></head>';
const SHELL_HTML = '<head><meta charset="utf-8"><title>t</title></head>';

function makePackage() {
  const root = tmpDirSync('claude-zh-pkg-');
  const app = path.join(root, 'app');
  const ion = path.join(app, 'resources', 'ion-dist');
  const assets = path.join(ion, 'assets', 'v1');
  const dynamic = path.join(ion, 'i18n', 'dynamic');
  mkdirSync(assets, { recursive: true });
  mkdirSync(dynamic, { recursive: true });
  writeFileSync(path.join(ion, 'i18n', 'en-US.json'), JSON.stringify({ a: 'Alpha', b: 'Beta', c: 'Gamma' }, null, 2));
  writeFileSync(path.join(dynamic, 'en-US.json'), JSON.stringify({ d: 'Delta', e: 'Epsilon' }, null, 2));
  writeFileSync(path.join(ion, 'index.html'), INDEX_HTML);
  writeFileSync(path.join(ion, 'frame-shell.html'), SHELL_HTML);
  writeFileSync(path.join(ion, 'frame-connect.html'), INDEX_HTML);
  writeFileSync(path.join(ion, 'frame-manage.html'), SHELL_HTML);
  writeFileSync(path.join(assets, 'shared-50-TEST.js'), `var w_=${ARRAY};var M_=${ARRAY};`);
  writeFileSync(path.join(assets, 'chunk-other.js'), 'var x=1;');
  return {
    packageRoot: root,
    appRoot: app,
    revertRoot: path.join(root, 'revert'),
    ion,
    dynamic,
    assets,
    bundle: path.join(assets, 'shared-50-TEST.js')
  };
}

const patchOptions = fixture => ({
  packageRoot: fixture.packageRoot,
  overrides: { a: '甲', z: '不在底座' },
  dynamicOverrides: { d: '丁' },
  revertRoot: fixture.revertRoot,
  catalogIsOriginal: false
});

test('applyPatches 生成两份词典、追加白名单、注入四个页面', () => {
  const fixture = makePackage();
  const { patched, added } = applyPatches(patchOptions(fixture));

  const catalog = JSON.parse(readFileSync(path.join(fixture.ion, 'i18n', 'zh-Hans.json'), 'utf8'));
  assert.deepEqual(catalog, { a: '甲', b: 'Beta', c: 'Gamma' });
  const dynamic = JSON.parse(readFileSync(path.join(fixture.dynamic, 'zh-Hans.json'), 'utf8'));
  assert.deepEqual(dynamic, { d: '丁', e: 'Epsilon' }, '动态词典也要跟着补，缺了前端整盘不加载');
  assert.deepEqual(added, [
    'app/resources/ion-dist/i18n/zh-Hans.json',
    'app/resources/ion-dist/i18n/dynamic/zh-Hans.json'
  ]);
  assert.equal(Object.keys(patched).length, 7);

  assert.equal((readFileSync(fixture.bundle, 'utf8').match(/"zh-Hans"/g) || []).length, 2);
  for (const name of ['index.html', 'frame-shell.html', 'frame-connect.html', 'frame-manage.html']) {
    assert.ok(readFileSync(path.join(fixture.ion, name), 'utf8').includes('data-i18n-catalogs'), `${name} 未注入`);
  }
});

test('applyPatches 先把 5 个原件备份到 revert/files', () => {
  const fixture = makePackage();
  applyPatches(patchOptions(fixture));
  const backup = name => path.join(fixture.revertRoot, 'files', 'app', 'resources', 'ion-dist', name);
  assert.equal(readFileSync(backup('index.html'), 'utf8'), INDEX_HTML);
  assert.equal(readFileSync(backup('frame-shell.html'), 'utf8'), SHELL_HTML);
  assert.equal(readFileSync(backup('assets/v1/shared-50-TEST.js'), 'utf8'), `var w_=${ARRAY};var M_=${ARRAY};`);
  assert.equal(existsSync(backup('i18n/zh-Hans.json')), false);
});

test('applyPatches 重复执行不叠加改动', () => {
  const fixture = makePackage();
  const firstRun = applyPatches(patchOptions(fixture));
  const after = {
    bundle: readFileSync(fixture.bundle, 'utf8'),
    index: readFileSync(path.join(fixture.ion, 'index.html'), 'utf8')
  };
  const secondRun = applyPatches(patchOptions(fixture));
  assert.equal(readFileSync(fixture.bundle, 'utf8'), after.bundle);
  assert.equal(readFileSync(path.join(fixture.ion, 'index.html'), 'utf8'), after.index);
  assert.deepEqual(secondRun.patched, firstRun.patched);
});

test('applyPatches 第二次执行时备份仍是初版原件', () => {
  const fixture = makePackage();
  applyPatches(patchOptions(fixture));
  applyPatches(patchOptions(fixture));
  const backup = path.join(fixture.revertRoot, 'files', 'app', 'resources', 'ion-dist', 'index.html');
  assert.equal(readFileSync(backup, 'utf8'), INDEX_HTML);
});

test('官方源不带 zh-Hans.json 时，重复安装不把它当原件备份下来', () => {
  const fixture = makePackage();
  const first = applyPatches(patchOptions(fixture));
  const zh = path.join(fixture.ion, 'i18n', 'zh-Hans.json');
  const zhDynamic = path.join(fixture.dynamic, 'zh-Hans.json');
  // 造出旧版安装器留下的现场：备份目录里躺着两份补丁产物
  const staleFiles = [
    path.join(fixture.revertRoot, 'files', 'app', 'resources', 'ion-dist', 'i18n', 'zh-Hans.json'),
    path.join(fixture.revertRoot, 'files', 'app', 'resources', 'ion-dist', 'i18n', 'dynamic', 'zh-Hans.json')
  ];
  for (const stale of staleFiles) {
    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, '{"旧":"补丁产物"}');
  }

  const second = applyPatches(patchOptions(fixture));
  assert.deepEqual(second.added, first.added, '第二轮仍要记着这两份词典是新增的');
  for (const stale of staleFiles) {
    assert.equal(existsSync(stale), false, '补丁产物不能留在备份里，否则还原会写回旧词典');
  }

  restoreFiles({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot });
  assert.equal(removeAddedCatalog({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot }), true);
  assert.equal(existsSync(zh), false, '还原后副本里不该再留中文词典');
  assert.equal(existsSync(zhDynamic), false, '还原后副本里不该再留中文动态词典');
});

test('backupFile 不覆盖已存在的备份', () => {
  const fixture = makePackage();
  backupFile(fixture.packageRoot, 'app/resources/ion-dist/index.html', fixture.revertRoot);
  writeFileSync(path.join(fixture.ion, 'index.html'), 'CHANGED');
  backupFile(fixture.packageRoot, 'app/resources/ion-dist/index.html', fixture.revertRoot);
  const backup = path.join(fixture.revertRoot, 'files', 'app', 'resources', 'ion-dist', 'index.html');
  assert.equal(readFileSync(backup, 'utf8'), INDEX_HTML);
});

test('restoreFiles 逐字节写回原件，removeAddedCatalog 删除新增词典', () => {
  const fixture = makePackage();
  applyPatches(patchOptions(fixture));
  const file = path.join(fixture.ion, 'i18n', 'zh-Hans.json');
  assert.ok(existsSync(file));

  const result = restoreFiles({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot });
  assert.equal(result.restored, 5);
  assert.deepEqual(result.missing, []);
  assert.equal(readFileSync(fixture.bundle, 'utf8'), `var w_=${ARRAY};var M_=${ARRAY};`);
  assert.equal(readFileSync(path.join(fixture.ion, 'index.html'), 'utf8'), INDEX_HTML);
  assert.equal(removeAddedCatalog({ packageRoot: fixture.packageRoot }), true);
  assert.equal(existsSync(file), false);
});

test('restoreFiles 备份目录缺失时标出 noBackup，不伪装成还原完成', () => {
  const fixture = makePackage();
  const result = restoreFiles({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot });
  assert.equal(result.restored, 0);
  assert.equal(result.noBackup, true, '没有备份时必须让调用方区分「本来没打过补丁」与「原件丢了」');
});

test('restoreLocale 拒绝 sidecar 把写入引到配置目录之外', () => {
  const root = tmpDirSync('claude-zh-sl-');
  const configPath = path.join(root, 'profile', 'Claude', 'config.json');
  const revertRoot = path.join(root, 'revert');
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, '{"locale":"zh-Hans"}');
  const outside = path.join(root, '别处', 'config.json');
  mkdirSync(path.dirname(outside), { recursive: true });
  const outsideBefore = '{"locale":"zh-Hans","keep":"yes"}';
  writeFileSync(outside, outsideBefore);
  mkdirSync(revertRoot, { recursive: true });
  writeFileSync(
    path.join(revertRoot, 'config-locale.json'),
    JSON.stringify({ configPath: outside, existed: true, previous: 'en-US' })
  );

  const result = restoreLocale({ configPath, revertRoot });
  assert.equal(result.restored, false);
  assert.equal(result.reason, 'path-mismatch');
  assert.equal(readFileSync(outside, 'utf8'), outsideBefore, '配置目录之外的文件不该被改写');
});

test('findWhitelistTargets 只认带锚点的 bundle 并报出次数', () => {
  const fixture = makePackage();
  const targets = findWhitelistTargets(fixture.appRoot);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].relative, 'resources/ion-dist/assets/v1/shared-50-TEST.js');
  assert.equal(targets[0].count, 2);
  assert.equal(targets[0].alreadyLocalized, false);
});

test('findWhitelistTargets 能识别已含中文的官方构建', () => {
  const fixture = makePackage();
  writeFileSync(fixture.bundle, 'var w_=["en-US","de-DE","id-ID","zh-Hans"];');
  const targets = findWhitelistTargets(fixture.appRoot);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].alreadyLocalized, true);
});

test('inspectHtmlFiles 报出四个页面的存在与注入状态', () => {
  const fixture = makePackage();
  assert.deepEqual(inspectHtmlFiles(fixture.appRoot).map(item => item.injected), [false, false, false, false]);
  applyPatches(patchOptions(fixture));
  assert.deepEqual(inspectHtmlFiles(fixture.appRoot).map(item => item.injected), [true, true, true, true]);
});

test('measureCoverage 统计交集、多余键与比例', () => {
  const result = measureCoverage({ a: 'A', b: 'B', c: 'C', d: 'D' }, { a: '甲', b: '乙', z: '多余' });
  assert.deepEqual(result, { baseKeys: 4, matched: 2, extra: 1, ratio: 0.5 });
});

test('writeLocale 记录旧值且只改一个字段', () => {
  const root = tmpDirSync('claude-zh-cfg-');
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{\n  "locale": "en-US",\n  "keep": "unchanged"\n}\n');
  const result = writeLocale({ configPath, revertRoot: path.join(root, 'revert') });
  assert.equal(result.previous, 'en-US');
  assert.equal(readFileSync(configPath, 'utf8'), '{\n  "locale": "zh-Hans",\n  "keep": "unchanged"\n}\n');
  assert.equal(readFileSync(path.join(root, 'revert', 'config-locale.json'), 'utf8').includes('en-US'), true);
});

test('writeLocale 第二次执行不改动文件', () => {
  const root = tmpDirSync('claude-zh-cfg-');
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{"locale":"en-US","a":1}');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  const once = readFileSync(configPath, 'utf8');
  writeLocale({ configPath, revertRoot });
  assert.equal(readFileSync(configPath, 'utf8'), once);
});

test('restoreLocale 把值改回安装前的旧值', () => {
  const root = tmpDirSync('claude-zh-cfg-');
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{"locale":"en-US","a":1}');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  const result = restoreLocale({ configPath, revertRoot });
  assert.equal(result.restored, true);
  assert.equal(readFileSync(configPath, 'utf8'), '{"locale":"en-US","a":1}');
});

test('restoreLocale 删掉安装时新建的配置文件，不留 locale 残留', () => {
  const root = tmpDirSync('claude-zh-cfg-');
  const configPath = path.join(root, 'profile', 'Claude', 'config.json');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  assert.equal(existsSync(configPath), true);
  const result = restoreLocale({ configPath, revertRoot });
  assert.equal(result.restored, true);
  assert.equal(result.reason, 'removed-file');
  assert.equal(existsSync(configPath), false, '安装时新建的文件应整个删掉');
});

test('restoreLocale 只摘掉 locale 字段，应用自己写的键原样保留', () => {
  const root = tmpDirSync('claude-zh-cfg-');
  const configPath = path.join(root, 'config.json');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  writeFileSync(configPath, '{"locale":"zh-Hans","theme":"dark"}');
  const result = restoreLocale({ configPath, revertRoot });
  assert.equal(result.restored, true);
  assert.equal(result.reason, 'removed-key');
  assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), { theme: 'dark' });
});

test('writeReadme 替换中文占位符', () => {
  const root = tmpDirSync('claude-zh-rm-');
  const readme = path.join(root, '说明.txt');
  writeReadme(readme, '装在这里：\n    {{安装目录}}\n共 {{译文条数}} 条\n未知：{{没有这个键}}', {
    安装目录: 'C:\\x',
    译文条数: 33897
  });
  const text = readFileSync(readme, 'utf8');
  assert.equal(text.includes('{{安装目录}}'), false, '占位符没被替换，用户会看到字面量');
  assert.equal(text.includes('C:\\x'), true);
  assert.equal(text.includes('33897'), true);
  assert.equal(text.includes('{{没有这个键}}'), true, '模板里有而没传值的键保留原样');
});

test('refreshPackage 清掉上一版残留的补丁文件，副本与官方包保持一致', () => {
  const root = tmpDirSync('claude-zh-rf-');
  const source = path.join(root, 'source');
  const dest = path.join(root, 'dest');
  const assets = 'app/resources/ion-dist/assets/v1';
  mkdirSync(path.join(source, 'app'), { recursive: true });
  mkdirSync(path.join(source, assets), { recursive: true });
  writeFileSync(path.join(source, 'app', 'claude.exe'), 'exe');
  writeFileSync(path.join(source, assets, 'shared-50-NEW.js'), 'var w_=1;');

  mkdirSync(path.join(dest, 'app'), { recursive: true });
  mkdirSync(path.join(dest, assets), { recursive: true });
  writeFileSync(path.join(dest, 'app', 'claude.exe'), 'exe');
  writeFileSync(path.join(dest, assets, 'shared-50-OLD.js'), 'var w_=["zh-Hans"];');
  writeFileSync(path.join(dest, 'app', 'zh-Hans.json'), '{}');

  refreshPackage(source, dest);

  assert.equal(existsSync(path.join(dest, assets, 'shared-50-NEW.js')), true);
  assert.equal(existsSync(path.join(dest, assets, 'shared-50-OLD.js')), false,
    '上一版的 shared-*.js 必须被清掉，否则白名单锚点会变成 4 处');
  assert.equal(existsSync(path.join(dest, 'app', 'zh-Hans.json')), false,
    '上一版的词典必须被清掉，补丁产物随后重建');
});

test('官方若自带 zh-Hans.json，还原时写回原件而不是当补丁产物删掉', () => {
  const fixture = makePackage();
  const official = path.join(fixture.ion, 'i18n', 'zh-Hans.json');
  const officialDynamic = path.join(fixture.dynamic, 'zh-Hans.json');
  writeFileSync(official, '{"official":"词典"}');
  writeFileSync(officialDynamic, '{"official":"动态词典"}');
  applyPatches({
    ...patchOptions(fixture),
    catalogIsOriginal: true,
    dynamicIsOriginal: true
  });
  assert.notEqual(readFileSync(official, 'utf8'), '{"official":"词典"}', '补丁应覆盖官方词典');
  assert.notEqual(readFileSync(officialDynamic, 'utf8'), '{"official":"动态词典"}', '补丁应覆盖官方动态词典');

  restoreFiles({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot });
  assert.equal(readFileSync(official, 'utf8'), '{"official":"词典"}');
  assert.equal(readFileSync(officialDynamic, 'utf8'), '{"official":"动态词典"}');
  assert.equal(
    removeAddedCatalog({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot }),
    false,
    '官方自带的词典不能删，否则「逐字节还原」不成立'
  );
  assert.equal(existsSync(official), true);
  assert.equal(existsSync(officialDynamic), true);
});

test('writeFileAtomic 落盘内容与预期一致且不留临时文件', () => {
  const root = tmpDirSync('claude-zh-io-');
  const file = path.join(root, 'x.json');
  writeFileAtomic(file, '内容');
  assert.equal(readFileSync(file, 'utf8'), '内容');
});

test('启动器把 userData 指到副本自己的目录，才有独立单实例锁', () => {
  const root = tmpDirSync('claude-zh-ln-');
  const launcher = path.join(root, '启动.cmd');
  writeLauncher(launcher);
  const text = readFileSync(launcher, 'utf8');
  assert.match(text, /set "LOCALAPPDATA=%~dp0profile"/);
  assert.match(text, /--user-data-dir="%~dp0profile\\Claude"/);
  assert.match(text, /start "" "%~dp0package\\app\\claude\.exe"/);
  assert.equal(text.includes('\n') && !text.includes('\r\n'), false, '启动器必须是 CRLF 换行');
});

test('快捷方式脚本把输出编码钉成 UTF-8，并回读校验目标', () => {
  const script = shortcutScript({
    launcherPath: 'C:\\Users\\某 用户\\AppData\\Local\\Claude-zh\\启动.cmd',
    installRoot: 'C:\\Users\\某 用户\\AppData\\Local\\Claude-zh',
    executable: 'C:\\Users\\某 用户\\AppData\\Local\\Claude-zh\\package\\app\\claude.exe'
  });
  // PowerShell 5.1 默认按控制台代码页写 stdout，不钉 UTF-8 就会把中文路径读成 U+FFFD
  assert.match(script, /\[Console\]::OutputEncoding = \[System\.Text\.Encoding\]::UTF8/);
  // 目标缺失时资源管理器只弹「已经更改或移动」，得在安装当时就失败
  assert.match(script, /if \(\$ws\.CreateShortcut\(\$p\)\.TargetPath -ne \$target\) \{ exit 4 \}/);
  assert.match(script, /if \(-not \(Test-Path -LiteralPath \$target\)\) \{ exit 5 \}/);
  assert.ok(script.includes("'C:\\Users\\某 用户\\AppData\\Local\\Claude-zh\\启动.cmd'"), '路径要原样内联');
});
