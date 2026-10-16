---
name: node-test-no-dir-arg
description: "本机跑测试只能裸 `node --test`（带目录参数会被当文件路径）；默认 170 通过 2 跳过，跳过的 2 项要 CDP_E2E=1 且必须加 --test-force-exit"
metadata:
  node_type: memory
  type: project
  originSessionId: 5ea68adf-d2a1-4ffd-b689-f366df2e1707
  modified: 2026-10-15T13:11:58.509Z
---

在本项目工作区跑测试，**只能用 `node --test`（不带参数）**。

Node v24.18.0 + Git Bash 下，`node --test installer` 与 `node --test installer/` 都会报
`test at installer:1:1 ✖ installer` —— 目录参数被当成文件路径处理。不带参数时会递归自动发现，
当前共 172 项（含 `project/backend/archive/` 下归档代码的测试），约 3 秒跑完。

**默认是 170 通过 + 2 跳过**，不是 172 通过：跳过的是归档里两个**会真开 headless 浏览器**的 CDP
端到端用例。要跑它们得 `CDP_E2E=1 node --test --test-force-exit` —— `--test-force-exit` 不可省，
浏览器进程句柄会让测试进程退不出（现象是「全部打 ✔ 但命令不返回」），该 flag 需要 Node 22 以上。

**Why:** 仓库早期文档里写的 `node --test project/backend/*.test.mjs installer/*.test.mjs` 在归档后
已经把 `archive/` 里的测试漏掉，靠裸 `node --test` 才是完整的一遍。那 2 项默认跳过是刻意的，
不是坏了——它们依赖本机装了 Chrome/Edge。

**How to apply:** 跑全量测试直接用 `node --test`；要验 CDP 注入链路才用 `CDP_E2E=1` 那条。写 README
或文档里的测试命令时，默认命令写 `node --test`。

相关：[[claude-localization-v1-released]]

