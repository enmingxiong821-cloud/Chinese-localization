import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyPatches, backupFile, refreshPackage, writeFileAtomic, writeLauncher, writeLocale, writeReadme } from './install-apply.mjs';
import { findWhitelistTargets, inspectHtmlFiles, measureCoverage } from './install-plan.mjs';
import { removeAddedCatalog, restoreFiles, restoreLocale } from './install-restore.mjs';

const ARRAY = '["en-US","de-DE","es-ES","id-ID"]';
const INDEX_HTML = '<head><meta charset="UTF-8"><meta name="viewport" content="w"></head>';
const SHELL_HTML = '<head><meta charset="utf-8"><title>t</title></head>';

function makePackage() {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-pkg-'));
  const app = path.join(root, 'app');
  const ion = path.join(app, 'resources', 'ion-dist');
  const assets = path.join(ion, 'assets', 'v1');
  mkdirSync(assets, { recursive: true });
  mkdirSync(path.join(ion, 'i18n'), { recursive: true });
  writeFileSync(path.join(ion, 'i18n', 'en-US.json'), JSON.stringify({ a: 'Alpha', b: 'Beta', c: 'Gamma' }, null, 2));
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
    assets,
    bundle: path.join(assets, 'shared-50-TEST.js')
  };
}

const patchOptions = fixture => ({
  packageRoot: fixture.packageRoot,
  baseCatalog: { a: 'Alpha', b: 'Beta', c: 'Gamma' },
  overrides: { a: '甲', z: '不在底座' },
  revertRoot: fixture.revertRoot
});

test('applyPatches 生成词典、追加白名单、注入四个页面', () => {
  const fixture = makePackage();
  const { patched, added } = applyPatches(patchOptions(fixture));

  const catalog = JSON.parse(readFileSync(path.join(fixture.ion, 'i18n', 'zh-Hans.json'), 'utf8'));
  assert.deepEqual(catalog, { a: '甲', b: 'Beta', c: 'Gamma' });
  assert.deepEqual(added, ['app/resources/ion-dist/i18n/zh-Hans.json']);
  assert.equal(Object.keys(patched).length, 6);

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
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-cfg-'));
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{\n  "locale": "en-US",\n  "keep": "unchanged"\n}\n');
  const result = writeLocale({ configPath, revertRoot: path.join(root, 'revert') });
  assert.equal(result.previous, 'en-US');
  assert.equal(readFileSync(configPath, 'utf8'), '{\n  "locale": "zh-Hans",\n  "keep": "unchanged"\n}\n');
  assert.equal(readFileSync(path.join(root, 'revert', 'config-locale.json'), 'utf8').includes('en-US'), true);
});

test('writeLocale 第二次执行不改动文件', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-cfg-'));
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{"locale":"en-US","a":1}');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  const once = readFileSync(configPath, 'utf8');
  writeLocale({ configPath, revertRoot });
  assert.equal(readFileSync(configPath, 'utf8'), once);
});

test('restoreLocale 把值改回安装前的旧值', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-cfg-'));
  const configPath = path.join(root, 'config.json');
  writeFileSync(configPath, '{"locale":"en-US","a":1}');
  const revertRoot = path.join(root, 'revert');
  writeLocale({ configPath, revertRoot });
  const result = restoreLocale({ configPath, revertRoot });
  assert.equal(result.restored, true);
  assert.equal(readFileSync(configPath, 'utf8'), '{"locale":"en-US","a":1}');
});

test('restoreLocale 删掉安装时新建的配置文件，不留 locale 残留', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-cfg-'));
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
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-cfg-'));
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
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-rm-'));
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
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-rf-'));
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
  writeFileSync(official, '{"official":"词典"}');
  applyPatches(patchOptions(fixture));
  assert.notEqual(readFileSync(official, 'utf8'), '{"official":"词典"}', '补丁应覆盖官方词典');

  restoreFiles({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot });
  assert.equal(readFileSync(official, 'utf8'), '{"official":"词典"}');
  assert.equal(
    removeAddedCatalog({ packageRoot: fixture.packageRoot, revertRoot: fixture.revertRoot }),
    false,
    '官方自带的词典不能删，否则「逐字节还原」不成立'
  );
  assert.equal(existsSync(official), true);
});

test('writeFileAtomic 落盘内容与预期一致且不留临时文件', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-io-'));
  const file = path.join(root, 'x.json');
  writeFileAtomic(file, '内容');
  assert.equal(readFileSync(file, 'utf8'), '内容');
});

test('启动器把 userData 指到副本自己的目录，才有独立单实例锁', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'claude-zh-ln-'));
  const launcher = path.join(root, '启动.cmd');
  writeLauncher(launcher);
  const text = readFileSync(launcher, 'utf8');
  assert.match(text, /set "LOCALAPPDATA=%~dp0profile"/);
  assert.match(text, /--user-data-dir="%~dp0profile\\Claude"/);
  assert.match(text, /start "" "%~dp0package\\app\\claude\.exe"/);
  assert.equal(text.includes('\n') && !text.includes('\r\n'), false, '启动器必须是 CRLF 换行');
});
