---
name: claude-desktop-text-layers
description: Claude Desktop 界面文本分四个独立层（Chromium内核/桌面intl/前端SPA/用户配置），各自的中文现状与激活方式完全不同
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-14T09:02:30.151Z
---

对 `Claude_2.31226.1.0_x64__pzs8sxrjxfjjc` 只读反查的结论：Claude Desktop 的界面文本分四层，**不是一个整体**。

| 层 | 资源 | 中文现状 | 激活方式 |
| --- | --- | --- | --- |
| A. Chromium 内核 | `app/locales/*.pak` | `zh-CN.pak` 已随包发布 | Electron `--lang=zh-CN` |
| B. 桌面外壳 intl | `resources/{locale}.json` | `zh-Hans.json` 已随包发布，613/801 键 | **已经生效**——`config.json.locale` 即启动语言 |
| C. 前端 SPA | `resources/ion-dist/i18n/*.json` | **完全没有 zh-Hans**（34,213 键） | 被三重硬编码门禁锁死 |
| D. 用户配置 | `%APPDATA%\Claude\config.json` 的 `locale` | **已经是 `zh-Hans`** | 已设置 |

**四个反直觉的点（都推翻了项目早期文档的假设）：**

1. **中文资源早就在包里**。层 A、B 不需要自己汉化，只差激活。层 C 才是真正的工作量。
2. **语言白名单 `lut`（11 种，无中文）只拦开机自动检测**（函数 `dut`）。启动逻辑 `_ut()` 是 `hut( config.locale !== undefined && put().includes(locale) ? locale : dut() )`——持久化配置优先，白名单只是兜底。所以层 B **零改造、零写入**。
3. **层 B 此刻已在渲染中文**，因为 `config.json.locale === "zh-Hans"` 且 `resources/zh-Hans.json` 存在。验证位置是托盘菜单/菜单栏/原生对话框（主进程 UI），**不是应用主窗口**——主窗口属层 C，永远是英文。这是此前误判"中文没生效"的根因。
4. **前端门禁读的 `meta[name="i18n-catalogs"]` 从未被注入过**（asar 0 命中、所有 HTML 0 命中），`E_()` 恒返回空。`O_()` 的分支顺序是「先查 catalog 再回落白名单」，所以注入这个 meta 本可以绕过白名单——**但"能注入"这个前提已被实测推翻，见 [[claude-c1-injection-only]]。**

**Claude Desktop 设置里没有语言选项**（用户确认）→ 层 B 无 UI 开关，回退只能改 `config.json`。

用户已定：层 C 走 **C1 运行时注入起步 → C2 改前端资源固化**；前端 34,213 键走**高频页面分批**，不追全量。
**其中 C2 这一半已被实测推翻——见 [[claude-c1-injection-only]]。**

详细代码证据、偏移量、方案选型见 `doc/Claude桌面汉化技术设计与首版闭环.md`。

**Why:** 项目原假设是"Claude 完全没有中文、必须改 asar"，导致把最大风险排在第一位。实际层 A/B 零写入可激活，层 C 是唯一需要动安装文件的。

**How to apply:** 讨论 Claude 汉化时先问"说的是哪一层"。不要把层 B 的 613 键当成整体进度。前端候选现有 64 条 / 34,213 键，覆盖率不足 1%，是必须正视的差距。

相关：[[claude-localization-scope]]
