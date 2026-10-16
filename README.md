# Chinese-localization

Windows 桌面应用汉化的工具链与流程。**当前只针对 Claude Desktop**。

## 给使用者：下载与安装

1. **下载**：到 [Releases](https://github.com/enmingxiong821-cloud/Chinese-localization/releases/latest)
   下载最新的 `Chinese-localization-vX.Y.Z.zip`，解压到任意目录即可（里面就是工具本身，不含 Claude）。
2. **装 Node.js**：需要 [Node.js LTS](https://nodejs.org/)（18 以上）。没装的话双击时会直接提示你装。
3. **双击 `installer\安装.cmd`**。安装器自动定位官方 Claude Desktop → 复制一份独立副本到
   `%LOCALAPPDATA%\Claude-zh\` → 打入中文 → 建好桌面与开始菜单快捷方式。全程无需管理员权限。
4. **用新出现的快捷方式启动**副本，首次登录一次，进主界面即是中文。

官方安装目录、官方配置与官方数据**全程未被改动**；副本与官方版各有独立的用户数据与单实例锁，
**可以同时运行互不干扰**。

**还原**：`node installer/install-cli.mjs restore`（删补丁与快捷方式），或直接删掉
`%LOCALAPPDATA%\Claude-zh` 整个目录（连同副本一起清掉）。两种都不影响官方版。

## 现状

层 C（前端 SPA，35,441 键 + 动态词典 49 键）的中文**已完整落地**，主词典键覆盖率
**99.53%**（35,274 / 35,441），动态词典 **100%**。未覆盖的 167 条全是品牌名、型号名、技术标识与
示例值（`GitHub`、`Haiku`、`MCP`、URL、UUID…），**本就应保留英文原样**，回落即得官方原文。

安装门禁已对官方 **2.42304.0.0** 复验通过：白名单锚点恰好 2 处、四个 HTML 锚点齐备、
覆盖率高于 95% 阈值，译文表与这一版的键空间吻合。

交付形态是**一键安装器**（[`installer/`](installer/)）：双击 `安装.cmd`，自动复制一份官方程序的
独立副本、打入中文、建好快捷方式。**官方安装目录一个字节都不动**，随时可整体删除还原。

译文表的来源、许可与收录口径见 [`installer/translations/SOURCES.md`](installer/translations/SOURCES.md)；
用户侧的使用说明见 [`installer/说明.txt`](installer/说明.txt)。

## Claude Desktop 的四层文本

| 层 | 位置 | 情况 |
| --- | --- | --- |
| A | `app/locales/*.pak` | Chromium 自带，`zh-CN.pak`/`zh-TW.pak` 随包发布，**无需处理** |
| B | `app/resources/{locale}.json` | 43 个语言，`zh-Hans.json` 随包发布，**无需处理** |
| C | `app/resources/ion-dist/i18n/*.json` 与 `i18n/dynamic/*.json` | 前端 SPA，35,441 + 49 键，**官方无中文**，需打补丁 |
| D | 副本 `profile\Claude\config.json` 的 `locale` | 应用级语言开关（副本自己的配置） |

层 C 的 locale 解析链是「`localStorage['spa:locale']` → `i18n-catalogs` 元数据 →
11 语言白名单」，白名单里没有中文。`en-US` 是键集的**超集**（其余 10 份各缺 49–55 键，官方自己的
译文也在追赶），所以拿 `en-US.json` 作底座补一份 `zh-Hans.json` 在结构上是安全的 —— 键多出来是常态。
`i18n/dynamic/` 是另一部小词典（模型与思考档位选择器的文案，49 键），前端把 base 与 dynamic
放在**同一个 `Promise.all`** 里取，任一份失败整盘就不加载 —— 所以两份必须一起补。

## 落地路径：可写副本

官方安装目录写不进 —— `C:\Program Files\WindowsApps\...` 的 ACL 只给 `TrustedInstaller`
和 `SYSTEM` 写权限，`Administrators` 也只有 `RX`，提权同样写不进。所以走**可写副本**：

1. 把官方包整份复制到 `%LOCALAPPDATA%\Claude-zh\package\`（约 700 MB）；
2. 启动副本时把 `LOCALAPPDATA` 指向副本专属目录，并加 `--user-data-dir` 把 Electron 的
   userData 也钉在副本内 → 副本有独立 userData 与独立单实例锁，可与官方版**同时运行互不干扰**；
3. 在副本里打四处补丁（见下）。

副本不会自动更新（包内无 `app-update.yml`），所以补丁不会被官方升级覆盖；官方升级后重跑一次
安装器即可。**副本与官方版之间没有共享文件**，因此也不需要复制或导出任何凭据；代价是副本是
全新环境，首次启动需在副本内登录一次。

### 四处补丁

| # | 位置 | 改动 |
| --- | --- | --- |
| 1 | `app/resources/ion-dist/i18n/zh-Hans.json` | 新增文件：官方 `en-US.json` 作底座 + 35,274 条中文覆盖 |
| 2 | `app/resources/ion-dist/i18n/dynamic/zh-Hans.json` | 新增文件：官方 `dynamic/en-US.json` 作底座 + 49 条中文覆盖 |
| 3 | `app/resources/ion-dist/assets/v1/shared-*.js` | 两处 11 语言白名单数组各追加 `"zh-Hans"`（共 +20 字节，恰好 2 处） |
| 4 | `app/resources/ion-dist/{index,frame-shell,frame-connect,frame-manage}.html` | 各在 `<meta charset>` 之后插入 159 字节，注册中文目录并把 `localStorage["spa:locale"]` 钉为 `zh-Hans` |

补丁不修改 `claude.exe`、不解包或改写 asar、不触碰数字签名。

## 已知残留与不做的事

- 副本是官方二进制 + 四处文本资源改动，**不提供零风险保证**。
- 未登录时的**欢迎页**（"Claude for Windows / 与 Claude 对话的最快方式 / 开始使用"）中文由
  **服务端**随 `locale` 本地化，**不是层 C 词典的产物**（删掉 `i18n/zh-Hans.json` 欢迎页也不变）。
  **验收层 C 必须在副本登录后进主界面看**，欢迎页/登录页不能作为层 C 的证据。
- 极少数提示来自程序主体，不在层 C 词典内，仍为英文。
- 不走「给官方安装原地打补丁」（ACL 挡死）；不走「应用自带的 `CLAUDE_USER_DATA_DIR` 换目录」
  （签名构建忽略它，asar 内明写 `signed builds ignore it`；有效的等价手段是 Electron 标准的
  `--user-data-dir`，已在用）；不走「挂调试端口注入」（`--remote-debugging-port` 在 asar 的
  命令行黑名单里，进程 1 秒内 `exit(1)`）。

## 命令行用法

```bash
node installer/install-cli.mjs install
```

```bash
node installer/install-cli.mjs verify
```

```bash
node installer/install-cli.mjs restore
```

`install` 可重复运行：源版本与译文表都没变时什么都不做；官方升级后重跑会用新版官方文件刷新副本，
用户的聊天记录（`profile\`）不受影响。`restore` 把补丁文件逐字节写回副本、删掉中文词典与快捷方式；
官方安装与官方数据全程未被改动。

## 跑测试

```bash
node --test
```

无需参数，会递归发现全部测试（带目录参数在本机不生效，目录会被当成文件路径）。默认 **170 项通过、
2 项跳过**，约 3 秒。跳过的是归档里两个会**真开 headless 浏览器**的端到端用例，按需单独启用：

```bash
CDP_E2E=1 node --test --test-force-exit
```

`--test-force-exit` 是这条深度路径必需的：浏览器进程句柄会让测试进程退不出（该 flag 需要 Node 22 以上；
默认那条命令不依赖它，Node 18 也能跑）。

## 发版打包

发布附件直接由 `git archive` 从提交内容生成，只含运行所需的最小闭合，不夹带文档与归档：

```bash
git archive --format=zip -o Chinese-localization.zip HEAD README.md LICENSE installer project/backend ':(exclude)project/backend/archive'
```

解压后双击 `installer\安装.cmd` 即可；包内的 `installer/*.test.mjs` 也能就地 `node --test`。
`project/backend/archive/` 是冻结的早期工具链，安装器用不到，别打进去。

**附件名只能用 ASCII**：GitHub 会把发布附件名里的非 ASCII 字符丢掉（传 `Claude汉化-v1.4.zip`
会变成 `Claude.-v1.4.zip`），所以用 `Chinese-localization-vX.Y.Z.zip` 这种形式。

## 目录

| 路径 | 内容 |
| --- | --- |
| [`installer/`](installer/) | **交付路径**：安装器、译文表、说明模板 |
| [`project/backend/`](project/backend/) | 安装器依赖的活代码：`safe-io.mjs`、`install-identity.mjs`、`scanner.mjs` |
| [`project/backend/archive/`](project/backend/archive/README.md) | 早期工具链（Cursor 链路、CDP 注入、候选审核、备份事务），冻结保留 |
| [`doc/`](doc/) | 技术设计依据与已归档的早期文档 |

## 边界

- 不修改 `claude.exe`，不破坏签名，不关闭更新，不持久化提权。
- 层 C 的 35,441 条源字符串属 Anthropic，**不随本仓库分发**；译文表只存 `{哈希键: 中文}`。
