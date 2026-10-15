/* 离线交互原型：所有应用、连接与翻译状态仅存在当前页面内存。
   历史设计资产：Cursor 与屏幕翻译已不在项目范围内（现只做 Claude Desktop 前端汉化）。 */
"use strict";
const APPS = [
  { id: "cursor", name: "Cursor", mark: "C", version: "演示版本 · VS Code 系", route: "语言包 + 专有界面词典", file: "演示语言包 / translations/main.i18n.json", description: "编辑器工作台、Agent 面板与应用设置", scopes: ["工作台菜单与通用设置", "Agent 面板与操作提示", "Cursor 专有设置"] },
  { id: "claude", name: "Claude", mark: "✳", version: "演示版本 · Electron", route: "语言资源 + 受控界面适配", file: "演示资源 / i18n/zh-CN.json", description: "桌面菜单、偏好设置与界面提示", scopes: ["桌面菜单与偏好设置", "会话操作与空状态", "在线界面（需独立适配）"] }
];
const state = { page: "apps", selected: "cursor", installed: new Set(), logs: [], terms: [
  { source: "Workspace", target: "工作区", scope: "通用" },
  { source: "Agent", target: "智能体", scope: "Cursor" },
  { source: "Artifacts", target: "作品", scope: "Claude" },
  { source: "Settings", target: "设置", scope: "通用" }
], connected: new Set(), running: false, original: false, mode: "overlay", target: "window", engine: "local", engineConfig: { endpoint: "", model: "" }, filter: "all", search: "", termSearch: "" };
const titles = { apps: "应用汉化", screen: "屏幕翻译", browser: "浏览器连接", terms: "术语库", engines: "翻译引擎", recovery: "恢复与诊断" };
const main = document.querySelector("main");
const modal = document.querySelector("#modal");
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const badge = (text, color = "") => `<span class="badge ${color}">${text}</span>`;
const heading = (title, subtitle, action = "") => `<div class="page-heading"><div><div class="subhead">PERSONAL WORKSPACE</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
let toastTimer;
function toast(text) {
  const node = document.querySelector("#toast");
  node.textContent = text;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 3500);
}
function openModal(title, body, actions = "") {
  document.querySelector("#modal-content").innerHTML = `<div class="dialog-head"><h2 id="modal-title">${title}</h2><button data-action="close">关闭</button></div><div class="dialog-body">${body}</div>${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`;
  modal.showModal();
}
function render() {
  document.querySelector("#breadcrumb").textContent = titles[state.page];
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === state.page);
    if (button.dataset.page === state.page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const views = { apps: appsView, screen: screenView, browser: browserView, terms: termsView, engines: enginesView, recovery: recoveryView };
  main.innerHTML = views[state.page]();
}
function appsView() {
  const app = APPS.find(item => item.id === state.selected);
  const installed = state.installed.has(app.id);
  const visible = APPS.filter(item => item.name.toLowerCase().includes(state.search.toLowerCase()) && (state.filter === "all" || state.installed.has(item.id)));
  return heading("让熟悉的工具，说中文。", "管理应用语言、预览汉化范围，随时回到原版。", '<button data-action="scan">重新扫描（演示）</button>') +
    `<div class="stats"><div class="stat"><small>演示应用</small><strong>02</strong><em>Cursor / Claude</em></div><div class="stat"><small>已模拟启用</small><strong>0${state.installed.size}</strong><em>不代表本机汉化状态</em></div><div class="stat"><small>目标语言</small><strong style="font:20px/2.15 inherit">简体中文</strong><em>zh-CN</em></div></div>
    <div class="toolbar"><div class="segmented"><button data-filter="all" class="${state.filter === "all" ? "selected" : ""}" aria-pressed="${state.filter === "all"}">全部应用</button><button data-filter="installed" class="${state.filter === "installed" ? "selected" : ""}" aria-pressed="${state.filter === "installed"}">已模拟启用</button></div><input id="app-search" aria-label="搜索应用" placeholder="搜索应用名称" value="${escapeHtml(state.search)}"></div>
    <div class="app-layout"><section class="app-list" aria-label="演示应用列表">${visible.length ? visible.map(item => `<button class="app-card ${item.id === app.id ? "chosen" : ""}" data-app="${item.id}" aria-pressed="${item.id === app.id}"><div class="app-top"><span class="app-monogram ${item.id}">${item.mark}</span><span class="app-name"><strong>${item.name}</strong><small>${item.version}</small></span>${badge(state.installed.has(item.id) ? "已模拟启用" : "待启用", state.installed.has(item.id) ? "" : "gray")}</div><p>${item.description}</p><div class="app-foot"><span>${item.route}</span><span>查看详情 →</span></div></button>`).join("") : '<div class="empty">没有匹配的演示应用</div>'}</section>
    <section class="detail" aria-label="应用详情"><div class="detail-header"><div><div class="subhead">APPLICATION PROFILE</div><h2>${app.name} 汉化方案</h2></div>${badge("演示适配", "blue")}</div><div class="detail-section"><h3>优先使用应用语言机制</h3><dl class="kv"><dt>适配方式</dt><dd>${app.route}</dd><dt>资源位置</dt><dd><code>${app.file}</code></dd><dt>备份策略</dt><dd>修改前校验 · 分版本恢复</dd></dl></div><div class="detail-section"><h3>计划覆盖范围</h3><ul class="scope-list">${app.scopes.map(text => `<li><span>${text}</span><span class="check">计划适配</span></li>`).join("")}<li><span>代码、路径与输入内容</span><span class="muted">保持原样</span></li></ul><div class="note">版本兼容性与覆盖率尚未实测。演示操作不会访问或修改真实应用。</div><div class="actions"><button class="primary" data-action="plan" ${installed ? "disabled" : ""}>${installed ? "已模拟启用" : "预览并启用中文"}</button><button data-action="sample">查看中英对照</button>${installed ? '<button data-action="restore-selected">模拟恢复</button>' : ""}</div></div></section></div>`;
}
function screenView() {
  const showTranslation = state.running && !state.original;
  const bilingual = showTranslation && state.mode === "bilingual";
  const label = (en, zh) => showTranslation && state.mode === "overlay" ? `<span class="translated">${zh}</span>` : `${en}${bilingual ? `<br><span class="translated">${zh}</span>` : ""}`;
  return heading("屏幕上的英文，就地读懂。", "选择演示窗口或区域，切换译文的显示方式。", badge(state.running ? "演示运行中" : "演示已暂停", state.running ? "" : "gray")) +
    `<div class="columns"><section><div class="actions"><label>翻译范围<select id="capture-target"><option value="window" ${state.target === "window" ? "selected" : ""}>指定窗口</option><option value="region" ${state.target === "region" ? "selected" : ""}>指定区域</option><option value="screen" ${state.target === "screen" ? "selected" : ""}>当前整屏</option></select></label><button data-action="choose-target">选择演示目标</button></div><div class="preview" role="img" aria-label="开发软件设置界面的文字翻译演示"><div class="preview-bar"><span>DEMO / Editor Settings</span><span>演示画面 · 非真实截图</span></div><div class="preview-content"><div class="preview-nav"><span>${label("General", "常规")}</span><span>${label("Models", "模型")}</span><span>${label("Privacy", "隐私")}</span></div><div class="preview-body"><h3>${label("Workspace Settings", "工作区设置")}</h3><p>${label("Manage your editor preferences.", "管理编辑器偏好设置。")}</p><div class="preview-row"><span>${label("Enable notifications", "启用通知")}</span><span class="preview-switch"></span></div><div class="preview-row"><span>${label("Save changes", "保存更改")}</span><span>Ctrl + S</span></div><div class="preview-row"><span>${label("API key", "API 密钥")}</span><code>••••••••</code></div></div></div></div>${showTranslation && state.mode === "sidebar" ? '<aside class="translation-side"><strong>双语侧栏</strong><p>Workspace Settings → 工作区设置</p><p>Enable notifications → 启用通知</p><p>Save changes → 保存更改</p></aside>' : ""}<div class="status-line"><span>当前目标：${{ window: "演示编辑器窗口", region: "演示设置区域", screen: "演示桌面画面" }[state.target]}</span><span>${state.running ? "仅在演示画面显示译文" : "等待开始"}</span></div><div class="actions"><button class="primary" data-action="toggle-screen">${state.running ? "暂停演示翻译" : "开始演示翻译"}</button><button data-action="toggle-original" ${!state.running ? "disabled" : ""}>${state.original ? "返回译文" : "查看原文"}</button><button data-action="correct">纠正译文</button></div></section><aside class="surface"><h2>显示与隐私</h2><div class="form-grid" style="margin-top:20px"><label>译文显示<select id="display-mode"><option value="overlay" ${state.mode === "overlay" ? "selected" : ""}>原位覆盖</option><option value="bilingual" ${state.mode === "bilingual" ? "selected" : ""}>中英双语</option><option value="sidebar" ${state.mode === "sidebar" ? "selected" : ""}>双语侧栏</option></select></label><label class="inline-check"><input type="checkbox" checked disabled>不保存屏幕截图（原型固定）</label><label class="inline-check"><input type="checkbox" checked disabled>不发送到云端（原型固定）</label></div><div class="note">原型不申请屏幕权限，也不执行 OCR。识别、速度及全屏兼容性待正式模块实测。</div></aside></div>`;
}
function browserView() {
  return heading("网页与桌面，共用你的译法。", "连接流程演示，插件尚未安装或开发。") + `<div class="surface">${["Edge", "Chrome"].map(name => `<div class="browser-row"><div class="browser-logo" aria-hidden="true">${name[0]}</div><div class="body"><h3>Microsoft ${name === "Edge" ? "Edge" : ""}${name === "Chrome" ? "Google Chrome" : ""}</h3><small>网页双语翻译 · 共享术语</small></div>${badge(state.connected.has(name) ? "已模拟连接" : "未连接", state.connected.has(name) ? "" : "gray")}<button data-browser="${name}">${state.connected.has(name) ? "断开演示连接" : "模拟配对"}</button></div>`).join("")}</div><div class="flow"><span>安装插件</span><span>用户确认配对</span><span>授权所需站点</span><span>同步术语</span></div><div class="note">只共享明确选择的资源。浏览器页面不能调用应用文件修改接口。</div><button data-action="browser-preview">预览网页双语效果</button>`;
}
function termsView() {
  const terms = state.terms.map((term, index) => ({ ...term, index })).filter(term => `${term.source} ${term.target} ${term.scope}`.toLowerCase().includes(state.termSearch.toLowerCase()));
  return heading("同一个语境，保持同一种译法。", "演示术语仅保留在当前页面，刷新后重置。", '<div class="actions"><button data-action="export-terms">导出 JSON</button><button class="primary" data-action="add-term">添加术语</button></div>') + `<div class="toolbar"><input id="term-search" aria-label="搜索术语" placeholder="搜索原文、译文或应用" value="${escapeHtml(state.termSearch)}"><span class="muted">${terms.length} 条匹配</span></div><div class="table-wrap"><table><thead><tr><th>原文</th><th>简体中文</th><th>适用范围</th><th>操作</th></tr></thead><tbody>${terms.map(term => `<tr><td>${escapeHtml(term.source)}</td><td>${escapeHtml(term.target)}</td><td>${escapeHtml(term.scope)}</td><td><div class="actions"><button data-edit="${term.index}">编辑</button><button data-delete="${term.index}">删除</button></div></td></tr>`).join("") || '<tr><td colspan="4" class="empty">没有匹配的术语</td></tr>'}</tbody></table></div>`;
}
function enginesView() {
  return heading("翻译引擎，由你决定。", "配置表单演示，不发送请求、不存储真实密钥。") + `<div class="engine-choice"><button data-engine="local" class="${state.engine === "local" ? "selected" : ""}" aria-pressed="${state.engine === "local"}"><strong>本地离线</strong><small>模型未接入 · 演示</small></button><button data-engine="cloud" class="${state.engine === "cloud" ? "selected" : ""}" aria-pressed="${state.engine === "cloud"}"><strong>自带云端服务</strong><small>OpenAI 兼容接口 · 演示</small></button></div><section class="surface"><form id="engine-form" class="form-grid">${state.engine === "local" ? '<h2>本地模型</h2><label>演示模型<select name="local-model"><option>离线翻译模型（尚未下载）</option></select></label><div class="note">未安装本地模型。硬件需求和实际效果将随组件选型验证。</div>' : `<h2>云端接口配置</h2><label>服务地址<input name="endpoint" type="url" required placeholder="https://api.example.com/v1" value="${escapeHtml(state.engineConfig.endpoint)}"></label><label>模型名称<input name="model" required maxlength="100" placeholder="填写模型名称" value="${escapeHtml(state.engineConfig.model)}"></label><div class="note warning">原型不收集 API 密钥。此表单只校验地址与名称，不进行连通性测试。</div>`}<p id="engine-error" class="field-error" role="alert"></p><div class="actions"><button class="primary" type="submit">校验演示配置</button></div></form></section>`;
}
function recoveryView() {
  return heading("每一次改动，都有退路。", "这里只记录本次页面中的模拟操作，不存在真实文件备份。", '<button data-action="export-diagnostics">导出演示诊断</button>') + `<section class="surface"><h2>模拟操作记录</h2>${state.logs.length ? state.logs.map(log => `<div class="log-item"><div><strong>${escapeHtml(log.name)} · ${log.action === "apply" ? "模拟汉化" : "模拟恢复"}</strong><p>${escapeHtml(log.time)} · 仅页面内存记录</p></div>${badge("演示完成", "gray")}</div>`).join("") : '<div class="empty">暂无记录。先在应用中心体验汉化预览。</div>'}</section><div class="note warning">真实恢复必须核对应用版本与文件指纹。此原型不能用于恢复本机软件。</div><div class="actions">${APPS.filter(app => state.installed.has(app.id)).map(app => `<button data-restore="${app.id}">模拟恢复 ${app.name}</button>`).join("")}</div>`;
}
function plan() {
  const app = APPS.find(item => item.id === state.selected);
  if (state.installed.has(app.id)) return;
  openModal(`${app.name} · 汉化预览`, `<p>将模拟以下流程，不修改本机文件。</p><ol><li>校验演示版本与适配规则</li><li>建立演示备份记录</li><li>加载简体中文资源</li><li>检查演示状态</li></ol><div class="note">代码、路径和用户输入保持原样。覆盖范围不代表实际适配结果。</div><label class="inline-check"><input id="confirm-demo" type="checkbox">我了解这是模拟操作</label><div id="apply-progress" aria-live="polite"></div>`, '<button data-action="close">取消</button><button class="primary" id="apply-demo" data-action="apply" disabled>模拟备份并启用</button>');
}
function addLog(app, action) {
  state.logs.unshift({ name: app.name, action, time: new Date().toLocaleString("zh-CN") });
}
async function applyDemo() {
  const button = document.querySelector("#apply-demo");
  if (!document.querySelector("#confirm-demo")?.checked || button.disabled) return;
  const app = APPS.find(item => item.id === state.selected);
  button.disabled = true;
  document.querySelector("#confirm-demo").disabled = true;
  document.querySelector("#apply-progress").innerHTML = '<div class="progress"><i style="width:40%"></i></div><p>正在模拟备份与校验…</p>';
  await new Promise(resolve => setTimeout(resolve, 450));
  state.installed.add(app.id);
  addLog(app, "apply");
  modal.close();
  render();
  toast(`${app.name} 已模拟启用中文；真实应用未修改`);
}
function restore(id) {
  const app = APPS.find(item => item.id === id);
  if (!app || !state.installed.has(id)) return;
  openModal(`模拟恢复 ${app.name}`, '<p>将清除当前页面中的模拟启用状态，并增加恢复记录。</p><p class="muted">没有真实备份或文件需要恢复。</p>', `<button data-action="close">取消</button><button class="primary" data-confirm-restore="${id}">确认模拟恢复</button>`);
}
function editTerm(index = -1, seed) {
  const term = seed || state.terms[index] || { source: "", target: "", scope: "通用" };
  openModal(index < 0 ? "添加术语" : "编辑术语", `<form id="term-form" data-index="${index}" class="form-grid"><label>原文<input name="source" required maxlength="120" value="${escapeHtml(term.source)}" autofocus></label><label>简体中文<input name="target" required maxlength="120" value="${escapeHtml(term.target)}"></label><label>适用范围<select name="scope">${["通用", "Cursor", "Claude"].map(scope => `<option ${term.scope === scope ? "selected" : ""}>${scope}</option>`).join("")}</select></label><p id="term-error" class="field-error" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close">取消</button><button class="primary" type="submit">保存术语</button></div></form>`);
}
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已生成下载文件");
}
document.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const data = button.dataset;
  if (data.page) { state.page = data.page; render(); return; }
  if (data.app) { state.selected = data.app; render(); return; }
  if (data.filter) { state.filter = data.filter; render(); return; }
  if (data.engine) { state.engine = data.engine; render(); return; }
  if (data.edit !== undefined) { editTerm(Number(data.edit)); return; }
  if (data.delete !== undefined) {
    const index = Number(data.delete);
    openModal("删除演示术语", `<p>确定删除「${escapeHtml(state.terms[index].source)}」？</p>`, `<button data-action="close">取消</button><button data-confirm-delete="${index}">确认删除</button>`); return;
  }
  if (data.confirmDelete !== undefined) { state.terms.splice(Number(data.confirmDelete), 1); modal.close(); render(); toast("术语已删除"); return; }
  if (data.restore) { restore(data.restore); return; }
  if (data.confirmRestore) {
    const app = APPS.find(item => item.id === data.confirmRestore);
    if (app && state.installed.delete(app.id)) addLog(app, "restore");
    modal.close(); render(); toast("模拟恢复完成；真实应用未修改"); return;
  }
  if (data.browser) {
    const name = data.browser;
    if (state.connected.has(name)) { state.connected.delete(name); render(); toast("演示连接已断开"); }
    else openModal(`${name} · 模拟配对`, '<p>演示配对码</p><h2 style="font-family:Consolas">482 916</h2><div class="note">这是固定演示码，不代表真实插件连接。</div><p>选择确认后，仅改变本页面连接状态。</p>', `<button data-action="close">取消</button><button class="primary" data-confirm-pair="${name}">确认模拟配对</button>`);
    return;
  }
  if (data.confirmPair) { state.connected.add(data.confirmPair); modal.close(); render(); toast("已模拟配对，未连接真实插件"); return; }
  const actions = {
    close: () => modal.close(),
    about: () => openModal("译界 · 交互原型", '<p>产品名为暂定名称。所有应用、翻译与配对均为演示。</p><p>数据仅保留在本页面内存，刷新后重置；术语与诊断可主动导出。</p>'),
    scan: () => toast("演示扫描完成：2 个样例应用；未读取本机安装列表"),
    plan,
    apply: applyDemo,
    sample: () => openModal("界面中英对照", '<div class="table-wrap"><table><thead><tr><th>原文</th><th>简体中文</th></tr></thead><tbody><tr><td>Settings</td><td>设置</td></tr><tr><td>New chat</td><td>新建对话</td></tr><tr><td>Workspace</td><td>工作区</td></tr><tr><td>Save changes</td><td>保存更改</td></tr></tbody></table></div><p class="muted">仅供预览，不代表实际应用词表覆盖。</p>'),
    "restore-selected": () => restore(state.selected),
    "choose-target": () => openModal("选择演示目标", '<p>仅可选择原型内的样例，不获取真实窗口或屏幕。</p>', '<button data-target="window">编辑器窗口</button><button data-target="region">设置区域</button><button data-target="screen">桌面画面</button>'),
    "toggle-screen": () => { state.running = !state.running; state.original = false; render(); },
    "toggle-original": () => { state.original = !state.original; render(); },
    correct: () => editTerm(-1, { source: "Enable notifications", target: "启用通知", scope: "通用" }),
    "browser-preview": () => openModal("网页双语预览", '<div class="subhead">DOCUMENTATION / DEMO</div><h2>Build with confidence</h2><p class="translated" style="color:#136b58">更从容地构建应用</p><p>Configure your workspace before getting started.</p><div class="note">开始之前，请先配置工作区。</div>'),
    "add-term": () => editTerm(),
    "export-terms": () => download("terms-demo.json", { demo: true, terms: state.terms }),
    "export-diagnostics": () => download("diagnostics-demo.json", { demo: true, realApplicationAccess: false, logs: state.logs, connected: [...state.connected] })
  };
  if (data.target) { state.target = data.target; modal.close(); render(); return; }
  actions[data.action]?.();
});
document.addEventListener("change", event => {
  if (event.target.id === "confirm-demo") document.querySelector("#apply-demo").disabled = !event.target.checked;
  if (event.target.id === "display-mode") { state.mode = event.target.value; render(); }
  if (event.target.id === "capture-target") { state.target = event.target.value; render(); }
});
document.addEventListener("input", event => {
  const key = event.target.id === "app-search" ? "search" : event.target.id === "term-search" ? "termSearch" : null;
  if (!key) return;
  const id = event.target.id;
  const position = event.target.selectionStart;
  state[key] = event.target.value;
  render();
  const input = document.getElementById(id);
  input.focus();
  input.setSelectionRange(position, position);
});
document.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "term-form") {
    const index = Number(form.dataset.index);
    const values = new FormData(form);
    const term = { source: values.get("source").trim(), target: values.get("target").trim(), scope: values.get("scope") };
    const error = document.querySelector("#term-error");
    if (!term.source || !term.target) { error.textContent = "原文和译文不能只包含空格。"; return; }
    if (state.terms.some((item, i) => i !== index && item.source.toLowerCase() === term.source.toLowerCase() && item.scope === term.scope)) { error.textContent = "相同范围已存在该原文，请编辑已有术语。"; return; }
    if (index >= 0) state.terms[index] = term; else state.terms.push(term);
    modal.close(); render(); toast("术语已保存到本次演示");
  }
  if (form.id === "engine-form") {
    if (state.engine === "cloud") {
      const values = new FormData(form);
      const endpoint = values.get("endpoint").trim();
      const model = values.get("model").trim();
      let valid = false;
      try { const url = new URL(endpoint); valid = url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { /* 表单内显示地址错误。 */ }
      if (!valid || !model) { document.querySelector("#engine-error").textContent = "请填写无内嵌凭据的 HTTPS 地址和非空模型名。"; return; }
      state.engineConfig = { endpoint, model };
    }
    document.querySelector("#engine-error").textContent = "";
    toast("演示配置校验通过；未测试连接、未下载模型");
  }
});
render();
