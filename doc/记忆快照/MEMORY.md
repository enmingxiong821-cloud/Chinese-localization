# 记忆索引

- [桌面汉化项目四项决策](project_claude_localization_scope.md) — Claude 路线优先、资源复用不接引擎、Electron+TS+C# 栈；「先纯自用」已于 2026-10-15 升级为公开仓库
- [Claude Desktop 四层文本模型](project_claude_desktop_text_layers.md) — 中文资源早已随包发布；只有前端 SPA 层缺中文，被三重门禁锁死
- [层 C 三道门全锁](project_claude_c1_injection_only.md) — ACL 写不进／签名构建忽略自定义数据目录／带调试开关拒绝启动；说的是「为什么改不了正式安装」，别当落地路径
- [可写副本通道](project_claude_writable_copy_channel.md) — robocopy 整包 + LOCALAPPDATA 重定向 + **必须加 `--user-data-dir`**（只重定向会抢单实例锁而启动失败）；免 3p
- [汉化已交付](project_claude_localization_v1_released.md) — **接手先读工作区 `doc/进度与交接.md`**；最新 v1.7（文档维护版，安装行为同 v1.5），装机在 `%LOCALAPPDATA%\Claude-zh`（副本已于 2026-10-16 刷新到 2.42304.0.0）；18 个历史提交带 AI 尾注未清
- [层 C 译源](project_localization_translation_source.md) — MIT 现成包覆盖 93.30%，缺口 2,291 条已自译，语义覆盖 100% 并装机验收；别重跑测量
- [跑测试只能 `node --test`](env_node_test_dir_arg.md) — 带目录参数会被当文件路径；默认 170 通过 2 跳过，那 2 项要 `CDP_E2E=1` + `--test-force-exit`
- [gh 输出必须先落文件](env_gh_output_needs_file.md) — 走管道/`$()` 时 936 代码页会吃掉 emoji，grep 永远 0 命中；顺带：全局 settings 硬禁 `git push --force` 与 `git reset --hard`
- [本仓库不自动提交](feedback_no_auto_commit.md) — 提交/推送/改全局配置要先问；「你来定」不等于授权提交
- [不提交推理废话](feedback_no_speculative_docs.md) — 入库文档只留结论、用法、残留；推导与试错过程留在对话里
- [发布物不得出现 AI 标注](feedback_no_ai_attribution.md) — 提交/release/PR 都不加 Co-Authored-By 与 🤖 尾注；协作者列表不能有 AI；用户是个人独立开发者
- [欢迎页中文不是层 C](project_claude_welcome_screen_not_layer_c.md) — 欢迎页由服务端本地化，不是层 C；离线 harness 也证不了层 C，验收只看已登录主界面
