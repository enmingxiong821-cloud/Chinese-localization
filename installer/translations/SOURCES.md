# 译文表来源与许可

`zh-Hans.overrides.json` 收录 **35,062** 条 `{哈希键: 中文}`，**不含任何英文原文**。
键空间与官方 `app/resources/ion-dist/i18n/en-US.json` 同构（10 字符哈希，值均为字符串）。

当前对应官方词典 **34,954** 键（Claude Desktop 2.37337.1.0），命中 **34,725** 条，覆盖率 **99.34%**。

## 来源与条数

| 来源 | 许可 | 并入本表的条数 |
|---|---|---|
| [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT © 2025 javaht | 31,753 |
| [Jyy1529/claude-desktop_win-zh_cn](https://github.com/Jyy1529/claude-desktop_win-zh_cn) | MIT © 2026 | 87 |
| github.com/lijunyu726 | MIT © 2026 | 43 |
| [good9527/Claude-Desktop-Chinese](https://github.com/good9527/Claude-Desktop-Chinese) | MIT © 2026 good9527 | 33 |
| github.com/Mars-Wang-1988 | MIT © 2026 Po1nt9 | 4 |
| 本项目自译 | 本项目 | 3,119 |
| 本项目改写 | 本项目 | 23 |
| **合计** | | **35,062** |

> 第三方各行为首版（2026-10-14，基准词典 2.31226.1.0 / 34,213 键）的**净贡献**，此后未重新测量。
> 「自译」含首版 1,954 条与 2026-10-15 补齐的 1,165 条，本表由此由 33,897 增至 35,062。

## 收录口径

- **只收录仓库根目录带真实 MIT LICENSE 文件的来源。** 另有 16 个同类仓库没有任何许可文件，
  合计只多覆盖 98 条；为这点增量承担许可风险不值得，**全部排除**。
- 合并优先级：javaht → Jyy1529 → lijunyu726 → good9527 → Mars-Wang-1988 → 本项目自译。
  本项目自译优先级最高，同键冲突时以自译为准。
- 上表是**并入本表后的净贡献**，不是各仓库的条目总数。例如 javaht 原文件有 32,746 条，
  与本项目键空间交集 32,036 条，其余属于其他产品线或官方已删除的键。
- 「本项目改写」的 23 条是对第三方译文的定点修正，其中 21 条原本来自无许可来源、
  2 条来自 javaht 且把 `{article}` 占位符误改成了 ICU `select`；两者都按官方英文原文重写。

## 未收录的 229 条

官方词典 34,954 键中有 229 条不在本表内。它们是 URL、ARN、UUID、OAuth scope、字体名等
本就应保留原样的示例值。装机底座是官方 `en-US.json`，这些键回落即得到原文，内容一致。

## 校验

对当前官方词典逐条结构校验（花括号占位符签名、HTML 标签、printf 变量、首尾空白、ICU 类型），
覆盖 **34,725** 条：

- **1,640 条**含 ICU `plural` / `select`，校验器一律转人工复核。本项目约定 ICU `plural` 只保留
  `other` 分支、丢弃 `one` 分支（中文无单复数），因此这些条目在结构上必然与英文不同，属预期。
- **42 条**报「保护标记不一致」，逐条核对后**全部属预期，无真实缺陷**：
  - 39 条是校验器误报——英文 `{percent}% used` 这类写法被 `%` 号正则当成了 printf 变量 `% u`，
    中文语序把 `%` 前移后不再匹配。
  - 2 条（`HKSFyjtJUc`、`eah567dUx5`）丢弃了英文的 `{article}` 占位符，中文无冠词。
  - 1 条（`57rquvtOqH`）占位符集合相同、重复次数不同，中文语序所致。
- **167 条**中文与英文完全相同，均为模板、品牌名与标识符（`{count} {noun}`、`Microsoft Azure`、
  `Google Pay`、`Anthropic Serif`、`sha256 {digest}`、`repo read:org` 等），属预期。

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

Anthropic 的英文界面字符串（层 C 的 `en-US.json`，34,954 键）版权归 Anthropic，
**不随本仓库分发**，安装时由安装程序从本机官方安装目录读取。本表只含哈希键与中文值。
