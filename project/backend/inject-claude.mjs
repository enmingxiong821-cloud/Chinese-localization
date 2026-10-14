/**
 * C1 运行时注入适配器（层 C 前端 SPA）。
 *
 * 原理：`ion-dist` 的 locale 解析链是「localStorage['spa:locale'] → catalog 元数据 → 11 语言白名单」。
 * 只要让 `E_()` 读到含目标语言的 `i18n-catalogs` meta，`O_()` 就会在白名单之前直接返回它，
 * 不必改 bundle 里的 `w_` / `M_` 数组。
 *
 * 边界：不改安装目录、不改 asar、不改 exe、不改签名、不写全局配置。
 * 注入只存在于被调试进程的生命周期内，进程退出即失效；还原走 revert。
 */
import path from 'node:path';
import { readCandidatePayload } from './candidate-artifacts.mjs';
import { sha256 } from './safe-io.mjs';

export const TARGET_DEFAULT = 'zh-Hans';
export const CATALOG_SELECTOR = 'meta[name="i18n-catalogs"]';
export const LOCALE_KEY = 'spa:locale';
export const LOCALE_SOURCE_KEY = 'spa:locale-source';

/** 候选里的相对路径 → 运行时请求的 URL 路径。应用请求的是 /i18n/...，候选存的是 resources/ion-dist/i18n/... */
const CANDIDATE_PREFIX = 'resources/ion-dist/';

/** E_() 的正则只认 4 段、后三段是 [\w-]+，所以版本号取摘要切片，天然合法。 */
const MAX_FULFILL_BYTES = 32 * 1024 * 1024;

function assertLocale(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9-]*$/.test(value)) throw new Error(`${label}标识非法`);
  return value;
}

/** 生成 catalog 元数据条目，形如 zh-Hans:1a2b3c4d.5e6f7a8b.9c0d1e2f。 */
export function catalogValue(target, digest) {
  assertLocale(target, '目标语言');
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('需要 64 位十六进制摘要');
  return `${target}:${digest.slice(0, 8)}.${digest.slice(8, 16)}.${digest.slice(16, 24)}`;
}

/**
 * 注入的预加载脚本。改写 `Document.prototype.querySelector` 而不是造一个真实 meta 元素：
 * 预加载阶段 `document.head` 可能还不存在，而原型方法此刻已经可用，与文档构建时序无关。
 * 应用自己若已发布该 meta，一律让位，不与之争抢。
 */
export function preloadSource(value, target) {
  assertLocale(target, '目标语言');
  return `(() => {
  const SELECTOR = ${JSON.stringify(CATALOG_SELECTOR)};
  const CATALOGS = ${JSON.stringify(value)};
  const LOCALE = ${JSON.stringify(target)};
  const original = Document.prototype.querySelector;
  if (!original.__c1Injected) {
    Document.prototype.querySelector = function (selector) {
      const found = original.call(this, selector);
      if (found || selector !== SELECTOR) return found;
      return { dataset: { i18nCatalogs: CATALOGS } };
    };
    Document.prototype.querySelector.__c1Injected = true;
  }
  try { localStorage.setItem(${JSON.stringify(LOCALE_KEY)}, LOCALE); } catch {}
})();`;
}

/**
 * 从已校验的候选目录取出三个目标文件，映射成运行时 URL 路径。
 * 走 readCandidatePayload 是为了复用完整性清单：改过的候选必须在这里就被拒绝，不能喂给应用。
 */
export async function resolveCatalogFiles(candidateDirectory, target = TARGET_DEFAULT) {
  assertLocale(target, '目标语言');
  const payload = await readCandidatePayload(candidateDirectory, 'claude');
  const wanted = [
    `${CANDIDATE_PREFIX}i18n/${target}.json`,
    `${CANDIDATE_PREFIX}i18n/${target}.overrides.json`,
    `${CANDIDATE_PREFIX}i18n/dynamic/${target}.json`
  ];
  const entries = [];
  for (const relative of wanted) {
    const bytes = payload.files.get(relative);
    if (!bytes) throw new Error(`候选缺少 ${relative}`);
    if (bytes.length > MAX_FULFILL_BYTES) throw new Error(`${relative} 超过 ${MAX_FULFILL_BYTES} 字节，不适合走拦截注入`);
    // 请求路径去掉候选前缀：resources/ion-dist/i18n/x.json → /i18n/x.json
    const url = `/${relative.slice(CANDIDATE_PREFIX.length)}`;
    const pathname = new URL(url, 'http://127.0.0.1').pathname;
    entries.push({ relative, url, pathname, bytes: bytes.length, sha256: sha256(bytes), base64: bytes.toString('base64') });
  }
  // 修订号由三份内容共同决定：任一文件变了，?v= 就变，避免旧缓存掩盖新内容。
  const revision = sha256(Buffer.from(entries.map(entry => `${entry.relative}\n${entry.sha256}\n`).join(''), 'utf8'));
  return { target, revision, manifestHash: payload.manifestHash, entries };
}

