/** 受控读写原语的专项测试：夹具全部在系统临时目录合成，只读原语不写入任何位置。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertRealDirectory, hashFile, listRegularFiles, readBoundedFile, safeRelative, sha256 } from './safe-io.mjs';
import { tmpDirAsync } from './tmp-fixtures.mjs';

const LIMITS = { maxDepth: 8, maxFiles: 100, maxTotalBytes: 1024 * 1024 };

const fixture = async () => tmpDirAsync('safe-io-');

test('sha256 与已知向量一致', () => {
  assert.equal(sha256(Buffer.alloc(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('safeRelative 接受规范的相对路径', () => {
  for (const value of ['a', 'a/b', 'app/resources/ion-dist/i18n/zh-Hans.json', 'a.b-c_d']) {
    assert.equal(safeRelative(value), true, value);
  }
});

test('safeRelative 拒绝绝对路径、反斜杠、冒号与上跳段', () => {
  for (const value of ['/abs', '../x', 'a/../b', 'a/./b', 'a//b', './a', 'C:/x', 'a\\b', 'a:b']) {
    assert.equal(safeRelative(value), false, value);
  }
});

test('safeRelative 拒绝非字符串与空串', () => {
  for (const value of ['', null, undefined, 1, {}, ['a']]) {
    assert.equal(safeRelative(value), false, String(value));
  }
});

test('assertRealDirectory 返回消解链接后的绝对目录', async () => {
  const root = await fixture();
  const nested = path.join(root, 'a', 'b');
  await mkdir(nested, { recursive: true });
  assert.equal(await assertRealDirectory(path.join(root, 'a', '..', 'a', 'b')), await realpath(nested));
});

test('assertRealDirectory 拒绝相对路径、空值与文件，并透传自定义消息', async () => {
  const root = await fixture();
  const file = path.join(root, 'a.txt');
  await writeFile(file, 'x');
  await assert.rejects(() => assertRealDirectory('relative/path'), { message: '需要绝对目录路径' });
  await assert.rejects(() => assertRealDirectory('   '), { message: '需要绝对目录路径' });
  await assert.rejects(() => assertRealDirectory(undefined), { message: '需要绝对目录路径' });
  await assert.rejects(() => assertRealDirectory('relative/path', '自定义消息'), { message: '自定义消息' });
  await assert.rejects(() => assertRealDirectory(file), { message: '路径必须是目录' });
});

test('listRegularFiles 递归列出普通文件', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'a', 'b'), { recursive: true });
  await writeFile(path.join(root, 'top.txt'), '1');
  await writeFile(path.join(root, 'a', 'mid.txt'), '22');
  await writeFile(path.join(root, 'a', 'b', 'deep.txt'), '333');
  assert.deepEqual((await listRegularFiles(root, LIMITS)).sort(), ['a/b/deep.txt', 'a/mid.txt', 'top.txt']);
});

test('listRegularFiles 拒绝目录树中的链接条目', async () => {
  const root = await fixture();
  const outside = await fixture();
  await writeFile(path.join(outside, 'secret.txt'), '不该被读到');
  await symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => listRegularFiles(root, LIMITS), /目录含链接：link/);
});

test('listRegularFiles 超过层数上限时报错', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'a'), { recursive: true });
  await writeFile(path.join(root, 'a', 'x.txt'), '1');
  assert.deepEqual(await listRegularFiles(root, { ...LIMITS, maxDepth: 1 }), ['a/x.txt'], '刚好到上限时应通过');
  await assert.rejects(() => listRegularFiles(root, { ...LIMITS, maxDepth: 0 }), /目录层级超过 0/);
});

test('listRegularFiles 超过文件数或总字节预算时报错', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'a.txt'), '1234567890');
  await writeFile(path.join(root, 'b.txt'), '1234567890');
  await assert.rejects(() => listRegularFiles(root, { ...LIMITS, maxFiles: 1 }), /目录文件数超过 1/);
  await assert.rejects(() => listRegularFiles(root, { ...LIMITS, maxTotalBytes: 5 }), /目录总字节超过限制/);
});

test('readBoundedFile 原样读出文件内容', async () => {
  const root = await fixture();
  const file = path.join(root, 'a.json');
  await writeFile(file, '{"k":"值"}');
  assert.deepEqual(await readBoundedFile(file, 1024), Buffer.from('{"k":"值"}'));
});

test('readBoundedFile 允许恰好等于上限，超过上限报错', async () => {
  const root = await fixture();
  const file = path.join(root, 'a.bin');
  await writeFile(file, Buffer.alloc(64, 7));
  assert.equal((await readBoundedFile(file, 64)).length, 64, '等于上限是允许的，判据是 size > maxBytes');
  await assert.rejects(() => readBoundedFile(file, 63), /文件类型或大小不允许/);
});

test('readBoundedFile 读不到文件时报错', async () => {
  const root = await fixture();
  await assert.rejects(() => readBoundedFile(path.join(root, '不存在.txt'), 1024));
});

test('hashFile 跨分块流式哈希，结果与整块哈希一致', async () => {
  const root = await fixture();
  const file = path.join(root, 'big.bin');
  const content = Buffer.alloc(1024 * 1024 + 12345, 3);
  await writeFile(file, content);
  const result = await hashFile(file);
  assert.equal(result.bytes, content.length);
  assert.equal(result.sha256, sha256(content), '分块读取不能改变摘要');
});

test('hashFile 超过上限时报错', async () => {
  const root = await fixture();
  const file = path.join(root, 'a.bin');
  await writeFile(file, Buffer.alloc(64, 1));
  await assert.rejects(() => hashFile(file, 63), /文件类型或大小不允许/);
  assert.equal((await hashFile(file, 64)).bytes, 64);
});
