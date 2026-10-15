---
name: claude-writable-copy-channel
description: Claude Desktop 可写副本通道（已交付版）：robocopy 整包 + LOCALAPPDATA 重定向 + --user-data-dir 必须成对使用，否则副本与官方版抢单实例锁而退出；免 3p
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-14T14:48:16.894Z
---

2026-10-14 实测并交付：层 C（前端 SPA）汉化的落地路径是**可写副本**，已做成一键安装器并装机验收。
这是层 C 唯一合规路径（另三条门见 [[claude-c1-injection-only]]）。

## 完整做法（三步，缺一不可）

1. **robocopy 整包**到可写目录（排除 `microsoft.system.package.metadata`，它是个**目录**，robocopy 要用 `/XD`）。
   686 MB / 3985 文件约 23 秒。官方包根 `C:\Program Files\WindowsApps\Claude_<ver>_x64__<publisher>\`
   **无需提权即可读**，但不可写。
2. **重定向 `LOCALAPPDATA`** 指向副本专属目录（日志、缓存跟着走）。
3. **必须再加 `--user-data-dir=<副本内路径>`**。这是 2026-10-14 更正的关键点。

## 更正：只重定向 LOCALAPPDATA 是**不够**的

本文件早前写「只重定向 LOCALAPPDATA 即可让副本有独立 userData 与独立单实例锁」——**错的**，实测推翻：

- Windows 上 Electron 的 userData 默认是 `%APPDATA%\Claude`（Roaming），**不受 `LOCALAPPDATA` 影响**。
  重定向 `LOCALAPPDATA` 只搬走了日志与缓存。
- 后果：副本与官方版**共用同一个单实例锁**，官方版在跑时副本打印
  `Not main instance, returning early from app ready` 然后自己退出——启动器点了没反应。
- 修法就是加 Electron 标准参数 **`--user-data-dir=<副本内路径>`**（有效，已装机验证）。
- 应用自带的 `CLAUDE_USER_DATA_DIR` **无效**：asar 里明写 `signed builds ignore it`，别再用它。

## 由此得到的交付形态（2026-10-14 用户拍板）

副本与官方版**之间没有共享文件**：userData、缓存、配置、日志全落在副本目录内，
`%APPDATA%\Claude` 与官方安装目录全程只读。代价是**副本是全新环境，首次启动需在副本内登录一次**
（登录态此后独立保存）。换来的好处：单实例锁分开、**可与官方版同时运行**，且不需要复制或导出任何凭据。

- 语言设置写在副本自己的 `<副本>\profile\Claude\config.json` 里。应用启动时会**合并**进我方预写的
  `{"locale":"zh-Hans"}`，不会覆盖掉它（实测）。
- `APPDATA` 重定向无效（应用走 Win32 known-folder 解析 Roaming，不读环境变量）—— 这条仍然成立。
- 真正钉住 SPA 界面语言的是 HTML 里注入的 `localStorage.setItem("spa:locale","zh-Hans")`。
- `main.log` 打印 `[updater] App is not installed, not enabling auto-updates`，包内也无 `app-update.yml`
  → 副本**不会自动更新**覆盖补丁。

**不需要 3p。** 早前以为必须用 `configLibrary` 激活 3p 才能加载副本的 ion-dist，实测推翻：
`appliedId` 置 null 后副本以正常 1p 模式跑起来，界面全中文、左下角是真实账号。免 3p 的好处是
没有伪造推理链路这一最可疑的信号。

## 补丁面（很小，三个点）

1. 新增 `app/resources/ion-dist/i18n/zh-Hans.json`：以官方 `en-US.json` 为底座 + 33,897 条 `{哈希:中文}` 覆盖表。
2. `app/resources/ion-dist/assets/v1/shared-50-*.js`：两处 `["en-US",…,"id-ID"]` 白名单**各追加 `"zh-Hans"`**
   （恰好 2 处，共 +20 字节）。SPA 用 `E_()` 读 `meta[name="i18n-catalogs"]`，正则
   `/^([\w-]+):([\w-]+)\.([\w-]+)\.([\w-]+)$/` 解析 `locale:a.b.c`；`spa:locale` 由 `m_()` 读 localStorage。
3. 4 个 html（`index.html`/`frame-shell.html`/`frame-connect.html`/`frame-manage.html`）各插入 159 字节：
   `<meta name="i18n-catalogs" data-i18n-catalogs="zh-Hans:0d22dfc5.5c7b1caa.17de78f4">` +
   `<script>try{localStorage.setItem("spa:locale","zh-Hans")}catch(e){}</script>`。
   注意 `0d22dfc5.5c7b1caa.17de78f4` **在官方包里 grep 不到**，是我方自造但仍被接受的常量。

层 A（官方自带 `zh-CN.pak`/`zh-TW.pak`）与层 B（官方自带 `zh-Hans.json`）**无需处理**。

## 3p 机制（已不用于落地路径，留作背景）

`inference` 只从 `%LOCALAPPDATA%\Claude-3p\configLibrary\<appliedId>.json` 构建；`deploymentMode`
只能否决不能激活；配置目录名 `Claude-3p` 是硬编码常量。用户机器上有 **CC Switch** 本地网关，
`configLibrary` 条目含 `inferenceGatewayApiKey`（**是凭据**）——**复制凭据进沙箱前必须先问用户**。

**Why:** 原安装一个字节不用动，就能拿到一个可改、可跑、可截图、可验收的真实应用实例。
代价从「共享 config.json」换成了「副本内首次登录一次」，用户 2026-10-14 明确选了后者。

**How to apply:** 讨论层 C 落地时先想到这里。改动沙箱外文件需先取得授权，
并做到"原样备份 → 改 → 验证 → 立即逐字节还原"。

相关：[[claude-localization-v1-released]]、[[claude-c1-injection-only]]、[[claude-desktop-text-layers]]、
[[no-auto-commit]]、[[no-speculative-docs]]
