# Claude 桌面汉化：技术设计与首版闭环方案

日期：2026-10-14
性质：基于本机安装包只读反查的**技术设计**，不是实现完成证明。
探测范围：`C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\`、`%APPDATA%\Claude\`、`%LOCALAPPDATA%\Claude\logs\`。
本轮**未写入任何文件、未修改配置、未启动带调试参数的应用、未解包 asar**。

> **版本口径说明。** 本文跨越两个官方版本：§一～§十的探测与反向工程结论绑定
> **2.31226.1.0**（见 §11 自述），当时层 C 为 34,213 键；§11 起改用**当前基准 2.37337.1.0**，
> 层 C 为 **34,954** 键、译文命中 **34,725**（99.34%）。文中键数、覆盖率一律以当前基准为准，
> 译文表的权威口径见 [`installer/translations/SOURCES.md`](../installer/translations/SOURCES.md)。

---

## 一、结论先行：问题定义需要修正

现有文档（含汇总 TXT）建立在三个前提上，本轮只读探测**推翻了其中两个半**：

| 原假设 | 实际情况 | 证据 |
| --- | --- | --- |
| Claude 桌面资源只有英文 | **`resources/zh-Hans.json` 已随包发布**，613/801 键，ICU 占位符完整，Anthropic 官方译文 | `resources/` 下 43 个语言 JSON，含 `zh-Hans.json`、`zh-Hant.json` |
| Claude 没有任何中文激活机制 | **存在官方 IPC `DesktopIntl.requestLocaleChange(locale)`**，且语言白名单**只拦自动检测、不拦显式切换** | `app.asar` @14103322 |
| 汉化 = 改 asar / 改 exe | 用户配置 **`locale` 已经是 `"zh-Hans"`**，且该字段**就是启动语言** | `%APPDATA%\Claude\config.json`；启动逻辑 `app.asar` @14105541 |
| 层 B 需要额外动作才能激活 | **层 B 此刻已经在加载中文**（`config.json.locale` + `resources/zh-Hans.json` 存在 → 启动即生效） | 同上 |
| 前端 34,954 键缺中文 | **成立**，且被三重硬编码门禁锁死 | `ion-dist/i18n/` 独缺 zh-Hans；`shared-50-Bmc9oUMm.js` @104000-107000 |

**真正的问题不是"把中文放进去"，而是"让中文在正确的那一层生效"。** 现状是中文资源已在包内、配置已指向中文，层 A 与层 B 都不需要任何改造——**唯一缺的是层 C**。

用户已确认：**Claude Desktop 设置里没有语言选项**。这印证了 `config.json.locale` 是外部写入的持久化字段，不是 UI 可选项；也意味着层 B 一旦生效就无"官方开关"可回退，恢复只能靠改回该字段。

---

## 二、Claude Desktop 的四个文本层

这是本次设计的核心模型。四层彼此独立，激活方式和风险完全不同：

| 层 | 覆盖的界面 | 资源 / 机制 | 中文现状 | 激活方式 | 写入需求 |
| --- | --- | --- | --- | --- | --- |
| **A. Chromium 内核** | 右键菜单、原生对话框、拼写检查菜单、系统集成提示 | `app/locales/*.pak`（54 个） | **`zh-CN.pak` 已随包发布** | Electron `--lang=zh-CN` 或 `commandLine.appendSwitch` | 无 |
| **B. 桌面外壳 intl** | 主进程文案，经 `contextBridge` 以 `electronIntl` 暴露给渲染层 | `resources/{locale}.json`（43 个） | **`zh-Hans.json` 已随包发布，613/801 键** | `DesktopIntl.requestLocaleChange('zh-Hans')` | 无 |
| **C. 前端 SPA** | **绝大多数可见 UI**（ion-dist） | `resources/ion-dist/i18n/{locale}.json` + `.overrides.json` + `dynamic/{locale}.json` | **完全没有 zh-Hans** | 渲染层白名单 + `i18n-catalogs` meta + `localStorage['spa:locale']` | **必须** |
| **D. 用户配置** | — | `%APPDATA%\Claude\config.json` 的 `locale` | **已是 `zh-Hans`** | 已被设置 | 无 |

**关键判断：层 A、B 已经是"不用自己汉化"的状态——中文资源随包发布，只差激活。层 C 才是真正要做的汉化工作量，也是唯一需要动安装文件的层。**

---

## 三、层 A / B：官方通道，零写入可走

### 层 A：Chromium 内核

- `app/locales/zh-CN.pak` 与 `zh-TW.pak` 已随包发布（与其余 52 个语言并列）。
- Electron 的内核语言由启动参数决定，不由应用代码决定。
- 覆盖范围有限：右键菜单、原生文件对话框、拼写检查菜单等；**不覆盖应用自绘 UI**。
- 可逆性：改启动参数即可，零文件写入。

### 层 B：桌面 intl（本轮最关键的发现）

主进程反查代码（`app.asar` @1410350x）：

```js
var tut={en:"en-US",de:"de-DE",fr:"fr-FR",ko:"ko-KR",ja:"ja-JP","es-419":"es-419",
         es:"es-ES",it:"it-IT",hi:"hi-IN",pt:"pt-BR",id:"id-ID"};
var lut = new Set(Object.values(tut));                    // 11 种，不含中文

function sut(){ return app.isPackaged ? process.resourcesPath : .../resources/i18n }
function cut(){ return readdirSync(sut()) }

// 自动检测：被 lut 白名单过滤 ← 中文被挡在这里
function uut(){ return cut().filter(e=>/[a-z]{2}-[A-Z]{2}/.test(e))
                       .map(e=>e.replace(/\.json$/,""))
                       .filter(e=>lut.has(e))            // ← zh-Hans 在此被剔除
                       .reduce((a,t)=>(a[t]=!0,a),{}) }

function dut(){ let e=app.getPreferredSystemLanguages(); ...
                for(let n of e){ if(t[n]) return n; }    // 永不返回 zh-Hans
                return "en-US" }

// 显式切换：用 fut 正则过滤，不查 lut
var fut=/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*\.json$/
function put(){ return cut().filter(e=>fut.test(e)).map(e=>e.slice(0,-5)) }  // zh-Hans 在内
function gut(e){ ... if(!fut.test(`${e}.json`)) return false
                     let n=put();
                     t = n.includes(e) ? e : _g;          // zh-Hans 通过
                     ... }
```

**结论：`lut` 白名单只用于开机自动检测（`dut`）。显式切换路径（`gut`）用 `put()` 校验，而 `put()` 只做正则形状检查——`resources/zh-Hans.json` 存在即通过。**

IPC 服务定义（`app.asar` @14103322）：

```js
var eut = ao(Qlt, "DesktopIntl", $lt, {
  methods: [["getInitialLocale",[],Zlt], ["requestLocaleChange",[["locale",P]]]],
  events:  [["localeChanged",[["locale",P],["messages",io]]]]
});
```

安全边界（`$lt`）：

```js
function $lt(e){
  if(!e.senderFrame || !e.senderFrame.url) return false;
  let t; try { t = new URL(e.senderFrame.url) } catch { return false }
  return !!(e.senderFrame?.parent === null && (t.origin === "null" || t.origin === ...));
}
```

**只接受顶层 frame 且 origin 为应用自身协议的请求。** 这是正确的设计——意味着该 IPC 只能从应用自己的渲染层调用，第三方进程无法直接触发。

`DesktopIntl` 经 `contextBridge.exposeInMainWorld("electronIntl", D)` 暴露给渲染层（`app.asar` @22296329），因此**渲染层具备调用 `requestLocaleChange` 的能力**。

### 层 B 的启动语言判定（**已定位，且结论是"已生效"**）

主进程启动路径（`app.asar` @14105256-14105541）：

```js
function _ut(){                       // 惰性初始化，首次调用 getIntl 时执行
  if(!vg){
    try { vg = mut(_g), aut = _g }    // _g = "en-US"，先立兜底
    catch(e){ vg = blt({locale:_g, messages:{}}, rut) }
    iut = new zhe(vg);
    try {
      let e = uo.get("locale");       // ← 读持久化配置的 locale 字段
      out = e;
      hut( e !== undefined && put().includes(e) ? e : dut() );
      //    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^    ^^^^^
      //    ① 有配置且在 resources/ 里存在 → 直接用
      //    ② 否则 → dut() 系统语言自动检测（此路被 11 语言白名单 lut 挡死）
    } catch(e){ N.error("Failed to determine best locale; keeping en-US fallback: %o", ...) }
  }
}
```

`uo.get` / `uo.set` 就是 `%APPDATA%\Claude\config.json`；`gut()` 末尾的 `uo.set("locale", t)` 会把语言写回该字段。

**结论：层 B 此刻已经在加载 `resources/zh-Hans.json`。** 因为：

1. `config.json.locale === "zh-Hans"`；
2. `put()` = `resources/` 下所有匹配 `/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*\.json$/` 的文件名（**不查 `lut`**），`zh-Hans.json` 在列；
3. 条件 ① 成立 → `hut("zh-Hans")` → `mut("zh-Hans")` 读取该文件并构建 intl 实例。

**11 语言白名单 `lut` 与 `dut()` 只在"配置里没有有效 locale"时才会被走到**，是纯兜底路径。这就是为什么此前文档认为"中文被白名单挡住"——白名单挡的是自动检测，不是持久化配置。

**推论：层 B 零改造、零写入。** 需要验证的只是"它显示的到底是什么"，验证位置是**主进程拥有的 UI**——托盘右键菜单、窗口菜单栏、原生对话框——而不是应用主窗口（后者属层 C）。

---

## 四、层 C：前端 SPA——三重门禁与真正的瓶颈

### 现状

`resources/ion-dist/i18n/` 下有 11 种语言的基础包（每种约 2.5–5.4 MB）、11 种 `.overrides.json`、11 种 `dynamic/*.json`——**唯独没有 zh-Hans**。而 `en-US.json` 有 **34,954 个键**。

### 三重门禁（`shared-50-Bmc9oUMm.js` @104000-107000）

```js
var C_="en-US";
var w_=["en-US","de-DE","fr-FR","ko-KR","ja-JP","es-419","es-ES","it-IT","hi-IN","pt-BR","id-ID"];
function T_(e,t=w_){ ... }        // 门禁 1：白名单，无中文 → 返回 en-US
var M_=["en-US",...同 11 种...];  // 第二份副本，供 N_/L_ 使用

function E_(){                     // 门禁 2：catalog 元数据
  let e=[];
  try{ let t=document.querySelector('meta[name="i18n-catalogs"]')?.dataset.i18nCatalogs||"";
       for(let n of t.split(",")){ let m=/^([\w-]+):([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(n);
                                   m && e.push(m.slice(1)) } }catch{}
  return e;
}

function O_(){                     // 门禁 3：语言解析顺序
  let e=null; try{ e=localStorage.getItem("spa:locale") }catch{ e=null }
  if(!e) return T_(navigator.languages);        // 无 spa:locale → 白名单
  let t=e.toLowerCase();
  for(let [id] of E_()) if(id.toLowerCase()===t) return id;   // ← 命中 catalog 则直接返回
  return T_([e]);                                // 否则回落白名单 → 中文被拒
}

function k_(e){                    // 资源路径解析
  for(let [t,n,r,i] of E_()) if(t===e)
    return { base:`/i18n/${e}.json?v=${n}`, dynamic:`/i18n/dynamic/${e}.json?v=${r}`,
             overrides:`/i18n/${e}.overrides.json?v=${i}` };
  return { base:`/i18n/${e}.json`, dynamic:`/i18n/dynamic/${e}.json`,
           overrides:`/i18n/${e}.overrides.json` };
}
```

### 门禁 2 是死代码——这是一个可利用的缺口

`E_()` 读 `meta[name="i18n-catalogs"]`。本轮全量检索：

- `app.asar`（44,590,401 字节）内 `i18n-catalogs` / `i18nCatalogs`：**0 命中**；
- `ion-dist/` 下全部 3,413 个 `.js/.html/.json` 文件中，仅 `shared-50-Bmc9oUMm.js` 自身出现（即读取方）；
- `index.html` 及三个 frame HTML 中均无该 meta。

**即 `E_()` 恒返回 `[]`，catalog 机制在当前版本从未被激活。**

但这带来一个关键推论——看 `O_()` 的分支顺序：

```js
for(let [id] of E_()) if(id.toLowerCase()===t) return id;   // 优先返回 catalog 内的语言
return T_([e]);                                             // 才回落白名单
```

**若能让 `E_()` 返回含 `zh-Hans` 的目录，`O_()` 会在白名单之前直接返回 `zh-Hans`，完全绕过 `w_` 门禁。**

这意味着改造成本排序是：

- **比"改硬编码白名单"更小的改动**：只需注入 `i18n-catalogs` meta，不必动 bundle 里的 `w_` / `M_` 数组；
- 且注入 meta 不影响其他语言的既有行为。

### 层 C 需要补齐的四件东西

| # | 内容 | 位置 | 规模 |
| --- | --- | --- | --- |
| C-1 | `zh-Hans.json` 基础目录 | `ion-dist/i18n/` | 34,954 键 |
| C-2 | `zh-Hans.overrides.json` | `ion-dist/i18n/` | 参照 de-DE 的 150 键量级 |
| C-3 | `dynamic/zh-Hans.json` | `ion-dist/i18n/dynamic/` | 参照 de-DE 的 49 键量级 |
| C-4 | `i18n-catalogs` meta（含 zh-Hans 条目及三个版本号） | `index.html` | 1 处 |
| C-5 | `localStorage['spa:locale'] = 'zh-Hans'` | 用户级，非安装文件 | 1 个键 |

### 存量资产盘点

现有 `claude-N4tZS0` / `k8ZcOH` / `vsyg70` 候选目录中的 `frontend.zh-CN.json` 只有 64 条——这是设计时的存量，不是最终结果。最终译文与覆盖率见 §13.3 / §13.4（34,725 / 34,954 = 99.34%）。

---

## 五、修正后的验收路线

按**风险从低到高**排列。前两步零写入，能在不碰任何安装文件的前提下拿到真实证据。

### M0 — 确认层 B 现状（**零风险，不需要重启应用**）

- **目标**：确认层 B（主进程 intl）是否确实已在渲染中文。
- **方法**：**右键点击 Claude 的托盘图标**，看托盘菜单与窗口菜单栏的语言；以及触发一次原生对话框（如未保存提示、文件选择框）。这些 UI 属层 B。
- **注意**：不要看应用主窗口——主窗口内容属层 C，**无论层 B 是否生效，主窗口都必然是英文**。这正是此前误判"中文没生效"的原因。
- **产出**：层 B 现状结论 + 层 B 覆盖到的界面清单。
- **回退**：无需回退，本步不写入。
- 若层 B 已中文 → 层 B 完成，直接进 M1；若仍是英文 → 才需要走 M1 的程序化激活。

### M1 — 激活层 A（零写入）

- **层 A**：以 `--lang=zh-CN` 启动（`app/locales/zh-CN.pak` 已随包发布）。
- 需一个启动器或快捷方式；不改安装文件。
- **验收**：Chromium 内核层 UI（右键菜单、原生文件对话框、拼写检查菜单）为中文的截图 + 未覆盖清单。
- **回退**：去掉启动参数即可。

### M2 — 层 C 前端包（首个真实写入，需先具备备份/恢复）

**这是唯一真正需要动安装文件的一步，也是项目当前的第二个动作点。**

前置条件（缺一不可）：

1. 备份事务可用（备份目标文件的原始字节 + 哈希 + 期望恢复路径）；
2. 版本门禁可用（记录安装版本标识 `Claude_2.31226.1.0_x64__pzs8sxrjxfjjc`，版本变化则拒绝写入）；
3. 写入失败可完整回滚。

推进策略（用户已定）：**高频页面分批**，不追 34,954 全量。

- 第一批：设置页、会话操作、菜单等高频页面，数百条量级；
- 其余由 C1 的 DOM 层兜底；
- 产出 C-1..C-4 四件套 + C-5。
- **验收**：指定页面的中文截图、DOM 对照、输入框内容未被改写、恢复后与原始状态逐字节一致。

### M3 — 常态化

版本升级检测 → 标记待适配 → 恢复中心 → 页面级验收清单。

---

## 六、层 C 的注入方案选型（**需你决策**）

四类候选，按侵入性排序：

| 方案 | 做法 | 权限 | 可逆性 | 随更新存活 | 主要风险 |
| --- | --- | --- | --- | --- | --- |
| **C1 运行时注入** | 启动器带 `--remote-debugging-port`，注入 meta + `spa:locale`，DOM 层兜底未译条目 | 用户级 | 进程退出即恢复 | 否（依赖启动器） | 本地调试端口是**本地提权面**，必须绑 127.0.0.1、短生命周期、仅自用；覆盖不到 canvas / 原生菜单 |
| **C2 改前端资源** | 写 C-1..C-3 三个 JSON + 在 `index.html` 注入 meta | 需管理员 / 破 WindowsApps ACL | 备份后可行 | 否，更新后重打 | 动 WindowsApps 受保护目录；不动 asar、不动 exe；需完整备份 |
| **C3 改 asar** | 解包 → 改 bundle 或主进程 → 重打包 | 管理员 | 需完整备份 | 否 | **最高**：Windows 下破坏 exe 内嵌完整性哈希 → Authenticode 失效；Cowork 沙箱可能拒启（社区项目已记录 `RPC pipe closed`） |
| **C4 等官方** | 不自行注入，只做资源复用与等待 Anthropic 补齐 | — | — | 是 | 不可控 |

**推荐 C1 起步 → C2 固化。**

理由：

1. **C1 完全不碰安装目录**，符合"安全第一、可逆优先"；它是唯一能在 M2 阶段就拿到"真实页面中文截图"而不承担 WindowsApps 风险的方式；
2. C1 天然可做 **DOM 层兜底**，正好补 34,149 条未译键的缺口，是纯资源替换方案做不到的；
3. C1 的注入通道与诊断通道复用，顺带解决层 B 的 `requestLocaleChange` 调用问题；
4. 待 C1 验证译文质量达标后，再用 C2 固化，避免过早承担不可逆风险。

**C4 应作为长期基线**：层 A、B 已是官方半支持状态，Anthropic 补齐层 C 中文是大概率事件。自建方案必须设计成"官方支持一到就整体退场"，而不是与官方机制竞争。

---

## 七、必须守住的安全与隐私边界

1. **调试端口是本方案唯一的本地攻击面**。`--remote-debugging-port` 允许任意本地进程连接并执行渲染层代码。约束：只绑 `127.0.0.1`、启动器退出即关闭、不做常驻监听、不写入任何全局配置、不对外暴露。
2. **修改 WindowsApps 需要破 ACL，属高风险操作**。执行前必须有完整备份与逐字节恢复验证；不做全局 ACL 变更，只针对具体文件、操作后恢复。
3. **不修改 `Claude.exe`**。改 exe 会破坏嵌在 exe 内的 asar 完整性哈希，且 Cowork 沙箱可能直接拒启。
4. **不改签名、不关更新、不提权常驻**。
5. 层 C 的 34,954 键源文本是 Anthropic 的资源，纯自用可，**不得随发行包分发**。
6. 候选资源中的 `report.json`、审核草稿含用户审查标识，发布前须过滤。
7. `%APPDATA%\Claude\` 下含 `oauth:tokenCache`、`oauth:tokenCacheV2` 等凭据字段——**任何备份/导出流程必须显式排除该目录，或对凭据字段做屏蔽**。本轮只读取了 `locale` 键与键名列表，未导出任何凭据值。

---

## 八、对现有项目资产的影响

| 现有资产 | 新方案下的定位 |
| --- | --- |
| `scanner.mjs` / `scan-cli.mjs` | 保留。需扩展 `resources/` 目录的**枚举能力**（当前只按白名单读 3 个固定路径，无法列出 43 个语言文件） |
| `claude-candidate.mjs` | 保留但**范围要改**。桌面 801 键是层 B，已被官方 zh-Hans 覆盖 613 键；前端 34,954 键才是主战场，当前候选只覆盖 64 条 |
| `candidate-artifacts.mjs` | 保留。P0-01 的硬超时与目录总量约束仍需补 |
| `review-decisions.mjs` / 审核页 | 保留。34,954 键规模下必须上分页/虚拟化（P2-01 已提） |
| 10 个候选目录 / 6 个审核目录 | 建议按 P2-02 建立 artifact-index，标记 superseded，不删除 |
| 层 A / 层 B 激活 | **全新模块**。属"适配器"范畴，建议放 `project/backend/drivers/claude/` |

**新增能力需求（三项均已于 2026-10-14 实现，见第十一节）：**

1. `ion-dist/i18n/` 的多语言枚举与差异比对 → `resource-enum.mjs` + `locale-enum-cli.mjs`；
2. 版本门禁：绑定安装标识 + 关键文件哈希，版本变化即拒绝 → `install-identity.mjs`；
3. 备份/恢复事务（P0-04）→ `backup-transaction.mjs`，复用 `safe-io.mjs` 的受控 I/O。

---

## 九、已确认决策（2026-10-14）

| 问题 | 决定 |
| --- | --- |
| 首个可验收闭环 | **Claude 桌面汉化**（用户知情选择的高风险路径） |
| 分发定位 | **先纯自用**，暂不处理 GPL / EULA / 译文分发授权 |
| 译文来源 | **资源复用 + 术语库，暂不接翻译引擎** |
| 技术栈 | **Electron + React + TS，Windows 原生能力走 C# 辅助进程** |
| 层 C 注入方案 | **C1 起步 → C2 固化** |
| 前端 34,954 键策略 | **高频页面分批推进**，不追全量 |
| 第一个动作 | **M0 + M1 零写入激活验证** |
| 应用内语言选项 | **不存在**（用户确认）→ 层 B 无 UI 开关，回退只能改 `config.json` |

**待补充确认（下一次运行时）**：托盘/菜单栏的实际语言，用于判定层 B 是否已生效。

---

## 十、本轮边界

- 本轮只做**只读反查**：读取 `app.asar`（44.6 MB）关键片段、`resources/` 与 `ion-dist/` 目录清单与语言文件、`%APPDATA%\Claude\` 配置键名、日志目录。
- **未写入、未修改、未解包、未启动带调试参数的应用、未修改 ACL、未提交 git。**
- 未读取 `oauth:tokenCache` 等凭据值，仅确认其键名存在并据此提出排除要求。
- 反向工程结论绑定 **`Claude_2.31226.1.0_x64__pzs8sxrjxfjjc`** 这一个版本，不外推到其他版本。

---

## 十一、M2 前置实现结果（2026-10-14）

### 11.1 路径更正：资源不在包根下，而在包根的 `app/` 下

本文档前文凡写 `resources/...` 处，均**相对 Electron 应用根**，不是 WindowsApps 包根。实测：

| 写法 | 实际绝对路径 |
| --- | --- |
| 包根 | `C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc` |
| 应用根 | `<包根>\app`（含 `resources\app.asar`） |
| 层 B | `<包根>\app\resources\{locale}.json` |
| 层 C | `<包根>\app\resources\ion-dist\i18n\{locale}.json` |

包根下**没有** `resources\` 目录。此前扫描器把 `resources/app/package.json` 当相对包根拼路径，因此恒为 `missing`、`version` 恒为 `null`——曾被记为"未实现"，实为路径写错。现由 `scanner.mjs:locateAppRoot()` 下钻修正：只认 `app/resources/app.asar` 这一个标记，`app` 为链接时不下钻。

### 11.2 安装标识（`install-identity.mjs`）

`Claude_2.31226.1.0_x64__pzs8sxrjxfjjc` 实测：

| 项 | 值 |
| --- | --- |
| `packageName` / `packageVersion` / `architecture` | `Claude` / `2.31226.1.0` / `x64` |
| `resources/app.asar` | 44,590,401 字节 · `efa9e2310cf943b333b153c093babb8b5a92f80a23cb68764dba9b29a0801d4a` |
| `resources/en-US.json` | 56,092 字节 · `0f0c3e0e1f475c2be7e511774c51549d3202b7dee800e866d4f8095d71445e04` |
| `resources/zh-Hans.json` | 38,992 字节 · `3f3b81cbbb0021d74ff424dc516f0c37b79873065751c1e41415de3c1d686910` |
| `resources/ion-dist/i18n/en-US.json` | 2,473,175 字节 · `3e925e5de0075210c51d32050d2db1ea1468915ef5ffae421bb9e2041d83a27a` |
| `identitySha256` | `8d006bfef6c02b0141c57e30cba7b3daff75876e4af3fd188400b72cf9f5e49d` |

标识含包字段与关键文件哈希，**不含 `appRoot`**——绝对路径进哈希会让标识随安装位置漂移，同一版本在不同机器上就对不上了。关键文件刻意**不含** `ion-dist/i18n/zh-Hans.json`：那是本项目将来要写入的文件，若纳入标识，打一次补丁标识就变，恢复时反而认不出来。

### 11.3 层 C 实测（`resource-enum.mjs`）

| 事实 | 数值 |
| --- | --- |
| 层 B 语言数 | 43（含 `zh-Hans`、`zh-Hant`） |
| 层 C 语言数 | 11：`de-DE en-US es-419 es-ES fr-FR hi-IN id-ID it-IT ja-JP ko-KR pt-BR` |
| 基准 `en-US.json` | 34,954 键，其中 6 个带 `++` 前缀，值全为字符串 |
| 基准键集 SHA-256 | `d2b2de161124228ebda3de8c4906ea5d9ec0491150fae1253c8ebcc2cb5dcfa1` |
| 层 C 缺少的层 B 语言 | 32 个（含 `zh-Hans`、`zh-Hant`） |
| 各语言键集对齐度 | **全部 11 种均为 34,954 键，缺 0 多 0** |

三条结构性结论：

1. **层 C 的 11 种语言与层 B 代码里的 `lut` 白名单是同一份**（对比第 57–59 行的 `tut`）。也就是说"哪些语言被支持"是**一个产品级决定，同时管住 B 的自动检测和 C 的资源发布**。缺 `zh-Hans` 不是文件没拷进去，而是它不在这份名单里。
2. **键集跨语言完全稳定**。因此以 `en-US` 为基准生成的 zh-Hans 骨架，结构必然正确——不需要逐语言猜键。
3. `dynamic` 键集（49 个）与主键集**不相交**；`overrides` 是主键集的**子集**（各语言 52–519 键，作为订正层）。两者是不同用途，不能合并。

### 11.4 已产出的骨架候选

`project/frontend/candidates/claude-nPKgFO/`，经 `validateCandidateDirectory` 通过：

| 文件 | 字节 | 说明 |
| --- | --- | --- |
| `resources/ion-dist/i18n/zh-Hans.json` | 2,473,175 | 34,954 键，值与 en-US 逐字节同尺寸 |
| `resources/ion-dist/i18n/zh-Hans.overrides.json` | 3 | `{}`——订正层，起步为空 |
| `resources/ion-dist/i18n/dynamic/zh-Hans.json` | 2,523 | 49 键 |

`counts.translated` 恒为 0：**骨架只保证结构占位，值全是英文原文，一条都不算汉化**。格式与既有资源一致（2 空格缩进、LF、结尾换行、无 BOM）。

### 11.5 备份与恢复事务（`backup-transaction.mjs`）

`plan`（只读）→ `create`（暂存 + 自校验 + 同卷重命名）→ `verify`（逐字节）→ `restore-plan`（**只出计划，`executed` 恒为 false**）。

恢复门禁的判据是**备份之外的关键文件是否仍然原样**：目标文件此刻应当已是补丁后的值，与备份必然不同，所以只作为现值报告，不作为阻断条件。安装一旦被更新（如 `app.asar` 变化），恢复计划即拒绝并点名漂移文件。

已对真实安装跑通 `verify` 与 `restore-plan`（`allowed: true`）。**未向安装目录写入任何字节。**

### 11.6 尚未解决

1. `scanner.mjs` 的白名单仍无法枚举 `resources/*.json`（43 个）与 `ion-dist/i18n/`——枚举能力现由 `resource-enum.mjs` 提供，两处尚未合并。
2. `merge-review-cli.mjs:26` 仍是三读窗口（P0-02 残留）。
3. `review-decisions.mjs:16` 的 `load` 仍是裸 `readFile`，无大小上界。
4. 既有候选统一用 `zh-CN` 命名，而安装目录与 `config.json` 用 `zh-Hans`——两套命名并存，落盘前需统一。
5. ~~`resources/` 与 `ion-dist/` 的 ACL 是否允许写入**尚未实测**~~ —— **已由第十二节实测判定：不允许，C2 作废。**
6. 既有候选用 `zh-CN`、安装目录用 `zh-Hans` 的双命名问题（同第 4 条）尚未统一。

---

## 十二、C1 运行时注入：路线收敛与实现（2026-10-14）

### 12.1 C2 作废——ACL 实测

对 `app`、`app\resources`、`app\resources\ion-dist\i18n` 逐级读 ACL，三处完全一致：

```
BUILTIN\Users:(I)(OI)(CI)(R)
NT SERVICE\TrustedInstaller:(I)(OI)(CI)(F)
NT AUTHORITY\SYSTEM:(I)(OI)(CI)(F)
BUILTIN\Administrators:(I)(CI)(RX)
```

当前进程为普通用户身份，**未提权**。结论：

1. 写入安装树被 ACL 拒绝；
2. **即便提权也只能拿到 `RX`，仍然不能写**——只有 TrustedInstaller 与 SYSTEM 持有 `(F)`；
3. 真要写，得先 `takeown` 夺取所有权再 `icacls` 授权，即第七节第 2 条点名的高风险操作；
4. 且 MSIX 的修复/更新会**静默撤销**这种改动。

**所以 C2 不是"难"，是被设计挡住的。C1 运行时注入成为唯一可行路径**——这与第九节已定的"C1 起步 → C2 固化"一致，只是"固化"这一半需要重新定义：固化目标是**持久化启动器**，不是写安装目录。

本轮**未做写入探测**：往带签名的 MSIX 包里加文件可能触发完整性校验失败与自动修复，而 `icacls` 的输出已是充分证据，不必冒着损坏安装的风险去实证。

### 12.2 门禁代码复核——对第四节的两处更正

从 `app/resources/ion-dist/assets/v1/shared-50-Bmc9oUMm.js`（392,782 字符，全量检索中唯一含 `i18n-catalogs` 的文件）按字符偏移逐字取回，第四节转录有**两处不准确**：

| 项 | 第四节写法 | 实际源码 |
| --- | --- | --- |
| `O_()` 取值 | `localStorage.getItem`（未说明是否校验） | 直接 `localStorage.getItem(f_)`，**不走 `p_` 正则校验**；做校验的是 `m_()` |
| `spa:locale-source` | 未提及 | `h_="spa:locale-source"`、`g_="user_choice"`，`__()` 要求 `m_()!==undefined && getItem(h_)===g_` |

`O_()` 不校验形状这点很关键：**注入值只需让 `E_()` 命中即可**，不必通过 `p_` 的 `^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$`（`zh-Hans` 恰好也满足，但这不是注入成立的前提）。

`E_()` 另有 `if(typeof document<"u")` 守卫；`k_()` 未命中 catalog 时走 `encodeURIComponent` 且**不带 `?v=`**。

### 12.3 激活取证的补充结论：`spa:locale` 从未被写入

- `%APPDATA%\Claude\config.json` 的 `locale` 已是 `"zh-Hans"`（层 D 开着）；
- `Preferences.intl` 为 null，无 locale / lang 键；
- **Local Storage（`000005.ldb`、`000032.log`、`000034.ldb`）中检索不到 `spa:locale`**；
- `%APPDATA%\Claude\logs\` 为空，无日志证据。

即门禁 3 从未触发 → `O_()` 恒走 `T_(navigator.languages)`，而 `w_` 白名单无中文 → **层 C 必然是 `en-US`**。这解释了为什么"层 B 已生效"却看不到任何中文：**层 C 覆盖了绝大多数可见 UI，而它被白名单兜底到英文**。

### 12.4 实现（`cdp-session.mjs` + `inject-claude.mjs` + `inject-cli.mjs`）

零新增依赖：CDP 客户端用 Node 24 自带的全局 `WebSocket` 与 `fetch`。

| 门禁 | 绕过方式 |
| --- | --- |
| 门禁 2（catalog 元数据） | 预加载脚本改写 `Document.prototype.querySelector`：命中 `meta[name="i18n-catalogs"]` 且真实元素不存在时，返回 `{ dataset: { i18nCatalogs } }`。**不造真实 meta 元素**——预加载阶段 `document.head` 可能尚不存在，原型方法则已可用，与文档构建时序无关。应用自己若已发布该 meta 则一律让位。 |
| 门禁 3（`spa:locale`） | 预加载脚本顺手 `localStorage.setItem('spa:locale', 'zh-Hans')`。`O_()` 随即在 `E_()` 中命中 `zh-Hans`，**在白名单之前**返回，`w_` 门禁完全不被走到。 |
| 资源投递 | `Fetch.enable` + `Fetch.requestPaused` → `Fetch.fulfillRequest`，只拦目标语言的三个路径，其余原样 `continueRequest`。磁盘上不存在这些文件。 |

**刻意不做**：不设 `spa:locale-source`。`__()` 消费它，但语义未经验证，不擅自改变应用对"用户是否显式选择过语言"的判断——这是"最小侵入"的直接应用。

**修订号** `?v=` 取三份文件内容摘要的切片，任一文件改动即变，避免旧缓存掩盖新内容。

**资源来源**：三个文件**必须**经 `readCandidatePayload` 校验后才喂给应用——改过的候选在这里就该被拒绝。

**可逆性**：`apply` 前先快照用户级 locale 键值，`revert` 精确还原（不是清空）。注入注册（预加载脚本、Fetch 拦截）依附于 CDP 会话，**进程退出即全部撤销**，不写任何安装文件、asar、exe、签名或全局配置。

### 12.5 验证：真实 Chromium 上的端到端证据

用系统自带 Chrome 起 `--headless=new` + `--remote-debugging-port=0`（自选端口，避免冲突），加载**逐字复刻真实门禁**的 fixture，配一个只提供 en-US 的静态源——`zh-Hans` 在磁盘上根本不存在，**取到内容就只能是拦截应答**。

| 断言 | 结果 |
| --- | --- |
| 未注入：`O_()` = `en-US`，`E_()` = `[]`，`k_()` 无 `?v=`，内容来自服务端 | 通过 |
| 注入后：`O_()` = `zh-Hans`，`N_('zh-Hans')` = false（不在白名单内仍生效），三个 URL 均带 `?v=`，三份内容均为候选提供 | 通过 |
| 还原后：`O_()` 回 `en-US`，`E_()` 回 `[]`，内容回服务端 | 通过 |
| 注入前已有 `spa:locale="ja-JP"`：还原后回到 `ja-JP` 而非默认值 | 通过 |

测试数 89 → **98，全绿**。全程未接触真实 Claude 安装：不读其文件、不启动它、不写任何东西。

### 12.6 尚未验证 / 下一步

1. **未在真实 Claude Desktop 上跑过。** 端到端证据来自复刻门禁的 fixture；真实 bundle 的门禁函数已逐字核对一致，但真实应用的加载时序、CSP、`file://` 或自定义协议下的 `localStorage` 可用性均未实测。
2. ~~**必须由你启动应用**：加 `--remote-debugging-port` 需要重启 Claude Desktop，而当前会话就跑在它里面，我不能自己重启。~~ **已作废，见 12.9**：应用直接拒绝带调试开关启动，重启也没用。
3. **译文本身是真正的瓶颈**：34,954 键按高频页面分批。骨架候选值全是英文原文，导致「注入成功」与「注入失败」在界面上完全一样——这个可判定性缺陷已由探针候选 + 观测报告解决，见 12.8。但探针只回答「链路通没通」，`translated` 仍是 0。
4. `--lang=zh-CN`（层 A）与托盘/菜单栏（层 B）的现状仍未取证，属 M0/M1。
5. 双命名（`zh-CN` vs `zh-Hans`）未统一。
6. `scanner.mjs` 与 `resource-enum.mjs` 的枚举能力未合并。

### 12.7 自用操作顺序（需你执行）

> ⚠️ **本节已作废，见 12.9。** 该方案要求带 `--remote-debugging-port` 启动 Claude Desktop，而应用会直接拒绝启动（`refusing to start — a debugging or network-override switch is present`）。

### 12.8 可判定性修正：探针候选 + 观测报告

骨架候选的值全是英文原文，注入成功与失败在界面上完全一样。两条互补的修正：

- **观测报告（直接证据）。** 拦截范围从目标语言三个路径放宽到整个 `*/i18n/*`，记录应用实际请求了哪些 i18n 路径。请求路径只可能由 `k_(locale)` 产生，而 `k_` 的入参就是 `O_()` 的返回值——所以「应用请求了 `/i18n/zh-Hans.json`」本身即 `O_()` 返回了 `zh-Hans` 的直接证据，不依赖肉眼看界面。真正应答的仍只有计划里那三个路径。
- **探针候选（`probe` 动词）。** 结构同骨架，但给**疑似展示文本**加 `[ZH] ` 前缀（`PROBE_MARKER`），界面出现前缀即同时证明语言切了、值也确实来自本文件。判据保守：长度 2–120、不以 URL / 绝对路径 / `#` / `.` 开头、非纯数字与分隔符，且**含空格或以大写字母开头**——`asc`、`left`、`en-US`、`dark` 这类既无空格又小写开头的多半是枚举或路由，一律跳过，宁可漏标几个按钮也不改坏一处逻辑。实测真实安装 34,262 条里标记 30,615、跳过 3,647。

`counts.translated` 恒为 0：标记不是译文，只能证明链路，**不能当汉化成果**，也已在设计上不可安装（`installable: false`）。

### 12.9 C1 作废——调试开关黑名单实测

**这一节推翻 12.4–12.7 的前提。**

实测：带 `--remote-debugging-port=127.0.0.1:9222` 直接启动 `<app>\claude.exe`，进程 1 秒内退出，stderr 只有一行：

```
Claude: refusing to start — a debugging or network-override switch is present on the command line.
```

`app.asar` 主进程入口处的守卫：

```js
var VZ=["remote-debugging-port","remote-debugging-pipe","ignore-certificate-errors","host-resolver-rules","host-rules","disable-web-security","log-net-log","net-log-capture-mode","ssl-key-log-file","renderer-cmd-prefix","utility-cmd-prefix","gpu-launcher","zygote-cmd-prefix","ppapi-plugin-launcher","nacl-loader-cmd-prefix","browser-subprocess-path"];
function HZ(e){return e.replace(/^(?:--|-|\/)/,"").toLowerCase().split("=",1)[0]}
function UZ(e){return e.some(e=>{let t=HZ(e);return VZ.some(v=>t.startsWith(v))})}

if(UZ(process.argv)&&!QZ()){
  try{ p.default.writeSync(2,`Claude: refusing to start — a debugging or network-override switch is present on the command line.\n`) }catch{}
  process.exit(1)
}
```

`--remote-debugging-port` 是名单第一条。`--user-data-dir` **不在**名单里（`user-data-dir` 前缀不匹配任何一项），所以这次拒绝由调试端口触发，与隔离 profile 无关。

**逃生门是带令牌的。** `QZ()` 要求同时存在 `CLAUDE_CDP_AUTH` 与 `CLAUDE_USER_DATA_DIR`，令牌是 `${时间戳}.${base64(userData 路径)}.${校验段}` 三段式，且内嵌路径必须与 `CLAUDE_USER_DATA_DIR` 逐字相同。这是 Anthropic 自己留的正规调试通道，我们签不出令牌。其后 `qZ(process.env)` 还会把 `CLAUDE_USER_DATA_DIR`、`SSLKEYLOGFILE` 从环境里删掉——应用是刻意在防这条路。

**守卫有缺口，但不走。** `--inspect` 不在名单里（`inspect` 在 asar 中命中 0 次）。但用它拿到的是主进程任意代码执行，**权力比名单禁止的每一项都大**，正是仓库指令「不绕过安全策略」要拦的动作，所以不采纳、不建议。`--proxy-server` 同样不在名单里，但它拦不到应用自身的资源协议，指望不上。

**三道门，全部是设计挡的：**

| 路线 | 门 | 证据 |
| --- | --- | --- |
| C2 资源落盘 | 安装目录 ACL | `BUILTIN\Administrators:(I)(CI)(RX)`，提权也只读 |
| 第二实例 / 隔离 profile | 签名构建忽略自定义数据目录 | asar：`CLAUDE_USER_DATA_DIR is set and signed builds ignore it`，并 `delete e.CLAUDE_USER_DATA_DIR` |
| C1 运行时注入 | 命令行调试开关黑名单 + 令牌 | 本节实测与守卫代码 |

**附带更正：** 子进程命令行显示真实 userData 是 `%LOCALAPPDATA%\Claude-3p`，不是文档先前写的 `%APPDATA%\Claude`；Electron 44.4.3。

**所以层 C 目前没有合规落地路径。** 三道门禁（包里无 `zh-Hans`、`i18n-catalogs` meta 恒空、11 语言白名单无中文）唯一能被同时解决的杠杆是运行时注入，而它锁在令牌后面。12.4–12.6 的实现与验证代码本身仍然正确，将来若有通道打开可直接复用；但**首版闭环不能建在 12.7 那条路上**。

12.7 的操作顺序作废；调试端口不再是「唯一的本地攻击面」，而是压根不可用。第七节第 1 条的其余约束（不破坏签名、不关闭更新、不持久化提权、不绕过安全策略）继续成立。

---

## 十三、层 C 落地：可写副本通道（2026-10-14）

**这一节推翻 12.9 的结论「层 C 没有合规落地路径」。**

12.9 的推理成立，但前提被框窄了：三道门拦的都是**「改原安装 + 用原安装跑」**。
真正的杠杆不是撬锁，而是**换一把自己的锁** —— 复制整包到可写目录，让它以为自己是另一个用户。

### 13.1 通道三步

1. **整包复制**（`robocopy`，排除 `microsoft.system.package.metadata`）到 `%LOCALAPPDATA%\Claude-zh\package\`。
   复制出来的副本不再受 WindowsApps ACL 约束，三道门里的"安装目录只读"自动消失。
2. **重定向 `LOCALAPPDATA`** 启动，副本的日志与缓存落进副本目录。
   注意：重定向 `APPDATA` **无效** —— Win32 已知文件夹解析（known-folder）不走环境变量。
   先前文档里"重定向 APPDATA"的写法是错的。
3. **加 `--user-data-dir` 给副本一份专属 userData**（`profile\Claude\`）。
   这一步是并存运行的关键：Electron 在 Windows 上的 userData 落在 **`%APPDATA%\Claude`**
   （`appData` = Roaming），**不随 `LOCALAPPDATA` 重定向**，所以只做第 2 步的副本会和正式安装
   共用 userData，连带共用单实例锁 —— 正式版一开着，副本就打印
   `Not main instance, returning early from app ready` 然后静默退出。
   `CLAUDE_USER_DATA_DIR` 无效；`--user-data-dir` 有效且不在 asar 的命令行黑名单里。

**副产物与正式安装之间没有任何共享文件**：userData、缓存、配置、日志全在副本目录内，
`%APPDATA%\Claude` 与正式安装目录全程只读。代价是副本是全新环境，首次启动需在副本内登录一次。

### 13.2 层 C 内容落地的两件事

12.9 列的三道门禁，在副本里逐一解开：

| 门禁 | 副本里的解法 |
| --- | --- |
| 包里无 `zh-Hans` 目录 | 自己写 `ion-dist/i18n/zh-Hans.json`（34,954 键，与 en-US 键集逐键一致） |
| `i18n-catalogs` meta 恒空 | 4 个 HTML 注入 `data-i18n-catalogs="zh-Hans:..."`（逗号分隔、`locale:a.b.c` **四段**格式） |
| 11 语言白名单无中文 | `shared-50-Bmc9oUMm.js` 的两处数组补 `"zh-Hans"` |

**白名单的真实作用被澄清了**：`i18n-catalogs` meta 才是**主开关**（同时携带语言名与内容哈希）；
`w_`（模糊匹配）/ `M_`（严格校验）两个 11 语言数组只管**从 `navigator.languages` 自动探测**。
所以两者都要动，但 meta 是必要项。

补丁前原件按字节备份进副本的 `revert\`，产物写完做 `node --check` 语法校验。
补丁脚本对白名单锚点出现次数有断言（要求恰好 2 处），数目不符即拒绝安装而非猜着改。

### 13.3 译文来源与缺口

**译文表**：`installer/translations/zh-Hans.overrides.json` 共 **35,062** 条，只存 `{哈希键: 中文}`，
不含英文原文。其中 **34,725** 条命中当前官方基线 `en-US.json`（34,954 键），覆盖率 **99.34%**；
另 **337** 条是官方已删的旧键，不影响使用。
另有 16 个无许可来源实测只多 98 条，弃用（不背许可风险）。
命中率测量、多源冲突、许可细节见 `doc/现成包复用命中率.md`。

**仍缺 229 条**：全部是 URL / UUID / 标识符，判定为无需翻译，回落即得官方原文。

**结构校验**：逐条比对占位符签名 / HTML 标签 / printf 变量 / ICU 类型 / 首尾空白，
34,725 / 34,725 合规，0 错误。校验器遵循的一条硬性规则：

> **ICU 的 `=N` 精确匹配分支与 `one` 单复数分支性质不同，不可一并丢弃。**
> `{count, plural, =2 {Delete # sessions} other {Delete all # sessions}}`
> 若删掉 `=2`，选中 2 个会话时会显示"删除全部" —— 是会导致误操作的语义错误。

### 13.4 验收结果

```
总键          34954
最终覆盖      34725  = 99.34%   （译文表 35062 条 = 命中 34725 + 官方已删旧键 337）
仍缺          229    —— 全部是 URL / UUID / 标识符，无需翻译
```

那 229 条回落即得原文，内容完全一致 → **实际语义覆盖 100%**。

**装机验收**：装入副本重启，首屏**零英文回落**。截图 `doc/验收-沙箱中文界面.png`。
可见：新建／自定义／更多／最近、"你启动的会话将显示在这里"、"你来了！"、
"今天我能帮你做什么？"、默认模型、项目或文件夹、给你的建议及三条建议项。

**层 C 验收位置**：未登录时的**欢迎页**（"Claude for Windows / 与 Claude 对话的最快方式 / 开始使用"）
中文由**服务端**随 `locale` 本地化，**不是层 C 词典的产物**：删掉 `i18n/zh-Hans.json` 或往词典写唯一标记，
欢迎页都不变，且这些字符串在副本包内任何文件里都找不到。**故验收层 C 必须在副本登录后进主界面看**，
欢迎页/登录页不能作为层 C 的证据。

### 13.5 交付形态

`installer/` 是一键安装器，双击 `installer/安装.cmd` 即可：

1. 定位正式安装（`Get-AppxPackage`）并核对版本指纹；
2. 门禁：基线词典与 4 个 HTML 必须存在；语言白名单锚点必须**恰好 2 处**；
   译文覆盖率 ≥ 95%，否则拒绝安装（退出码 1）；
3. 复制副本（`robocopy`，staging → 校验 → rename）；
4. 打三处补丁，原件按字节备份进 `revert\`，`node --check` 验证产物语法；
5. 写副本自己的 `profile\Claude\config.json` 的 `locale`，旧值记进 `revert\config-locale.json`；
6. 生成 `启动.cmd`（`LOCALAPPDATA` 重定向 + `--user-data-dir`）与桌面／开始菜单快捷方式。

幂等：状态文件记 `{源指纹, 译文表哈希, 每个补丁产物的 sha256}`，全部吻合即 0 改动返回。
正式版升级后重跑一次即可；副本的 `profile\`（用户数据）不动。
还原：`node installer/install-cli.mjs restore`，或直接删除整个副本目录。

### 13.6 边界与残留风险

- **不改原安装**：正式安装目录与 `%APPDATA%\Claude\` 全程只读，安装器不写这两个位置，
  因此不需要复制、导出或触碰任何凭据。
- **不破坏签名、不关闭更新、不持久化提权、不带调试开关** —— 第七节约束全部成立。
  （这也意味着 12.4–12.6 的 C1 注入代码不再需要，但保留备用。）
- **副本不会自动更新**：包内无 `app-update.yml`，启动日志打印
  `[updater] App is not installed, not enabling auto-updates`，所以补丁不会被官方升级覆盖。
- **回滚路径完整**：`revert\` 下存有补丁前原文件。真正基线是未被动过的
  `i18n/en-US.json`，复制回去即完全还原。
- **层 C 源字符串是 Anthropic 的**，不随仓库分发。译文入库时只存**译文值与来源标注**，
  不含英文原文，并保留各家 MIT 版权声明。
- **未做**：跨源术语一致性审计（译文来自多个现成包与自译，用词可能按版本漂移、彼此不统一）。
- **已知残留**：`data-i18n-catalogs` 里的目录哈希是我方自造常量，语义未完全逆向；
  官方前端构建结构若变（白名单锚点不再是 2 处），安装器会拒绝安装而不是猜着改。
