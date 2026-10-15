---
name: claude-localization-v1-released
description: 汉化已交付并装机：接手先读工作区 doc/进度与交接.md；最新发布 v1.1（整理版，补丁内容未变）；本机副本在 %LOCALAPPDATA%\Claude-zh；官方 config.json 残留一个无害的 locale 键未清理
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-15T07:21:41.329Z
---

2026-10-14：层 C 汉化**首版已交付并装机**，用户授权「全权给你，以及发布新版本」，提交已推送到
`origin/main`（仓库 `enmingxiong821-cloud/Chinese-localization`）。

## 接手入口

**下次继续开发，先读工作区里的 `doc/进度与交接.md`**——现状、关键数字、已定决策、怎么验证、已知坑、
下一步、从零复现都在那，且随代码同版本演进。本记忆只留不适合放进仓库的部分。

## 交付物

`installer/` 一键安装器，双击 `安装.cmd` 即可（无 Node 时 .cmd 会提示装 LTS）。
`install` / `verify` / `restore` 三个动词。做法见 [[claude-writable-copy-channel]]。

## 发布线（截至 2026-10-15）

`v1.0` → `v1.0.1`（修译文与安装器还原/失败路径）→ `v1.1`（仓库整理版，**补丁内容与 v1.0.1 完全一致**，
不改用户可见行为；从旧版升级无需重跑安装器）。

## 本机当前状态（2026-10-15）

- 中文版副本已安装在 `%LOCALAPPDATA%\Claude-zh\`（约 700 MB）。`verify` 通过。
- 基准官方版本 `2.37337.1.0`；译文覆盖 34,725 / 34,954 = 99.34%。
- 副本可与官方版同时运行（独立 userData + 独立单实例锁）。
- 安装器幂等：源指纹与译文表哈希都没变时零改动退出。
- 2026-10-15 已把工作区收成自洽：交付面收敛（旧工具链进 `project/backend/archive/`、早期文档进
  `doc/archive/`），工作区外的资料也收了进来——`.claude` 记忆快照进 `doc/记忆快照/`，会话记录与离线
  安装包进 `备份/`（**不进 git**）。756 MB 的已装副本**故意没归档**，安装器重跑即得。

## 一处需要知道但未清理的残留

`%APPDATA%\Claude\config.json`（官方版的真实配置，含 `oauth:tokenCache`）里有一行
`"locale": "zh-Hans"`，是更早的沙箱实验留下的（mtime 2026-10-14T14:12:46Z）。

**它现在对官方版是空操作**：系统 UI 文化是 zh-CN，层 A/B 本来就出中文，加不加这行界面完全一致。

当时**故意没去动它**：官方版正在运行且持有凭据，改一个运行中进程的配置文件既不保险、也可能被它写回。
要清掉的话，在官方版设置里切一次语言，或直接删掉那一行。

**Why:** 让下次接手时不会误以为「官方数据从未被碰过」，也不会因为这个残留而误判回归。

**How to apply:** 若将来怀疑官方版行为异常，先排除这一行。清理属写操作，需先取得授权（见 [[no-auto-commit]]）。

相关：[[claude-writable-copy-channel]]、[[claude-c1-injection-only]]、[[localization-translation-source]]
