/** 候选目录与独立草稿的只读校验；审核完成也不提供安装入口。 */
import { open } from 'node:fs/promises';
import path from 'node:path';
import { assertSameCandidateVersion, loadReviewSource, MAX_DRAFT_BYTES, validateReviewDraft } from './review-decisions.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args.some(argument => !path.isAbsolute(argument))) {
  console.error('用法：node project/backend/validate-review-cli.mjs "候选绝对目录" "审核草稿绝对路径"');
  process.exitCode = 2;
} else {
  let handle;
  try {
    const source = await loadReviewSource(args[0]);
    handle = await open(args[1], 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_DRAFT_BYTES) throw new Error('审核草稿必须是8 MiB以内的普通文件');
    const bytes = await handle.readFile();
    if (bytes.length !== info.size || (await handle.stat()).mtimeMs !== info.mtimeMs) throw new Error('读取期间审核草稿发生变化');
    const draft = JSON.parse(bytes.toString('utf8'));
    const result = validateReviewDraft(source, draft);
    const latest = await loadReviewSource(args[0]);
    assertSameCandidateVersion(source, latest);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, installable: false }));
    process.exitCode = 2;
  } finally { await handle?.close(); }
}
