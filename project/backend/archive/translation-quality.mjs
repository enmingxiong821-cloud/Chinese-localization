/** 保守校验：保护常见占位符、图标标识、HTML标签与换行；不替代语义审核。 */
function tokens(text) {
  return [...text.matchAll(/\{\{[^{}\r\n]+\}\}|\$\{[^{}\r\n]+\}|\{[\w.]+\}|%(?:\d+\$)?[-+#0 ]*\d*(?:\.\d+)?[sdifouxXeEgGc]|\$\([\w~-]+\)|<\/?[a-zA-Z][^>]*>|\\n|\n/g)].map(match => match[0]).sort();
}
export function validateTranslation(source, target) {
  if (typeof source !== 'string' || typeof target !== 'string' || !target.trim()) return { valid: false, reason: 'empty-or-invalid' };
  // ICU复数/选择表达式暂不自动处理，避免简单正则假装完整解析器。
  if (/\{[^{}]*,\s*(?:plural|select|selectordinal)\s*,/.test(source + target)) return { valid: false, reason: 'icu-review-required' };
  if (JSON.stringify(tokens(source)) !== JSON.stringify(tokens(target))) return { valid: false, reason: 'protected-token-mismatch' };
  if (target.length > Math.max(300, source.length * 4)) return { valid: false, reason: 'length-review-required' };
  return { valid: true, unchanged: source === target };
}
