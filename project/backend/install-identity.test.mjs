/** 安装标识测试：全部数据在系统临时目录合成，不读取也不触碰真实安装。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpDirAsync } from './tmp-fixtures.mjs';
import { DEFAULT_KEY_FILES, compareIdentity, identityComplete, readInstallIdentity } from './install-identity.mjs';

const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
  <Identity Name="Anthropic.Claude" Publisher="CN=Anthropic, O=Anthropic" Version="2.31226.1.0" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Claude</DisplayName></Properties>
</Package>`;

const baseFiles = {
  'app/resources/app.asar': 'asar-fixture',
  'app/resources/en-US.json': '{"Settings":"Settings"}',
  'app/resources/zh-Hans.json': '{"Settings":"设置"}',
  'app/resources/ion-dist/i18n/en-US.json': '{"a":"A"}'
};

async function packageFixture(files = baseFiles, manifest = MANIFEST) {
  const root = await tmpDirAsync('install-identity-');
  for (const [relative, value] of Object.entries({ 'AppxManifest.xml': manifest, ...files })) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  return root;
}

test('标识字段来自AppxManifest且关键文件逐一流式哈希', async () => {
  const identity = await readInstallIdentity(await packageFixture());
  assert.equal(identity.packageName, 'Anthropic.Claude');
  assert.equal(identity.packageVersion, '2.31226.1.0');
  assert.equal(identity.architecture, 'x64');
  assert.equal(identity.publisher, 'CN=Anthropic, O=Anthropic');
  assert.ok(identity.appRoot.endsWith(`${path.sep}app`));
  assert.equal(identity.files.length, DEFAULT_KEY_FILES.length);
  assert.ok(identity.files.every(file => file.status === 'hashed' && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.ok(identityComplete(identity));
});

test('同一内容在不同安装位置得到相同标识', async () => {
  const left = await readInstallIdentity(await packageFixture());
  const right = await readInstallIdentity(await packageFixture());
  assert.notEqual(left.appRoot, right.appRoot);
  assert.equal(left.identitySha256, right.identitySha256);
});

test('关键文件内容变化即改变标识', async () => {
  const before = await readInstallIdentity(await packageFixture());
  const after = await readInstallIdentity(await packageFixture({ ...baseFiles, 'app/resources/zh-Hans.json': '{"Settings":"设定"}' }));
  assert.notEqual(before.identitySha256, after.identitySha256);
});

test('关键文件缺失时标识不完整并拒绝比对', async () => {
  const { 'app/resources/zh-Hans.json': _omitted, ...partial } = baseFiles;
  const identity = await readInstallIdentity(await packageFixture(partial));
  assert.equal(identity.files.find(file => file.path === 'resources/zh-Hans.json').status, 'missing');
  assert.equal(identityComplete(identity), false);
  assert.throws(() => compareIdentity(identity, identity), /标识不完整/);
});

test('比对失败时指出漂移的具体文件', async () => {
  const expected = await readInstallIdentity(await packageFixture());
  const actual = await readInstallIdentity(await packageFixture({ ...baseFiles, 'app/resources/ion-dist/i18n/en-US.json': '{"a":"B"}' }));
  assert.throws(() => compareIdentity(expected, actual), /resources\/ion-dist\/i18n\/en-US\.json/);
  assert.equal(compareIdentity(expected, expected), true);
});

test('AppxManifest缺少Identity元素时抛错', async () => {
  await assert.rejects(readInstallIdentity(await packageFixture(baseFiles, '<Package></Package>')), /缺少 Identity/);
});

test('属性值中的XML实体按单趟规则反转义', async () => {
  const manifest = '<Package><Identity Name="A&amp;B" Version="2.0" Publisher="CN=&quot;Anthropic, PBC&quot; &amp;quot;double&amp;quot; &#x27;q&#x27;" ProcessorArchitecture="x64" /></Package>';
  const identity = await readInstallIdentity(await packageFixture(baseFiles, manifest));
  assert.equal(identity.packageName, 'A&B');
  // 双重编码只能还原一层，否则同一份清单会随编码风格得到不同标识。
  assert.equal(identity.publisher, 'CN="Anthropic, PBC" &quot;double&quot; \'q\'');
});

test('相对路径与非法关键文件路径拒绝', async () => {
  await assert.rejects(readInstallIdentity('.', DEFAULT_KEY_FILES), /绝对/);
  await assert.rejects(readInstallIdentity(await packageFixture(), ['../escape.json']), /路径非法/);
});

test('默认关键文件不含本项目将来写入的资源', async () => {
  assert.ok(!DEFAULT_KEY_FILES.includes('resources/ion-dist/i18n/zh-Hans.json'));
});
