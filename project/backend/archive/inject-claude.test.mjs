/**
 * 注入适配器测试。
 *
 * 分两层：
 *   1. 纯函数层——端点校验、catalog 值、预加载脚本、计划结构，不需要浏览器。
 *   2. 端到端层——用系统自带的 Chrome/Edge 起 headless + 环回调试端口，
 *      加载逐字复刻真实门禁的 fixture，断言「未注入 → en-US」「注入 → zh-Hans」
 *      「还原 → 回 en-US」。资源由 Fetch 拦截就地应答，服务端根本没有这些文件。
 *
 * 全程不接触真实 Claude 安装：不读它的文件、不启动它、不写任何东西。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLoopback, httpBase, listDebugTargets, openSession } from './cdp-session.mjs';
import { publishCandidate } from './candidate-artifacts.mjs';
import {
  applyInjection, buildInjectionPlan, CATALOG_SELECTOR, catalogValue, planInjection,
  preloadSource, resolveCatalogFiles, revertInjection, TARGET_DEFAULT
} from './inject-claude.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'i18n-gate.html');

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);

const DIGEST = 'a'.repeat(64);

// ---------------------------------------------------------------- 纯函数层

test('非环回端点一律拒绝', () => {
  assert.deepEqual(assertLoopback('127.0.0.1:9222'), { host: '127.0.0.1', port: 9222 });
  assert.deepEqual(assertLoopback('localhost:1'), { host: 'localhost', port: 1 });
  assert.deepEqual(assertLoopback('[::1]:9222'), { host: '::1', port: 9222 });
  for (const bad of ['0.0.0.0:9222', '192.168.1.5:9222', 'example.com:9222', '9222', '127.0.0.1', '127.0.0.1:0', '127.0.0.1:70000', '', null]) {
    assert.throws(() => assertLoopback(bad), /环回|格式|端口/, String(bad));
  }
});

test('httpBase 对 IPv6 加方括号', () => {
  assert.equal(httpBase('127.0.0.1:9222'), 'http://127.0.0.1:9222');
  assert.equal(httpBase('[::1]:9222'), 'http://[::1]:9222');
});

test('catalog 值三段版本号满足门禁正则', () => {
  const value = catalogValue('zh-Hans', DIGEST);
  assert.equal(value, 'zh-Hans:aaaaaaaa.aaaaaaaa.aaaaaaaa');
  const match = /^([\w-]+):([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(value);
  assert.ok(match, '必须匹配 E_() 的正则');
  assert.equal(match[1], 'zh-Hans');
  assert.throws(() => catalogValue('../evil', DIGEST), /标识非法/);
  assert.throws(() => catalogValue('zh-Hans', 'abc'), /摘要/);
});

test('预加载脚本改写 querySelector 且让位真实 meta', () => {
  const source = preloadSource(catalogValue('zh-Hans', DIGEST), 'zh-Hans');
  assert.match(source, /Document\.prototype\.querySelector = function/);
  assert.match(source, /if \(found \|\| selector !== SELECTOR\) return found;/);
  assert.match(source, /if \(!original\.__c1Injected\)/);
  // 只设 spa:locale，不碰 spa:locale-source。
  assert.match(source, /localStorage\.setItem\("spa:locale", LOCALE\)/);
  assert.doesNotMatch(source, /locale-source/);
  assert.match(source, /"meta\[name=\\"i18n-catalogs\\"\]"/);
});

test('注入计划只拦目标语言的三个路径且标注不落盘', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'inject-plan-'));
  const candidate = await publishCandidate(root, 'claude-', 'claude', {
    'resources/ion-dist/i18n/zh-Hans.json': '{"c1":"base"}\n',
    'resources/ion-dist/i18n/zh-Hans.overrides.json': '{}\n',
    'resources/ion-dist/i18n/dynamic/zh-Hans.json': '{"c1":"dyn"}\n'
  });
  const plan = await buildInjectionPlan(candidate);
  assert.equal(plan.target, TARGET_DEFAULT);
  assert.equal(plan.persistent, false);
  assert.equal(plan.installFilesModified, false);
  assert.deepEqual(plan.paths, ['/i18n/zh-Hans.json', '/i18n/zh-Hans.overrides.json', '/i18n/dynamic/zh-Hans.json']);
  // 拦截范围是整个 /i18n/：只有看得见全部请求，才能判断应用到底选了哪个语言。
  assert.deepEqual(plan.patterns, ['*/i18n/*']);
  assert.match(plan.catalogValue, /^zh-Hans:[a-f0-9]{8}\.[a-f0-9]{8}\.[a-f0-9]{8}$/);
  // 修订号取自三份内容：任一文件改动都必须改变它。
  const other = await publishCandidate(root, 'claude-', 'claude', {
    'resources/ion-dist/i18n/zh-Hans.json': '{"c1":"base2"}\n',
    'resources/ion-dist/i18n/zh-Hans.overrides.json': '{}\n',
    'resources/ion-dist/i18n/dynamic/zh-Hans.json': '{"c1":"dyn"}\n'
  });
  assert.notEqual(plan.catalogValue, (await buildInjectionPlan(other)).catalogValue);
});

test('候选被改动或缺少目标文件时拒绝出计划', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'inject-bad-'));
  await assert.rejects(resolveCatalogFiles(root), /ENOENT|清单|目录/);
  const candidate = await publishCandidate(root, 'claude-', 'claude', {
    'resources/ion-dist/i18n/zh-Hans.json': '{}\n'
  });
  await assert.rejects(resolveCatalogFiles(candidate), /缺少/);
});

test('计划参数非法时拒绝', async () => {
  assert.throws(() => planInjection({ target: 'zh-Hans', candidateDirectory: 'relative', files: { entries: [1] } }), /绝对路径/);
  assert.throws(() => planInjection({ target: 'zh-Hans', candidateDirectory: path.resolve('/tmp'), files: null }), /缺少资源条目/);
});

// ---------------------------------------------------------------- 端到端层

async function startStaticServer(root) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const file = path.join(root, ...pathname.replace(/^\/+/, '').split('/'));
    if (!path.resolve(file).startsWith(path.resolve(root))) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
      response.end(body);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, origin: `http://127.0.0.1:${server.address().port}` };
}

/** 起 headless 浏览器并要求它自行选端口（--remote-debugging-port=0），从 stderr 读回实际端口。 */
function launchBrowser(profileDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(BROWSERS, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-sync', '--disable-extensions',
      '--remote-debugging-port=0', `--user-data-dir=${profileDirectory}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('浏览器未在 20 秒内报告调试地址')); }, 20000);
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) { clearTimeout(timer); resolve({ child, webSocketUrl: match[1] }); }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`浏览器提前退出，code=${code}，stderr=${stderr.slice(0, 400)}`)); });
  });
}

async function waitForGate(session, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { result } = await session.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__gate || null)',
      returnByValue: true
    });
    if (typeof result?.value === 'string' && result.value !== 'null') {
      const gate = JSON.parse(result.value);
      if (gate.ready) return gate;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('等待门禁结果超时');
}

async function navigateAndRead(session, url) {
  await session.send('Page.navigate', { url });
  return waitForGate(session);
}

const skip = BROWSERS ? false : '本机未找到 Chrome 或 Edge，跳过端到端验证';

test('端到端：注入前后 locale 解析链的真实行为', { skip }, async t => {
  const webRoot = await mkdtemp(path.join(tmpdir(), 'inject-web-'));
  const profile = await mkdtemp(path.join(tmpdir(), 'inject-profile-'));
  const candidateRoot = await mkdtemp(path.join(tmpdir(), 'inject-cand-'));
  await mkdir(path.join(webRoot, 'i18n', 'dynamic'), { recursive: true });
  await writeFile(path.join(webRoot, 'index.html'), await readFile(FIXTURE, 'utf8'));
  // 服务端只提供 en-US：zh-Hans 在磁盘上根本不存在，取到内容就只能是拦截应答。
  await writeFile(path.join(webRoot, 'i18n', 'en-US.json'), '{"src":"server-en-US"}');
  await writeFile(path.join(webRoot, 'i18n', 'en-US.overrides.json'), '{"src":"server-en-US"}');
  await writeFile(path.join(webRoot, 'i18n', 'dynamic', 'en-US.json'), '{"src":"server-en-US"}');
  const candidate = await publishCandidate(candidateRoot, 'claude-', 'claude', {
    'resources/ion-dist/i18n/zh-Hans.json': '{"c1":"zh-base"}',
    'resources/ion-dist/i18n/zh-Hans.overrides.json': '{"c1":"zh-ovr"}',
    'resources/ion-dist/i18n/dynamic/zh-Hans.json': '{"c1":"zh-dyn"}'
  });

  const { server, origin } = await startStaticServer(webRoot);
  const browser = await launchBrowser(profile);
  let session;
  let handle;
  t.after(async () => {
    if (session) session.close();
    if (browser.child.pid) spawn('taskkill', ['/pid', String(browser.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise(resolve => server.close(resolve));
  });

  const port = new URL(browser.webSocketUrl).port;
  const endpoint = `127.0.0.1:${port}`;
  const [target] = await listDebugTargets(endpoint);
  session = await openSession(target.webSocketDebuggerUrl);
  await session.send('Page.enable');
  await session.send('Runtime.enable');

  // ① 未注入：白名单兜底，必然是 en-US，资源来自服务端。
  const baseline = await navigateAndRead(session, `${origin}/index.html`);
  assert.equal(baseline.locale, 'en-US');
  assert.equal(baseline.isEnglish, true);
  assert.deepEqual(baseline.catalogs, [], 'E_() 在真实应用里恒为空，fixture 应一致');
  assert.equal(baseline.urls.base, '/i18n/en-US.json');
  assert.match(baseline.fetched.base.body, /server-en-US/);

  // ② 注入：catalog 生效，O_() 在白名单之前就返回 zh-Hans。
  const files = await resolveCatalogFiles(candidate);
  const plan = await buildInjectionPlan(candidate);
  handle = await applyInjection(session, plan, files);
  const injected = await navigateAndRead(session, `${origin}/index.html`);
  assert.equal(injected.locale, 'zh-Hans', '注入后门禁必须直接返回 zh-Hans');
  assert.equal(injected.whitelisted, false, 'zh-Hans 不在 11 语言白名单内');
  assert.deepEqual(injected.catalogs.map(entry => entry[0]), ['zh-Hans']);
  assert.match(injected.urls.base, /^\/i18n\/zh-Hans\.json\?v=[a-f0-9]{8}$/);
  assert.match(injected.urls.overrides, /^\/i18n\/zh-Hans\.overrides\.json\?v=[a-f0-9]{8}$/);
  assert.match(injected.urls.dynamic, /^\/i18n\/dynamic\/zh-Hans\.json\?v=[a-f0-9]{8}$/);
  // 磁盘上不存在这些路径，内容只能来自 Fetch 拦截。
  assert.equal(injected.fetched.base.status, 200);
  assert.match(injected.fetched.base.body, /zh-base/);
  assert.match(injected.fetched.dynamic.body, /zh-dyn/);
  assert.match(injected.fetched.overrides.body, /zh-ovr/);

  // 自报证据：注入器观察到的请求，就是 O_() 选择结果的直接体现。
  const observations = handle.observations();
  assert.equal(observations.targetRequested, true, observations.verdict);
  assert.deepEqual(Object.keys(observations.fulfilledPaths).sort(), [
    '/i18n/dynamic/zh-Hans.json', '/i18n/zh-Hans.json', '/i18n/zh-Hans.overrides.json'
  ]);
  // 未注入时应用请求的是 en-US；注入后不该再出现这个请求。
  assert.equal(observations.requestedPaths['/i18n/en-US.json'], undefined);

  // ③ 还原：会话注入撤掉，localStorage 回到注入前（原本没有 → 移除）。
  const reverted = await revertInjection(session, handle);
  assert.equal(reverted.restored, true);
  assert.equal(reverted.previous.value, null, '注入前本就没有 spa:locale，还原后必须清掉而不是留成空串');
  handle = null;
  const restored = await navigateAndRead(session, `${origin}/index.html`);
  assert.equal(restored.locale, 'en-US');
  assert.deepEqual(restored.catalogs, []);
  assert.match(restored.fetched.base.body, /server-en-US/);
});

test('端到端：注入前已有的 spa:locale 会被精确还原', { skip }, async t => {
  const webRoot = await mkdtemp(path.join(tmpdir(), 'inject-web2-'));
  const profile = await mkdtemp(path.join(tmpdir(), 'inject-profile2-'));
  const candidateRoot = await mkdtemp(path.join(tmpdir(), 'inject-cand2-'));
  await mkdir(path.join(webRoot, 'i18n', 'dynamic'), { recursive: true });
  await writeFile(path.join(webRoot, 'index.html'), await readFile(FIXTURE, 'utf8'));
  for (const relative of ['i18n/en-US.json', 'i18n/en-US.overrides.json', 'i18n/dynamic/en-US.json']) {
    await writeFile(path.join(webRoot, relative), '{"src":"server-en-US"}');
  }
  const candidate = await publishCandidate(candidateRoot, 'claude-', 'claude', {
    'resources/ion-dist/i18n/zh-Hans.json': '{"c1":"zh-base"}',
    'resources/ion-dist/i18n/zh-Hans.overrides.json': '{}\n',
    'resources/ion-dist/i18n/dynamic/zh-Hans.json': '{"c1":"zh-dyn"}'
  });

  const { server, origin } = await startStaticServer(webRoot);
  const browser = await launchBrowser(profile);
  let session;
  let handle;
  t.after(async () => {
    if (session) session.close();
    if (browser.child.pid) spawn('taskkill', ['/pid', String(browser.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    await new Promise(resolve => server.close(resolve));
  });

  const [target] = await listDebugTargets(`127.0.0.1:${new URL(browser.webSocketUrl).port}`);
  session = await openSession(target.webSocketDebuggerUrl);
  await session.send('Page.enable');
  await session.send('Runtime.enable');

  await navigateAndRead(session, `${origin}/index.html`);
  // 模拟用户此前已经有自己的选择，注入后必须还回去。
  await session.send('Runtime.evaluate', {
    expression: 'localStorage.setItem("spa:locale", "ja-JP"); localStorage.setItem("spa:locale-source", "user_choice"); true',
    returnByValue: true
  });

  const files = await resolveCatalogFiles(candidate);
  handle = await applyInjection(session, await buildInjectionPlan(candidate), files);
  const injected = await navigateAndRead(session, `${origin}/index.html`);
  assert.equal(injected.locale, 'zh-Hans');

  const reverted = await revertInjection(session, handle);
  handle = null;
  assert.deepEqual(reverted.previous, { value: 'ja-JP', source: 'user_choice', readable: true });
  const restored = await navigateAndRead(session, `${origin}/index.html`);
  assert.equal(restored.locale, 'ja-JP', '还原后必须回到用户原本选的 ja-JP，而不是被清成默认');
});
