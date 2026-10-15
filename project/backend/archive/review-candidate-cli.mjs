/** 生成独立HTML审核文件，不向候选目录写入。 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCandidateReview } from './candidate-review.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !path.isAbsolute(args[0])) throw new Error('用法：node project/backend/review-candidate-cli.mjs "候选绝对目录"');
  const result = await createCandidateReview(args[0]);
  const parent = fileURLToPath(new URL('../frontend/reviews/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, `${result.app}-`));
  const output = path.join(directory, 'index.html');
  await writeFile(output, result.html, { flag: 'wx' });
  await writeFile(path.join(directory, 'review-draft.json'), JSON.stringify(result.draft, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, draft: path.join(directory, 'review-draft.json'), rows: result.rows, installable: false, reviewOnly: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.code || error.message, installed: false }));
  process.exitCode = 2;
}
