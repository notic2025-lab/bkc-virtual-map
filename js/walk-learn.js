// ============================================================
// クラウド歩行学習 — 歩けば歩くほど地図と経路が賢くなる
//   仕組み:
//   1) GPS追従中のユーザーの移動を「約6mグリッドのセル間遷移カウント」として
//      匿名集計し、Firebase RTDB (walk/g) へ increment 送信する。
//      グリッドは緯度経度ベースの固定アンカーなので、GEO校正後もデータは有効。
//      さらにナビ到着時のGPS位置を施設ごとに集計し (walk/e)、
//      「本当の入口」を全ユーザーの到着地点から自動測量する。
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
import { gpsToWorld, toWorld, worldToPercent, SHOPS, PLACES, CATEGORIES, MAP_W, MAP_D } from './data.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

const CELL = 1.5;              // 1セル = 1.5ワールド単位 ≈ 6m
const ACC_LIMIT_M = 20;        // これより精度が悪い測位は学習に使わない
const SAMPLE_MS = 2500;        // 移動サンプリング間隔
const FLUSH_MS = 15000;        // 集計送信間隔
const MAX_JUMP_CELLS = 3;      // これを超えるセル移動はGPSジャンプとして無視
const CACHE_KEY = 'bkc-walk-cache-v2'; // v2: 緯度経度グリッド＋入口データ形式
const CACHE_TTL = 72 * 3600 * 1000;  // 3日キャッシュ（無料枠のダウンロード量を節約）
const POPULAR_MIN = 4;         // この回数以上でエッジ割引・表示の対象
const SHORTCUT_MIN = 8;        // この回数以上で「みんなの道」としてグラフに追加
const NOVEL_DIST = 2.0;        // 既存通路からこれ以上離れた区間だけ新規の道とみなす（≈8m）
const CONNECT_DIST = 4.5;      // みんなの道と既存通路を接続する最大距離（≈18m）
                               // ※脇道の入口セルは NOVEL_DIST フィルタにより通路から
                               //   2単位以上離れた所から始まるため、それより広くとる
const FACTOR_MIN = 0.72;       // 人気通路のコスト係数下限（最大28%優遇）
const SHORTCUT_FACTOR = 0.85;  // みんなの道のコスト係数（GPS由来なので控えめに優遇）

let ctx = null;          // app.js から渡される { THREE, scene, geoState, nodePos, adj, addEdge, setEdgeFactor }
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
// 通信は REST API のみ（Firebase SDK不使用）
//   SDKは常時WebSocket接続を張るため、Sparkプランの同時接続上限（100）を
//   1ユーザー1接続で消費してしまう。歩行学習は15秒に1回の送信と1日1回の
//   取得だけなので、RESTなら接続数を一切消費せず、何千人が使っても
//   ライブ共有用の接続枠を圧迫しない。
// ------------------------------------------------------------
const DB_URL = FIREBASE_CONFIG.databaseURL.replace(/\/$/, '');

async function restFetch(path, options = {}, timeoutMs = 8000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${DB_URL}/${path}.json`, { ...options, signal: ac.signal });
    if (!res.ok) throw new Error(`rtdb ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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

// ---- 地理グリッド（サーバーに保存する座標系） ----
// GEO校正（回転・縮尺・原点の調整）と完全に独立した緯度経度ベースの固定グリッド。
// こうすることで、後から地図の縮尺を校正しても蓄積済みデータは無効にならない。
// ※このアンカー値は恒久固定。変更すると全データの位置がズレる
const ALAT = 34.9822, ALNG = 135.9617, CELL_M = 6;
const LAT_STEP = CELL_M / 111320;
const LNG_STEP = CELL_M / (111320 * Math.cos(ALAT * Math.PI / 180));
const geoCellOf = (lat, lng) => ({
  gx: Math.round((lng - ALNG) / LNG_STEP),
  gy: Math.round((lat - ALAT) / LAT_STEP),
});
const geoCellId = (c) => `g${c.gx}_${c.gy}`;
const GEO_CELL_RE = /^g(-?\d+)_(-?\d+)$/;
function geoCellWorld(id) {
  const m = GEO_CELL_RE.exec(id);
  if (!m) return null;
  return gpsToWorld(ALAT + Number(m[2]) * LAT_STEP, ALNG + Number(m[1]) * LNG_STEP);
}

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
  const cur = geoCellOf(g.lat, g.lng); // 保存は緯度経度グリッド（GEO校正と独立）
  if (!lastCell) { lastCell = cur; return; }
  const dx = cur.gx - lastCell.gx, dy = cur.gy - lastCell.gy;
  if (dx === 0 && dy === 0) return;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > MAX_JUMP_CELLS) { lastCell = cur; return; } // GPSジャンプ
  // 途中のセルを補間し、連続する遷移として記録する
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  let prev = lastCell;
  for (let i = 1; i <= steps; i++) {
    const c = { gx: Math.round(lastCell.gx + dx * i / steps), gy: Math.round(lastCell.gy + dy * i / steps) };
    if (c.gx === prev.gx && c.gy === prev.gy) continue;
    const key = pairKey(geoCellId(prev), geoCellId(c));
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
    const payload = {};
    for (const [key, n] of batch) payload[key] = { '.sv': { increment: Math.min(n, 50) } };
    await restFetch('walk/g', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
    return c && c.data ? c : null;
  } catch { return null; }
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* 容量超過でも継続 */ }
}

