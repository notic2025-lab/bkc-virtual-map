// ============================================================
// マップデータ検証ツール（デプロイ前チェック）
//   使い方: node tools/validate-data.mjs
//   - 通路グラフの連結性（正門から全ノードへ到達できるか）
//   - 全建物・施設の entry ノードが存在するか
//   - カテゴリ・ID重複・必須フィールドの検証
//   測量データ（survey-data.js）をマージした後の最終状態を検証するため、
//   survey-data.js を更新して push する前にも必ず実行すること。
// ============================================================
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { FLOORS, FLOOR_ORDER, SHOPS, PLACES, CATEGORIES } = await import(join(root, 'js/data.js'));

let errors = 0;
const fail = (msg) => { console.error('✗ ' + msg); errors++; };

const fl = FLOORS.campus;
const nodes = fl.navNodes;

// 1. エッジの両端ノードが存在するか
for (const [a, b] of fl.navEdges) {
  for (const n of [a, b]) if (!nodes[n]) fail(`edge node missing: ${n}`);
}

// 2. グラフ連結性（正門 GM から全ノードへ到達できるか）
const adj = {};
for (const [a, b] of fl.navEdges) { (adj[a] ??= []).push(b); (adj[b] ??= []).push(a); }
const start = nodes.GM ? 'GM' : Object.keys(nodes)[0];
const seen = new Set([start]);
const queue = [start];
while (queue.length) {
  const cur = queue.pop();
  for (const n of adj[cur] ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
}
for (const n of Object.keys(nodes)) if (!seen.has(n)) fail(`node unreachable from ${start}: ${n}`);

// 3. SHOPS / PLACES の entry・cat・floor・必須項目
for (const s of SHOPS) {
  if (!nodes[s.entry]) fail(`shop entry missing: ${s.id} -> ${s.entry}`);
  if (!CATEGORIES[s.cat]) fail(`shop cat invalid: ${s.id} -> ${s.cat}`);
  if (s.floor !== 'campus') fail(`shop floor invalid: ${s.id}`);
  if (!s.desc || !s.name) fail(`shop missing name/desc: ${s.id}`);
  if (!Number.isFinite(s.pin?.left) || !Number.isFinite(s.pin?.top)) fail(`shop pin invalid: ${s.id}`);
}
const ids = new Set();
for (const s of [...SHOPS, ...PLACES]) {
  if (ids.has(s.id)) fail(`duplicate id: ${s.id}`);
  ids.add(s.id);
}
for (const p of PLACES) if (!nodes[p.entry]) fail(`place entry missing: ${p.id} -> ${p.entry}`);
for (const need of ['gate-main', 'gate-east', 'bus', 'plaza']) {
  if (!PLACES.find(p => p.id === need)) fail(`required place missing: ${need}`);
}

console.log(`buildings: ${SHOPS.length}, nodes: ${Object.keys(nodes).length}, edges: ${fl.navEdges.length}, floors: ${FLOOR_ORDER.length}`);
console.log(errors === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${errors} error(s)`);
process.exit(errors ? 1 : 0);
