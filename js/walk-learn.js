// ============================================================
// クラウド歩行学習 — 歩けば歩くほど地図と経路が賢くなる
//   仕組み:
//   1) GPS追従中のユーザーの移動を「約6mグリッドのセル間遷移カウント」として
//      匿名集計し、Firebase RTDB (walk/t) へ increment 送信する。
//      個人ID・タイムスタンプ・軌跡そのものは一切送らない。
//   2) 集計データを読み込み、
//      - 既存の通路: よく歩かれている区間ほど A* コストを割引（実際に人が
//        通る道が優先される）
//      - どの通路にも属さないのに多く歩かれている区間: 「みんなの道
//        （ショートカット）」として経路グラフに自動追加（建物内を通る
//        誤学習はフットプリント判定で除外）
//      - 学習した道は地図上に金色の点線相当のラインで表示
//   3) 結果は localStorage にキャッシュし、次回はオフラインでも効く。
//   Firebase接続はこのモジュール内だけ。失敗しても本体は略図グラフで動く。
// ============================================================
import { gpsToWorld, toWorld, SHOPS, MAP_W, MAP_D } from './data.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CELL = 1.5;              // 1セル = 1.5ワールド単位 ≈ 6m
const ACC_LIMIT_M = 20;        // これより精度が悪い測位は学習に使わない
const SAMPLE_MS = 2500;        // 移動サンプリング間隔
const FLUSH_MS = 15000;        // 集計送信間隔
const MAX_JUMP_CELLS = 3;      // これを超えるセル移動はGPSジャンプとして無視
const CACHE_KEY = 'bkc-walk-cache';
const CACHE_TTL = 24 * 3600 * 1000;
const POPULAR_MIN = 4;         // この回数以上でエッジ割引・表示の対象
const SHORTCUT_MIN = 8;        // この回数以上で「みんなの道」としてグラフに追加
const NOVEL_DIST = 2.0;        // 既存通路からこれ以上離れた区間だけ新規の道とみなす（≈8m）
const CONNECT_DIST = 4.5;      // みんなの道と既存通路を接続する最大距離（≈18m）
                               // ※脇道の入口セルは NOVEL_DIST フィルタにより通路から
                               //   2単位以上離れた所から始まるため、それより広くとる
const FACTOR_MIN = 0.72;       // 人気通路のコスト係数下限（最大28%優遇）
const SHORTCUT_FACTOR = 0.85;  // みんなの道のコスト係数（GPS由来なので控えめに優遇）

let ctx = null;          // app.js から渡される { THREE, scene, geoState, nodePos, adj, addEdge, setEdgeFactor }
let fb = null;
let applied = false;
let collecting = false;
let originalEdges = null; // 学習ノード追加「前」のエッジ一覧スナップショット

export function setup(deps) {
  ctx = deps;
  // 既存グラフのスナップショット（人気割引と新規判定の基準は略図＋測量の道のみ）
  originalEdges = [];
  for (const a of Object.keys(ctx.adj)) {
    for (const b of ctx.adj[a]) if (a < b) originalEdges.push([a, b]);
  }
}

// ------------------------------------------------------------
// Firebase（必要時のみ・二重初期化ガード付き）
// ------------------------------------------------------------
async function loadFirebase() {
  if (fb) return fb;
  const appMod = await import(`${SDK}firebase-app.js`);
  const dbMod = await import(`${SDK}firebase-database.js`);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
  const db = dbMod.getDatabase(app, FIREBASE_CONFIG.databaseURL);
  fb = { db, ...dbMod };
  return fb;
}

// ------------------------------------------------------------
// セル座標
// ------------------------------------------------------------
const cellOf = (x, z) => ({ cx: Math.round(x / CELL), cz: Math.round(z / CELL) });
const cellId = (c) => `c${c.cx}_${c.cz}`;
const cellCenter = (id) => {
  const m = /^c(-?\d+)_(-?\d+)$/.exec(id);
  return m ? { x: Number(m[1]) * CELL, z: Number(m[2]) * CELL } : null;
};
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ------------------------------------------------------------
// 収集（匿名セル遷移カウント）
// ------------------------------------------------------------
const pending = new Map(); // pairKey -> 加算数
let lastCell = null;