async function fetchRemote() {
  // g = 通行量（緯度経度グリッド） / e = 到着地点ヒストグラム / p = みんなの登録スポット
  const w = (await restFetch('walk')) ?? {};
  const data = { g: w.g ?? {}, e: w.e ?? {}, p: w.p ?? {} };
  writeCache(data);
  return data;
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

function apply(data) {
  if (applied || !data) return;
  // 緯度経度グリッドの遷移を現在のGEO変換でワールドグリッドへ写像する
  // （GEO校正後も、蓄積データがそのまま新しい地図位置に正しく乗る）
  const worldPairs = new Map();
  for (const [k, v] of Object.entries(data.g ?? {})) {
    if (!Number.isFinite(v) || v <= 0 || !/^g-?\d+_-?\d+\|g-?\d+_-?\d+$/.test(k)) continue;
    if (worldPairs.size >= 20000) break;
    const [ga, gb] = k.split('|');
    const wa = geoCellWorld(ga), wb = geoCellWorld(gb);
    if (!wa || !wb) continue;
    const a = cellId(cellOf(wa.x, wa.z)), b = cellId(cellOf(wb.x, wb.z));
    if (a === b) continue;
    const key = pairKey(a, b);
    worldPairs.set(key, (worldPairs.get(key) ?? 0) + v);
  }
  const pairs = [...worldPairs.entries()];
  applyEntrances(data.e); // 入口補正は冪等（何度適用しても同じ結果）
  applySpots(data.p);     // みんなの登録スポット（追加済みIDはスキップ）
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

// ------------------------------------------------------------
// 入口の自動測量 — ナビ到着時のGPS位置の集計から「本当の入口」を推定する
//   5サンプル以上たまった施設は、経路のゴール地点（_navPos）と入口ノード
//   （entry）を、みんなの到着地点の加重平均へ補正する
// ------------------------------------------------------------
const MIN_ENTRANCE_SAMPLES = 5;
function applyEntrances(e) {
  if (!e) return 0;
  const pois = [...SHOPS, ...PLACES];
  let fixed = 0;
  for (const [poiId, cells] of Object.entries(e)) {
    const poi = pois.find(p => p.id === poiId);
    if (!poi || !cells || typeof cells !== 'object') continue;
    const entries = Object.entries(cells)
      .filter(([k, v]) => Number.isFinite(v) && v > 0 && GEO_CELL_RE.test(k));
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total < MIN_ENTRANCE_SAMPLES) continue;
    // 最多セルの近傍（±3セル≈18m）だけで加重平均 → 単発の異常値・いたずらに強い
    const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const tm = GEO_CELL_RE.exec(top[0]);
    let sx = 0, sz = 0, sw = 0;
    for (const [k, v] of entries) {
      const m = GEO_CELL_RE.exec(k);
      if (Math.abs(Number(m[1]) - Number(tm[1])) > 3 || Math.abs(Number(m[2]) - Number(tm[2])) > 3) continue;
      const w = geoCellWorld(k);
      sx += w.x * v; sz += w.z * v; sw += v;
    }
    if (!sw) continue;
    const ex = sx / sw, ez = sz / sw;
    poi._navPos = ctx.makeVec(ex, ez);
    // 実測入口の最寄り通路ノードを入口ノードにする（学習ノードも対象）
    let best = null, bd = Infinity;
    for (const [id, p] of Object.entries(ctx.nodePos)) {
      const d = Math.hypot(p.x - ex, p.z - ez);
      if (d < bd) { bd = d; best = id; }
    }
    if (best && bd <= 12) poi.entry = best.split(':')[1];
    fixed++;
  }
  if (fixed) console.info(`walk-learn: ${fixed} 施設の入口をみんなの到着地点で補正`);
  return fixed;
}

// ------------------------------------------------------------
// みんなの登録スポット — 誰でも「現在地に駐輪場」等を登録でき、全ユーザーに反映
//   walk/p/{ランダムID} = { n: 名前, c: カテゴリ, g: 6mセル }
//   同名・近接（≈30m）の登録は1つに統合（重複・位置ブレ・投票を吸収）
// ------------------------------------------------------------
const spotIds = new Set();
const normName = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);

