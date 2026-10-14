/** 语言资源枚举测试：数据全部在系统临时目录合成，不读取也不触碰真实安装。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BASE_LOCALE, buildLocaleSkeleton, buildProbeCandidate, enumerateLocaleResources, FRONTEND_DIR, looksLikeDisplayText, PROBE_MARKER, pseudolocalize, SHELL_DIR } from './resource-enum.mjs';

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

// ---------------------------------------------------------------- 伪本地化探针

test('展示文本判据偏保守：枚举、路由、URL、日期一律不动', () => {
  for (const text of ['Send message', 'Settings', 'Delete 3 items']) assert.equal(looksLikeDisplayText(text), true, text);
  // 无空格且不以大写开头 —— 多半是枚举值或比较键，改了会破坏行为。
  for (const text of ['asc', 'left', 'en-US', 'zh-Hans', 'dark', 'small']) assert.equal(looksLikeDisplayText(text), false, text);
  for (const text of ['https://claude.ai/x', '/v1/messages', '#anchor', '.json', '2024-01-01', '12:30', '  ', 'a', 'x'.repeat(121)]) {
    assert.equal(looksLikeDisplayText(text), false, text);
  }
  for (const value of [null, 42, true, undefined, {}, ['Send message']]) assert.equal(looksLikeDisplayText(value), false, String(value));
  // 前后空白不该让它漏掉：去掉空白后仍以大写开头。
  assert.equal(looksLikeDisplayText('  Send  '), true);
});

test('标记只加在展示文本上，非字符串值原样保留', () => {
  const result = pseudolocalize({ title: 'Send message', dir: 'asc', count: 3, flag: true, empty: null, url: 'https://a/b' });
  assert.equal(result.values.title, `${PROBE_MARKER}Send message`);
  assert.equal(result.values.dir, 'asc');
  assert.equal(result.values.count, 3);
  assert.equal(result.values.flag, true);
  assert.equal(result.values.empty, null);
  assert.equal(result.values.url, 'https://a/b');
  assert.equal(result.marked, 1);
  assert.equal(result.skipped, 5);
});

test('__proto__ 键走 defineProperty，不污染原型', () => {
  const input = JSON.parse('{"__proto__": "Send message", "constructor": "Delete all"}');
  const result = pseudolocalize(input);
  assert.equal(Object.getPrototypeOf(result.values), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(result.values, '__proto__').value, `${PROBE_MARKER}Send message`);
  assert.equal(Object.getOwnPropertyDescriptor(result.values, 'constructor').value, `${PROBE_MARKER}Delete all`);
  assert.equal(result.marked, 2);
});

test('自定义标记生效，空标记拒绝', () => {
  assert.equal(pseudolocalize({ a: 'Send message' }, '¶ ').values.a, '¶ Send message');
  assert.throws(() => pseudolocalize({ a: 'Send message' }, ''), /标记不能为空/);
});

test('探针候选结构同骨架、带标记、translated仍为零', async () => {
  const root = await packageFixture();
  const probe = await buildProbeCandidate(root, 'zh-Hans');
  assert.equal(probe.marker, PROBE_MARKER);
  assert.deepEqual(probe.counts, {
    mainKeys: 3, dynamicKeys: 1, overridesKeys: 0, translated: 0, marked: 4, skipped: 0
  });
  const main = JSON.parse(probe.files[`${FRONTEND_DIR}/zh-Hans.json`]);
  assert.deepEqual(main, { a: `${PROBE_MARKER}Alpha`, b: `${PROBE_MARKER}Beta`, c: `${PROBE_MARKER}Gamma` });
  assert.deepEqual(JSON.parse(probe.files[`${FRONTEND_DIR}/dynamic/zh-Hans.json`]), { d: `${PROBE_MARKER}Delta` });
  assert.equal(probe.files[`${FRONTEND_DIR}/zh-Hans.overrides.json`], '{}\n');
  // 标记不是译文：这个候选只能证明链路通，不能当汉化成果。
  assert.equal(probe.counts.translated, 0);
  assert.equal(probe.files[`${FRONTEND_DIR}/zh-Hans.json`], json(main));
});

test('探针候选与骨架候选的键集完全相同', async () => {
  const root = await packageFixture();
  const skeleton = await buildLocaleSkeleton(root, 'zh-Hans');
  const probe = await buildProbeCandidate(root, 'zh-Hans');
  for (const relative of [`${FRONTEND_DIR}/zh-Hans.json`, `${FRONTEND_DIR}/dynamic/zh-Hans.json`]) {
    assert.deepEqual(
      Object.keys(JSON.parse(probe.files[relative])),
      Object.keys(JSON.parse(skeleton.files[relative])),
      relative
    );
  }
});
