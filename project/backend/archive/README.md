# 归档：早期工具链

这里的代码**不参与交付**。交付路径只有 `installer/`，它递归 import 到的后端模块才是在用的。

## 边界怎么划的

从 `installer/` 出发递归解析 import，得到的就是活代码。其余全部归档：

| 状态 | 文件 |
| --- | --- |
| 活代码（留在 `project/backend/`） | `safe-io.mjs`、`install-identity.mjs`、`scanner.mjs` 及各自测试 |
| 归档 | 本目录下其余全部 `.mjs`、`fixtures/`、`third-party/` |

活代码目录里只有这 5 个文件，归档代码的跨边界 import 已改成 `../` 指回活代码，`project/backend/archive` 不被任何活代码引用。

## 归档里有什么

- **Cursor 链路**：`cursor-pack.mjs`、`build-cursor-pack.mjs`、`claude-candidate.mjs`、`build-claude-candidate.mjs`、`translation-quality.mjs` —— 早期按模块映射生成 VSIX 候选的方向，已放弃。
- **CDP 运行时注入**：`inject-claude.mjs`、`cdp-session.mjs`、`inject-cli.mjs` —— `--remote-debugging-port` 在 asar 命令行黑名单里，进程 1 秒内退出，这条通道打不开，不是落地路径。
- **候选与审核链路**：`candidate-*`、`review-*`、`validate-review-cli.mjs`、`merge-review-cli.mjs` —— 为多人协作审核设计，实际是单人自译，未走这条流程。
- **备份事务**：`backup-transaction.mjs`、`backup-cli.mjs` —— 它的暂存→复验→rename 范式已被 `installer/install-apply.mjs` 吸收。
- **只读枚举与报告**：`locale-analysis.mjs`、`resource-enum.mjs`、`locale-enum-cli.mjs`、`scan-cli.mjs`、`analyze-locale-cli.mjs`、`identity-cli.mjs` —— 缺口测量的历史工具，测量已完成，结论记在 `installer/translations/SOURCES.md`。
- **`fixtures/i18n-gate.html`**：早期门禁实验页面。
- **`third-party/vscode-loc-MIT.txt`**：只属于已归档的 Cursor 链路，**不是**已交付译文表的许可（译文来源见 `installer/translations/SOURCES.md`）。

## 维护口径

代码冻结保留、不再改动，作为历史记录与将来复用参考。它们的测试仍在 `node --test` 里跑并全部通过，作用是让归档代码别悄悄烂掉；测试失败不阻断交付，但要说明原因。

例外是 `inject-claude.test.mjs` 里两个 CDP 端到端用例：它们会真开一个 headless 浏览器，默认跳过（`CDP_E2E=1` 才跑，且需配 `--test-force-exit`，原因见 `doc/进度与交接.md` 的已知坑）。
