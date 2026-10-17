---
name: claude-localization-v1-released
description: 汉化已交付并装机：接手先读工作区 doc/进度与交接.md；最新发布 v1.7（文档维护版，安装行为同 v1.5；此前 v1.6 补社区文件与仓库设置，v1.5 修测试临时目录泄漏、工具链入库，v1.4 补译 630 条跟上官方 2.42304.0.0）；附件名只能用 ASCII 且 #标签不改进下载名；发布线 v1.2 修品牌名误译、v1.2.1 修快捷方式路径乱码、v1.3 改交付形态；本机副本在 %LOCALAPPDATA%\Claude-zh，已于 2026-10-16 刷新到 2.42304.0.0；官方 config.json 残留一个无害的 locale 键未清理
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-17T15:58:01.907Z
---

2026-10-14：层 C 汉化**首版已交付并装机**，用户授权「全权给你，以及发布新版本」，提交已推送到
`origin/main`（仓库 `enmingxiong821-cloud/Chinese-localization`）。

## 接手入口

**下次继续开发，先读工作区里的 `doc/进度与交接.md`**——现状、关键数字、已定决策、怎么验证、已知坑、
下一步、从零复现都在那，且随代码同版本演进。本记忆只留不适合放进仓库的部分。

## 交付物

`installer/` 一键安装器，双击 `安装.cmd` 即可（无 Node 时 .cmd 会提示装 LTS）。
`install` / `verify` / `restore` 三个动词。做法见 [[claude-writable-copy-channel]]。

## 发布线（截至 2026-10-16）

`v1.0` → `v1.0.1`（修译文与安装器还原/失败路径）→ `v1.1`（仓库整理版，补丁内容与 v1.0.1 完全一致）
→ `v1.2`（**补丁由三处增至四处**：剔除 23 条品牌/模型名误译，补上 `i18n/dynamic/zh-Hans.json`）
→ `v1.2.1`（修快捷方式路径在状态文件里被写成乱码的缺陷）
→ `v1.3`（**只改交付形态**：README 前置下载安装四步，发布附件带 `git archive` 生成的压缩包）
→ `v1.4`（**跟上官方的版本漂移**：官方从 2.37337.1.0 升到 2.42304.0.0，补译新增界面文案 630 条，
译文表 35,123 → 35,753 条、覆盖率回到 99.53%；并对新版复验安装门禁与全表结构校验）
→ `v1.5`（**维护版，译文与补丁一字未改**，装过 v1.4 的不必重装：修掉测试夹具往系统临时目录持续
堆积目录的泄漏，改由 `project/backend/tmp-fixtures.mjs` 统一登记、测试跑完由 `after` 钩子删净；
补译工具链「导出缺口 → 校验 → 合并 → 审计」收进 `project/tools/`，**不随发布 zip 分发**）
→ `v1.6`（**仓库维护版，安装行为与 v1.5 完全相同**：补 `SECURITY.md`、`CONTRIBUTING.md`、行为准则与
issue/PR 模板，`main` 加分支保护、合并收敛为 squash、开 secret scanning，新增 windows-latest 的
`node --test` 工作流。附件内容与 v1.5 一致，只有打包元数据不同）
→ `v1.7`（**文档维护版，安装行为不变**：修正交接文档里「分支保护没开」的过期记述，README 补上
发布附件必须先复制成 ASCII 文件名再上传。附件里只有 `README.md` 与 v1.6 不同）。

v1.2 起补丁点由三处变四处，**升级必须重跑安装器**；v1.2.1 只影响建快捷方式那一刻，译文与补丁不受影响，
但已有安装的状态文件若已写坏，需删掉 `%LOCALAPPDATA%\Claude-zh\.install-state.json` 再跑一次。
v1.3 不改译文与补丁。**GitHub 发布附件的文件名只能用 ASCII**（中文会被丢掉），用
`Chinese-localization-vX.Y.Z.zip`；`gh release create 文件#标签` 只改显示名、**不改进下载名**，
必须先把压缩包复制成 ASCII 文件名再上传。

## 本机当前状态（2026-10-17）

- **v1.7 已发布**：`main` 推到 `824ab4b`，注释 tag `v1.7` 已推送，GitHub release 已建（Latest），
  附件 `Chinese-localization-v1.7.zip`（1,150,837 字节）。附件、tag 的 `git archive` 输出、本地
  `备份/安装器-v1.7.zip` **三者 SHA-256 同为 `8989cdbb…`**，可由 tag 复现；v1.5／v1.6 的本地包保留。
  发布正文与提交都不含 AI 署名（作者只有 `enmingxiong821-cloud`）。
