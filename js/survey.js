// ============================================================
// 現地測量モード（URL に ?survey を付けると起動）
//   キャンパスを実際に歩いて「通路・建物入口の実GPS座標」を採取する。
//   - 歩行ログ: 約6mごとに通路ノードを自動記録し、線でつなぐ
//   - 入口を記録: 建物の前で施設を選ぶと入口ノード＋建物位置を実測登録
//   - エクスポート: js/survey-data.js を丸ごと生成（DL＋クリップボード）
//   記録は localStorage に常時保存されるため、途中で落ちても消えない。
// ============================================================
import * as THREE from 'three';
import { GEO, gpsToWorld, toWorld, SHOPS, PLACES, FLOORS } from './data.js';

const LS_KEY = 'bkc-survey-v1';
const ACCURACY_LIMIT_M = 15;  // これより精度が悪い測位は記録しない
const STEP_M = 6;             // 歩行ログのノード間隔
const CONNECT_M = 30;         // チェーン開始時に最寄りノードへ自動接続する距離

export function initSurvey({ scene, geoState, startGeolocation, toast }) {
  // ---------- 状態 ----------
  const state = load() ?? {
    seq: 1, nodes: {}, edges: [], buildings: {}, places: {}, replaceGraph: false,
  };
  let logging = false;
  let lastNodeId = null;   // 歩行チェーンの末尾（Sノードのみ）
  const actions = [];      // 取り消し用の操作履歴
  let wakeLock = null;

  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* 容量超過等でも動作継続 */ } }
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } }

  // ---------- 座標ユーティリティ ----------
  const here = () => (geoState.lat != null ? { lat: geoState.lat, lng: geoState.lng } : null);
  const distM = (a, b) => {
    const dN = (b.lat - a.lat) * 111320;
    const dE = (b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180);
    return Math.hypot(dN, dE);
  };
  // ノードID → ワールド座標（測量ノード優先、次に略図ノード）
  function nodeWorld(id) {
    if (state.nodes[id]) return gpsToWorld(state.nodes[id].lat, state.nodes[id].lng);
    const p = FLOORS.campus.navNodes[id];
    return p ? toWorld(p.left, p.top) : null;
  }
  function nearestAnyNode(pos, maxM) {
    const w = gpsToWorld(pos.lat, pos.lng);
    const ids = new Set([...Object.keys(state.nodes), ...Object.keys(FLOORS.campus.navNodes)]);
    let best = null, bd = Infinity;
    for (const id of ids) {
      const nw = nodeWorld(id);
      if (!nw) continue;
      const d = Math.hypot(nw.x - w.x, nw.z - w.z) * GEO.meterPerUnit;
      if (d < bd) { bd = d; best = id; }
    }
    return bd <= maxM ? best : null;
  }

  // ---------- 記録操作 ----------
  function addNode(pos, { connectNearest = false } = {}) {
    // 接続先は自ノード登録「前」に決める（自分自身への接続を防ぐ）
    let connectTo = lastNodeId;
    if (!connectTo && connectNearest) connectTo = nearestAnyNode(pos, CONNECT_M);
    const id = 'S' + state.seq++;
    state.nodes[id] = { lat: pos.lat, lng: pos.lng };
    const edge = connectTo && connectTo !== id ? [connectTo, id] : null;
    if (edge) state.edges.push(edge);
    actions.push({ type: 'node', id, edge });
    lastNodeId = id;
    save(); redraw(); updateHud();
    return id;
  }

  function recordPoi(poi, isPlace) {
    const p = here();
    if (!p) { toast('GPSを取得中です。空の見える場所で少し待ってください'); return; }
    // 入口ノードは歩行チェーンとは独立に、最寄りの通路ノードへ接続する
    const keep = lastNodeId;
    lastNodeId = null;
    const nodeId = addNode(p, { connectNearest: true });
    lastNodeId = keep;
    const bucket = isPlace ? state.places : state.buildings;
    bucket[poi.id] = { entry: nodeId, pin: { lat: p.lat, lng: p.lng } };
    actions.push({ type: 'poi', isPlace, poiId: poi.id });
    save(); updateHud();
    toast(`「${poi.name}」の入口を記録しました（±${Math.round(geoState.accuracy ?? 0)}m）`);
  }

  function undo() {
    const a = actions.pop();
    if (!a) { toast('取り消す操作がありません'); return; }
    if (a.type === 'node') {
      delete state.nodes[a.id];
      state.edges = state.edges.filter(e => e[0] !== a.id && e[1] !== a.id);
      if (lastNodeId === a.id) {
        lastNodeId = a.edge && state.nodes[a.edge[0]] ? a.edge[0] : null;
      }
      toast('ノードを取り消しました');
    } else if (a.type === 'poi') {
      const bucket = a.isPlace ? state.places : state.buildings;
      delete bucket[a.poiId];
      toast('入口記録を取り消しました（もう一度↩でノードも消えます）');
    }
    save(); redraw(); updateHud();
  }

  function clearAll() {
    if (!confirm('測量データをすべて削除します。よろしいですか？\n（エクスポート済みのファイルには影響しません）')) return;
    state.seq = 1; state.nodes = {}; state.edges = []; state.buildings = {}; state.places = {};
    actions.length = 0; lastNodeId = null;
    save(); redraw(); updateHud();
    toast('測量データを削除しました');
  }

  function exportData() {
    const body = {
      version: 1,
      recordedAt: new Date().toISOString(),
      replaceGraph: !!ui.replace.checked,
      nodes: state.nodes,
      edges: state.edges,
      buildings: state.buildings,
      places: state.places,
    };
    const text =
      '// 自動生成: BKC現地測量データ（?survey モードでエクスポート）\n' +
      '// このファイルで js/survey-data.js を丸ごと置き換えて push すると、\n' +
      '// マップとナビが実測GPSベースになります。\n' +
      'export const SURVEY = ' + JSON.stringify(body, null, 2) + ';\n';
    navigator.clipboard?.writeText(text).catch(() => {});
    const blob = new Blob([text], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'survey-data.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('survey-data.js をダウンロード＆クリップボードにコピーしました');
  }

  async function setLogging(on) {
    logging = on;
    lastNodeId = null; // 開始・停止のたびに新しいチェーンにする
    ui.log.textContent = on ? '記録を停止' : '記録を開始';
    ui.log.classList.toggle('sv-active', on);
    if (on) {
      startGeolocation();
      toast('歩行ログ記録中 — 通路の中央をゆっくり歩いてください');
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 非対応でも続行 */ }
    } else {
      try { wakeLock?.release(); } catch { /* noop */ }
      wakeLock = null;
    }
    updateHud();
  }

  // ---------- 歩行ログ（自動ノード記録） ----------
  setInterval(() => {
    updateHud();
    if (!logging) return;
    const p = here();
    if (!p || (geoState.accuracy ?? 999) > ACCURACY_LIMIT_M) return;
    const last = lastNodeId && state.nodes[lastNodeId];
    if (!last) { addNode(p, { connectNearest: true }); return; }
    if (distM(last, p) >= STEP_M) addNode(p);
  }, 1200);

  // ---------- 3Dオーバーレイ（測量済みの通路を水色で表示） ----------
  const group = new THREE.Group();
  scene.add(group);
  const nodeGeo = new THREE.SphereGeometry(0.55, 10, 8);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38f0ff, depthTest: false });
  const entryMat = new THREE.MeshBasicMaterial({ color: 0xf6c76a, depthTest: false });
  function redraw() {
    for (const c of [...group.children]) {
      group.remove(c);
      if (c.geometry && c.geometry !== nodeGeo) c.geometry.dispose();
    }
    const entryIds = new Set(
      [...Object.values(state.buildings), ...Object.values(state.places)].map(s => s.entry)
    );
    for (const id of Object.keys(state.nodes)) {
      const w = nodeWorld(id);
      const m = new THREE.Mesh(nodeGeo, entryIds.has(id) ? entryMat : nodeMat);
      m.position.set(w.x, 0.8, w.z);
      m.renderOrder = 30;
      group.add(m);
    }
    const pts = [];
    for (const [a, b] of state.edges) {
      const wa = nodeWorld(a), wb = nodeWorld(b);
      if (!wa || !wb) continue;
      pts.push(new THREE.Vector3(wa.x, 0.7, wa.z), new THREE.Vector3(wb.x, 0.7, wb.z));
    }
    if (pts.length) {
      const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x38f0ff, transparent: true, opacity: 0.95, depthTest: false })
      );
      lines.renderOrder = 29;
      group.add(lines);
    }
  }

  // ---------- UI ----------
  const style = document.createElement('style');
  style.textContent = `
    #survey-panel {
      position: fixed; z-index: 90; left: 10px; bottom: max(10px, env(safe-area-inset-bottom));
      width: min(320px, calc(100vw - 20px));
      background: rgba(20,24,28,.95); backdrop-filter: blur(14px);
      border: 1px solid rgba(56,240,255,.3); border-radius: 16px;
      padding: 12px 14px; color: #eef4f6; font-size: 13px;
      box-shadow: 0 14px 44px rgba(0,0,0,.5);
    }
    #survey-panel .sv-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; margin-bottom: 6px; }
    #survey-panel #sv-gps { font-size: 11px; font-weight: 700; color: #7ceaff; }
    #survey-panel #sv-gps.sv-bad { color: #fca5a5; }
    #survey-panel .sv-stats { font-size: 11px; color: #9fc9d8; margin-bottom: 9px; }
    #survey-panel .sv-row { display: flex; gap: 7px; margin-bottom: 7px; }
    .sv-btn {
      flex: 1; min-height: 46px; border-radius: 12px; cursor: pointer;
      border: 1px solid rgba(56,240,255,.35); background: rgba(56,240,255,.08);
      color: #eafcff; font: 700 13px/1.2 inherit;
    }
    .sv-btn.sv-primary { background: rgba(56,240,255,.22); }
    .sv-btn.sv-active { background: #22d3ee; color: #06222b; }
    .sv-btn.sv-danger { flex: 0 0 auto; padding: 0 14px; border-color: rgba(248,113,113,.4); color: #fca5a5; background: rgba(127,29,29,.2); }
    .sv-btn.sv-small { flex: 0 0 auto; padding: 0 14px; }
    #survey-panel .sv-check { display: flex; gap: 7px; align-items: center; font-size: 11px; color: #9fc9d8; margin-bottom: 8px; }
    #survey-picker {
      position: fixed; inset: 0; z-index: 95; background: rgba(4,12,18,.9); backdrop-filter: blur(8px);
      display: flex; flex-direction: column; padding: 16px;
    }
    #survey-picker.hidden { display: none; }
    #survey-picker h3 { color: #eafcff; font-size: 15px; margin-bottom: 10px; }
    #sv-picker-list { overflow-y: auto; flex: 1; display: grid; gap: 6px; align-content: start; }
    .sv-poi {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 12px 14px; border-radius: 12px; cursor: pointer; text-align: left;
      border: 1px solid rgba(56,240,255,.25); background: rgba(10,26,38,.9); color: #eafcff;
      font: 700 13px/1.3 inherit;
    }
    .sv-poi small { color: #7ceaff; font-weight: 700; flex-shrink: 0; }
    .sv-poi .sv-done { color: #4ade80; }
    #sv-picker-close { margin-top: 10px; min-height: 48px; }
    body.nav-active #survey-panel { display: none; }
  `;
  document.head.appendChild(style);

  // #app は fixed 配置でスタッキングコンテキストを作るため、その内側に入れて
  // 起動時ピッカー（z:210）より下・通常UIより上の正しい重なり順にする
  const uiRoot = document.getElementById('app') ?? document.body;
  const panel = document.createElement('div');
  panel.id = 'survey-panel';
  panel.innerHTML = `
    <div class="sv-head"><span>測量モード</span><span id="sv-gps">GPS待機中</span></div>
    <div class="sv-stats" id="sv-stats"></div>
    <div class="sv-row">
      <button id="sv-log" class="sv-btn sv-primary" type="button">記録を開始</button>
      <button id="sv-node" class="sv-btn sv-small" type="button" title="現在地にノードを追加">＋</button>
      <button id="sv-undo" class="sv-btn sv-small" type="button" title="直前の記録を取り消す">戻す</button>
    </div>
    <div class="sv-row">
      <button id="sv-poi" class="sv-btn" type="button">入口を記録</button>
    </div>
    <label class="sv-check"><input type="checkbox" id="sv-replace"> 略図の通路を置き換える（全域測量後にON）</label>
    <div class="sv-row">
      <button id="sv-export" class="sv-btn sv-primary" type="button">書き出し</button>
      <button id="sv-clear" class="sv-btn sv-danger" type="button" title="測量データを全削除">削除</button>
    </div>`;
  uiRoot.appendChild(panel);

  const picker = document.createElement('div');
  picker.id = 'survey-picker';
  picker.className = 'hidden';
  picker.innerHTML = `
    <h3>どの施設の入口ですか？（近い順）</h3>
    <div id="sv-picker-list"></div>
    <button id="sv-picker-close" class="sv-btn" type="button">閉じる</button>`;
  uiRoot.appendChild(picker);

  const ui = {
    gps: panel.querySelector('#sv-gps'),
    stats: panel.querySelector('#sv-stats'),
    log: panel.querySelector('#sv-log'),
    replace: panel.querySelector('#sv-replace'),
  };
  ui.replace.checked = !!state.replaceGraph;
  ui.replace.addEventListener('change', () => { state.replaceGraph = ui.replace.checked; save(); });

  panel.querySelector('#sv-log').addEventListener('click', () => setLogging(!logging));
  panel.querySelector('#sv-node').addEventListener('click', () => {
    const p = here();
    if (!p) { toast('GPSを取得中です…'); return; }
    addNode(p, { connectNearest: true });
    toast('ノードを追加しました');
  });
  panel.querySelector('#sv-undo').addEventListener('click', undo);
  panel.querySelector('#sv-clear').addEventListener('click', clearAll);
  panel.querySelector('#sv-export').addEventListener('click', exportData);
  panel.querySelector('#sv-poi').addEventListener('click', openPicker);
  picker.querySelector('#sv-picker-close').addEventListener('click', () => picker.classList.add('hidden'));

  function openPicker() {
    const p = here();
    if (!p) { toast('GPSを取得中です。空の見える場所で少し待ってください'); return; }
    const w = gpsToWorld(p.lat, p.lng);
    const cands = [...SHOPS.map(s => ({ poi: s, isPlace: false })), ...PLACES.map(s => ({ poi: s, isPlace: true }))]
      .map(c => {
        const pw = toWorld(c.poi.pin.left, c.poi.pin.top);
        return { ...c, d: Math.hypot(pw.x - w.x, pw.z - w.z) * GEO.meterPerUnit };
      })
      .sort((a, b) => a.d - b.d);
    const list = picker.querySelector('#sv-picker-list');
    list.innerHTML = '';
    for (const c of cands) {
      const recorded = (c.isPlace ? state.places : state.buildings)[c.poi.id];
      const btn = document.createElement('button');
      btn.className = 'sv-poi';
      btn.type = 'button';
      btn.innerHTML = `<span>${c.poi.name}</span><small class="${recorded ? 'sv-done' : ''}">${recorded ? '✓済' : `約${Math.round(c.d)}m`}</small>`;
      btn.addEventListener('click', () => {
        picker.classList.add('hidden');
        recordPoi(c.poi, c.isPlace);
      });
      list.appendChild(btn);
    }
    picker.classList.remove('hidden');
  }

  function updateHud() {
    if (geoState.lat == null) {
      ui.gps.textContent = 'GPS待機中';
      ui.gps.classList.remove('sv-bad');
    } else {
      const acc = Math.round(geoState.accuracy ?? 0);
      ui.gps.textContent = `GPS ±${acc}m${acc > ACCURACY_LIMIT_M ? '（精度不足）' : ''}`;
      ui.gps.classList.toggle('sv-bad', acc > ACCURACY_LIMIT_M);
    }
    const done = Object.keys(state.buildings).length + Object.keys(state.places).length;
    const total = SHOPS.length + PLACES.length;
    ui.stats.textContent =
      `ノード ${Object.keys(state.nodes).length} ・ 通路 ${state.edges.length} ・ 入口 ${done}/${total}` +
      (logging ? ' ・ 記録中' : '');
  }

  // ---------- 起動 ----------
  startGeolocation();
  redraw();
  updateHud();
  toast('測量モード: 「歩行ログ開始」を押して通路を歩いてください', 4200);
}