function sampleMove() {
  const g = ctx.geoState;
  if (document.visibilityState !== 'visible') { lastCell = null; return; }
  if (g.lat == null || !g.ok || (g.accuracy ?? 999) > ACC_LIMIT_M) return;
  const w = gpsToWorld(g.lat, g.lng);
  if (Math.abs(w.x) > MAP_W / 2 || Math.abs(w.z) > MAP_D / 2) return;
  const cur = cellOf(w.x, w.z);
  if (!lastCell) { lastCell = cur; return; }
  const dx = cur.cx - lastCell.cx, dz = cur.cz - lastCell.cz;
  if (dx === 0 && dz === 0) return;
  if (Math.max(Math.abs(dx), Math.abs(dz)) > MAX_JUMP_CELLS) { lastCell = cur; return; } // GPSジャンプ
  // 途中のセルを補間し、連続する遷移として記録する
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  let prev = lastCell;
  for (let i = 1; i <= steps; i++) {
    const c = { cx: Math.round(lastCell.cx + dx * i / steps), cz: Math.round(lastCell.cz + dz * i / steps) };
    if (c.cx === prev.cx && c.cz === prev.cz) continue;
    const key = pairKey(cellId(prev), cellId(c));
    if (pending.size < 200 || pending.has(key)) pending.set(key, (pending.get(key) ?? 0) + 1);
    prev = c;
  }
  lastCell = cur;
}

async function flush() {
  if (!pending.size || !navigator.onLine) return;
  const batch = new Map(pending);
  pending.clear();
  try {
    const { db, ref, update, increment } = await loadFirebase();
    const payload = {};
    for (const [key, n] of batch) payload[key] = increment(Math.min(n, 50));
    await update(ref(db, 'walk/t'), payload);
  } catch {
    // ルール未設定・オフライン等では静かに破棄（学習は任意機能）
  }
}

// ------------------------------------------------------------
// 取得（24hキャッシュ）
// ------------------------------------------------------------
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.t ? c : null;
  } catch { return null; }
}
function writeCache(t) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), t })); } catch { /* 容量超過でも継続 */ }
}

async function fetchRemote() {
  const { db, ref, get } = await loadFirebase();
  const snap = await Promise.race([
    get(ref(db, 'walk/t')),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
  ]);
  const t = snap.val() ?? {};
  writeCache(t);
  return t;
}

// ------------------------------------------------------------
// 学習の適用
// ------------------------------------------------------------
function segPointDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// 建物フットプリント（軸平行矩形）。少し縮めて「壁沿いの道」は許容する
function buildingRects() {
  return SHOPS.map(s => {
    const { x, z } = toWorld(s.pin.left, s.pin.top);
    return { x, z, hw: Math.max(0, s.size.w / 2 - 0.6), hd: Math.max(0, s.size.d / 2 - 0.6) };
  }).filter(r => r.hw > 0.5 && r.hd > 0.5);
}
const inRect = (r, x, z) => Math.abs(x - r.x) <= r.hw && Math.abs(z - r.z) <= r.hd;

