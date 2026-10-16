/** 合成安装资源测试：测试数据只在系统临时目录创建。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, realpath, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpDirAsync } from './tmp-fixtures.mjs';
import { scanApplication } from './scanner.mjs';

async function fixture(files = {}) {
  const root = await tmpDirAsync('localization-scan-');
  for (const [relative, value] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  return root;
}
const cursorFiles = {
  'resources/app/package.json': '{"version":"fixture-1"}',
  'resources/app/out/nls.keys.json': '[["module",["first","second"]]]',
  'resources/app/out/nls.messages.json': '["First","Second"]'
};
test('正常资源计数、指纹及扫描前后内容和修改时间一致', async () => {
  const root = await fixture(cursorFiles);
  const before = await Promise.all(Object.keys(cursorFiles).map(async relative => ({ content: await readFile(path.join(root, relative)), modified: (await stat(path.join(root, relative))).mtimeMs })));
  const report = await scanApplication('cursor', root);
  assert.equal(report.version, 'fixture-1');
  assert.deepEqual(report.nls, { modules: 1, keys: 2, messages: 2, aligned: true });
  assert.equal(report.compatibility, 'not-verified');
  assert.ok(report.resources.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
  const after = await Promise.all(Object.keys(cursorFiles).map(async relative => ({ content: await readFile(path.join(root, relative)), modified: (await stat(path.join(root, relative))).mtimeMs })));
  assert.deepEqual(after, before);
  assert.ok(!JSON.stringify(report).includes('First'));
});
test('缺失资源不伪报支持', async () => {
  const report = await scanApplication('claude', await fixture());
  assert.equal(report.version, null);
  assert.ok(report.resources.every(file => file.status === 'missing'));
});
test('损坏 JSON 及不匹配键数量有明确结果', async () => {
  const root = await fixture({ ...cursorFiles, 'resources/app/package.json': '{broken', 'resources/app/out/nls.messages.json': '["Only"]' });
  const report = await scanApplication('cursor', root);
  assert.equal(report.resources[0].status, 'invalid-json');
  assert.equal(report.nls.aligned, false);
});
test('无效 NLS 结构与 BOM', async () => {
  const root = await fixture({ ...cursorFiles, 'resources/app/package.json': '\uFEFF{"version":"bom"}', 'resources/app/out/nls.keys.json': '{"wrong":[]}' });
  const report = await scanApplication('cursor', root);
  assert.equal(report.version, 'bom');
  assert.equal(report.nls.keys, null);
  assert.equal(report.nls.aligned, false);
});
test('拒绝未知应用与相对路径', async () => {
  await assert.rejects(scanApplication('__proto__', 'relative'));
  await assert.rejects(scanApplication('cursor', '.'));
});
test('超大资源不读取正文', async () => {
  const root = await fixture({ 'resources/en-US.json': ' '.repeat(16 * 1024 * 1024 + 1) });
  const report = await scanApplication('claude', root);
  assert.equal(report.resources[0].status, 'too-large');
});
test('WindowsApps包根自动下钻到Electron应用根', async () => {
  const packageRoot = await fixture({ 'app/resources/app.asar': 'asar', 'app/resources/en-US.json': '{"a":"b"}' });
  const report = await scanApplication('claude', packageRoot);
  assert.equal(report.appRoot, path.join(await realpath(packageRoot), 'app'));
  assert.equal(report.resources[0].status, 'read');
  assert.equal(report.resources[0].path, 'resources/en-US.json');
});
test('直接传Electron应用根时不下钻', async () => {
  const appRoot = await fixture({ 'resources/app.asar': 'asar', 'resources/en-US.json': '{}' });
  const report = await scanApplication('claude', appRoot);
  assert.equal(report.appRoot, await realpath(appRoot));
  assert.equal(report.resources[0].status, 'read');
});
test('包根下的app为链接时不下钻', async () => {
  const outside = await fixture({ 'resources/app.asar': 'asar' });
  const packageRoot = await fixture();
  await symlink(outside, path.join(packageRoot, 'app'), process.platform === 'win32' ? 'junction' : 'dir');
  const report = await scanApplication('claude', packageRoot);
  assert.equal(report.appRoot, await realpath(packageRoot));
});
test('中间目录链接拒绝读取', async () => {
  const root = await fixture();
  const outside = await fixture({ 'en-US.json': '{"secret":"hidden"}' });
  await symlink(outside, path.join(root, 'resources'), process.platform === 'win32' ? 'junction' : 'dir');
  const report = await scanApplication('claude', root);
  assert.ok(report.resources.every(file => file.status === 'link-rejected'));
});
