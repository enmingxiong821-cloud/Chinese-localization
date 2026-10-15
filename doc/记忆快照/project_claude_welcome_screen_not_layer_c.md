---
name: claude-welcome-screen-not-layer-c
description: 未登录欢迎页的中文不是层 C 产物，不能用它验收层 C；层 C 只能登录后看
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-15T02:02:38.890Z
---

Claude 桌面版**未登录时的欢迎页**（"Claude for Windows / 与 Claude 对话的最快方式 / 开始使用"）渲染出来的中文**不是层 C 词典的产物**，验收层 C 时不要拿它当证据。

实测依据（2026-10-15，官方 2.37337.1.0 副本）：

- 这两句在副本包内 **4065 个文件**里全都没有（UTF-8、UTF-16 两种编码都扫过），副本 cache / profile 里也没有。
- 删掉 `ion-dist/i18n/zh-Hans.json` 再启动 → 欢迎页照旧中文。
- 往词典里写唯一标记（`ZZMARKER…`）再启动 → 欢迎页照旧，标记不出现。
- 官方包的 SPA 白名单和 `ion-dist/i18n/` 里都没有 zh-Hans，所以也不是官方层 C 自带。

推断：该页文案由运行时从服务端取（随 `locale` 本地化），跟本地词典无关。**欢迎页只能证明层 D（locale 设置）生效**。

补充（2026-10-15，离线 Chromium 复现层 C 的尝试，结论是别再试）：

- 用本地静态服务器伺服副本的 `ion-dist` + 真 Chromium 走 CDP，SPA **确实请求了** `/i18n/zh-Hans.json`（请求日志 3 次）——说明补丁的接线是通的、locale 解析到了 `zh-Hans`。
- 但页面显示的仍是 `Can't reach Claude / Check your connection. / Try again`。这三个串在 catalog 里都有中文（`Ppy/7+uyGC` → "检查你的连接。"），渲染出来却是英文 `defaultMessage`，说明**这个错误屏在 i18n 生效之前渲染**。
- 把 `/edge-api/*` 一律回 `{}` 想骗过后端，无效，仍是英文。真实 app 又拒绝带调试开关启动。
- 所以**离线 harness 证不了层 C**，别再花时间搭。

**验收层 C 的有效证据**：`doc/验收-沙箱中文界面.png`（已登录主界面），逐串比对过——"你来了！"(`y1XRP1BJQF`)、"今天我能帮你做什么？"(`ye34lid+ov`)、"给我发送每日简报"(`29FPzFqfHK`)、"你的提供商设置需要修复"(`c9fsVL9wrY`) 等全部命中的是**本仓库译文表的值**，不是官方或服务端文案。

**Why:** 首版闭环那次就是在这类"看起来中文了"的画面上签的字，容易把"界面中文"误当成层 C 打通的证据。

**How to apply:** 验收层 C 必须在**副本登录后**进主界面看（登录是一次性人工动作，凭据复制需先经用户同意）。中文对话界面的截图才是有效证据；欢迎页、登录页都不算。相关：[[project_claude_desktop_text_layers]]、[[project_claude_localization_v1_released]]。