function applySpots(p) {
  if (!p || !ctx.addCrowdSpot) return;
  const items = [];
  for (const [id, s] of Object.entries(p)) {
    if (items.length >= 600) break;
    if (!/^p[a-f0-9]{8}$/.test(id)) continue;
    const name = cleanName(s?.n);
    if (!name) continue;
    const w = geoCellWorld(String(s.g ?? ''));
    if (!w || Math.abs(w.x) > MAP_W / 2 || Math.abs(w.z) > MAP_D / 2) continue;
    items.push({ id, name, key: normName(name), cat: typeof s.c === 'string' ? s.c : 'life', x: w.x, z: w.z });
  }
  const groups = [];
  for (const it of items.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const grp = groups.find(x => x.key === it.key && Math.hypot(x.x / x.n - it.x, x.z / x.n - it.z) <= 7.5);
    if (grp) { grp.n++; grp.x += it.x; grp.z += it.z; }
    else groups.push({ id: it.id, key: it.key, name: it.name, cat: it.cat, x: it.x, z: it.z, n: 1 });
  }
  let added = 0;
  for (const grp of groups.slice(0, 300)) {
    if (spotIds.has(grp.id)) continue;
    spotIds.add(grp.id);
    const x = grp.x / grp.n, z = grp.z / grp.n;
    let best = null, bd = Infinity;
    for (const [nid, np] of Object.entries(ctx.nodePos)) {
      const d = Math.hypot(np.x - x, np.z - z);
      if (d < bd) { bd = d; best = nid; }
    }
    if (ctx.addCrowdSpot({ id: 'cs-' + grp.id, name: grp.name, cat: grp.cat, pin: worldToPercent(x, z), entry: best?.split(':')[1] })) added++;
  }
  if (added) console.info(`walk-learn: みんなの登録スポット ${added} 件を表示`);
}

