/** 安装标识 CLI：只读，输出可比对的标识与关键文件指纹，不写入任何位置。 */
import path from 'node:path';
import { identityComplete, readInstallIdentity } from './install-identity.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('用法：node project/backend/identity-cli.mjs "安装包根绝对路径"');
} else if (args.length !== 1 || !path.isAbsolute(args[0])) {
  console.error('需要一个绝对的安装包根路径；使用 --help 查看用法。');
  process.exitCode = 2;
} else {
  try {
    const identity = await readInstallIdentity(args[0]);
    const complete = identityComplete(identity);
    console.log(JSON.stringify({ ...identity, complete }, null, 2));
    process.exitCode = complete ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, readOnly: true }));
    process.exitCode = 2;
  }
}
