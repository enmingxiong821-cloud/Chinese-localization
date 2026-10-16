/**
 * 诊断：官方自带的各语言词典与 en-US 的键集是否对齐。
 *
 * 用法：node project/tools/check-parity.mjs
 *
 * 用途是回答「能不能拿 en-US.json 当底座补一份 zh-Hans.json」。结论：
 * 官方除 en-US 外的各语言都缺几十个键，键集**从来不完全一致**，缺键是常态；
 * en-US 是超集，所以拿它当底座做出来的 zh-Hans.json 只会多键，前端不判错。
 * 官方升级后若这个结论变了（比如某语言反而多键），才需要重新评估。
 */
import fs from 'node:fs';
import path from 'node:path';
import { locateOfficialPackage } from '../../installer/install-plan.mjs';

const appRoot = path.join(locateOfficialPackage().packageRoot, 'app');
const dir = path.join(appRoot, 'resources', 'ion-dist', 'i18n');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en-US.json'), 'utf8'));
const enKeys = new Set(Object.keys(en));
console.log(`en-US ${enKeys.size} 键；目录内 ${files.length} 份 json`);

for (const file of files) {
  if (file === 'en-US.json') continue;
  const o = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const keys = Object.keys(o);
  const missing = [...enKeys].filter(key => !(key in o)).length;
  const extra = keys.filter(key => !enKeys.has(key)).length;
  const flag = missing === 0 && extra === 0 ? '一致' : `缺 ${missing} 多 ${extra}`;
  console.log(`  ${file.padEnd(18)} ${String(keys.length).padStart(6)}  ${flag}`);
}

const dynDir = path.join(dir, 'dynamic');
const dynFiles = fs.readdirSync(dynDir).filter(f => f.endsWith('.json')).sort();
const enDyn = JSON.parse(fs.readFileSync(path.join(dynDir, 'en-US.json'), 'utf8'));
console.log(`\ndynamic: en-US ${Object.keys(enDyn).length} 键；共 ${dynFiles.length} 份`);
for (const file of dynFiles) {
  const o = JSON.parse(fs.readFileSync(path.join(dynDir, file), 'utf8'));
  const n = Object.keys(o).length;
  console.log(`  ${file.padEnd(18)} ${String(n).padStart(4)}  ${n === Object.keys(enDyn).length ? '一致' : '不一致'}`);
}
