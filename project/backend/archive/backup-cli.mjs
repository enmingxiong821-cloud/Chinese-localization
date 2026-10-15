/** 备份事务 CLI：plan/create/verify 三个动作从不写入安装目录，restore-plan 只产出计划。 */
import path from 'node:path';
import { buildRestorePlan, createBackup, planBackup, verifyBackup } from './backup-transaction.mjs';
import { readInstallIdentity } from '../install-identity.mjs';

const USAGE = [
  '用法：',
  '  node project/backend/backup-cli.mjs plan         "安装包根" "备份根目录" "相对路径" [...]',
  '  node project/backend/backup-cli.mjs create       "安装包根" "备份根目录" "相对路径" [...]',
  '  node project/backend/backup-cli.mjs verify       "备份绝对目录"',
  '  node project/backend/backup-cli.mjs restore-plan "备份绝对目录" "安装包根"'
].join('\n');

function fail(message) {
  console.error(message);
  process.exitCode = 2;
}

const [verb, ...rest] = process.argv.slice(2);

if (verb === '--help' || verb === undefined) {
  console.log(USAGE);
  process.exitCode = verb === undefined ? 2 : 0;
} else if (verb === 'verify') {
  if (rest.length !== 1 || !path.isAbsolute(rest[0])) fail(USAGE);
  else {
    try {
      const result = await verifyBackup(rest[0]);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(JSON.stringify({ error: error.code || error.message, valid: false }));
      process.exitCode = 1;
    }
  }
} else if (verb === 'restore-plan') {
  if (rest.length !== 2 || rest.some(argument => !path.isAbsolute(argument))) fail(USAGE);
  else {
    try {
      const current = await readInstallIdentity(rest[1]);
      const plan = await buildRestorePlan(rest[0], current);
      console.log(JSON.stringify(plan, null, 2));
      process.exitCode = plan.allowed ? 0 : 1;
    } catch (error) {
      console.error(JSON.stringify({ error: error.code || error.message, executed: false }));
      process.exitCode = 2;
    }
  }
} else if (verb === 'plan' || verb === 'create') {
  // 至少要有安装包根、备份根和一条目标路径，且两者都必须是绝对路径。
  if (rest.length < 3 || !path.isAbsolute(rest[0]) || !path.isAbsolute(rest[1])) fail(USAGE);
  else {
    const [packageRoot, destination, ...targets] = rest;
    try {
      const plan = await planBackup(packageRoot, targets);
      if (verb === 'plan') {
        const { appRoot, ...visible } = plan;
        console.log(JSON.stringify({ ...visible, note: '只读计划，未写入任何位置。' }, null, 2));
      } else {
        const result = await createBackup(plan, destination);
        console.log(JSON.stringify({ plan: { identitySha256: plan.identity.identitySha256, packageVersion: plan.identity.packageVersion, targets: plan.targets, entries: plan.entries }, backup: result }, null, 2));
      }
    } catch (error) {
      console.error(JSON.stringify({ error: error.code || error.message, wroteToInstall: false }));
      process.exitCode = 2;
    }
  }
} else fail(USAGE);
