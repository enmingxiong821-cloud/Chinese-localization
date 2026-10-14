# Chinese-localization

专业汉化，尤其针对claude等等，欢迎大家一起完善

Windows 桌面应用汉化的工具链与流程。**当前只针对 Claude Desktop**（Cursor 为后续目标）。

## 现状

层 C（前端 SPA，34,213 键）的中文**已完整落地并装机验收**，键覆盖率 **99.08%**
（33,897 / 34,213）。未覆盖的 316 条是 URL、ARN、UUID、OAuth scope、字体名等
本就应保留原样的值，回落即得官方原文，**界面上不出现英文残留**。

交付形态是**一键安装器**（`installer/`）：双击 `安装.cmd`，自动复制一份官方程序的独立副本、
打入中文、建好快捷方式。**官方安装目录一个字节都不动**，随时可整体删除还原。

后端链路（安装包身份核验、资源枚举与缺口报告、候选生成、审核草稿、审核合并、
备份与恢复、运行时注入适配器）照旧保留。

## Claude Desktop 的四层文本

| 层 | 位置 | 情况 |
| --- | --- | --- |
| A | `app/locales/*.pak` | Chromium 自带，`zh-CN.pak`/`zh-TW.pak` 随包发布，**无需处理** |
| B | `app/resources/{locale}.json` | 43 个语言，`zh-Hans.json` 随包发布，**无需处理** |
| C | `app/resources/ion-dist/i18n/*.json` | 前端 SPA，34,213 键，**官方无中文**，需打补丁 |
| D | `profile\Claude\config.json` 的 `locale` | 应用级语言开关（副本自己的配置） |

层 C 的 locale 解析链是「`localStorage['spa:locale']` → `i18n-catalogs` 元数据 →
11 语言白名单」，白名单里没有中文。`ion-dist` 的 11 份资源键集完全一致
（各 34,213 键，0 缺 0 余），所以补一份 `zh-Hans.json` 在结构上是安全的。

## 落地路径：可写副本

官方安装目录写不进 —— `C:\Program Files\WindowsApps\...` 的 ACL 只给 `TrustedInstaller`
和 `SYSTEM` 写权限，`Administrators` 也只有 `RX`，提权同样写不进。所以走**可写副本**：

1. 把官方包整份复制到 `%LOCALAPPDATA%\Claude-zh\package\`（约 700 MB）；
2. 启动副本时把 `LOCALAPPDATA` 指向副本专属目录，并加 `--user-data-dir` 把 Electron 的
   userData 也钉在副本内 → 副本有独立 userData 与独立单实例锁，可与官方版**同时运行互不干扰**；
3. 在副本里打三处补丁（见下）。

副本不会自动更新（包内无 `app-update.yml`，启动日志打印
`[updater] App is not installed, not enabling auto-updates`），所以补丁不会被官方升级覆盖；
官方升级后重跑一次安装器即可。

**副本与官方版之间没有共享文件**：userData、缓存、配置、日志全部落在副本目录内，
`%APPDATA%\Claude` 与官方安装目录全程只读、不被写入，因此也不需要复制或导出任何凭据。
代价是副本是全新环境，首次启动需在副本内登录一次；登录态此后独立保存在副本里。

### 三处补丁

| # | 位置 | 改动 |
| --- | --- | --- |
| 1 | `app/resources/ion-dist/i18n/zh-Hans.json` | 新增文件：官方 `en-US.json` 作底座 + 33,897 条中文覆盖 |
| 2 | `app/resources/ion-dist/assets/v1/shared-*.js` | 两处 11 语言白名单数组各追加 `"zh-Hans"`（共 +20 字节，恰好 2 处） |
| 3 | `app/resources/ion-dist/{index,frame-shell,frame-connect,frame-manage}.html` | 各在 `<meta charset>` 之后插入 159 字节，注册中文目录并把 `localStorage["spa:locale"]` 钉为 `zh-Hans` |

补丁不修改 `claude.exe`、不解包或改写 asar、不触碰数字签名。

## 已知残留与不做的事

- 副本是官方二进制 + 三处文本资源改动，**不提供零风险保证**。
- `locale` 写在副本自己的 userData 配置里（`profile\Claude\config.json`），官方版读不到。
- 副本是独立环境，首次启动需在副本内登录一次。
- 极少数提示来自程序主体，不在层 C 词典内，仍为英文。
- 不走「给官方安装原地打补丁」（ACL 挡死）、不走「应用自带的 `CLAUDE_USER_DATA_DIR` 换目录」
  （签名构建忽略它，asar 内明写 `signed builds ignore it`；有效的等价手段是 Electron 标准的
  `--user-data-dir`，已在用）、不走「挂调试端口注入」（`--remote-debugging-port` 在 asar 的
  命令行黑名单里，进程 1 秒内 `exit(1)`；逃生门要一个签不出来的 `CLAUDE_CDP_AUTH` 令牌）。
  `inject-claude.mjs` / `cdp-session.mjs` 代码与测试保留，但**不是落地路径**。

## 安装与还原

安装（双击即可，或命令行运行）：

```bash
node installer/install-cli.mjs install
```

校验安装是否完好：

```bash
node installer/install-cli.mjs verify
```

还原（把补丁文件逐字节写回、删掉中文语言包、删除快捷方式；官方安装与官方数据全程未被改动）：

```bash
node installer/install-cli.mjs restore
```

安装器是可重复运行的：源版本与译文表都没变时什么都不做；官方升级后重跑会用新版官方文件
刷新副本，用户的聊天记录（`profile\`）不受影响。

译文表的来源、许可与收录口径见 [`installer/translations/SOURCES.md`](installer/translations/SOURCES.md)。

## 命令

只读：

```bash
node project/backend/identity-cli.mjs "C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc"
```

```bash
node project/backend/locale-enum-cli.mjs report "安装包根"
```

生成候选（不安装）：

```bash
node project/backend/locale-enum-cli.mjs probe "安装包根" "候选父目录"
```

注入适配器（**目前跑不通**，命令保留供通道打开时使用；`apply` 常驻，Ctrl-C 退出并精确还原）：

```bash
node project/backend/inject-cli.mjs plan --candidate "候选绝对目录"
```

```bash
node project/backend/inject-cli.mjs apply --port 9222 --candidate "候选绝对目录"
```

审核链路：`review-candidate-cli.mjs` → `validate-review-cli.mjs` → `merge-review-cli.mjs`，
备份与恢复见 `backup-cli.mjs`。

跑测试：

```bash
node --test project/backend/*.test.mjs
```

## 边界

- 不修改 `Claude.exe`，不破坏签名，不关闭更新，不持久化提权。
- 调试端口只绑定环回地址、短时、不常驻。
- 备份与导出一律排除 `%APPDATA%\Claude\` 下的凭据（`oauth:tokenCache` 等）。
- 层 C 的 34,213 条源字符串属 Anthropic，**不随本仓库分发**；候选、审核产物与备份
  都已在 `.gitignore` 里排除，只在本地存在。

设计与调研文档见 [`doc/`](doc/)。
