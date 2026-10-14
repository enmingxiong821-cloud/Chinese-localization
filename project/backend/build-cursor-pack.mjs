/** 候选产物固定写入项目 frontend/candidates 的新目录，禁止覆盖已有输出。 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildCursorCandidate } from './cursor-pack.mjs';
import { publishCandidate } from './candidate-artifacts.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('用法：node project/backend/build-cursor-pack.mjs "Cursor绝对安装目录" "微软中文扩展绝对目录"');
} else if (args.length !== 2) {
  console.error('需要两个绝对目录；使用 --help 查看用法。');
  process.exitCode = 2;
} else {
  try {
    const candidate = await buildCursorCandidate(...args);
    const license = await readFile(new URL('./third-party/vscode-loc-MIT.txt', import.meta.url), 'utf8');
    const parent = fileURLToPath(new URL('../frontend/candidates/', import.meta.url));
    const files = {
      'package.json': JSON.stringify(candidate.manifest, null, 2) + '\n',
      'translations/main.i18n.json': JSON.stringify(candidate.translation, null, 2) + '\n',
      'coverage.json': JSON.stringify(candidate.report, null, 2) + '\n',
      'pending.json': JSON.stringify(candidate.pending, null, 2) + '\n',
      'THIRD-PARTY-LICENSE.txt': license,
      'README.md': '# 未验证候选资源\n\n此目录不是VSIX。禁止将规则接受率当成完整汉化率。未安装到Cursor；同键语义、引擎兼容性和真实界面尚需验证。\n'
    };
    const output = await publishCandidate(parent, 'cursor-', 'cursor', files);
    console.log(JSON.stringify({ output, status: candidate.report.status, coverage: candidate.coverage }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, installed: false }));
    process.exitCode = 2;
  }
}
