/** 生成审核合并后的新候选目录；不改写源候选、不安装目标应用。 */
import { mkdir, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadReviewSource, MAX_DRAFT_BYTES, mergeApprovedReview } from './review-decisions.mjs';
import { publishCandidate, validateCandidateDirectory } from './candidate-artifacts.mjs';

const args = process.argv.slice(2);
if (args.length !== 3 || !path.isAbsolute(args[0]) || !path.isAbsolute(args[1])) {
  console.error('用法：node project/backend/merge-review-cli.mjs "候选绝对目录" "审核草稿绝对路径" "审查人标识"');
  process.exitCode = 2;
} else {
  let handle;
  try {
    const [candidatePath, draftPath, reviewer] = args;
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(reviewer)) throw new Error('审查人标识仅允许字母、数字、点、下划线和连字符，长度1至64');
    const source = await loadReviewSource(candidatePath);
    handle = await open(draftPath, 'r');
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_DRAFT_BYTES) throw new Error('审核草稿必须是8 MiB以内的普通文件');
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('读取期间审核草稿发生变化');
    const draft = JSON.parse(bytes.toString('utf8'));
    const merged = await mergeApprovedReview(candidatePath, draft);
    const latest = await loadReviewSource(candidatePath);
    if (latest.manifestHash !== source.manifestHash) throw new Error('合并期间候选版本发生变化');
    if (!merged.approvedApplied) throw new Error('没有已批准的译文可合并');
    const files = Object.fromEntries([...merged.files].map(([name, content]) => [name, content.toString('utf8')]));
    const audit = JSON.parse(files['merge-audit.json'] || '{}');
    audit.reviewer = reviewer;
    audit.createdAt = new Date().toISOString();
    files['merge-audit.json'] = JSON.stringify(audit, null, 2) + '\n';
    const outputRoot = fileURLToPath(new URL('../frontend/candidates/', import.meta.url));
    await mkdir(outputRoot, { recursive: true });
    const output = await publishCandidate(outputRoot, `${source.app}-`, source.app, files);
    const verified = await validateCandidateDirectory(output, source.app);
    console.log(JSON.stringify({ output, integrityVerified: verified.integrityVerified, applicationVerified: false, installable: false, approvedApplied: merged.approvedApplied, reviewer }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, installed: false }));
    process.exitCode = 2;
  } finally { await handle?.close(); }
}
