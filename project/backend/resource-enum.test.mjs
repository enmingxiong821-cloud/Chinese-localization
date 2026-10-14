/** 语言资源枚举测试：数据全部在系统临时目录合成，不读取也不触碰真实安装。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BASE_LOCALE, buildLocaleSkeleton, enumerateLocaleResources, FRONTEND_DIR, SHELL_DIR } from './resource-enum.mjs';

const MANIFEST = '<Package><Identity Name="Claude" Version="1.0.0.0" Publisher="CN=X" ProcessorArchitecture="x64" /></Package>';
const EN = { a: 'Alpha', b: 'Beta', c: 'Gamma' };
const DE = { a: 'Alpha-de', b: 'Beta-de', z: 'Zeta-de' };

const json = value => JSON.stringify(value, null, 2) + '\n';

function baseFiles(extra = {}) {
  return {
    'AppxManifest.xml': MANIFEST,
    'app/resources/app.asar': 'asar-fixture',
    [`app/${SHELL_DIR}/en-US.json`]: '{}',
    [`app/${SHELL_DIR}/zh-Hans.json`]: '{}',
    [`app/${SHELL_DIR}/de-DE.json`]: '{}',
    [`app/${FRONTEND_DIR}/en-US.json`]: json(EN),
    [`app/${FRONTEND_DIR}/de-DE.json`]: json(DE),
    [`app/${FRONTEND_DIR}/de-DE.overrides.json`]: json({ a: 'Alpha-ovr' }),
    [`app/${FRONTEND_DIR}/dynamic/en-US.json`]: json({ d: 'Delta' }),
    [`app/${FRONTEND_DIR}/dynamic/de-DE.json`]: json({ d: 'Delta-de' }),
    ...extra
  };
}

async function packageFixture(files = baseFiles()) {
  const root = await mkdtemp(path.join(tmpdir(), 'locale-enum-'));
  for (const [relative, value] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  return root;
}

test('报告区分壳层与前端层并指出目标不在前端发布名单', async () => {
  const report = await enumerateLocaleResources(await packageFixture());
  assert.equal(report.target, 'zh-Hans');
  assert.equal(report.shell.count, 3);
  assert.equal(report.shell.hasTarget, true);
  assert.equal(report.shell.targetPath, `${SHELL_DIR}/zh-Hans.json`);
  assert.equal(report.frontend.baseLocale, BASE_LOCALE);
  assert.equal(report.frontend.baseKeyCount, 3);
  assert.equal(report.frontend.hasTarget, false);
  assert.equal(report.frontend.missingVersusShellCount, 1);
  assert.deepEqual(report.frontend.missingVersusShell, ['zh-Hans']);
  assert.deepEqual(report.frontend.locales.map(entry => entry.locale), ['de-DE', 'en-US']);
  assert.ok(report.targetFiles.every(file => file.present === false));
});

test('键集以基准语言为准，双向差异分别计数', async () => {
  const report = await enumerateLocaleResources(await packageFixture());
  const de = report.frontend.locales.find(entry => entry.locale === 'de-DE');
  assert.equal(de.keyCount, 3);
  assert.equal(de.missingFromBase, 1);
  assert.equal(de.extraVersusBase, 1);
  assert.match(de.keySetSha256, /^[a-f0-9]{64}$/);
  const base = report.frontend.locales.find(entry => entry.locale === BASE_LOCALE);
  assert.equal(base.missingFromBase, 0);
  assert.equal(base.extraVersusBase, 0);
  assert.equal(base.keySetSha256, report.frontend.baseKeySetSha256);
});

test('overrides与dynamic按各自规则对基准键集归类', async () => {
  const report = await enumerateLocaleResources(await packageFixture());
  const de = report.frontend.locales.find(entry => entry.locale === 'de-DE');
  assert.equal(de.overrides.keyCount, 1);
  assert.equal(de.overrides.outsideBase, 0);
  assert.equal(de.overrides.path, `${FRONTEND_DIR}/de-DE.overrides.json`);
  assert.equal(de.dynamic.keyCount, 1);
  // dynamic 键与主键集不相交是真实结构，不是异常。
  assert.equal(de.dynamic.sharedWithBase, 0);
});

test('overrides键不在主键集时计入outsideBase', async () => {
  const root = await packageFixture(baseFiles({ [`app/${FRONTEND_DIR}/de-DE.overrides.json`]: json({ a: 'X', ghost: 'Y' }) }));
  const report = await enumerateLocaleResources(root);
  assert.equal(report.frontend.locales.find(entry => entry.locale === 'de-DE').overrides.outsideBase, 1);
});

test('骨架键集与基准一致、值保留原文、translated为零', async () => {
  const root = await packageFixture();
  const skeleton = await buildLocaleSkeleton(root, 'zh-Hans');
  assert.deepEqual(skeleton.counts, { mainKeys: 3, dynamicKeys: 1, overridesKeys: 0, translated: 0 });
  const main = JSON.parse(skeleton.files[`${FRONTEND_DIR}/zh-Hans.json`]);
  assert.deepEqual(main, EN);
  assert.deepEqual(JSON.parse(skeleton.files[`${FRONTEND_DIR}/dynamic/zh-Hans.json`]), { d: 'Delta' });
  assert.equal(skeleton.files[`${FRONTEND_DIR}/zh-Hans.overrides.json`], '{}\n');
  // 输出格式与既有资源一致：2 空格缩进、LF、结尾换行、无 BOM。
  assert.equal(skeleton.files[`${FRONTEND_DIR}/zh-Hans.json`], json(EN));
});

test('目标语言已存在时拒绝生成骨架', async () => {
  await assert.rejects(buildLocaleSkeleton(await packageFixture(), 'de-DE'), /已存在/);
});

test('非法目标语言标识拒绝', async () => {
  const root = await packageFixture();
  await assert.rejects(buildLocaleSkeleton(root, '../evil'), /标识非法/);
  await assert.rejects(buildLocaleSkeleton(root, 'zh_Hans'), /标识非法/);
  await assert.rejects(buildLocaleSkeleton(root, '9zh'), /标识非法/);
});

test('前端层缺少基准语言时抛错', async () => {
  const { [`app/${FRONTEND_DIR}/en-US.json`]: _omitted, ...rest } = baseFiles();
  await assert.rejects(enumerateLocaleResources(await packageFixture(rest)), /缺少基准语言/);
});

test('前端层缺少dynamic目录时抛错', async () => {
  const files = Object.fromEntries(Object.entries(baseFiles()).filter(([relative]) => !relative.includes('/dynamic/')));
  await assert.rejects(enumerateLocaleResources(await packageFixture(files)), /ENOENT|no such file/i);
});

test('枚举与骨架生成全程只读', async () => {
  const root = await packageFixture();
  const watched = baseFiles();
  const snapshot = async () => Promise.all(Object.keys(watched).map(async relative => ({
    relative,
    content: await readFile(path.join(root, relative)),
    modified: (await stat(path.join(root, relative))).mtimeMs
  })));
  const before = await snapshot();
  await enumerateLocaleResources(root);
  await buildLocaleSkeleton(root, 'zh-Hans');
  assert.deepEqual(await snapshot(), before);
  assert.equal(await stat(path.join(root, 'app', 'resources', 'app.asar')).then(info => info.isFile()), true);
});
