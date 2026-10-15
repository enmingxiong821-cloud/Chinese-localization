/** 扫描 CLI：仅输出资源元数据，不输出文件正文或用户配置。 */
import { scanApplication } from '../scanner.mjs';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('用法：node project/backend/scan-cli.mjs cursor|claude "绝对安装目录"');
} else if (args.length !== 2) {
  console.error('需要应用标识和绝对安装目录；使用 --help 查看用法。');
  process.exitCode = 2;
} else {
  try {
    const report = await scanApplication(args[0], args[1]);
    console.log(JSON.stringify(report, null, 2));
    // 发现文件错误或不一致时，不将不完整扫描当成成功。
    process.exitCode = report.resources.every(file => file.status === 'read') && (args[0] !== 'cursor' || report.nls.aligned) ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || error.message, readOnly: true }));
    process.exitCode = 2;
  }
}
