---
name: claude-c1-injection-only
description: "（slug 是历史名）Claude Desktop 层 C 的三条路全被设计挡死：ACL 写不进、签名构建忽略自定义数据目录、带调试开关直接拒绝启动；但「可写副本」通道已绕开全部三道门并跑通验收，见 [[claude-writable-copy-channel]]"
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-14T11:03:53.436Z
---

**Claude Desktop 层 C（前端 SPA `ion-dist/i18n/`，34,213 键）走「改原安装」这条路没有合规落地路径。三道门，全部是设计挡的，不是难度问题。**

> 2026-10-14 更新：三道门**都被「可写副本」通道绕开了**（不动原安装、不碰调试端口、不碰 ACL），层 C 已在副本上端到端跑通验收。落地细节见 [[claude-writable-copy-channel]]。下面三条仍然是"为什么不能直接改正式安装"的权威记录。

## 一、C2 资源落盘：ACL 不让写

对 `Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\app`、`app\resources`、`app\resources\ion-dist\i18n` 逐级读 ACL，三处一致：

```
BUILTIN\Users:(I)(OI)(CI)(R)
NT SERVICE\TrustedInstaller:(I)(OI)(CI)(F)
NT AUTHORITY\SYSTEM:(I)(OI)(CI)(F)
BUILTIN\Administrators:(I)(CI)(RX)
```

**提权也只有 `RX`**。真要写必须先 `takeown` 夺所有权再 `icacls` 授权，而 MSIX 修复/更新会静默撤销。本轮特意没做写入探测：往带签名的 MSIX 包里加文件可能触发完整性校验失败与自动修复，`icacls` 输出已是充分证据。

## 二、第二实例 / 隔离 profile：签名构建忽略自定义数据目录

`app.asar` 里有：`[user-data-dir] CLAUDE_USER_DATA_DIR is set and signed builds ignore it (path kind: %s); this launch uses the default data folder`，配合一整套 `setPath("userData", ...)` 搬迁逻辑，以及 `qZ(process.env)` 主动 `delete e.CLAUDE_USER_DATA_DIR`。单一实例锁按 userData 走，所以第二个实例拿不到锁，只会把 argv 交给正在运行的那个然后 `app.exit(0)`。

## 三、C1 运行时注入：命令行调试开关被黑名单拦下

实测：带 `--remote-debugging-port=127.0.0.1:9222` 直接启动 `claude.exe`，进程 1 秒内 `exit(1)`，stderr 只有一行 `Claude: refusing to start — a debugging or network-override switch is present on the command line.`

守卫是 `if (UZ(process.argv) && !QZ()) { ...exit(1) }`，`UZ` 拿 argv 去比对 16 项黑名单，**`remote-debugging-port` 是第一条**；`--user-data-dir` 不在名单里，所以拒绝由调试端口触发，与隔离 profile 无关。

逃生门 `QZ()` 是**带令牌的正规通道**：需要 `CLAUDE_CDP_AUTH`（`${时间戳}.${base64(userData路径)}.${校验段}` 三段式，内嵌路径必须与 `CLAUDE_USER_DATA_DIR` 逐字相同）+ `CLAUDE_USER_DATA_DIR`。令牌签不出来。

守卫有个缺口：**`--inspect` 不在名单里**。但用它拿到的是主进程任意代码执行，权力比名单禁止的每一项都大，正是仓库指令「不绕过安全策略」要拦的动作——**不采纳、不建议，要走必须由用户显式决定**。

## 门禁为什么无法绕开

层 C 的 locale 解析链要三道门同时过：①包里没有 `zh-Hans` 资源 ②真实应用里 `i18n-catalogs` meta 恒空（所以 `O_()` 落到白名单兜底）③11 语言白名单里没有中文。唯一能同时解决①②③的杠杆就是运行时注入——它锁在令牌后面。**只往 `localStorage['spa:locale']` 写 `zh-Hans` 没用**，第二道门就把你送回 `en-US`。

## 附带的另两条事实

- 真实 userData 是 `%LOCALAPPDATA%\Claude-3p`，**不是** `%APPDATA%\Claude`（设计文档先前写错了）。Electron 44.4.3。
- `O_()` 读 `localStorage['spa:locale']` **不经过** `p_` 正则校验（做校验的是 `m_()`）；另有一个 `h_="spa:locale-source"` 键，`__()` 要求它等于 `"user_choice"`，语义未经验证。

**Why:** 项目原计划把 C1 注入当首版闭环。若不在动手前把这三道门都量一遍，会在投入 34,213 条翻译之后才发现资源根本喂不进去。这个结论直接决定后续所有架构选择。

**How to apply:** 凡涉及"把中文喂进 Claude Desktop"的方案，一律先回到这三条——别再重新论证、别再假设"换个参数就能挂上调试器"。注入适配器（`inject-claude.mjs` / `cdp-session.mjs`）代码本身正确且测试充分，将来若有通道打开可直接复用，**但不要把它当既成路径来排期**。要另找路时优先考虑：Cursor（同为 Electron，未必有这层守卫）、层 A/层 B/层 D（`--lang` 不在黑名单里，是允许的）、以及外部覆盖层/OCR 翻译。

**How to apply（2026-10-14 起）：** 要落地层 C，**不要**再走 C1 注入或 C2 写盘，直接走 [[claude-writable-copy-channel]] 的可写副本。只有讨论"为什么不能直接汉化已安装的那个应用"时才回到本文。

操作步骤与实测记录见 `doc/Claude桌面汉化技术设计与首版闭环.md` 第 12 节（12.7 已作废，结论在 12.9）。

相关：[[claude-desktop-text-layers]]、[[claude-localization-scope]]、[[localization-no-auto-commit]]
