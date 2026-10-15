import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, truncate, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishCandidate, validateCandidateDirectory } from './candidate-artifacts.mjs';

async function parent() { return mkdtemp(path.join(tmpdir(), 'candidate-integrity-')); }

test('发布完整候选并通过精确文件集与哈希校验', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'package.json': '{"name":"fixture"}\n', 'translations/main.json': '{"contents":{}}\n' });
  assert.deepEqual(await validateCandidateDirectory(output, 'cursor'), { valid: true, integrityVerified: true, applicationVerified: false, installable: false, app: 'cursor', files: 2 });
  assert.equal((await readdir(path.join(root, '.staging'))).length, 0);
});

test('损坏文件、缺失文件、意外文件与错误应用均拒绝', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'claude-', 'claude', { 'report.json': '{}\n' });
  await writeFile(path.join(output, 'report.json'), 'tampered');
  await assert.rejects(validateCandidateDirectory(output, 'claude'), /校验失败/);
  await rm(path.join(output, 'report.json'));
  await assert.rejects(validateCandidateDirectory(output, 'claude'), /文件与清单不一致/);
  await writeFile(path.join(output, 'extra.txt'), 'extra');
  await assert.rejects(validateCandidateDirectory(output, 'claude'), /文件与清单不一致/);
  await assert.rejects(validateCandidateDirectory(output, 'cursor'), /状态或应用不匹配/);
});

test('非法清单路径、篡改状态与符号链接拒绝', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'manifest-data.json': '{}\n' });
  const manifestPath = path.join(output, 'candidate-integrity.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files[0].path = '../outside';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(validateCandidateDirectory(output), /条目无效/);
  const second = await publishCandidate(root, 'cursor-', 'cursor', { 'manifest-data.json': '{}\n' });
  await writeFile(path.join(second, 'candidate-status.json'), JSON.stringify({ installable: true, verified: true, reason: 'candidate-not-install-verified' }));
  await assert.rejects(validateCandidateDirectory(second), /状态标记/);
  const third = await publishCandidate(root, 'cursor-', 'cursor', { 'manifest-data.json': '{}\n' });
  await mkdir(path.join(third, 'link-target'));
  await import('node:fs/promises').then(({ symlink }) => symlink(path.join(third, 'link-target'), path.join(third, 'link'), process.platform === 'win32' ? 'junction' : 'dir'));
  await assert.rejects(validateCandidateDirectory(third), /含链接/);
});

test('构建失败时清理暂存目录且不发布不完整候选', async () => {
  const root = await parent();
  await assert.rejects(publishCandidate(root, 'claude-', 'claude', { '../escape': 'bad' }), /路径或内容无效/);
  assert.deepEqual(await readdir(path.join(root, '.staging')), []);
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('claude-')), []);
});

test('候选状态必须保持不可安装和未验证', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'claude-', 'claude', { 'report.json': '{}\n' });
  const manifestPath = path.join(output, 'candidate-integrity.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.installable = true;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(validateCandidateDirectory(output), /状态或应用不匹配/);
});

test('清单必须包含完整性已验证声明', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'report.json': '{}\n' });
  const manifestPath = path.join(output, 'candidate-integrity.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.integrityVerified;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(validateCandidateDirectory(output), /状态或应用不匹配/);
});

test('候选状态标记必须与生成内容逐字节一致', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'report.json': '{}\n' });
  const statusPath = path.join(output, 'candidate-status.json');
  const status = JSON.parse(await readFile(statusPath, 'utf8'));
  status.extra = 'unexpected';
  await writeFile(statusPath, JSON.stringify(status));
  await assert.rejects(validateCandidateDirectory(output), /状态标记/);
});

test('目录层数超限拒绝', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'report.json': '{}\n' });
  let nested = output;
  for (let i = 0; i < 18; i++) nested = path.join(nested, 'd');
  await mkdir(nested, { recursive: true });
  await assert.rejects(validateCandidateDirectory(output), /层级超过/);
});

test('目录总字节超限拒绝', async () => {
  const root = await parent();
  const output = await publishCandidate(root, 'cursor-', 'cursor', { 'report.json': '{}\n' });
  const big = path.join(output, 'big.bin');
  await writeFile(big, '');
  await truncate(big, 64 * 1024 * 1024 + 1);
  await assert.rejects(validateCandidateDirectory(output), /总字节超过限制/);
  await rm(big);
});