- 2026-10-17 仓库设置完善（**随后以 v1.6 发布**）：`main` 加 ruleset（禁强推/禁删除）、合并只留 squash、
  关 Projects 与 Discussions、开 secret scanning + push protection、补 `SECURITY.md`、
  issue/PR 模板与 `CONTRIBUTING.md`、行为准则、加 windows-latest 的 `node --test` 工作流
  （两次运行均通过）。社区健康度 42% → 71% → 100%。
- 中文版副本已安装在 `%LOCALAPPDATA%\Claude-zh\`（约 756 MB）。`verify` 通过。
- **译文表已按官方 `2.42304.0.0`（35,441 键）补齐**：主词典覆盖 35,274 / 35,441 = **99.53%**，
  动态词典 49 / 49 = **100%**。
- **本机副本已于 2026-10-16 重跑 `installer\安装.cmd` 刷新到 `2.42304.0.0`**，`verify` 通过，
  与上表同版本同数字。副本是官方包的整份复制、**不会自动更新**，官方每次升级后都要重跑一次安装器
  （`profile\` 里的登录态不受影响）。
- 副本可与官方版同时运行（独立 userData + 独立单实例锁）。
- 安装器幂等：源指纹与译文表哈希都没变时零改动退出。
- 2026-10-15 已把工作区收成自洽：交付面收敛（旧工具链进 `project/backend/archive/`、早期文档进
  `doc/archive/`），工作区外的资料也收了进来——`.claude` 记忆快照进 `doc/记忆快照/`，会话记录与离线
  安装包进 `备份/`（**不进 git**）。已装副本**故意没归档**，安装器重跑即得。
  2026-10-16 把顶层的 `prototype/` 也移进 `doc/archive/prototype/`。
- 2026-10-15 用户确认：**已登录主界面的中文正常**（层 C 与动态词典在真实界面生效）。
- v1.4 补的那 630 条：结构校验全过，并逐条核对确认已落进刷新后副本的 `zh-Hans.json`
  （635 条采纳项 0 缺、0 值不一致），副本内 `en-US` 35,441 键 0 缺、0 空值。
- 2026-10-16 已把顶层的 `prototype/` 移进 `doc/archive/prototype/`。

## 一处需要知道但未清理的残留

`%APPDATA%\Claude\config.json`（官方版的真实配置，含 `oauth:tokenCache`）里有一行
`"locale": "zh-Hans"`，是更早的沙箱实验留下的（mtime 2026-10-14T14:12:46Z）。

**它现在对官方版是空操作**：系统 UI 文化是 zh-CN，层 A/B 本来就出中文，加不加这行界面完全一致。

当时**故意没去动它**：官方版正在运行且持有凭据，改一个运行中进程的配置文件既不保险、也可能被它写回。
要清掉的话，在官方版设置里切一次语言，或直接删掉那一行。

**Why:** 让下次接手时不会误以为「官方数据从未被碰过」，也不会因为这个残留而误判回归。

**How to apply:** 若将来怀疑官方版行为异常，先排除这一行。清理属写操作，需先取得授权（见 [[no-auto-commit]]）。

## 一处洗不掉的痕迹：历史提交带 AI 尾注

截至 v1.4（`31707ff`），**21 个提交里有 18 个带 `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>`**，
从 `812fd5e`（2026-10-14，项目初始内容）一直到 `e6e23a0`（2026-10-15）。那是
[[no-ai-attribution]] 这条规则**立起来之前**留下的，仓库公开后这些署名现在 GitHub 上可见。
v1.4 之后的新提交是干净的。

**Why:** 防止下次接手时以为「从来没加过 AI 署名」而白查一遍；也解释为什么那条规则写得那么硬。

**How to apply:** 不要再往提交里加任何 AI 署名。**清理需要改写 18 个提交 + 强制推送**，
而全局 settings 硬禁 `git push --force`，公开仓库强推还会跟已克隆的人冲突；
2026-10-17 起 `main` 上另有 ruleset「main 保护」（禁删除、禁强推，管理员也不可绕过），
要清历史得先删 ruleset、强推后再重建——**不要主动提议，用户问了才评估**
（2026-10-16 问过一次，用户没让做）。

相关：[[claude-writable-copy-channel]]、[[claude-c1-injection-only]]、[[localization-translation-source]]