/** 纯函数：产出一份可断言、可打印的注入计划，本身不连接任何进程。 */
export function planInjection({ target, candidateDirectory, files }) {
  assertLocale(target, '目标语言');
  if (!candidateDirectory || !path.isAbsolute(candidateDirectory)) throw new Error('需要候选目录绝对路径');
  if (!files?.entries?.length) throw new Error('注入计划缺少资源条目');
  return {
    schemaVersion: 1,
    target,
    candidateDirectory,
    catalogValue: catalogValue(target, files.revision),
    preload: preloadSource(catalogValue(target, files.revision), target),
    // 只拦目标语言的三个路径：任何其他 locale 的请求原样放行，不制造额外停顿面。
    patterns: files.entries.map(entry => `*${entry.pathname}*`),
    paths: files.entries.map(entry => entry.pathname),
    entries: files.entries.map(({ relative, url, bytes, sha256: digest }) => ({ relative, url, bytes, sha256: digest })),
    revision: files.revision,
    manifestHash: files.manifestHash,
    // 会话内生效，进程退出即消失；不改任何安装文件。
    persistent: false,
    installFilesModified: false,
    notes: [
      `只设置 ${LOCALE_KEY}，不设置 ${LOCALE_SOURCE_KEY}：后者语义未经验证，不擅自改变应用对「用户是否显式选择过语言」的判断。`,
      '应用若已自行发布 i18n-catalogs meta，注入让位，不覆盖。',
      '资源由 Fetch 拦截就地应答，磁盘上不存在这些文件。'
    ]
  };
}

export async function buildInjectionPlan(candidateDirectory, target = TARGET_DEFAULT) {
  const files = await resolveCatalogFiles(candidateDirectory, target);
  return planInjection({ target, candidateDirectory, files });
}

const JSON_HEADERS = [
  { name: 'Content-Type', value: 'application/json; charset=utf-8' },
  // 必须禁缓存：否则改一次候选再刷新拿到的还是上一版。
  { name: 'Cache-Control', value: 'no-store, max-age=0' },
  { name: 'Access-Control-Allow-Origin', value: '*' }
];

/** 读取当前的用户级 locale 键值，供 revert 精确还原（不擅自清空用户原有设置）。 */
export async function readStoredLocale(session) {
  const { result } = await session.send('Runtime.evaluate', {
    expression: `(() => { try { return JSON.stringify({ value: localStorage.getItem(${JSON.stringify(LOCALE_KEY)}), source: localStorage.getItem(${JSON.stringify(LOCALE_SOURCE_KEY)}) }); } catch { return 'null'; } })()`,
    returnByValue: true
  });
  if (typeof result?.value !== 'string') return { value: null, source: null, readable: false };
  try {
    const parsed = JSON.parse(result.value);
    return { value: parsed?.value ?? null, source: parsed?.source ?? null, readable: true };
  } catch {
    return { value: null, source: null, readable: false };
  }
}

/**
 * 施加注入：注册预加载脚本 + 启用 Fetch 拦截。
 * plan 保持纯数据，响应用的字节由 files（resolveCatalogFiles 的产物）单独传入。
 * 返回的 dispose 只还原会话状态；localStorage 由 revertInjection 单独还原。
 */
export async function applyInjection(session, plan, files) {
  if (!files?.entries?.length) throw new Error('注入缺少资源载荷');
  const bodies = new Map(files.entries.map(entry => [entry.pathname, entry.base64]));
  if (plan.paths.some(pathname => !bodies.has(pathname))) throw new Error('注入计划与资源载荷不匹配');
  const previous = await readStoredLocale(session);

  await session.send('Page.enable');
  const off = session.on('Fetch.requestPaused', params => {
    const requestId = params.requestId;
    const reply = error => session.send('Fetch.continueRequest', { requestId }).catch(() => {});
    try {
      const pathname = new URL(params.request.url).pathname;
      const body = bodies.get(pathname);
      if (!body) { reply(); return; }
      session.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responsePhrase: 'OK',
        responseHeaders: JSON_HEADERS,
        body
      }).catch(() => reply());
    } catch {
      // 处理器自身异常必须放行请求，否则页面会卡在 paused 状态。
      reply();
    }
  });

  await session.send('Fetch.enable', { patterns: plan.patterns.map(urlPattern => ({ urlPattern })) });
  const { identifier } = await session.send('Page.addScriptToEvaluateOnNewDocument', { source: plan.preload });

  return {
    previous,
    async dispose() {
      off();
      await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
      await session.send('Fetch.disable').catch(() => {});
    }
  };
}

/** 还原用户级键值到注入前，并撤掉会话注入。 */
export async function revertInjection(session, handle) {
  if (handle) await handle.dispose();
  const previous = handle?.previous ?? { value: null, source: null };
  const statements = [
    `restore(${JSON.stringify(LOCALE_KEY)}, ${JSON.stringify(previous.value ?? null)})`,
    `restore(${JSON.stringify(LOCALE_SOURCE_KEY)}, ${JSON.stringify(previous.source ?? null)})`
  ].join('; ');
  const expression = `(() => {
  const restore = (key, value) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); };
  try { ${statements}; return true; } catch { return false; }
})()`;
  const { result } = await session.send('Runtime.evaluate', { expression, returnByValue: true });
  return { restored: result?.value === true, previous };
}
