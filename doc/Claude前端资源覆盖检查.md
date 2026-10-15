# Claude前端资源覆盖检查

> ⚠️ 本文「`i18n-catalogs` 注入方未知」已作废：该注入点在官方包中是死代码，实际注入由本项目的 HTML 补丁提供，见 `Claude桌面汉化技术设计与首版闭环.md` §12.2。

## 资源事实

本机Claude安装：`C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\app`。

| 资源 | 状态 | 条目数 |
| --- | --- | ---: |
| `resources/en-US.json` | 存在 | 801 |
| `resources/zh-Hans.json` | 存在 | 613 |
| `resources/ion-dist/i18n/en-US.json` | 存在 | 34,954 |
| `resources/ion-dist/i18n/de-DE.json` | 存在 | 34,954 |
| `resources/ion-dist/i18n/de-DE.overrides.json` | 存在 | 150 |
| `resources/ion-dist/i18n/dynamic/de-DE.json` | 存在 | 49 |
| `resources/ion-dist/i18n/zh-Hans.json` | 缺失 | — |
| `resources/ion-dist/i18n/zh-Hans.overrides.json` | 缺失 | — |
| `resources/ion-dist/i18n/dynamic/zh-Hans.json` | 缺失 | — |

Claude前端根入口HTML及三个frame HTML均未发现 `i18n-catalogs` 字面量；前端 `shared-50-Bmc9oUMm.js` 读取该meta的 `dataset.i18nCatalogs`，并从目录元数据派生基础、动态和overrides资源路径。静态默认语言白名单不含中文。

无法通过当前只读探测确定 `i18n-catalogs` 的注入方。`resources/app.asar` 大于扫描器16MiB限制；WindowsApps下对 `app.asar.unpacked` 目录枚举返回EPERM。未绕过权限、未解包asar、未修改权限或安装资源。

## 候选资源当前情况

Claude桌面中文候选：`project/frontend/candidates/claude-Itub2X/`。

- 桌面候选对象：801键；611条候选译文（588条来源于自带zh-Hans、23条来源于起始词典）；188个英文资源中缺失的原生中文键清单；190条原文保留。
- 前端候选对象：34,213键；64条通用短词候选；34,149条原文保留。
- 独立产物校验通过：桌面键数、审核条数、缺失原生键数、前端键数及保留数吻合。
- 以上只是候选数据，不是页面覆盖或实际加载成功。

## 下一步判据

必须先由获准访问的应用运行时或能读取打包资源的渠道确定meta目录注入方式及配置来源；再确定前端基础、动态、overrides资源的期望结构和选择机制。没有这些证据，不生成伪装完整的zh-Hans前端包，不修改WindowsApps，也不把仅有64条候选描述为前端汉化。

Cursor下一步将使用product.json的`vscodeVersion`对照本机语言扩展引擎范围，核实继承`^1.128.0`的兼容条件；不安装候选扩展。
