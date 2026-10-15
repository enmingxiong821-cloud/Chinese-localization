---
name: claude-localization-scope
description: "桌面汉化项目的四项已定决策（首选 Claude 路线、纯自用、资源复用不接引擎、Electron+React+TS+C# 栈）及其理由；其中「纯自用」已于 2026-10-15 升级为公开仓库。"
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-15T13:18:46.130Z
---

2026-10-14 用户就桌面汉化项目的四个方向性问题做出选择：

1. **首个可验收闭环 = Claude 桌面汉化**（不是 Cursor 语言包 VSIX）。用户是在我明确提示"Claude 是四选一里风险最高的一条"之后选的，属于知情的主动选择，不要反复劝退。
2. **分发定位 = 先纯自用**。暂不处理 GPL / EULA / Native Messaging 注册 / 译文分发授权；等闭环跑通再升级定位。
   **（2026-10-15 更新：闭环已跑通，仓库已改为 public，使用者从 release 下附件安装。原第 2 条其余部分仍有效——
   仓库只分发 `{哈希键: 中文}` 译文表与工具链，不含 Anthropic 的英文原文；GPL / EULA 的合规问题照旧未处理。）**
3. **译文来源 = 资源复用 + 术语库，暂不接翻译引擎**。优先用目标应用自带或官方译文，缺失部分用词典补。
4. **技术栈 = Electron + React + TypeScript，Windows 原生能力走 C# 辅助进程**（命名管道通信）。

**Why:** 用户目标是先把一款应用的真实加载闭环跑通、能截图能恢复，而不是继续在上游堆候选资源。此前项目已积累 10 个候选目录、6 个审核目录却从未走过一次真实加载验证。

**How to apply:** 后续所有设计和工作排序以此为准。看到"要不要顺便做 Cursor / 屏幕翻译 / 插件"的诱惑时，按第 1 条顶回去；看到"接个翻译 API"的想法时，按第 3 条顶回去。技术选型讨论直接假设 Electron+TS+C#，不再重新论证。

相关：[[claude-desktop-text-layers]]
