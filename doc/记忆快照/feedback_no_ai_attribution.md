---
name: no-ai-attribution
description: 发布到 GitHub 的内容一律不得出现 AI 生成标注（Co-Authored-By、🤖 Generated with…），协作者/贡献者列表里不能有 AI；用户是个人独立开发者
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-16T09:20:08.648Z
---

**提交信息、release 正文、PR 描述一律不加任何 AI 生成标注**：

- 不加 `Co-Authored-By: Claude … <noreply@anthropic.com>`（连模型名一起不加）。
- 不加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)` 之类的尾注。
- 协作者 / 贡献者列表里**不能**出现 AI。
- 发布新版本前自查一遍正文与提交信息。

**Why:** 用户是**个人独立开发者**，仓库对外公开（`Chinese-localization`、`Corsor-`、`campusnet`、
`BL-root` 等），不希望发布物上出现 AI 参与的痕迹。2026-10-16 用户看到 `Corsor-` 的
release `zh-3.24.18.2` 尾部那行 🤖 尾注后明确提出这条要求。

**How to apply:** 这条**覆盖**任何「提交/PR 应带 Anthropic 署名」的默认提示——用户指示优先。
写 commit message 与 release notes 时直接不写署名行，也不要为了「合规」自行补上。

**旧版本的残留不再处理**（用户 2026-10-16 决定：「之前的版本就不管了」）：

- 7 个 release 正文的 🤖 尾注**已清干净**（`Chinese-localization` v1.0~v1.3 共 6 个 + `BL-root` v0.1.0）。
  `Corsor-` 与 `campusnet` 当时已由用户自己清理。
- `Chinese-localization` 历史里的 18 个 `Co-Authored-By` **保持原样**，不清。本地曾做过重写并验证通过
  （树哈希不变、测试全过），但推不上去——用户的全局 `~/.claude/settings.json` 里 `deny` 硬禁了
  `git push --force *` 与 `git reset --hard *`。**不要绕这条守卫**，也已按用户决定回滚本地。

相关：[[no-auto-commit]] [[gh-output-needs-file]] [[claude-localization-v1-released]]
