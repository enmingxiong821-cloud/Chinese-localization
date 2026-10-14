/** 备份与恢复事务测试：数据全部在系统临时目录合成，从不写入真实安装目录。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildRestorePlan, createBackup, planBackup, verifyBackup } from './backup-transaction.mjs';
import { readInstallIdentity } from './install-identity.mjs';

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<Package><Identity Name="Anthropic.Claude" Publisher="CN=Anthropic" Version="2.31226.1.0" ProcessorArchitecture="x64" /></Package>`;

const PATCHED = 'resources/ion-dist/i18n/zh-Hans.json';
const ABSENT = 'resources/ion-dist/i18n/zh-Hans.legacy.json';

async function packageFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'backup-pkg-'));
  const files = {
    'AppxManifest.xml': MANIFEST,
    'app/resources/app.asar': 'asar-fixture',
    'app/resources/en-US.json': '{"Settings":"Settings"}',
    'app/resources/zh-Hans.json': '{"Settings":"设置"}',
    'app/resources/ion-dist/i18n/en-US.json': '{"a":"A"}',
    'app/resources/ion-dist/i18n/zh-Hans.json': '{"a":"甲"}',
    ...overrides
  };
  for (const [relative, value] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  return root;
}

async function backupRoot() {
  return mkdtemp(path.join(tmpdir(), 'backup-dest-'));
}

test('计划为只读且记录完整标识与目标指纹', async () => {
  const root = await packageFixture();
  const target = path.join(root, 'app', ...PATCHED.split('/'));
  const before = { content: await readFile(target), modified: (await stat(target)).mtimeMs };
  const plan = await planBackup(root, [PATCHED, ABSENT]);
  assert.deepEqual(plan.targets, [ABSENT, PATCHED].sort());
  assert.equal(plan.entries.find(entry => entry.path === PATCHED).status, 'hashed');
  assert.equal(plan.entries.find(entry => entry.path === ABSENT).status, 'missing');
  assert.match(plan.identity.identitySha256, /^[a-f0-9]{64}$/);
  assert.deepEqual({ content: await readFile(target), modified: (await stat(target)).mtimeMs }, before);
});

test('创建备份后逐字节复验通过', async () => {
  const root = await packageFixture();
  const destination = await backupRoot();
  const plan = await planBackup(root, [PATCHED, ABSENT]);
  const result = await createBackup(plan, destination);
  assert.equal(result.present, 1);
  assert.equal(result.absent, 1);
  assert.equal(result.packageVersion, '2.31226.1.0');
  assert.equal(path.dirname(result.directory), destination);
  const verified = await verifyBackup(result.directory);
  assert.equal(verified.valid, true);
  assert.equal(verified.identitySha256, plan.identity.identitySha256);
  assert.deepEqual(verified.targets, plan.targets);
  assert.equal(await readFile(path.join(result.directory, 'files', ...PATCHED.split('/')), 'utf8'), '{"a":"甲"}');
});

test('计划与备份之间源文件变化时拒绝并清理暂存', async () => {
  const root = await packageFixture();
  const destination = await backupRoot();
  const plan = await planBackup(root, [PATCHED, ABSENT]);
  plan.entries.find(entry => entry.path === PATCHED).sha256 = 'f'.repeat(64);
  await assert.rejects(createBackup(plan, destination), /备份期间源文件变化/);
  assert.deepEqual(await readdir(path.join(destination, '.staging')), []);
});

test('备份内容被篡改后复验失败', async () => {
  const root = await packageFixture();
  const destination = await backupRoot();
  const result = await createBackup(await planBackup(root, [PATCHED]), destination);
  await writeFile(path.join(result.directory, 'files', ...PATCHED.split('/')), '{"a":"篡改"}');
  await assert.rejects(verifyBackup(result.directory), /备份文件校验失败/);
});

test('备份目录多出文件时复验失败', async () => {
  const root = await packageFixture();
  const result = await createBackup(await planBackup(root, [PATCHED]), await backupRoot());
  await writeFile(path.join(result.directory, 'files', 'extra.txt'), 'x');
  await assert.rejects(verifyBackup(result.directory), /与清单不一致/);
});

test('安装未变时恢复计划允许执行但仍不执行', async () => {
  const root = await packageFixture();
  const result = await createBackup(await planBackup(root, [PATCHED, ABSENT]), await backupRoot());
  const plan = await buildRestorePlan(result.directory, await readInstallIdentity(root));
  assert.equal(plan.allowed, true);
  assert.equal(plan.reason, null);
  assert.equal(plan.executed, false);
  assert.deepEqual(plan.restore.map(entry => entry.path), [PATCHED]);
  assert.deepEqual(plan.remove.map(entry => entry.path), [ABSENT]);
  assert.ok(plan.notes.some(note => note.includes('不执行任何写入')));
});

test('安装更新后恢复计划拒绝并指出漂移', async () => {
  const root = await packageFixture();
  const result = await createBackup(await planBackup(root, [PATCHED]), await backupRoot());
  await writeFile(path.join(root, 'app', 'resources', 'app.asar'), 'asar-after-update');
  const plan = await buildRestorePlan(result.directory, await readInstallIdentity(root));
  assert.equal(plan.allowed, false);
  assert.match(plan.reason, /app\.asar/);
});

test('目标文件本身的变化不阻断恢复，只作为现值报告', async () => {
  const root = await packageFixture();
  const result = await createBackup(await planBackup(root, [PATCHED]), await backupRoot());
  await writeFile(path.join(root, 'app', ...PATCHED.split('/')), '{"a":"再次改动"}');
  const plan = await buildRestorePlan(result.directory, await readInstallIdentity(root));
  assert.equal(plan.allowed, true);
  assert.equal(plan.current.find(entry => entry.path === PATCHED).bytes, Buffer.byteLength('{"a":"再次改动"}'));
});

test('非法目标路径与非法备份根目录拒绝', async () => {
  const root = await packageFixture();
  await assert.rejects(planBackup(root, ['../escape.json']), /路径非法/);
  await assert.rejects(planBackup(root, []), /1 到/);
  await assert.rejects(planBackup(root, [PATCHED, PATCHED]), /重复/);
  await assert.rejects(createBackup(await planBackup(root, [PATCHED]), 'relative-dir'), /绝对路径/);
});

test('同一目标可备份到同一根目录下的多个独立目录', async () => {
  const destination = await backupRoot();
  const first = await createBackup(await planBackup(await packageFixture(), [PATCHED]), destination);
  const second = await createBackup(await planBackup(await packageFixture(), [PATCHED]), destination);
  assert.notEqual(first.directory, second.directory);
  await verifyBackup(first.directory);
  await verifyBackup(second.directory);
});
