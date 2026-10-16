# 补译工具链

官方升级后，层 C 会冒出一批译文表里没有的新文案。这套脚本是那轮补译的可复用主线：
**导出缺口 → 校验回填结果 → 并入译文表 → 事后审计**。产物是
`installer/translations/zh-Hans.overrides.json`。

脚本都读本机已安装的官方 Claude Desktop（经 `installer/install-plan.mjs` 定位），
所以只能在装了官方包、且 Node 可用的 Windows 机器上跑。**本目录不随发布 zip 分发**。

## 用法

工作目录放中间产物。里面会有官方英文原文，**只在本地临时目录里存在，不进仓库**。

```bash
node project/tools/export-gaps.mjs
```

省略工作目录时会在系统临时目录新建一个并把路径打印出来。

`jin<N>.jsonl` 每行 `{ i, k, en }`：序号、哈希键、英文原文。把每批交给翻译，
回填成 `jout<N>.jsonl`，每行 `{ "k": "<键>", "zh": "<中文>" }`；判为**保留英文**的条目
写成 `{ "k": "<键>", "skip": "<类别，如 brand / url / path / id>" }`。

```bash
node project/tools/check-batch.mjs <工作目录>
```

校验并写出 `accepted.json`。有错误会逐批列出（每批前 30 条）。
**只有完全通过判据的条目才写进 `accepted.json`**，出错的条目会被排除——所以先修错误再合并，
或只合并当轮通过的部分，都不会把坏译文带进表里。

```bash
node project/tools/merge-accepted.mjs <工作目录>
```

把 `accepted.json` 并入译文表。只追加、不重排，git diff 只有新增行；键冲突或空译文会中止。

```bash
node project/tools/audit-table.mjs
```

对成型的译文表做结构审计。覆盖率与安装门禁不在这里，另跑 `node installer/install-cli.mjs verify`。

```bash
node project/tools/check-parity.mjs
```

诊断官方各语言词典与 `en-US` 的键集差异（见下）。

## 校验判据

`check-batch.mjs` 逐条比对英文与中文，任一条不合即计入错误：

- **占位符根名集一致**：`{name}`、`{count, plural, …}` 取第一个标识符比对，少一个多一个都算错。
- **ICU 精确分支 `=N` 必须保留**。丢掉它会让 `=2 {…}` 这类分支退回 `other`，语义出错
  （原文「删除 2 个会话」会变成「删除全部」）。
- **ICU `select` 的分支关键字必须保留**；`plural` 的 `one` 按约定统一丢弃，不参与比对
  （中文无单复数，只留 `other`）。
- **HTML 标签数一致**；**printf 变量数一致**。
- 译文非空、不含裸制表符或换行。
- 译文与英文逐字节相同的条目**应当判成 SKIP**，而不是硬译。
- 译文若无汉字又不等于英文，说明没翻干净。
- 品牌名/模型名键（`brand-keys.json`）不得被翻译。
- 键不得重复、不得超出本批输入、不得已存在于现有译文表。

`audit-table.mjs` 对成品表再独立跑一遍占位符签名、HTML 标签、printf 三类比对，
并报出「中文与英文逐字节相同」的条数——这个数应当等于「表内英文值 + 未覆盖键」，
对不上说明有硬译。

## 翻译时的复核项

机器只保证结构，下面几类是人工复核的着眼点（一次性排查脚本没保留，这里是结论）：

- 中英混排处是否漏了半角空格；
- 句末是否残留半角标点（`. , ! ? ; :`）；
- 短标签（英文 ≤2 个词）是否译得过头或不通顺；
- 人称用词是否统一。

## 键集对齐（`check-parity.mjs` 的结论）

官方除 `en-US` 外的各语言都缺几十个键，**键集从来不完全一致，缺键是常态**。
`en-US` 是超集，所以拿 `en-US.json` 当底座补 `zh-Hans.json` 只会多键，前端不判错。
官方升级后若这条结论变了，才需要重新评估。

## 残留

- 这五个脚本没有自动化测试：跑起来依赖本机装有官方 Claude Desktop，不适合进 `node --test`。
  改动它们之后，至少用一次真实缺口导出 + `audit-table.mjs` 走一遍。
- 只保留了这条主线。`measure`（与 `install-cli verify` 重复）、旧 TSV 格式的
  `normalize`/`validate`（已被 `check-batch` 取代）、以及各种一次性探针脚本都没有入库。