function apply(t) {
  if (applied || !t) return;
  const pairs = Object.entries(t)
    .filter(([k, v]) => Number.isFinite(v) && v > 0 && /^c-?\d+_-?\d+\|c-?\d+_-?\d+$/.test(k))
    .slice(0, 20000);
  if (!pairs.length) return;
  applied = true;

  // セルごとの通行量
  const cellCount = new Map();
  for (const [k, v] of pairs) {
    const [a, b] = k.split('|');
    cellCount.set(a, (cellCount.get(a) ?? 0) + v);
    cellCount.set(b, (cellCount.get(b) ?? 0) + v);
  }

  // 1) 既存通路の人気割引: 実際によく歩かれている道ほどA*で優先される
  for (const [a, b] of originalEdges) {
    const pa = ctx.nodePos[a], pb = ctx.nodePos[b];
    if (!pa || !pb) continue;
    const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    const n = Math.max(2, Math.ceil(len / CELL));
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const x = pa.x + (pb.x - pa.x) * i / n;
      const z = pa.z + (pb.z - pa.z) * i / n;
      sum += cellCount.get(cellId(cellOf(x, z))) ?? 0;
    }
    const mean = sum / (n + 1);
    if (mean >= POPULAR_MIN) {
      const factor = Math.max(FACTOR_MIN, 1 - 0.06 * Math.log2(1 + mean));
      ctx.setEdgeFactor(a, b, factor);
    }
  }

  // 2) みんなの道（ショートカット）の発見:
  //    よく歩かれているのに既存のどの通路にも沿っていない遷移をグラフへ追加
  const rects = buildingRects();
  const shortcutPairs = [];
  for (const [k, v] of pairs) {
    if (v < SHORTCUT_MIN) continue;
    const [aId, bId] = k.split('|');
    const a = cellCenter(aId), b = cellCenter(bId);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    // 既存通路の近くなら（=既にある道なら）追加しない
    let nearExisting = false;
    for (const [ea, eb] of originalEdges) {
      const pa = ctx.nodePos[ea], pb = ctx.nodePos[eb];
      if (!pa || !pb) continue;
      if (segPointDist(mx, mz, pa.x, pa.z, pb.x, pb.z) < NOVEL_DIST) { nearExisting = true; break; }
    }
    if (nearExisting) continue;
    // 建物の中を突っ切る誤学習（GPS反射など）を除外
    let hitsBuilding = false;
    for (const r of rects) {
      if (inRect(r, mx, mz) || inRect(r, a.x, a.z) || inRect(r, b.x, b.z)) { hitsBuilding = true; break; }
    }
    if (hitsBuilding) continue;
    shortcutPairs.push([aId, bId, v]);
  }

  // グラフへ追加（ノードID: campus:WL{cx}_{cz}。既存ノードのW1〜W4等と衝突しない接頭辞）
  const learnedNodeIds = new Set();
  let addedEdges = 0;
  for (const [aId, bId] of shortcutPairs.slice(0, 600)) {
    const na = `campus:WL${aId.slice(1)}`;
    const nb = `campus:WL${bId.slice(1)}`;
    for (const [nid, cid] of [[na, aId], [nb, bId]]) {
      if (!ctx.nodePos[nid]) {
        const c = cellCenter(cid);
        ctx.nodePos[nid] = ctx.makeVec(c.x, c.z);
        learnedNodeIds.add(nid);
      }
    }
    ctx.addEdge(na, nb);
    ctx.setEdgeFactor(na, nb, SHORTCUT_FACTOR);
    addedEdges++;
  }
  // みんなの道を既存の通路網へ接続する（孤立していると経路に使われない）。
  // 通路「ノード」はまばらなので、近くを通る既存通路（エッジ）を探し、
  // その両端ノードへ接続する — 脇道が通路の途中で交わるケースを拾うため
  for (const nid of learnedNodeIds) {
    const p = ctx.nodePos[nid];
    let best = null, bd = Infinity;
    for (const [ea, eb] of originalEdges) {
      const pa = ctx.nodePos[ea], pb = ctx.nodePos[eb];
      if (!pa || !pb) continue;
      const d = segPointDist(p.x, p.z, pa.x, pa.z, pb.x, pb.z);
      if (d < bd) { bd = d; best = [ea, eb]; }
    }
    if (best && bd <= CONNECT_DIST) { ctx.addEdge(nid, best[0]); ctx.addEdge(nid, best[1]); }
  }

  drawOverlay(pairs, cellCount);
  console.info(`walk-learn: 歩行データ ${pairs.length} 区間を適用（みんなの道 ${addedEdges} 区間を追加）`);
}

// 「みんなの道」の可視化 — よく歩かれている区間ほど濃い金色のライン
function drawOverlay(pairs, cellCount) {
  const THREE = ctx.THREE;
  const faint = [], strong = [];
  for (const [k, v] of pairs) {
    if (v < POPULAR_MIN) continue;
    const [aId, bId] = k.split('|');
    const a = cellCenter(aId), b = cellCenter(bId);
    if (!a || !b) continue;
    const bucket = v >= SHORTCUT_MIN ? strong : faint;
    bucket.push(new THREE.Vector3(a.x, 0.5, a.z), new THREE.Vector3(b.x, 0.5, b.z));
  }
  const group = new THREE.Group();
  if (faint.length) {
    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(faint),
      new THREE.LineBasicMaterial({ color: 0xc9a75a, transparent: true, opacity: 0.28 })
    ));
  }
  if (strong.length) {
    group.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(strong),
      new THREE.LineBasicMaterial({ color: 0xe3b662, transparent: true, opacity: 0.6 })
    ));
  }
  if (group.children.length) {
    group.children.forEach(l => { l.renderOrder = 6; });
    ctx.scene.add(group);
  }
}

// ------------------------------------------------------------
// 公開API
// ------------------------------------------------------------
// 起動時: キャッシュがあればネットワークなしで即適用（全ユーザーの経路が賢くなる）
export function applyCached() {
  const c = readCache();
  if (c) apply(c.t);
}

// GPS追従が始まったら: 最新データを取得して適用し、匿名収集を開始
export async function start() {
  if (collecting) return;
  collecting = true;
  const c = readCache();
  if (c && Date.now() - c.at < CACHE_TTL) {
    apply(c.t);
    fetchRemote().catch(() => {}); // 次回セッション用にキャッシュだけ更新
  } else {
    try { apply(await fetchRemote()); }
    catch { if (c) apply(c.t); }   // 取得失敗時は古いキャッシュで代用
  }
  setInterval(sampleMove, SAMPLE_MS);
  setInterval(flush, FLUSH_MS);
  addEventListener('pagehide', () => { flush(); });
}
