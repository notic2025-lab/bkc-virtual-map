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
const { SURVEY } = await import(join(root, 'js/survey-data.js'));
const { surveyProgress } = await import(join(root, 'js/survey-planner.js'));

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

// 4. 現地名称監査・生GPSログの形式
if (!Number.isInteger(SURVEY.version) || SURVEY.version < 3) fail('survey version must be 3 or newer');
if (SURVEY.geo != null) {
  if (!Number.isFinite(SURVEY.geo.lat0) || SURVEY.geo.lat0 < 34.9 || SURVEY.geo.lat0 > 35.1) fail('survey geo.lat0 invalid');
  if (!Number.isFinite(SURVEY.geo.lng0) || SURVEY.geo.lng0 < 135.8 || SURVEY.geo.lng0 > 136.1) fail('survey geo.lng0 invalid');
  if (!Number.isFinite(SURVEY.geo.rotationDeg) || Math.abs(SURVEY.geo.rotationDeg) > 180) fail('survey geo.rotationDeg invalid');
  if (!Number.isFinite(SURVEY.geo.meterPerUnit) || SURVEY.geo.meterPerUnit < 1 || SURVEY.geo.meterPerUnit > 20) fail('survey geo.meterPerUnit invalid');
}
const knownShopIds = new Set(SHOPS.map(s => s.id));
for (const [id, audit] of Object.entries(SURVEY.audits ?? {})) {
  if (!knownShopIds.has(id)) fail(`audit shop unknown: ${id}`);
  if (!['ok', 'corrected', 'unconfirmed', 'not-found'].includes(audit?.status)) fail(`audit status invalid: ${id}`);
  if (audit?.status === 'corrected' && !audit.observedName?.trim()) fail(`corrected audit missing observedName: ${id}`);
  if (typeof audit?.observedName === 'string' && audit.observedName.length > 60) fail(`audit name too long: ${id}`);
  if (typeof audit?.note === 'string' && audit.note.length > 240) fail(`audit note too long: ${id}`);
}
let rawSamples = 0;
for (const track of SURVEY.tracks ?? []) {
  if (!track || !Array.isArray(track.samples)) { fail('track samples invalid'); continue; }
  if (track.kind && !['path', 'free-path', 'building-perimeter'].includes(track.kind)) fail(`track kind invalid: ${track.id ?? '?'}`);
  if (track.kind === 'path' && (!track.targetEdge || !['forward', 'reverse'].includes(track.direction))) {
    fail(`planned path metadata invalid: ${track.id ?? '?'}`);
  }
  for (const p of track.samples) {
    rawSamples++;
    if (!Number.isFinite(p?.lat) || p.lat < 34.9 || p.lat > 35.1 ||
        !Number.isFinite(p?.lng) || p.lng < 135.8 || p.lng > 136.1) fail(`track coordinate invalid: ${track.id ?? '?'}`);
    if (!Number.isFinite(p?.accuracy) || p.accuracy < 0 || p.accuracy > 1000) fail(`track accuracy invalid: ${track.id ?? '?'}`);
    if (!Number.isFinite(p?.timestamp)) fail(`track timestamp invalid: ${track.id ?? '?'}`);
  }
}

for (const [id, rec] of Object.entries(SURVEY.buildings ?? {})) {
  if (rec?.entrance && (!Number.isFinite(rec.entrance.lat) || !Number.isFinite(rec.entrance.lng))) fail(`building entrance invalid: ${id}`);
  if (rec?.entrances) {
    if (!Array.isArray(rec.entrances) || rec.entrances.length > 12) fail(`building entrances invalid: ${id}`);
    for (const entrance of rec.entrances) {
      if (!Number.isFinite(entrance?.lat) || !Number.isFinite(entrance?.lng)) fail(`building entrance coordinate invalid: ${id}`);
    }
  }
  if (rec?.footprint) {
    if (!Array.isArray(rec.footprint) || rec.footprint.length < 4) fail(`building footprint too short: ${id}`);
    for (const p of rec.footprint) {
      if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) fail(`building footprint coordinate invalid: ${id}`);
    }
    if (rec.footprintQuality?.passed !== true) fail(`building footprint lacks passed quality: ${id}`);
  }
}
const progress = surveyProgress(SURVEY);
if (SURVEY.replaceGraph && !progress.productionReady) {
  fail('replaceGraph requires every survey quality gate to pass');
}

console.log(`buildings: ${SHOPS.length}, nodes: ${Object.keys(nodes).length}, edges: ${fl.navEdges.length}, floors: ${FLOOR_ORDER.length}, audits: ${Object.keys(SURVEY.audits ?? {}).length}, raw samples: ${rawSamples}, survey score: ${progress.score}%`);
console.log(errors === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${errors} error(s)`);
process.exit(errors ? 1 : 0);
