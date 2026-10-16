---
name: claude-localization-scope
description: "桌面汉化项目的五项已定决策（首选 Claude 路线、纯自用、资源复用不接引擎、Electron+React+TS+C# 栈、只做 Windows 版）及其理由；其中「纯自用」已于 2026-10-15 升级为公开仓库。"
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-16T10:31:40.435Z
---

2026-10-14 用户就桌面汉化项目的四个方向性问题做出选择：

1. **首个可验收闭环 = Claude 桌面汉化**（不是 Cursor 语言包 VSIX）。用户是在我明确提示"Claude 是四选一里风险最高的一条"之后选的，属于知情的主动选择，不要反复劝退。
2. **分发定位 = 先纯自用**。暂不处理 GPL / EULA / Native Messaging 注册 / 译文分发授权；等闭环跑通再升级定位。
   **（2026-10-15 更新：闭环已跑通，仓库已改为 public，使用者从 release 下附件安装。原第 2 条其余部分仍有效——
   仓库只分发 `{哈希键: 中文}` 译文表与工具链，不含 Anthropic 的英文原文；GPL / EULA 的合规问题照旧未处理。）**
3. **译文来源 = 资源复用 + 术语库，暂不接翻译引擎**。优先用目标应用自带或官方译文，缺失部分用词典补。
4. **技术栈 = Electron + React + TypeScript，Windows 原生能力走 C# 辅助进程**（命名管道通信）。
5. **平台 = 只做 Windows 版**（2026-10-16 定）。macOS 与 Linux 版**不在范围内**，不再讨论移植。

**Why:** 2026-10-16 我把「译文对 Mac 版是否通用」摆到台面上问，用户直接回「那就只专注 windows 现在，其他不管」。
移植的实际代价也支持这个决定：交付物里**译文表**（`{哈希键: 中文}`，三平台共用一套 SPA 词典）内容确实基本通用，
但**安装器**是纯 Windows 的（MSIX 定位 `WindowsApps`、robocopy、`.cmd` 启动器、PowerShell 快捷方式、Windows ACL 门禁），
等于要重做一个；而 Mac 上改 `.app` 内资源还会破坏代码签名，多出一整类 Windows 没有的风险。

**How to apply:** 再被问「支持 Mac / Linux 吗」，按本条直接答「只做 Windows」，**不要主动提议移植方案或评估工作量**。
看到「顺手把译文表也发一份给 Mac 用户」这类想法同样顶回去。

**Why:** 用户目标是先把一款应用的真实加载闭环跑通、能截图能恢复，而不是继续在上游堆候选资源。此前项目已积累 10 个候选目录、6 个审核目录却从未走过一次真实加载验证。

**How to apply:** 后续所有设计和工作排序以此为准。看到"要不要顺便做 Cursor / 屏幕翻译 / 插件"的诱惑时，按第 1 条顶回去；看到"接个翻译 API"的想法时，按第 3 条顶回去。技术选型讨论直接假设 Electron+TS+C#，不再重新论证。

相关：[[claude-desktop-text-layers]]
