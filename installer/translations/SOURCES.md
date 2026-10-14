# 译文表来源与许可

`zh-Hans.overrides.json` 收录 **33,897** 条 `{哈希键: 中文}`，**不含任何英文原文**。
键空间与官方 `app/resources/ion-dist/i18n/en-US.json` 同构（10 字符哈希，值均为字符串）。

## 来源与条数

| 来源 | 许可 | 并入本表的条数 |
|---|---|---|
| [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT © 2025 javaht | 31,753 |
| [Jyy1529/claude-desktop_win-zh_cn](https://github.com/Jyy1529/claude-desktop_win-zh_cn) | MIT © 2026 | 87 |
| github.com/lijunyu726 | MIT © 2026 | 43 |
| [good9527/Claude-Desktop-Chinese](https://github.com/good9527/Claude-Desktop-Chinese) | MIT © 2026 good9527 | 33 |
| github.com/Mars-Wang-1988 | MIT © 2026 Po1nt9 | 4 |
| 本项目自译 | 本项目 | 1,954 |
| 本项目改写 | 本项目 | 23 |
| **合计** | | **33,897** |

## 收录口径

- **只收录仓库根目录带真实 MIT LICENSE 文件的来源。** 另有 16 个同类仓库没有任何许可文件，
  合计只多覆盖 98 条；为这点增量承担许可风险不值得，**全部排除**。
- 合并优先级：javaht → Jyy1529 → lijunyu726 → good9527 → Mars-Wang-1988 → 本项目自译。
  本项目自译优先级最高，同键冲突时以自译为准。
- 上表是**并入本表后的净贡献**，不是各仓库的条目总数。例如 javaht 原文件有 32,746 条，
  与本项目键空间交集 32,036 条，其余属于其他产品线或官方已删除的键。
- 「本项目改写」的 23 条是对第三方译文的定点修正，其中 21 条原本来自无许可来源、
  2 条来自 javaht 且把 `{article}` 占位符误改成了 ICU `select`；两者都按官方英文原文重写。

## 未收录的 316 条

官方词典 34,213 键中有 316 条不在本表内。它们是 URL、ARN、UUID、OAuth scope、字体名等
本就应保留原样的示例值。装机底座是官方 `en-US.json`，这些键回落即得到原文，内容一致。

## 校验

逐条结构校验（花括号占位符签名、HTML 标签、printf 变量、首尾空白、ICU 类型）：
**33,897 / 33,897 通过，0 结构错误**。

其中 9 条会被校验器标为「HTML 标签不一致」，是校验器按标签出现顺序逐一比对导致的误报：
中文无单复数，本项目约定 ICU `plural` 只保留 `other` 分支、丢弃 `one` 分支，
标签数量因此少于英文；另有 3 条只是中英文语序不同导致标签顺序变化，标签本身完整配对。

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

Anthropic 的英文界面字符串（层 C 的 `en-US.json`，34,213 键）版权归 Anthropic，
**不随本仓库分发**，安装时由安装程序从本机官方安装目录读取。本表只含哈希键与中文值。
