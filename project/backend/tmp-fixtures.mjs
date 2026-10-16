/**
 * 测试夹具临时目录的登记处。
 *
 * 各测试文件原先各自 `mkdtemp` 且从不清理，跑一次 `node --test` 就在系统临时目录里留一批
 * 目录（实测累积到数千个）。这里统一登记，整个测试文件跑完由 `after` 钩子一次删干净。
 *
 * 用法：`const root = tmpDirSync('prefix-')` 或 `const root = await tmpDirAsync('prefix-')`。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

const created = [];

after(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
  created.length = 0;
});

export function tmpDirSync(prefix) {
  return track(mkdtempSync(path.join(tmpdir(), prefix)));
}

export async function tmpDirAsync(prefix) {
  return track(await mkdtemp(path.join(tmpdir(), prefix)));
}

function track(root) {
  created.push(root);
  return root;
}
