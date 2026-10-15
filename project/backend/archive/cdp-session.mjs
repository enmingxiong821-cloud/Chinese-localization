/**
 * 极简 CDP（Chrome DevTools Protocol）客户端。
 * 只用 Node 24 自带的全局 WebSocket 与 fetch，不引入任何依赖。
 *
 * 调试端口是本方案唯一的本地攻击面，因此端点校验写在这里而不散在各调用点：
 * 只接受环回主机，任何远程地址一律拒绝。
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ENDPOINT_PATTERN = /^([^\s/:]+|\[[^\]]+\]):(\d{1,5})$/;
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

/** 解析并校验 主机:端口，非环回直接抛错。 */
export function assertLoopback(endpoint) {
  if (typeof endpoint !== 'string') throw new Error('需要 主机:端口 形式的端点');
  const match = ENDPOINT_PATTERN.exec(endpoint.trim());
  if (!match) throw new Error('端点格式应为 主机:端口');
  const host = match[1].toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`调试端点只允许环回地址，拒绝 ${match[1]}`);
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('调试端口非法');
  return { host: host === '[::1]' ? '::1' : host, port };
}

export function httpBase(endpoint) {
  const { host, port } = assertLoopback(endpoint);
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

/** 列出可调试目标；match 为可选的 URL 子串过滤。 */
export async function listDebugTargets(endpoint, { match } = {}) {
  const base = httpBase(endpoint);
  let response;
  try {
    response = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(5000) });
  } catch {
    // 区分"端口没监听"与其他故障：前者是最常见的手误，值得直接说清楚。
    throw new Error(`${base} 连不上：确认应用是以 --remote-debugging-port=127.0.0.1:<端口> 启动的，且端口号一致`);
  }
  if (!response.ok) throw new Error(`${base} 响应 ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('调试目标列表格式异常');
  const pages = targets.filter(target => target?.type === 'page' && typeof target.webSocketDebuggerUrl === 'string');
  if (match) {
    const found = pages.find(target => String(target.url).includes(match));
    if (!found) throw new Error(`未找到匹配 ${match} 的页面目标`);
    return [found];
  }
  if (pages.length === 0) throw new Error('没有可调试的页面目标');
  return pages;
}

/**
 * 建立一条 CDP 会话。send 返回 Promise；on 注册事件处理，返回注销函数。
 * 消息按 CDP 规范分流：带 id 的走 pending，其余按 method 派发。
 */
export async function openSession(webSocketUrl) {
  if (typeof webSocketUrl !== 'string' || !/^ws:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\//.test(webSocketUrl)) {
    throw new Error('调试 WebSocket 地址非法或非环回');
  }
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const handlers = new Map();
  let nextId = 1;
  let closed = false;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('调试连接超时')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('调试连接失败')); }, { once: true });
  });

  socket.addEventListener('close', () => {
    closed = true;
    for (const entry of pending.values()) entry.reject(new Error('调试连接已关闭'));
    pending.clear();
  });

  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)); } catch { return; }
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method} 失败：${message.error.message}`));
      else entry.resolve(message.result);
      return;
    }
    for (const handler of handlers.get(message.method) ?? []) {
      // 单个处理器的异常不能拖垮整个会话，否则 Fetch 拦截会静默卡住页面加载。
      try { handler(message.params); } catch { /* 由处理器自身负责响应 */ }
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) { reject(new Error('调试连接已关闭')); return; }
    const id = nextId++;
    const payload = JSON.stringify({ id, method, params });
    if (Buffer.byteLength(payload, 'utf8') > MAX_MESSAGE_BYTES) { reject(new Error(`${method} 请求体超过 ${MAX_MESSAGE_BYTES} 字节`)); return; }
    pending.set(id, { resolve, reject, method });
    socket.send(payload);
  });

  const on = (method, handler) => {
    const list = handlers.get(method) ?? [];
    list.push(handler);
    handlers.set(method, list);
    return () => handlers.set(method, (handlers.get(method) ?? []).filter(item => item !== handler));
  };

  return { send, on, close: () => socket.close() };
}
