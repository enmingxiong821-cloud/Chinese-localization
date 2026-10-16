# 译文表来源与许可

`zh-Hans.overrides.json` 收录 **35,753** 条 `{哈希键: 中文}`，**不含任何英文原文**。
键空间与官方 `app/resources/ion-dist/i18n/en-US.json` 同构（键为哈希，值均为字符串）。

当前对应官方词典 **35,441** 键（Claude Desktop 2.42304.0.0），命中 **35,274** 条，覆盖率 **99.53%**。

同目录另有 `zh-Hans.dynamic.json`，**49** 条，对应官方 `i18n/dynamic/en-US.json`（模型与思考档位选择器的文案），
口径与本表相同，单独成文件以免污染本表的覆盖率统计。见下「动态词典」。

## 来源与条数

| 来源 | 许可 | 并入本表的条数 |
|---|---|---|
| [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT © 2025 javaht | 31,753 |
| [Jyy1529/claude-desktop_win-zh_cn](https://github.com/Jyy1529/claude-desktop_win-zh_cn) | MIT © 2026 | 87 |
| github.com/lijunyu726 | MIT © 2026 | 43 |
| [good9527/Claude-Desktop-Chinese](https://github.com/good9527/Claude-Desktop-Chinese) | MIT © 2026 good9527 | 33 |
| github.com/Mars-Wang-1988 | MIT © 2026 Po1nt9 | 4 |
| 本项目自译 | 本项目 | 3,833 |
| 本项目改写 | 本项目 | 23 |
| **合计** | | **35,753** |

> 第三方各行为首版（2026-10-14，基准词典 2.31226.1.0 / 34,213 键）的**净贡献**，此后未重新测量。
> 「自译」累计 **3,833** 条 = 首版 1,954 + 2026-10-15 补齐 1,165 + 2026-10-15 复审补译 84
> + 2026-10-16 跟随官方 2.42304.0.0 补译 630；本表由 33,897 增至 35,753。
> 合计只加**前六行**：「本项目改写」那 23 条是对第三方条目的定点替换，已落在对应来源行内，不另计。

## 收录口径

- **只收录仓库根目录带真实 MIT LICENSE 文件的来源。** 另有 16 个同类仓库没有任何许可文件，
  合计只多覆盖 98 条；为这点增量承担许可风险不值得，**全部排除**。
- 合并优先级：javaht → Jyy1529 → lijunyu726 → good9527 → Mars-Wang-1988 → 本项目自译。
  本项目自译优先级最高，同键冲突时以自译为准。
- 上表是**并入本表后的净贡献**，不是各仓库的条目总数。例如 javaht 原文件有 32,746 条，
  与本项目键空间交集 32,036 条，其余属于其他产品线或官方已删除的键。
- 「本项目改写」的 23 条是对第三方译文的定点修正，其中 21 条原本来自无许可来源、
  2 条来自 javaht 且把 `{article}` 占位符误改成了 ICU `select`；两者都按官方英文原文重写。
- **品牌名、产品名与模型名一律保留官方英文原文，不译。** 2026-10-15 全表审计时剔除了 **23** 条
  把这类名字直译成中文的条目（`Anthropic`、`Bash`、`Chrome`、`Haiku`、`Sonnet`、`Opus`、
  `JetBrains`、`Linear`、`Notion`、`OAuth`、`PowerPoint`、`Python`、`Slack`、`TikTok`、`URL`、
  `Windows`、`Max`、`API`、`Amazon Bedrock`、`Claude Opus 4`、`Windows (x64)/(arm64)`；
  例如 `Haiku→俳句`、`Windows→窗户`、`Chrome→铬`）。剔除后这些键回落官方英文原文。
  `installer/translations.test.mjs` 会挡住它们被重新合并回来。

## 未收录的 167 条

官方词典 35,441 键中有 167 条不在本表内，**全部是本就应保留原样的值**：品牌与产品名
（`GitHub`、`Excel`、`Zoom`、`Outlook`、`Azure`、`AWS`、`Node.js`、`OpenTelemetry`…）、
型号名（`Haiku`、`Sonnet`、`Opus`、`Claude Opus 4`）、技术标识（`MCP`、`JWT`、`SSH`、`WSL`、
`SHA-256`、`HTML`、`PDF`、`CLI`）、示例值（URL、ARN、UUID、OAuth scope、`example.com`、
占位路径）与纯数字（`0`、`30`、`3600`）。

装机底座是官方 `en-US.json`，这些键回落即得到原文，**内容一致，不是缺译**。
2026-10-16 复审逐条确认过，其中不含应译而未译的界面文案：**162 条**判定为「本就应保留原样」
的英文（品牌、路径、URL、UUID、示例值、纯数字、时间档位），另 **5 条**是纯模板串
（值里只有占位符，如 `{status}…`、`{first} · {second}`），译出来与英文逐字节相同，故不入表。

## 动态词典

官方在 `i18n/dynamic/` 下另有一部小词典（11 个语种各一份，同样没有中文），收录**模型与思考档位
选择器**的 49 条文案。它与主词典是两个独立请求，但前端把两者放在**同一个 `Promise.all`** 里取，
**任一份缺失就整盘不加载**，所以它必须跟着一起补。

`zh-Hans.dynamic.json` 收录全部 **49** 条，覆盖率 **100%**，全部为本项目自译，许可同上。
键空间与官方 `i18n/dynamic/en-US.json` 同构，同样只存 `{哈希键: 中文}`，不含英文原文。
单独成文件是因为它的键空间与主词典不相交，并进来会污染主表的覆盖率统计。

## 校验

2026-10-16 对官方 2.42304.0.0 词典重跑结构校验（花括号占位符签名、ICU 分支、HTML 标签、
printf 变量），覆盖 **35,274** 条，**无一处真实缺陷**：

- **1,676 条**含 ICU `plural` / `select`。约定 `plural` 只保留 `other` 分支（中文无单复数），
  但 `=N` 精确匹配分支必须原样保留，`select` 的分支关键字一个不丢。
- **占位符签名差异 3 条**，逐条核对后全部属预期：
  - `HKSFyjtJUc`、`eah567dUx5` 丢弃英文的 `{article}` 占位符，中文无冠词。
  - `MaXzl46L9f` 把 `{marketplaceName}` 从 `plural` 分支内提到分支外，中文只留 `other`，等价。
- **HTML 标签数差异 6 条**，全部由丢弃 `one` 分支引起（英文 `one {<b>#</b> item}` 里的标签随分支一并消失）。
- **printf 变量差异 0 条**。
- **167 条**中文与英文完全相同，均为模板与标识符（`{first} · {second}`、`Microsoft Azure`、
  `sha256 {digest}`、`repo read:org` 等）——底座回落即同串，属预期。

## 版权声明

本表包含上述 MIT 仓库的译文，按 MIT 许可分发，各部分版权归原作者所有：

```
MIT License

Copyright (c) 2025 javaht          # javaht/claude-desktop-zh-cn
Copyright (c) 2026                 # Jyy1529/claude-desktop_win-zh_cn
Copyright (c) 2026                 # lijunyu726
Copyright (c) 2026 good9527        # good9527/Claude-Desktop-Chinese
Copyright (c) 2026 Po1nt9          # Mars-Wang-1988
```

完整许可原文见各仓库根目录的 LICENSE 文件。

## 不随本仓库分发

Anthropic 的英文界面字符串（层 C 的 `en-US.json`，35,441 键）版权归 Anthropic，
**不随本仓库分发**，安装时由安装程序从本机官方安装目录读取。本表只含哈希键与中文值。
