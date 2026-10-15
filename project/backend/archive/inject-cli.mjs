/**
 * C1 注入 CLI。四个动词，前两个只读，后两个需要显式 --port。
 *
 *   probe   --port N                     列出调试端口上的页面目标
 *   plan    --candidate PATH [--locale L] 打印注入计划，不连接任何进程
 *   apply   --port N --candidate PATH [--locale L] [--match S] [--no-reload]
 *   revert  --port N [--match S]
 *
 * apply 会常驻并把注入保持到进程退出；Ctrl-C 会精确还原用户级 locale 键值，
 * 并打印本轮应用实际请求过的 i18n 路径（判断注入是否生效的直接证据）。
 * 本工具不修改安装目录、asar、exe、签名或任何全局配置。
 */
import path from 'node:path';
import { listDebugTargets, openSession } from './cdp-session.mjs';
import { applyInjection, buildInjectionPlan, resolveCatalogFiles, revertInjection, TARGET_DEFAULT } from './inject-claude.mjs';

const USAGE = [
  '用法：',
  '  node project/backend/inject-cli.mjs probe  --port 9222',
  '  node project/backend/inject-cli.mjs plan   --candidate "候选绝对目录" [--locale zh-Hans]',
  '  node project/backend/inject-cli.mjs apply  --port 9222 --candidate "候选绝对目录" [--locale zh-Hans] [--match URL子串] [--no-reload]',
  '  node project/backend/inject-cli.mjs revert --port 9222 [--match URL子串]',
  '',
  '调试端口只允许环回地址。apply 需常驻，Ctrl-C 退出并还原。',
  'apply 会在重载后等待并打印观测结果：应用是否真的请求了目标语言的 i18n 资源。'
].join('\n');

function parseArguments(argv) {
  const options = { locale: TARGET_DEFAULT, reload: true };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--no-reload') { options.reload = false; continue; }
    const key = { '--port': 'port', '--candidate': 'candidate', '--locale': 'locale', '--match': 'match' }[token];
    if (!key) throw new Error(`无法识别的参数：${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} 缺少取值`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function fail(message, code = 2) {
  console.error(JSON.stringify({ error: message, installFilesModified: false }, null, 2));
  process.exitCode = code;
}

/**
 * 重载之后应用才会发出 /i18n/ 请求，观测要等一小会儿。
 * 等待超时不当作失败——只是"还没看到"，把实际看到的路径原样报出来更有用。
 */
const OBSERVE_MS = 20000;

async function observe(handle, timeoutMs = OBSERVE_MS) {
  const deadline = Date.now() + timeoutMs;
  let latest = handle.observations();
  while (!latest.targetRequested && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    latest = handle.observations();
  }
  return latest;
}

const [verb, ...rest] = process.argv.slice(2);

if (!verb || verb === '--help') {
  console.log(USAGE);
} else {
  let options;
  try { options = parseArguments(rest); } catch (error) { fail(error.message); }

  if (options) {
    if (verb === 'plan') {
      if (!options.candidate || !path.isAbsolute(options.candidate)) fail('plan 需要 --candidate 绝对路径');
      else {
        try {
          const plan = await buildInjectionPlan(options.candidate, options.locale);
          console.log(JSON.stringify(plan, null, 2));
        } catch (error) { fail(error.code || error.message); }
      }
    } else if (verb === 'probe' || verb === 'apply' || verb === 'revert') {
      if (!options.port) fail(`${verb} 需要 --port`);
      else {
        let session;
        try {
          const targets = await listDebugTargets(`127.0.0.1:${options.port}`, { match: options.match });
          if (verb === 'probe') {
            console.log(JSON.stringify({ endpoint: `127.0.0.1:${options.port}`, targets: targets.map(target => ({ title: target.title, url: target.url, type: target.type })) }, null, 2));
          } else {
            session = await openSession(targets[0].webSocketDebuggerUrl);
            await session.send('Page.enable');
            await session.send('Runtime.enable');
            if (verb === 'revert') {
              const result = await revertInjection(session, null);
              console.log(JSON.stringify({ reverted: result.restored, target: targets[0].url, note: '无法得知注入前的取值，这里只做清除；跨进程的精确还原由 apply 的 Ctrl-C 负责。' }, null, 2));
            } else {
              if (!options.candidate || !path.isAbsolute(options.candidate)) { fail('apply 需要 --candidate 绝对路径'); }
              else {
                const plan = await buildInjectionPlan(options.candidate, options.locale);
                const files = await resolveCatalogFiles(options.candidate, options.locale);
                const handle = await applyInjection(session, plan, files);
                if (options.reload) await session.send('Page.reload', { ignoreCache: true });
                console.log(JSON.stringify({
                  applied: true,
                  target: targets[0].url,
                  locale: plan.target,
                  catalogValue: plan.catalogValue,
                  paths: plan.paths,
                  previousStoredLocale: handle.previous,
                  reloaded: options.reload,
                  persistent: false,
                  installFilesModified: false,
                  note: '注入只在本次进程存活期间有效。按 Ctrl-C 退出并还原。'
                }, null, 2));

                console.log('注入已生效，进程常驻中。Ctrl-C 退出并还原。');

                // 常驻：Fetch 拦截与预加载脚本都依附于这条 CDP 会话，进程退出即全部撤销。
                const stop = async () => {
                  process.off('SIGINT', stop);
                  // 先取观测再 dispose：撤销之后这两个 Map 就没有意义了。
                  const final = handle.observations();
                  const result = await revertInjection(session, handle).catch(error => ({ restored: false, error: error.message }));
                  console.log(JSON.stringify({ reverted: result.restored, previous: result.previous ?? handle.previous, observations: final }, null, 2));
                  session.close();
                  process.exit(0);
                };
                process.on('SIGINT', stop);

                // 自报证据：应用请求了目标语言的基础目录，只能出自 O_() 返回了目标语言。
                const observations = await observe(handle);
                console.log(JSON.stringify({
                  observations,
                  waitedMs: OBSERVE_MS,
                  ...(observations.targetRequested ? {} : {
                    hint: options.reload
                      ? '应用已重载却没有请求目标语言：多半是门禁没走到 O_()，或页面目标选错了。'
                      : '本次未重载应用，请求尚未发生；手动重载页面后再看本轮末尾的报告。'
                  })
                }, null, 2));
              }
            }
          }
        } catch (error) {
          if (session) session.close();
          fail(error.code || error.message);
        }
      }
    } else {
      console.log(USAGE);
      process.exitCode = 2;
    }
  }
}
