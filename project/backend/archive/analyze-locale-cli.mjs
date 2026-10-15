/** 显式指定模块的只读诊断，不执行应用脚本，不读用户会话。 */
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { analyzeLocaleLoader } from './locale-analysis.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || !path.isAbsolute(args[0])) {
  console.error('用法：node project/backend/analyze-locale-cli.mjs "绝对JavaScript模块路径"');
  process.exitCode = 2;
} else {
  let handle;
  try {
    handle = await open(args[0], 'r');
    const before = await handle.stat();
    if (!before.isFile() || before.size > 16 * 1024 * 1024) throw new Error('仅处理16MiB以内的普通文件');
    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('读取期间文件发生变化');
    const content = buffer.subarray(0, length);
    const result = analyzeLocaleLoader(content.toString('utf8'));
    console.log(JSON.stringify({ file: path.basename(args[0]), readOnly: true, bytes: length, sha256: createHash('sha256').update(content).digest('hex'), ...result }, null, 2));
    // 未识别也是诊断结果，但不能报为明确识别成功。
    if (result.status === 'unrecognized-review-required') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, readOnly: true }));
    process.exitCode = 2;
  } finally { await handle?.close(); }
}
