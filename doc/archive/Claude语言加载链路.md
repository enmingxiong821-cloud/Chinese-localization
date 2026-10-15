# Claude前端语言加载静态核查

> 状态：静态证据（`spa:locale`、`T_`/`O_`/`E_`/`k_` 链路）仍有效；激活结论已被 `Claude桌面汉化技术设计与首版闭环.md` §11/§12 取代。保留证据，结论以该文为准。

范围：本机Claude_2.31226.1.0_x64__pzs8sxrjxfjjc安装资源，只读，不执行目标代码，不修改配置。

## 已观察证据

- ion-dist/index.html的desktopPreferredLanguages引用用于设置data-cjk-order，不能把字体选择当作译文加载。
- 前端入口为assets/v1/index-D35w9RK9.js。
- assets/v1/shared-50-Bmc9oUMm.js中观察到spa:locale、spa:locale-source及user_choice字符串。
- 模块中两处显式语言集合均为en-US、de-DE、fr-FR、ko-KR、ja-JP、es-419、es-ES、it-IT、hi-IN、pt-BR、id-ID，没有中文。
- T_函数按完整语言标签或主语言匹配，未匹配时返回en-US；O_读取spa:locale，先匹配文档catalog，再调用语言匹配函数。
- E_从文档data-i18n-catalogs解析目录版本信息；k_生成/i18n/<locale>.json、/i18n/dynamic/<locale>.json及/i18n/<locale>.overrides.json，存在catalog时附版本参数。

上述是静态代码证据，不是运行时调用跟踪。不能因此断言所有页面使用同一入口，也不能据此认定修改localStorage即可启用中文。

## 工程处理

新增project/backend/locale-analysis.mjs，保守识别已观察的语言字面量模式和资源路径标记，不执行输入代码。未识别结构返回unrecognized-review-required。测试见locale-analysis.test.mjs。

需要后续核查：实际文档catalog、加载函数调用方、桌面语言与前端语言同步、动态资源及overrides优先级。当前候选资源尚未提供完整动态资源和激活方案，不应直接安装到真实Claude。
