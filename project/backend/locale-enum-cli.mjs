/** 语言资源枚举 CLI：report 只读输出；skeleton 生成结构骨架并发布为候选，不安装。 */
import path from 'node:path';
import { publishCandidate } from './candidate-artifacts.mjs';
import { buildLocaleSkeleton, enumerateLocaleResources } from './resource-enum.mjs';

const USAGE = [
  '用法：',
  '  node project/backend/locale-enum-cli.mjs report   "安装包根" [目标语言，默认 zh-Hans]',
  '  node project/backend/locale-enum-cli.mjs skeleton "安装包根" "候选父目录" [目标语言，默认 zh-Hans]'
].join('\n');

function usage() {
  console.error(USAGE);
  process.exitCode = 2;
}

const [verb, ...rest] = process.argv.slice(2);

if (verb === '--help') {
  console.log(USAGE);
} else if (verb === 'report') {
  if (rest.length < 1 || rest.length > 2 || !path.isAbsolute(rest[0])) usage();
  else {
    try {
      console.log(JSON.stringify(await enumerateLocaleResources(rest[0], { target: rest[1] }), null, 2));
    } catch (error) {
      console.error(JSON.stringify({ error: error.code || error.message, readOnly: true }));
      process.exitCode = 2;
    }
  }
} else if (verb === 'skeleton') {
  if (rest.length < 2 || rest.length > 3 || !path.isAbsolute(rest[0]) || !path.isAbsolute(rest[1])) usage();
  else {
    try {
      const skeleton = await buildLocaleSkeleton(rest[0], rest[2]);
      const directory = await publishCandidate(rest[1], 'claude-', 'claude', skeleton.files);
      console.log(JSON.stringify({
        candidate: directory,
        target: rest[2] ?? 'zh-Hans',
        counts: skeleton.counts,
        base: skeleton.base,
        // 候选只保证结构对齐与完整性，既未审核也不可安装。
        installable: false,
        applicationVerified: false,
        next: '骨架值全部是英文原文，需按高频页面分批填写译文并走审核链路。'
      }, null, 2));
    } catch (error) {
      console.error(JSON.stringify({ error: error.code || error.message, installable: false }));
      process.exitCode = 2;
    }
  }
} else usage();
