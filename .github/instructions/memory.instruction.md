---
applyTo: '**'
---

# 本项目范围与边界

## 交付形态

把 Claude Desktop（Electron）的**前端界面**汉化成中文，交付为 `installer/` 下的一键安装器：
复制官方程序成独立副本 → 在副本里打四处前端资源补丁 → 建快捷方式 → 以独立 userData 启动。
**官方安装自始至终不被改动。**

## 已定范围

- **只做 Claude Desktop。** Cursor、实时翻译/屏幕翻译、OCR、浏览器插件、C#/.NET 辅助进程均为
  **范围外**，不要再作为需求推进。
- 层 A（Chromium locale pak）与层 B（shell 资源）官方自带中文，不改。唯一的缺口是层 C（前端 SPA 词典）。
- 译文表只存 `{哈希键: 中文}`，**不含英文原文**；Anthropic 的英文字符串不随本仓库分发，
  安装时由安装器从本机官方目录读取。

## 已定决策（不要再问）

- 交付形态：双击 `.cmd` 调 Node；安装幂等、可重复运行；桌面与开始菜单各建一个快捷方式；
  说明只放一个 `说明.txt`。
- 副本使用独立 userData（启动器带 `--user-data-dir`），与官方版可同时运行，互不抢单实例锁。

## 仓库边界

- 不自动提交、推送、关闭更新、改变全局配置、绕过安全策略或启动收费服务。
- 修改真实安装资源前，先显示具体范围、风险与恢复方式，并取得授权。
- 入库文档只写结论、用法与残留，不写推导过程与试错叙述。

## 当前状态

v1.4 已交付：`installer/` 是可安装/校验/还原的一键安装器，层 C 界面中文已在真实安装的已登录主界面上验收。

交付路径只有 `installer/`，它递归 import 到的 `project/backend/` 三个模块（`safe-io.mjs`、
`install-identity.mjs`、`scanner.mjs`）是活代码，其余已归档：早期工具链在
`project/backend/archive/`，早期文档在 `doc/archive/`。**改动只针对活代码与 `installer/`。**

现状、键数、覆盖率以 `README.md` 与 `installer/translations/SOURCES.md` 为准。
