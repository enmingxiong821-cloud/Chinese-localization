/** 审核页唯一内联脚本；由生成器计算CSP哈希，不从候选词条执行代码。 */
export const reviewClientScript = String.raw`(() => {
  'use strict';
  const main = document.querySelector('main[data-candidate-manifest-sha]');
  const rows = [...document.querySelectorAll('tr[data-review-id]')];
  const feedback = document.getElementById('review-feedback');
  const counter = document.getElementById('review-count');
  const search = document.getElementById('review-search');
  const filter = document.getElementById('review-filter');
  const importInput = document.getElementById('review-import');
  const allowed = new Set(['unreviewed', 'approved', 'rejected', 'deferred']);

  function message(text, failed = false) {
    feedback.textContent = text;
    feedback.dataset.error = String(failed);
  }
  function update() {
    const counts = { unreviewed: 0, approved: 0, rejected: 0, deferred: 0 };
    let visible = 0;
    for (const row of rows) {
      const decision = row.querySelector('select').value;
      counts[decision]++;
      const match = (filter.value === 'all' || filter.value === decision) &&
        (!search.value.trim() || (row.dataset.reviewKey + ' ' + row.dataset.reviewSource + ' ' + row.querySelector('textarea').value).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
      row.hidden = !match;
      if (match) visible++;
    }
    counter.textContent = '未审 ' + counts.unreviewed + ' · 通过 ' + counts.approved + ' · 拒绝 ' + counts.rejected + ' · 暂缓 ' + counts.deferred + ' · 当前显示 ' + visible;
  }
  function currentDraft() {
    return {
      schemaVersion: 1,
      app: main.dataset.app,
      candidateManifestSha256: main.dataset.candidateManifestSha,
      entries: rows.map(row => ({ id: row.dataset.reviewId, decision: row.querySelector('select').value, target: row.querySelector('textarea').value }))
    };
  }
  function restore(draft) {
    if (!draft || draft.schemaVersion !== 1 || draft.app !== main.dataset.app || draft.candidateManifestSha256 !== main.dataset.candidateManifestSha || !Array.isArray(draft.entries) || draft.entries.length !== rows.length) throw new Error('审核表与当前候选不匹配');
    for (let i = 0; i < rows.length; i++) {
      const item = draft.entries[i];
      if (!item || item.id !== rows[i].dataset.reviewId || !allowed.has(item.decision) || typeof item.target !== 'string' || item.target.length > 10000 || (item.decision === 'approved' && rows[i].dataset.canApprove !== 'true')) throw new Error('审核表第 ' + (i + 1) + ' 项不合法');
    }
    for (let i = 0; i < rows.length; i++) {
      rows[i].querySelector('textarea').value = draft.entries[i].target;
      rows[i].querySelector('select').value = draft.entries[i].decision;
    }
    update();
  }
  document.getElementById('review-export').addEventListener('click', () => {
    const serialized = JSON.stringify(currentDraft(), null, 2) + '\n';
    if (new Blob([serialized]).size > 8 * 1024 * 1024) { message('审核草稿超过 8 MiB，请分批审核。', true); return; }
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'review-' + main.dataset.app + '-' + main.dataset.candidateManifestSha.slice(0, 10) + '.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('审核草稿已导出；请使用校验命令检查，导出本身不代表通过。');
  });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('审核文件超过 8 MiB');
      restore(JSON.parse(await file.text()));
      message('草稿已导入；仍需使用校验命令检查决策和译文。');
    } catch (error) { message(error.message, true); }
    finally { importInput.value = ''; }
  });
  document.getElementById('review-import-button').addEventListener('click', () => importInput.click());
  search.addEventListener('input', update);
  filter.addEventListener('change', update);
  document.querySelectorAll('tbody').forEach(body => {
    body.addEventListener('change', event => {
      if (event.target.matches('select')) update();
    });
    body.addEventListener('input', event => {
      if (event.target.matches('textarea')) update();
    });
  });
  update();
})();`;
