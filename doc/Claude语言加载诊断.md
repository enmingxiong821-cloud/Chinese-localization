# Claude 语言加载诊断

> 状态：静态证据（模块字节数与 SHA-256、默认语言列表、资源路径）仍有效；「中文被 11 语言白名单挡死、需额外激活」的结论已被 `Claude桌面汉化技术设计与首版闭环.md` §11/§12 取代。保留证据，结论以该文为准。

## 实际模块

目标：Claude Windows 安装目录中的 `resources/ion-dist/assets/v1/shared-50-Bmc9oUMm.js`。

本轮使用项目内 `project/backend/analyze-locale-cli.mjs` 做只读静态分析，没有执行目标 JavaScript、读取用户会话或修改安装文件。

| 项目 | 结果 |
| --- | --- |
| 文件字节数 | 392782 |
| SHA-256 | 2c714e0b7c30463db10ba5a905708f661ca14b1fa9d98c04546423b4474247c8 |
| 静态分析状态 | static-evidence-only |
| 默认静态语言列表 | en-US、de-DE、fr-FR、ko-KR、ja-JP、es-419、es-ES、it-IT、hi-IN、pt-BR、id-ID |
| 默认列表包含中文 | false |
| localStorage 语言键 | spa:locale |
| 页面目录元数据 | meta[name="i18n-catalogs"] / dataset.i18nCatalogs |
| 基础资源路径 | /i18n/{locale}.json |
| 动态资源路径 | /i18n/dynamic/{locale}.json |
| overrides 路径 | /i18n/{locale}.overrides.json |

## 结论边界

静态模块包含默认语言选择、用户语言存储键和页面目录读取路径。默认语言列表没有中文；同时加载器会读取 `i18n-catalogs` 元数据，因此仅修改默认列表不能证明所有加载来源，也不能证明加入中文后运行时一定成功。

实际适配需要继续确认：谁写入 `i18n-catalogs` 元数据、资源文件命名与内容格式、语言配置如何进入窗口、动态资源和 overrides 是否需要同步，以及 WindowsApps 安装形态下的权限与恢复流程。

## 验证

`node --test project/backend/scanner.test.mjs project/backend/cursor-pack.test.mjs project/backend/claude-candidate.test.mjs project/backend/locale-analysis.test.mjs`

结果：28 项通过、0 失败、0 跳过。

`node project/backend/analyze-locale-cli.mjs "Claude共享模块绝对路径"` 已输出上述静态证据。

下一步仍为只读定位资源元数据和语言配置来源；未进入 Claude 安装文件修改或运行时注入。
