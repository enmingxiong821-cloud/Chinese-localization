/** 输出仅限项目内新建候选目录，不提供安装操作。 */
import { fileURLToPath } from 'node:url';
import { buildClaudeCandidate } from './claude-candidate.mjs';
import { publishCandidate } from './candidate-artifacts.mjs';

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('用法：node project/backend/build-claude-candidate.mjs "Claude绝对安装目录"');
  process.exitCode = 2;
} else {
  try {
    const candidate = await buildClaudeCandidate(args[0]);
    const parent = fileURLToPath(new URL('../frontend/candidates/', import.meta.url));
    const files = {};
    for (let index = 0; index < candidate.resources.length; index++) {
      const resource = candidate.resources[index];
      const name = index === 0 ? 'desktop' : 'frontend';
      files[`${name}.zh-CN.json`] = JSON.stringify(resource.translation, null, 2) + '\n';
      files[`${name}.review.json`] = JSON.stringify(resource.review, null, 2) + '\n';
      if (resource.missingNative.length) files[`${name}.missing-native.json`] = JSON.stringify(resource.missingNative, null, 2) + '\n';
    }
    const report = { status: candidate.status, installable: false, verified: false, nativeResource: candidate.nativeResource, notes: candidate.notes, resources: candidate.resources.map(({ translation, review, missingNative, ...metadata }) => ({ ...metadata, missingNative: missingNative.length })) };
    files['report.json'] = JSON.stringify(report, null, 2) + '\n';
    files['README.md'] = '# 未安装的Claude候选资源\n\n包含目标应用原文，仅供本机审核，不作为可公开分发包。英文保留项不是汉化成果。尚未检查白名单与实际加载，不要直接覆盖安装资源。\n';
    const output = await publishCandidate(parent, 'claude-', 'claude', files);
    console.log(JSON.stringify({ output, ...report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, installed: false }));
    process.exitCode = 2;
  }
}
