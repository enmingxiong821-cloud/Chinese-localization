/**
 * 受控文件读取与目录枚举的共用实现：有界读取、预算限制，枚举时拒绝链接与特殊文件。
 * readBoundedFile / hashFile 自身不做链接检查，调用方须先用 assertRealDirectory 解析路径。
 */
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function safeRelative(relative) {
  return typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.includes(':') && !path.isAbsolute(relative) && relative.split('/').every(part => part && part !== '.' && part !== '..');
}

/** 解析为规范绝对目录；符号链接在此处被消解，调用方拿到的是真实路径。 */
export async function assertRealDirectory(value, message = '需要绝对目录路径') {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value)) throw new Error(message);
  const root = await realpath(value);
  if (!(await lstat(root)).isDirectory()) throw new Error('路径必须是目录');
  return root;
}

/** 递归枚举普通文件，同时施加层数、文件数与总字节预算，避免被指向大目录时全量展开。 */
export async function listRegularFiles(root, limits, current = '', depth = 0, budget = { files: 0, bytes: 0 }) {
  if (depth > limits.maxDepth) throw new Error(`目录层级超过 ${limits.maxDepth}`);
  const files = [];
  for (const entry of await readdir(path.join(root, current), { withFileTypes: true })) {
    const relative = current ? `${current}/${entry.name}` : entry.name;
    const info = await lstat(path.join(root, ...relative.split('/')));
    if (info.isSymbolicLink()) throw new Error(`目录含链接：${relative}`);
    if (info.isDirectory()) { files.push(...await listRegularFiles(root, limits, relative, depth + 1, budget)); continue; }
    if (!info.isFile()) throw new Error(`目录含特殊文件：${relative}`);
    if (++budget.files > limits.maxFiles) throw new Error(`目录文件数超过 ${limits.maxFiles}`);
    if ((budget.bytes += info.size) > limits.maxTotalBytes) throw new Error('目录总字节超过限制');
    files.push(relative);
  }
  return files;
}

/** 读满 size+1 字节即停；stat 之后文件若被追加，也不会无界读取。 */
export async function readBoundedFile(fullPath, maxBytes) {
  const handle = await open(fullPath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error(`文件类型或大小不允许：${fullPath}`);
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error(`读取期间文件发生变化：${fullPath}`);
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

/** 流式哈希大文件，不整体读入内存。 */
export async function hashFile(fullPath, maxBytes = 512 * 1024 * 1024) {
  const handle = await open(fullPath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error(`文件类型或大小不允许：${fullPath}`);
    const digest = createHash('sha256');
    const chunk = Buffer.alloc(1024 * 1024);
    let length = 0;
    while (length < before.size) {
      const result = await handle.read(chunk, 0, Math.min(chunk.length, before.size - length), length);
      if (!result.bytesRead) break;
      digest.update(chunk.subarray(0, result.bytesRead));
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error(`读取期间文件发生变化：${fullPath}`);
    return { bytes: length, sha256: digest.digest('hex') };
  } finally { await handle.close(); }
}