// スポット登録（本編の📍ボタンから呼ばれる。成功すると全ユーザーに反映される）
export async function registerSpot(rawName, cat) {
  const g = ctx.geoState;
  const name = cleanName(rawName);
  if (!name) { ctx.toast('スポット名を入力してください'); return false; }
  if (g.lat == null || !g.ok) { ctx.toast('キャンパス内でGPSが取れた状態で登録できます'); return false; }
  if ((g.accuracy ?? 99) > 25) { ctx.toast(`GPS精度が不足しています（±${Math.round(g.accuracy)}m）。空の見える場所でお試しください`); return false; }
  if (!CATEGORIES[cat]) cat = 'life';
  const id = 'p' + Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
  const cell = geoCellId(geoCellOf(g.lat, g.lng));
  try {
    await restFetch(`walk/p/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ n: name, c: cat, g: cell }),
    });
  } catch {
    ctx.toast('登録を送信できませんでした。通信環境を確認してください');
    return false;
  }
  // キャッシュへ反映（3日キャッシュ中の再訪でも表示されるように）
  const c = readCache();
  if (c) { c.data.p = { ...(c.data.p ?? {}), [id]: { n: name, c: cat, g: cell } }; writeCache(c.data); }
  // ローカルへ即時反映（同名・近接スポットが既にあれば投票扱いとして重複追加しない）
  const w = geoCellWorld(cell);
  const dup = SHOPS.some(s => {
    if (normName(s.name) !== normName(name)) return false;
    const sw = toWorld(s.pin.left, s.pin.top);
    return Math.hypot(sw.x - w.x, sw.z - w.z) <= 7.5;
  });
  if (!dup && ctx.addCrowdSpot) {
    spotIds.add(id);
    let best = null, bd = Infinity;
    for (const [nid, np] of Object.entries(ctx.nodePos)) {
      const d = Math.hypot(np.x - w.x, np.z - w.z);
      if (d < bd) { bd = d; best = nid; }
    }
    ctx.addCrowdSpot({ id: 'cs-' + id, name, cat, pin: worldToPercent(w.x, w.z), entry: best?.split(':')[1] });
  }
  ctx.toast(`「${name}」を登録しました。全ユーザーの地図に反映されます`, 4200);
  return true;
}

// 登録フォーム（スタイルはこのモジュール内で完結）
export function openSpotForm() {
  const g = ctx.geoState;
  if (g.lat == null) { ctx.startGeolocation?.(); ctx.toast('GPSを取得しています。少し待ってからもう一度お試しください'); return; }
  if (!g.ok) { ctx.toast('スポット登録はキャンパス内でのみ利用できます'); return; }
  document.getElementById('spot-form')?.remove();
  if (!document.getElementById('spot-form-style')) {
    const st = document.createElement('style');
    st.id = 'spot-form-style';
    st.textContent = `
      #spot-form { position: fixed; inset: 0; z-index: 92; display: grid; place-items: center;
        padding: 16px; background: rgba(30,35,32,.45); backdrop-filter: blur(6px); }
      #spot-form .spf { width: min(340px, 100%); display: grid; gap: 10px; background: #fffefa;
        border: 1px solid rgba(33,39,42,.12); border-radius: 16px; padding: 18px;
        box-shadow: 0 20px 60px rgba(30,35,32,.25); }
      #spot-form h3 { font-size: 16px; color: #21272a; }
      #spot-form p { font-size: 12px; color: #6b7480; line-height: 1.6; }
      #spot-form label { font-size: 12px; font-weight: 700; color: #21272a; }
      #spot-form input, #spot-form select { width: 100%; min-height: 46px; border-radius: 10px;
        padding: 0 12px; border: 1px solid rgba(33,39,42,.2); background: #f4f2ed;
        color: #21272a; font: 600 14px/1.2 inherit; }
      #spot-form .spf-save { min-height: 48px; border: 0; border-radius: 10px; cursor: pointer;
        background: #8d1937; color: #fff; font: 700 14px/1 inherit; }
      #spot-form .spf-cancel { min-height: 44px; border: 0; background: none; cursor: pointer;
        color: #6b7480; font: 600 13px/1 inherit; text-decoration: underline; }`;
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.id = 'spot-form';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="spf">
      <h3>現在地にスポットを登録</h3>
      <p>駐輪場・自販機・喫煙所など、地図に無い場所を登録すると全ユーザーの地図と検索に反映されます（±${Math.round(g.accuracy ?? 0)}m）。</p>
      <div><label for="spf-name">名前</label>
      <input id="spf-name" type="text" maxlength="24" placeholder="例：第一駐輪場" autocomplete="off"></div>
      <div><label for="spf-cat">カテゴリ</label>
      <select id="spf-cat">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}"${k === 'life' ? ' selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <button class="spf-save" type="button">この場所に登録</button>
      <button class="spf-cancel" type="button">キャンセル</button>
    </div>`;
  (document.getElementById('app') ?? document.body).appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('.spf-cancel').addEventListener('click', close);
  el.querySelector('.spf-save').addEventListener('click', async () => {
    const btn = el.querySelector('.spf-save');
    btn.disabled = true;
    const ok = await registerSpot(el.querySelector('#spf-name').value, el.querySelector('#spf-cat').value);
    btn.disabled = false;
    if (ok) close();
  });
  setTimeout(() => el.querySelector('#spf-name').focus(), 60);
}

// ナビ到着時に app.js から呼ばれる（匿名・座標は6mセルに量子化してから送信）
export function reportArrival(poiId) {
  try {
    const g = ctx?.geoState;
    if (!poiId || !g || g.lat == null || !g.ok || (g.accuracy ?? 99) > 15) return;
    if (!/^[a-z0-9-]{1,32}$/.test(poiId)) return;
    const cell = geoCellId(geoCellOf(g.lat, g.lng));
    restFetch(`walk/e/${poiId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [cell]: { '.sv': { increment: 1 } } }),
    }).catch(() => { /* 収集は任意機能 */ });
  } catch { /* noop */ }
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
  if (c) apply(c.data);
}

// データ適用のみ（収集なし）。キャッシュが新しければネット不要、
// 無ければ軽量フェッチ（gzip数十KB・3日キャッシュ）。GPSなしの利用者にも
// みんなの道・入口補正・登録スポットが届く
export async function ensureData() {
  const c = readCache();
  if (c && Date.now() - c.at < CACHE_TTL) { apply(c.data); return; }
  try { apply(await fetchRemote()); }
  catch { if (c) apply(c.data); }  // 取得失敗時は古いキャッシュで代用
}

// GPS追従が始まったら: データ適用に加えて匿名収集を開始
export async function start() {
  if (collecting) return;
  collecting = true;
  await ensureData();
  setInterval(sampleMove, SAMPLE_MS);
  setInterval(flush, FLUSH_MS);
  addEventListener('pagehide', () => { flush(); });
}
