# Chinese-localization

专业汉化，尤其针对claude等等，欢迎大家一起完善

Windows 桌面应用汉化的工具链与流程。**当前只针对 Claude Desktop**（Cursor 为后续目标）。

## 现状（别把它想得比实际更完整）

已经跑通的是**后端链路**：安装包身份核验、资源枚举与缺口报告、候选生成、审核草稿、
审核合并、备份与恢复、以及层 C 的运行时注入适配器。

**还没跑通的是真实应用加载验收，而且已经确认走不通。** 注入适配器在无头 Chromium 上、
用逐字复刻的真实门禁代码做过端到端验证（未注入 → `en-US`，注入 → `zh-Hans`，还原 → 回原值），
但在真正的 Claude Desktop 里，应用会拒绝带调试开关启动——通道本身就不存在，见下面「路线」。所以：

- 界面上的中文目前还是 0 个字符串；
- `counts.translated` 恒为 0 的候选（骨架、探针）**不是汉化成果**，只是结构占位与链路诊断。

## Claude Desktop 的四层文本

| 层 | 位置 | 情况 |
| --- | --- | --- |
| A | `app/locales/*.pak` | Chromium 自带，`zh-CN.pak` 已随包发布 |
| B | `app/resources/{locale}.json` | 43 个语言，`zh-Hans.json` 已在（613/801 键） |
| C | `app/resources/ion-dist/i18n/*.json` | 前端 SPA，34,213 键，**无中文**，被三重门禁锁死 |
| D | `%APPDATA%\Claude\config.json` 的 `locale` | 应用级语言开关 |

层 C 是主战场。它的 locale 解析链是「`localStorage['spa:locale']` → `i18n-catalogs`
元数据 → 11 语言白名单」，白名单里没有中文。`ion-dist` 的 11 份资源键集完全一致
（各 34,213 键，0 缺 0 余），所以补一份 `zh-Hans.json` 在结构上是安全的。

## 路线

层 C 计划走 **C1 运行时注入 → C2 资源落盘**，但这三条路目前**全被设计挡住**，不是难度问题：

- **C2 资源落盘**：`C:\Program Files\WindowsApps\...` 的 ACL 只给 `TrustedInstaller`
  和 `SYSTEM` 写权限，`Administrators` 也只有 `RX`，提权同样写不进。
- **隔离 profile 起第二实例**：签名构建忽略自定义数据目录（asar 内明写
  `signed builds ignore it`），单一实例锁仍按默认 userData 走。
- **C1 挂调试端口**：`--remote-debugging-port` 在 asar 的 16 项命令行黑名单里，进程
  1 秒内 `exit(1)` 并打印 `refusing to start — a debugging or network-override switch is
  present on the command line`。逃生门要一个签不出来的 `CLAUDE_CDP_AUTH` 令牌
  （时间戳 + base64(userData 路径) + 校验段）。

**所以层 C 目前没有合规落地路径，需要先做路线决策。** 注入适配器（`inject-claude.mjs` /
`cdp-session.mjs`）代码正确、测试充分，通道一旦打开可直接复用，但**不能当既成路径排期**。

层 B 不受影响（零写入、已生效）；层 A、层 D 与这三道门无关，尚未实测。

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
