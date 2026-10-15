---
name: localization-no-auto-commit
description: "本仓库有长期有效的\"不自动提交/推送\"指令（记在非显眼的 .github/instructions 里）；即便用户说\"你来定\"也不等于授权提交"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-14T08:33:48.780Z
---

**在本项目里，提交、推送、改全局配置、关闭更新、绕过安全策略一律要先问，不能顺手做。**

原文见 `.github/instructions/memory.instruction.md` 第 61 行：「不自动提交、推送、关闭更新、改变全局配置、绕过安全策略或启动收费服务。」同文件第 59 行另有一条：**修改实际 Cursor/Claude 安装资源前，必须先显示具体范围、风险和恢复方式并确认授权。**

**Why:** 这份指令藏在 Copilot 的 `instructions` 目录里，不是 CLAUDE.md，会话启动时不会自动加载，很容易漏掉；而它约束的正是"看起来无害的收尾动作"。用户全局 CLAUDE.md 的「写操作要授权」与之一致。唯一的例外是用户被**具体追问**某一动作时——上一轮的提交推送就是这样取得授权的（用户明确选了「修好 .gitignore 再提交推送」）。

**How to apply:** 用户说「你来定，根据项目来」这类宽泛授权，指的是**做什么**，不是**可以提交**。做完一轮改动后停在 `git diff` 这一步，把改动点、验证结果列出来，把提交/推送单独作为一问提出来。同理，涉及真实安装目录的任何写入，先摆范围、风险、恢复方式再动手。

相关：[[claude-c1-injection-only]]、[[claude-localization-scope]]
