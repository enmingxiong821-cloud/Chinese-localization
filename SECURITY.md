# 安全策略

## 支持范围

只维护最新一个 release。旧版本的问题请先升级再复现。

## 这个项目对系统做了什么

安装器全程**不修改官方安装**（`Program Files\WindowsApps` 下的文件一个字节都不动），也不会：

- 复制或读取登录凭据（副本与官方版共用 `%APPDATA%\Claude\config.json`，安装器不读取其中任何字段）
- 修改 `claude.exe`、`app.asar` 或破坏数字签名
- 关闭自动更新、代理流量、申请管理员权限

它只做四件事：复制一份官方程序到 `%LOCALAPPDATA%\Claude-zh\`、替换副本里的前端文本资源、建快捷方式、写入一条 `locale`。

## 报告安全问题

**不要开公开 issue。**

请用仓库 Security 页的「Report a vulnerability」（GitHub Security Advisory），可私下沟通并协商披露时间。

适合走这个渠道的问题：安装器代码缺陷（路径穿越、任意写、越权）、译文表被投毒、凭据可能泄漏、安装包与 tag 不一致。

## 请勿在 issue 中粘贴

- `config.json` 全文或其中任何 `oauth` 字段
- 账号 token、cookie、请求头
- 未打码的完整日志（路径里的用户名请先替换掉）

## 响应

个人项目，尽力在 7 天内回复。确认后会尽快发修复版本，并在 release 说明里写清影响范围。
