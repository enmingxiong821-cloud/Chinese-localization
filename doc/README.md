# 文档地图

**交付与事实来源只有一个地方**：[`README.md`](../README.md)（现状、四层文本、落地路径、安装与还原）
与 [`installer/translations/SOURCES.md`](../installer/translations/SOURCES.md)（译文来源、许可、收录口径）。
键数、覆盖率、版本号一律以这两份为准，任何文档里的旧数字都以它们覆盖。

## 本目录

| 文档 | 内容 |
| --- | --- |
| [进度与交接.md](进度与交接.md) | **接手入口**：现状、关键数字、已定决策、怎么验证、已知坑、下一步、从零复现 |
| [Claude桌面汉化技术设计与首版闭环.md](Claude桌面汉化技术设计与首版闭环.md) | 技术设计依据：四层文本模型、层 C 的三重门禁、11 语言白名单、可写副本路线、补丁点的由来 |
| [记忆快照/](记忆快照/) | 本项目在 `.claude` 里的记忆文件快照（含决策、边界、已知坑）。**是快照**：其中提到的 `doc/xxx.md` 可能已移入 [`archive/`](archive/) |

## 已归档（历史快照，数字与结论冻结在成文日期）

[`archive/`](archive/README.md) —— 早期调研、里程碑记录、以及被后续决策取代的范围与方案。只作证据与追溯，不对照当前实现。
[`archive/prototype/`](archive/prototype/) 是早期的交互原型 v0.1（静态页面），已被安装器取代。

## 其他目录

| 目录 | 状态 |
| --- | --- |
| [`installer/`](../installer) | **交付路径**：一键安装器、译文表、说明模板 |
| [`project/backend/`](../project/backend) | 安装器依赖的活代码（`safe-io.mjs`、`install-identity.mjs`、`scanner.mjs`），其余见 [`project/backend/archive/`](../project/backend/archive/README.md) |
| [`project/tools/`](../project/tools/README.md) | 官方升级后补译译文表的工具链（导出缺口 → 校验 → 合并 → 审计）。**不属交付路径，不随发布 zip 分发** |
| [`research/`](../research) | 调研阶段的 GitHub Search 脚本与 README 原文快照 |
| [`备份/`](../备份/README.md) | 本地归档（会话记录、离线安装包），**不进 git** |
