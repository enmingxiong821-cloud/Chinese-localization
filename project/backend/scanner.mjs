/** 只读资源扫描；不修改安装目录，不执行目标应用代码。 */
import { lstat, realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MAX_BYTES = 16 * 1024 * 1024;
const resources = {
  cursor: ['resources/app/package.json', 'resources/app/out/nls.keys.json', 'resources/app/out/nls.messages.json'],
  claude: ['resources/en-US.json', 'resources/zh-Hans.json', 'resources/ion-dist/i18n/en-US.json']
};

async function isAbsoluteDirectory(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) throw new Error('需要明确的绝对安装目录');
  const root = await realpath(value);
  if (!(await lstat(root)).isDirectory()) throw new Error('安装根路径必须是目录');
  return root;
}

/**
 * WindowsApps 包根与 Electron 应用根差一层 app/。
 * 传入包根时下钻，传入应用根时原样返回；只认 app/resources/app.asar 这一个标记，不猜。
 */
export async function locateAppRoot(installRoot) {
  const root = await isAbsoluteDirectory(installRoot);
  const nested = path.join(root, 'app');
  try {
    const info = await lstat(nested);
    if (!info.isSymbolicLink() && info.isDirectory() && (await lstat(path.join(nested, 'resources', 'app.asar'))).isFile()) return nested;
  } catch { /* 不是包根布局，按应用根处理 */ }
  return root;
}

/** 将安装根目录限制为调用方明确指定的范围；拒绝链接资源。 */
async function inspect(root, relative) {
  const target = path.join(root, relative);
  try {
    let current = root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) return { path: relative, status: 'link-rejected' };
    }
    const canonical = await realpath(target);
    const within = path.relative(root, canonical);
    if (within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) return { path: relative, status: 'outside-root' };
    const handle = await open(canonical, 'r');
    try {
      const before = await handle.stat();
      if (!before.isFile()) return { path: relative, status: 'not-file' };
      if (before.size > MAX_BYTES) return { path: relative, status: 'too-large', bytes: before.size };
      // 多读一个字节以检测扫描期间增长；避免无界读取。
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      const after = await handle.stat();
      if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) return { path: relative, status: 'changed-during-scan' };
      const content = buffer.subarray(0, length);
      const fingerprint = { bytes: length, sha256: createHash('sha256').update(content).digest('hex') };
      try {
        const json = JSON.parse(content.toString('utf8').replace(/^\uFEFF/, ''));
        return { path: relative, status: 'read', ...fingerprint, json };
      } catch { return { path: relative, status: 'invalid-json', ...fingerprint }; }
    } finally { await handle.close(); }
  } catch (error) {
    return { path: relative, status: error.code === 'ENOENT' ? 'missing' : 'unreadable', code: error.code || 'IO_ERROR' };
  }
}

/** 复用受控读取，调用方只允许项目规定的资源路径。 */
export async function readResourceSet(rootPath, relativePaths) {
  if (typeof rootPath !== 'string' || !path.isAbsolute(rootPath)) throw new Error('需要绝对资源根目录');
  if (!Array.isArray(relativePaths) || relativePaths.some(item => typeof item !== 'string' || !item || item.split('/').some(part => !part || part === '.' || part === '..') || item.includes('\\') || item.includes(':') || path.isAbsolute(item))) throw new Error('非法相对资源路径');
  const root = await realpath(rootPath);
  if (!(await lstat(root)).isDirectory()) throw new Error('资源根路径必须是目录');
  const files = [];
  for (const relative of relativePaths) files.push(await inspect(root, relative));
  return files;
}

export async function scanApplication(app, installRoot) {
  if (!Object.hasOwn(resources, app)) throw new Error('仅支持 cursor 或 claude');
  const root = app === 'claude' ? await locateAppRoot(installRoot) : await isAbsoluteDirectory(installRoot);
  const files = [];
  for (const relative of resources[app]) files.push(await inspect(root, relative));
  const packageInfo = files.find(file => file.path.endsWith('package.json'))?.json;
  const report = { schemaVersion: 1, app, appRoot: root, readOnly: true, compatibility: 'not-verified', version: typeof packageInfo?.version === 'string' ? packageInfo.version : null, resources: [] };
  for (const { json, ...metadata } of files) report.resources.push(metadata);
  if (app === 'cursor') {
    const keys = files[1].json;
    const messages = files[2].json;
    const validKeys = Array.isArray(keys) && keys.every(item => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && Array.isArray(item[1]) && item[1].every(key => typeof key === 'string'));
    const validMessages = Array.isArray(messages) && messages.every(message => typeof message === 'string');
    const keyCount = validKeys ? keys.reduce((count, item) => count + item[1].length, 0) : null;
    report.nls = { modules: validKeys ? keys.length : null, keys: keyCount, messages: validMessages ? messages.length : null, aligned: validKeys && validMessages && keyCount === messages.length };
  }
  report.notes = ['资源存在不代表适配通过。', 'Claude 的 appRoot 指 Electron 应用根（含 resources/app.asar），不是 WindowsApps 包根。', '未检查 asar 内部、语言白名单、签名或运行时界面。'];
  return report;
}
