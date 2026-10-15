/** Claude首批候选资源：只匹配明确短文案，不进行全文件字符串替换。 */
import { locateAppRoot, readResourceSet } from '../scanner.mjs';
import { validateTranslation } from './translation-quality.mjs';

// 本项目编写的起始译法；英文相同的不同语境仍需页面审核。
const terms = new Map(Object.entries({
  'Settings': '设置', 'Preferences': '偏好设置', 'General': '常规',
  'Appearance': '外观', 'Account': '账户', 'Language': '语言',
  'Notifications': '通知', 'New chat': '新建对话', 'Copy': '复制',
  'Cancel': '取消', 'Save': '保存', 'Delete': '删除', 'Rename': '重命名',
  'Search': '搜索', 'Help': '帮助', 'About': '关于', 'Quit': '退出',
  'Close': '关闭', 'Open': '打开', 'Sign out': '退出登录', 'Retry': '重试',
  'Continue': '继续', 'Back': '返回', 'Done': '完成', 'Edit': '编辑',
  'Share': '分享', 'Export': '导出'
}));

export function composeClaudeResource(source, native = {}) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) throw new Error('语言资源必须是键值对象');
  if (native === null || typeof native !== 'object' || Array.isArray(native)) throw new Error('原生中文必须是键值对象');
  const translation = Object.create(null);
  const review = [];
  const counts = { total: 0, matched: 0, unchanged: 0, nonString: 0 };
  const provenance = { nativeAccepted: 0, nativeRejected: 0, nativeUnchanged: 0, glossaryAccepted: 0 };
  const issues = [];
  for (const [key, text] of Object.entries(source)) {
    counts.total++;
    if (typeof text !== 'string') {
      counts.nonString++;
      throw new Error('资源含非字符串值，停止生成');
    }
    let target;
    let origin = 'starter-glossary';
    if (Object.hasOwn(native, key)) {
      const quality = validateTranslation(text, native[key]);
      if (quality.valid && !quality.unchanged) {
        target = native[key];
        origin = 'bundled-zh-Hans';
      } else if (quality.valid) provenance.nativeUnchanged++;
      else {
        provenance.nativeRejected++;
        issues.push({ key, reason: quality.reason, origin: 'bundled-zh-Hans' });
      }
    }
    target ??= terms.get(text);
    if (target !== undefined && validateTranslation(text, target).valid) {
      translation[key] = target;
      counts.matched++;
      if (origin === 'bundled-zh-Hans') provenance.nativeAccepted++;
      else provenance.glossaryAccepted++;
      review.push({ key, source: text, target, origin, status: 'page-review-required' });
    } else {
      // 输出完整键表保留原文，单独统计，不能计为汉化。
      translation[key] = text;
      counts.unchanged++;
    }
  }
  return { translation, review, counts, provenance, issues };
}

export async function buildClaudeCandidate(root) {
  const appRoot = await locateAppRoot(root);
  const paths = ['resources/en-US.json', 'resources/ion-dist/i18n/en-US.json'];
  const files = await readResourceSet(appRoot, paths);
  if (files.some(file => file.status !== 'read')) throw new Error('语言资源读取不完整');
  const [native] = await readResourceSet(appRoot, ['resources/zh-Hans.json']);
  if (!['read', 'missing'].includes(native.status)) throw new Error('原生中文资源存在但不可用，停止生成');
  return {
    status: 'candidate-not-install-verified',
    nativeResource: { path: native.path, status: native.status, sha256: native.sha256 },
    resources: files.map((file, index) => {
      const built = composeClaudeResource(file.json, index === 0 && native.status === 'read' ? native.json : {});
      const missingNative = index === 0 && native.status === 'read'
        ? Object.entries(file.json).filter(([key]) => !Object.hasOwn(native.json, key)).map(([key, source]) => ({ key, source }))
        : [];
      return { sourcePath: file.path, sha256: file.sha256, bytes: file.bytes, ...built, missingNative };
    }),
    notes: ['所有候选译文需要页面语境审核。', '原文保留项不计入汉化数量。', '未修改locale、语言白名单、asar、签名或安装文件。']
  };
}
