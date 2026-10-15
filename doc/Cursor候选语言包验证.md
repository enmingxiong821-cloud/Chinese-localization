# Cursor 候选语言资源生成与验证

> **范围外。** Cursor 路线已废弃，本项目现只做 Claude Desktop。本文与其中的模块
> （`cursor-pack.mjs`、`build-cursor-pack.mjs`）保留作历史记录，不再维护。

## 当前交付

新增模块：`project/backend/cursor-pack.mjs`、`translation-quality.mjs`、`build-cursor-pack.mjs`、`cursor-pack.test.mjs`。扫描器增加受控资源集合读取入口；原有只读扫描行为保持。

输入为 Cursor 3.24.12 本机 NLS 资源与本机微软简体中文语言包 1.128.0；依模块和键进行匹配，不按英文全文猜测。复用资源授权已通过 `gh api repos/microsoft/vscode-loc/license` 核对为 MIT，产物附版权和许可全文。未引入第三方运行依赖。

生成目录：`project/frontend/candidates/cursor-NvS5q2/`。

文件：package.json、translations/main.i18n.json、coverage.json、pending.json、THIRD-PARTY-LICENSE.txt、README.md。

此目录是候选扩展源码，不是 VSIX，未安装到 Cursor，未验证对应 VS Code 引擎范围或真实页面。清单引擎范围继承基础语言包 ^1.128.0，尚需对照 Cursor 实際兼容性检查。

## 实际统计

| 指标 | 数量 |
| --- | --- |
| 索引消息 | 13530 |
| 唯一模块/键标识 | 12761 |
| 重复位置 | 769 |
| 接受的唯一键 | 10943 |
| 其中原译文相同 | 91 |
| 缺失 | 1777 |
| 保护标记不匹配 | 31 |
| 原文冲突标识 | 10 |
| 待审核合计 | 1818 |

重复位置中11个位置英文与首次出现不同，涉及10个唯一标识。冲突标识全部排除，pending.json包含原文变体；相同原文的重复键合并。

规则接受率约85.75%，不是中文界面覆盖率；同键对应英文可能跨版本改变，语义审核未完成。不变译文可能是品牌、快捷键或其他内容，不能一律统计为已汉化。

## 验证

`node --test project/backend/scanner.test.mjs project/backend/cursor-pack.test.mjs`

结果：16项通过、0失败、0跳过。新增测试涵盖映射顺序、数量与结构、占位符重排及次数、图标、标签、换行、长度、ICU人工审核、原型键、重复合并及冲突排除、资源路径穿越。

生成命令：

```text
node project/backend/build-cursor-pack.mjs "Cursor绝对安装目录" "微软简体中文扩展绝对目录"
```

独立读取本轮实际产物验证通过：输出唯一键10943，逐索引校验11521个已输出匹配项，pending1818，统计守恒，清单路径正确，许可声明存在。

生成器每次创建新目录，禁止覆盖已有文件。遇到写入失败可能留下部分新目录；成功产物与失败目录不能混用。文件I/O硬超时及并发文件替换防护仍未完善。

## 下一阶段

- 先核对 Cursor 对应 VS Code 引擎版本与语言包加载格式，再评估 VSIX 打包。
- 为缺失条目建立按应用语境审核的词典；不使用未调用的机翻服务冒充翻译结果。
- 逐项审核保护标记差异与10个冲突标识，不以放宽校验换取漂亮覆盖率。
- 未接入桌面原型；CLI接口经过测试，未新增Web接口，本轮不涉及浏览器页面修改。
- 实际应用加载、UI显示、恢复与升级行为均未验证。
