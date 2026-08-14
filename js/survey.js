// ============================================================
// 現地測量モード（URL に ?survey を付けると起動）
//   キャンパスを実際に歩いて「通路・建物入口の実GPS座標」を採取する。
//   - 歩行ログ: 約6mごとに通路ノードを自動記録し、線でつなぐ
//   - 入口を記録: 建物の前で施設を選ぶと入口ノード＋建物位置を実測登録
//   - エクスポート: js/survey-data.js を丸ごと生成（DL＋クリップボード）
//   記録は localStorage に常時保存されるため、途中で落ちても消えない。
// ============================================================
import * as THREE from 'three';
import { GEO, gpsToWorld, toWorld, SHOPS, PLACES, FLOORS, CATEGORIES, BASE_SURVEY_SHOP_IDS } from './data.js';
import { SURVEY as BASE_SURVEY } from './survey-data.js';
import {
  SURVEY_QUALITY, createSurveyPlan, surveyProgress, evaluateTrack, perimeterFromTrack,
  buildProductionGraph, deriveGeoReference,
} from './survey-planner.js?v=20260814c';

const LS_KEY = 'bkc-survey-v1'; // キーは維持して既存の現地データを自動移行する
const ACCURACY_LIMIT_M = 5;   // 完成地図へ採用できるGPS精度上限（95%半径）
const RAW_ACCURACY_LIMIT_M = 30; // 品質分析用の生GPSはここまで保持
const STEP_M = 6;             // 歩行ログのノード間隔
const CONNECT_M = 30;         // チェーン開始時に最寄りノードへ自動接続する距離
const STATIONARY_SECONDS = 15; // 入口・スポットは複数測位の中央値で記録
const SURVEY_SHOPS = SHOPS.filter(s => BASE_SURVEY_SHOP_IDS.includes(s.id));

export function initSurvey({ scene, camera, mapControls, geoState, startGeolocation, toast }) {
  const syncParam = new URLSearchParams(location.search).get('sync') ?? '';
  const syncToken = /^[a-f0-9]{32,96}$/i.test(syncParam) ? syncParam : '';
  let syncTimer = null;
  let syncStatus = syncToken ? 'PC同期待機' : '';

  // ---------- 状態 ----------
  const base = BASE_SURVEY && typeof BASE_SURVEY === 'object' ? BASE_SURVEY : {};
  const baseNodeSeq = Math.max(0, ...Object.keys(base.nodes ?? {}).map(id => /^S(\d+)$/.exec(id)?.[1] ?? 0).map(Number));
  const basePointSeq = Math.max(0, ...Object.keys(base.points ?? {}).map(id => /^pt-(\d+)$/.exec(id)?.[1] ?? 0).map(Number));
  const state = load() ?? {
    seq: baseNodeSeq + 1,
    pseq: basePointSeq,
    nodes: structuredClone(base.nodes ?? {}),
    edges: structuredClone(base.edges ?? []),
    buildings: structuredClone(base.buildings ?? {}),
    places: structuredClone(base.places ?? {}),
    points: structuredClone(base.points ?? {}),
    audits: structuredClone(base.audits ?? {}),
    tracks: structuredClone(base.tracks ?? []),
    trackSeq: (base.tracks ?? []).length,
    planner: structuredClone(base.planner ?? { skipped: {}, history: [], budgetMin: 30 }),
    replaceGraph: !!base.replaceGraph,
  };
  state.points ??= {};  // 旧バージョンで保存したデータとの互換
  state.audits ??= {};
  state.tracks ??= [];
  state.trackSeq ??= state.tracks.length;
  state.planner ??= { skipped: {}, history: [], budgetMin: 30 };
  state.planner.skipped ??= {};
  state.planner.history ??= [];
  state.planner.budgetMin ??= 30;
  state.pseq ??= 0;
  // v1では建物入口が pin として保存されていた。建物本体の位置と混同しないよう移行する。
  for (const rec of Object.values(state.buildings ?? {})) {
    if (rec?.pin && !rec.entrance) rec.entrance = rec.pin;
    if (rec && 'pin' in rec) delete rec.pin;
  }
  let logging = false;
  let lastNodeId = null;   // 歩行チェーンの末尾（Sノードのみ）
  let activeTrack = null;  // 後処理用の生GPSログ
  let lastRawTimestamp = null;
  let activePlannerTask = null;
  let currentPlan = null;
  let currentTaskIndex = 0;
  let lastPlannerPosition = null;
  let plannerRefreshAt = 0;
  const actions = [];      // 取り消し用の操作履歴
  let wakeLock = null;
  const guideGroup = new THREE.Group();
  scene.add(guideGroup);

  let storageWarned = false;
  function schedulePcBackup(json) {
    if (!syncToken) return;
    clearTimeout(syncTimer);
    syncStatus = 'PC同期中';
    syncTimer = setTimeout(async () => {
      try {
        const response = await fetch(`./api/survey-backup?token=${encodeURIComponent(syncToken)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json, cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        syncStatus = 'PC保存済み';
      } catch {
        syncStatus = 'PC同期失敗';
      }
      updateHud();
    }, 1200);
  }
  function save() {
    try {
      const json = JSON.stringify(state);
      schedulePcBackup(json);
      localStorage.setItem(LS_KEY, json);
      if (json.length > 3_500_000 && !storageWarned) {
        storageWarned = true;
        toast('測量データが大きくなっています。今すぐ「書き出し」でバックアップしてください', 6200);
      }
    } catch {
      storageWarned = true;
      toast('端末保存容量が不足しています。測量を止めて直ちに書き出してください', 7000);
    }
  }
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } }

  // ---------- 座標ユーティリティ ----------
  const here = () => (geoState.lat != null ? {
    lat: geoState.lat,
    lng: geoState.lng,
    accuracy: Number.isFinite(geoState.accuracy) ? geoState.accuracy : null,
    timestamp: Number.isFinite(geoState.timestamp) ? geoState.timestamp : Date.now(),
  } : null);
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
    state.nodes[id] = {
      lat: pos.lat, lng: pos.lng,
      accuracy: Number.isFinite(pos.accuracy) ? pos.accuracy : undefined,
      recordedAt: Number.isFinite(pos.timestamp) ? new Date(pos.timestamp).toISOString() : undefined,
    };
    if (activeTrack && logging) (activeTrack.nodeIds ??= []).push(id);
    const edge = connectTo && connectTo !== id ? [connectTo, id] : null;
    if (edge) state.edges.push(edge);
    actions.push({ type: 'node', id, edge });
    lastNodeId = id;
    save(); redraw(); updateHud();
    return id;
  }

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // 建物入口などは、1回のGPS値ではなくその場で複数回測った中央値を採用する。
  async function captureStationaryPosition(label) {
    if (!here()) { toast('GPSを取得中です。空の見える場所で少し待ってください'); return null; }
    toast(`${label}: ${STATIONARY_SECONDS}秒間、その場で停止してください`, 4200);
    const samples = [];
    const seen = new Set();
    const deadline = Date.now() + STATIONARY_SECONDS * 1000;
    while (Date.now() < deadline) {
      const p = here();
      if (p && Number.isFinite(p.accuracy) && p.accuracy <= ACCURACY_LIMIT_M && !seen.has(p.timestamp)) {
        seen.add(p.timestamp);
        samples.push(p);
      }
      await wait(700);
    }
    if (samples.length < SURVEY_QUALITY.minStationarySamples) {
      toast(`有効GPSが${samples.length}点だけでした。3点以上必要なため、空の見える場所で再試行してください`, 5600);
      return null;
    }
    const result = {
      lat: median(samples.map(p => p.lat)),
      lng: median(samples.map(p => p.lng)),
      accuracy: median(samples.map(p => p.accuracy)),
      samples: samples.length,
      measuredAt: new Date().toISOString(),
      timestamp: Date.now(),
    };
    toast(`${label}: ${samples.length}点の中央値を取得しました（±${Math.round(result.accuracy)}m）`);
    return result;
  }

  async function recordPoi(poi, isPlace) {
    const p = await captureStationaryPosition(`${poi.name}の入口`);
    if (!p) return false;
    // 入口ノードは歩行チェーンとは独立に、最寄りの通路ノードへ接続する
    const keep = lastNodeId;
    lastNodeId = null;
    const nodeId = addNode(p, { connectNearest: true });
    lastNodeId = keep;
    const bucket = isPlace ? state.places : state.buildings;
    const previousRecord = bucket[poi.id] ? structuredClone(bucket[poi.id]) : null;
    if (isPlace) {
      bucket[poi.id] = { entry: nodeId, pin: p };
    } else {
      const previous = bucket[poi.id] ?? {};
      const entrances = Array.isArray(previous.entrances) ? [...previous.entrances]
        : (previous.entrance ? [{ ...previous.entrance, entry: previous.entry }] : []);
      const same = entrances.findIndex(e => distM(e, p) <= 4);
      const measured = { ...p, entry: nodeId };
      if (same >= 0) entrances[same] = measured;
      else entrances.push(measured);
      bucket[poi.id] = { ...previous, entry: nodeId, entrance: p, entrances };
    }
    actions.push({ type: 'poi', isPlace, poiId: poi.id, previousRecord });
    save(); redraw(); updateHud();
    toast(`「${poi.name}」の入口を記録しました（中央値±${Math.round(p.accuracy)}m）`);
    refreshPlanner();
    return true;
  }

  // 地図に無いスポット（駐輪場・自販機・喫煙所など）を現在地に新規登録する。
  // 反映は「書き出し → survey-data.js を置き換えて push」した時だけ =
  // 運用前フェーズの整備専用で、一般ユーザーが勝手に増やすことはできない。
  async function recordPoint(name, cat) {
    const p = await captureStationaryPosition(name);
    if (!p) return;
    const keep = lastNodeId;
    lastNodeId = null;
    const nodeId = addNode(p, { connectNearest: true });
    lastNodeId = keep;
    const id = 'pt-' + (++state.pseq);
    state.points[id] = { name: name.slice(0, 24), cat, entry: nodeId, pin: p };
    actions.push({ type: 'point', id });
    save(); redraw(); updateHud();
    toast(`「${name}」を登録しました（中央値±${Math.round(p.accuracy)}m）`);
  }

  function saveAudit(poi, { status, observedName, note }) {
    const corrected = status === 'corrected' ? observedName.trim().slice(0, 60) : '';
    if (status === 'corrected' && !corrected) {
      toast('現地で確認した正しい名称を入力してください');
      return false;
    }
    const previousAudit = state.audits[poi.id] ? structuredClone(state.audits[poi.id]) : null;
    state.audits[poi.id] = {
      status,
      observedName: corrected,
      note: note.trim().slice(0, 240),
      checkedAt: new Date().toISOString(),
      location: here(),
    };
    actions.push({ type: 'audit', poiId: poi.id, previousAudit });
    save(); updateHud();
    toast(status === 'ok' ? `「${poi.name}」を名称OKで記録しました` : `「${poi.name}」の現地確認を保存しました`);
    refreshPlanner();
    return true;
  }

  function undo() {
    const a = actions.pop();
    if (!a) { toast('取り消す操作がありません'); return; }
    if (a.type === 'point') {
      delete state.points[a.id];
      toast('ポイント登録を取り消しました（もう一度↩でノードも消えます）');
      save(); redraw(); updateHud();
      return;
    }
    if (a.type === 'audit') {
      if (a.previousAudit) state.audits[a.poiId] = a.previousAudit;
      else delete state.audits[a.poiId];
      toast('名称チェックを取り消しました');
      save(); updateHud(); refreshPlanner(true);
      return;
    }
    if (a.type === 'node') {
      delete state.nodes[a.id];
      state.edges = state.edges.filter(e => e[0] !== a.id && e[1] !== a.id);
      if (lastNodeId === a.id) {
        lastNodeId = a.edge && state.nodes[a.edge[0]] ? a.edge[0] : null;
      }
      toast('ノードを取り消しました');
    } else if (a.type === 'poi') {
      const bucket = a.isPlace ? state.places : state.buildings;
      if (a.previousRecord) bucket[a.poiId] = a.previousRecord;
      else delete bucket[a.poiId];
      toast('入口記録を取り消しました（もう一度↩でノードも消えます）');
    }
    save(); redraw(); updateHud();
  }

  function clearAll() {
    if (!confirm('測量データをすべて削除します。よろしいですか？\n（エクスポート済みのファイルには影響しません）')) return;
    state.seq = 1; state.pseq = 0; state.trackSeq = 0;
    state.nodes = {}; state.edges = []; state.buildings = {}; state.places = {}; state.points = {};
    state.audits = {}; state.tracks = [];
    state.planner = { skipped: {}, history: [], budgetMin: 30 };
    activeTrack = null; lastRawTimestamp = null;
    actions.length = 0; lastNodeId = null;
    save(); redraw(); updateHud();
    refreshPlanner(true);
    toast('測量データを削除しました');
  }

  async function restoreFromPc() {
    if (!syncToken || !confirm('スマホ内の現在の測量状態を、PCの最新バックアップで置き換えます。よろしいですか？')) return;
    try {
      const response = await fetch(`./api/survey-backup?token=${encodeURIComponent(syncToken)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const restored = await response.json();
      if (!restored || typeof restored !== 'object' || !restored.nodes
          || !Array.isArray(restored.edges) || !Array.isArray(restored.tracks)) throw new Error('invalid state');
      localStorage.setItem(LS_KEY, JSON.stringify(restored));
      location.reload();
    } catch {
      toast('PCバックアップを復元できませんでした', 5200);
    }
  }

  function exportData() {
    if (logging) {
      toast('先に測定を停止して品質判定を完了してください');
      return;
    }
    const progress = surveyProgress(state);
    const requestedReplace = !!ui.replace.checked;
    const canReplace = progress.productionReady;
    const production = requestedReplace && canReplace ? buildProductionGraph(state) : null;
    if (requestedReplace && !canReplace) {
      ui.replace.checked = false;
      state.replaceGraph = false;
      toast('全6品質条件が未達のため、略図の置換を停止しました。進捗を100%にしてください', 5600);
    }
    const productionCoords = production ? Object.values(production.nodes).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
    const geo = deriveGeoReference(productionCoords);
    const body = {
      version: 3,
      recordedAt: new Date().toISOString(),
      geo,
      replaceGraph: !!production,
      nodes: production?.nodes ?? state.nodes,
      edges: production?.edges ?? state.edges,
      buildings: production?.buildings ?? state.buildings,
      places: production?.places ?? state.places,
      points: production?.points ?? state.points,
      audits: state.audits,
      // 生GPSは公開地図へ直接適用せず、往復軌跡の平均化・外れ値除去用に保持する。
      tracks: state.tracks,
      planner: state.planner,
    };
    const text =
      '// 自動生成: BKC現地測量データ（?survey モードでエクスポート）\n' +
      '// このファイルで js/survey-data.js を丸ごと置き換えて push すると、\n' +
      '// マップとナビが実測GPSベースになります。\n' +
      'export const SURVEY = ' + JSON.stringify(body, null, 2) + ';\n';
    navigator.clipboard?.writeText(text).catch(() => {});
    downloadText('survey-data.js', text, 'text/javascript');

    const features = [];
    for (const track of state.tracks) {
      if (!track.quality?.passed || !['path', 'free-path'].includes(track.kind)) continue;
      const coords = (track.samples ?? [])
        .filter(p => Number.isFinite(p.accuracy) && p.accuracy <= SURVEY_QUALITY.productionAccuracyM)
        .map(p => [p.lng, p.lat]);
      if (coords.length >= 2) features.push({
        type: 'Feature',
        properties: { kind: 'path-observation', id: track.id, taskId: track.taskId, direction: track.direction, quality: track.quality },
        geometry: { type: 'LineString', coordinates: coords },
      });
    }
    for (const shop of SURVEY_SHOPS) {
      const rec = state.buildings[shop.id];
      const entrances = Array.isArray(rec?.entrances) ? rec.entrances : (rec?.entrance ? [rec.entrance] : []);
      entrances.forEach((entrance, index) => features.push({
        type: 'Feature', properties: { kind: 'entrance', id: shop.id, entranceIndex: index + 1, name: state.audits[shop.id]?.observedName || shop.name },
        geometry: { type: 'Point', coordinates: [entrance.lng, entrance.lat] },
      }));
      if (Array.isArray(rec?.footprint) && rec.footprint.length >= 4) features.push({
        type: 'Feature', properties: { kind: 'building', id: shop.id, name: state.audits[shop.id]?.observedName || shop.name, quality: rec.footprintQuality },
        geometry: { type: 'Polygon', coordinates: [rec.footprint.map(p => [p.lng, p.lat])] },
      });
    }
    const geojson = JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
    setTimeout(() => downloadText('bkc-survey.geojson', geojson, 'application/geo+json'), 250);
    toast('survey-data.js と GeoJSON を書き出しました');
  }

  function downloadText(filename, contents, type) {
    const blob = new Blob([contents], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function setLogging(on, context = null) {
    logging = on;
    lastNodeId = null; // 開始・停止のたびに新しいチェーンにする
    ui.log.textContent = on ? '記録を停止' : '記録を開始';
    ui.log.classList.toggle('sv-active', on);
    if (on) {
      startGeolocation();
      activeTrack = {
        id: `T${++state.trackSeq}`,
        startedAt: new Date().toISOString(),
        endedAt: null,
        kind: context?.kind ?? 'free-path',
        taskId: context?.taskId ?? null,
        targetId: context?.targetId ?? null,
        targetEdge: context?.targetEdge ?? null,
        targetNodes: context?.targetNodes ?? null,
        direction: context?.direction ?? null,
        expectedStartWorld: context?.expectedStartWorld ?? null,
        expectedEndWorld: context?.expectedEndWorld ?? null,
        nodeIds: [],
        samples: [],
      };
      activePlannerTask = context?.task ?? null;
      state.tracks.push(activeTrack);
      lastRawTimestamp = null;
      save();
      toast('歩行ログ記録中 — 通路の中央をゆっくり歩いてください');
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 非対応でも続行 */ }
    } else {
      const finishedTrack = activeTrack;
      if (finishedTrack) {
        finishedTrack.endedAt = new Date().toISOString();
        finishedTrack.quality = evaluateTrack(finishedTrack);
        if (finishedTrack.kind === 'building-perimeter' && finishedTrack.targetId) {
          const result = perimeterFromTrack(finishedTrack);
          finishedTrack.footprintQuality = result;
          if (result.passed) {
            const rec = state.buildings[finishedTrack.targetId] ??= {};
            rec.footprint = result.footprint;
            rec.center = result.center;
            rec.footprintQuality = {
              passed: true, closureM: result.closureM, samples: result.samples,
              areaM2: result.areaM2, medianAccuracyM: result.medianAccuracyM,
              measuredAt: new Date().toISOString(),
            };
            toast(`建物外周を採用しました（閉合差${Math.round(result.closureM)}m）`, 4200);
          } else {
            toast(`外周は品質不足です: ${result.reason}。再測定してください`, 5200);
          }
        } else if (finishedTrack.kind === 'path' || finishedTrack.kind === 'free-path') {
          const q = finishedTrack.quality;
          if (!q.passed) {
            const rejected = new Set(finishedTrack.nodeIds ?? []);
            for (const id of rejected) delete state.nodes[id];
            state.edges = state.edges.filter(([a, b]) => !rejected.has(a) && !rejected.has(b));
            if (lastNodeId && rejected.has(lastNodeId)) lastNodeId = null;
            redraw();
          }
          const endpointReason = Number.isFinite(q.startErrorM) && (q.startErrorM > 35 || q.endErrorM > 35)
            ? `。指定区間との端点差 ${Math.round(q.startErrorM)}m/${Math.round(q.endErrorM)}m` : '';
          toast(q.passed
            ? `通路測定を採用しました（良好GPS ${Math.round(q.goodRatio * 100)}%）`
            : `通路測定は品質不足です（良好GPS ${Math.round(q.goodRatio * 100)}%）${endpointReason}。再測定してください`, 5200);
        }
        if (finishedTrack.taskId) {
          state.planner.history.push({
            taskId: finishedTrack.taskId,
            finishedAt: finishedTrack.endedAt,
            passed: finishedTrack.kind === 'building-perimeter'
              ? !!finishedTrack.footprintQuality?.passed : !!finishedTrack.quality?.passed,
          });
        }
      }
      activeTrack = null;
      activePlannerTask = null;
      lastRawTimestamp = null;
      save();
      try { wakeLock?.release(); } catch { /* noop */ }
      wakeLock = null;
    }
    updateHud();
    if (!on) refreshPlanner();
    else {
      const task = currentPlan?.tasks?.[currentTaskIndex];
      renderTaskGuidance(task);
      drawPlannerTask(task);
    }
  }

  // ---------- 歩行ログ（自動ノード記録） ----------
  setInterval(() => {
    updateHud();
    if (!logging) return;
    const p = here();
    if (!p) return;
    if (activeTrack && Number.isFinite(p.accuracy) && p.accuracy <= RAW_ACCURACY_LIMIT_M && p.timestamp !== lastRawTimestamp) {
      lastRawTimestamp = p.timestamp;
      activeTrack.samples.push({
        lat: p.lat, lng: p.lng, accuracy: p.accuracy, timestamp: p.timestamp,
      });
      // 端末を閉じても失わないよう定期保存。ノード追加時にも保存される。
      if (activeTrack.samples.length % 5 === 0) save();
    }
    if ((p.accuracy ?? 999) > ACCURACY_LIMIT_M) return;
    // 建物外周は建物ポリゴン用であり、歩行ナビの通路グラフには追加しない。
    if (activeTrack?.kind === 'building-perimeter') return;
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
      [...Object.values(state.buildings), ...Object.values(state.places), ...Object.values(state.points)].map(s => s.entry)
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
      position: fixed; z-index: 90; left: 50%; transform: translateX(-50%);
      bottom: max(8px, env(safe-area-inset-bottom));
      width: min(430px, calc(100vw - 16px)); max-height: min(62dvh, 610px); overflow-y: auto;
      background: rgba(20,24,28,.95); backdrop-filter: blur(14px);
      border: 1px solid rgba(56,240,255,.35); border-radius: 18px;
      padding: 10px 12px; color: #eef4f6; font-size: 13px;
      box-shadow: 0 14px 44px rgba(0,0,0,.5);
    }
    #survey-panel .sv-head { display: flex; justify-content: space-between; align-items: center; font-weight: 800; margin-bottom: 6px; }
    #survey-panel #sv-gps { font-size: 11px; font-weight: 700; color: #7ceaff; }
    #survey-panel #sv-gps.sv-bad { color: #fca5a5; }
    #survey-panel .sv-stats { font-size: 10px; color: #9fc9d8; margin: 7px 0; }
    #sv-guide { border: 1px solid rgba(74,222,128,.4); border-radius: 14px; padding: 10px; background: rgba(8,25,31,.9); }
    #sv-guide-head { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:7px; }
    #sv-guide-head b { color:#f6c76a; font-size:12px; }
    #sv-progress-track { height:7px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.1); margin-bottom:7px; }
    #sv-progress-fill { height:100%; width:0; background:linear-gradient(90deg,#22d3ee,#4ade80); }
    #sv-progress-text { color:#b9dce8; font-size:10px; line-height:1.45; margin:7px 0; }
    #sv-plan-controls { display:flex; gap:6px; margin-bottom:8px; }
    #sv-budget { width:86px; border-radius:9px; border:1px solid rgba(56,240,255,.3); background:#081722; color:#eafcff; padding:0 7px; }
    #sv-task-card { border-top:1px solid rgba(74,222,128,.25); padding-top:8px; }
    #sv-task-card.hidden { display:none; }
    #sv-task-count { color:#7ceaff; font-size:10px; font-weight:800; }
    #sv-action-title { display:block; color:#fff; font-size:20px; line-height:1.25; margin:5px 0; }
    #sv-distance { color:#4ade80; font-size:14px; font-weight:900; margin-bottom:6px; }
    #sv-route-key { display:flex; gap:12px; font-size:10px; color:#d7e8ed; margin:5px 0 8px; }
    #sv-route-key span::before { content:''; display:inline-block; width:18px; height:5px; border-radius:9px; margin-right:5px; vertical-align:middle; }
    #sv-route-key .move::before { background:#22d3ee; }
    #sv-route-key .measure::before { background:#ff4fd8; }
    #sv-task-title { display:block; color:#d9f7ff; font-size:12px; line-height:1.35; margin:3px 0 6px; }
    #sv-task-reason, #sv-task-instruction { color:#bdd4dc; font-size:11px; line-height:1.5; margin:0 0 5px; }
    #sv-task-instruction { color:#f7e7bc; font-size:13px; font-weight:800; }
    #sv-simple-steps { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin:8px 0; }
    #sv-simple-steps span { padding:6px 4px; border-radius:8px; background:rgba(255,255,255,.06); color:#8daab4; text-align:center; font-size:10px; font-weight:800; }
    #sv-simple-steps span.active { background:rgba(74,222,128,.18); color:#8ff3b0; outline:1px solid rgba(74,222,128,.45); }
    #sv-task-start { min-height:58px; font-size:16px; background:#22c55e; color:#062b15; border:0; }
    #sv-task-start.stop { background:#ef4444; color:#fff; }
    #sv-task-start:disabled { background:#475569; color:#cbd5e1; cursor:not-allowed; }
    #sv-safety { color:#fca5a5; font-size:10px; line-height:1.4; margin:6px 0 0; }
    #sv-secondary-actions { display:flex; gap:6px; margin-top:6px; }
    #sv-advanced { margin-top:8px; border-top:1px solid rgba(255,255,255,.1); padding-top:7px; }
    #sv-advanced summary { cursor:pointer; color:#93b9c7; font-size:11px; font-weight:800; padding:4px; }
    #sv-advanced[open] summary { margin-bottom:7px; }
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
    #survey-picker, #survey-audit-picker {
      position: fixed; inset: 0; z-index: 95; background: rgba(4,12,18,.9); backdrop-filter: blur(8px);
      display: flex; flex-direction: column; padding: 16px;
    }
    #survey-picker.hidden, #survey-audit-picker.hidden { display: none; }
    #survey-picker h3, #survey-audit-picker h3 { color: #eafcff; font-size: 15px; margin-bottom: 10px; }
    #sv-picker-list, #sv-audit-list { overflow-y: auto; flex: 1; display: grid; gap: 6px; align-content: start; }
    .sv-poi {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 12px 14px; border-radius: 12px; cursor: pointer; text-align: left;
      border: 1px solid rgba(56,240,255,.25); background: rgba(10,26,38,.9); color: #eafcff;
      font: 700 13px/1.3 inherit;
    }
    .sv-poi small { color: #7ceaff; font-weight: 700; flex-shrink: 0; }
    .sv-poi .sv-done { color: #4ade80; }
    #sv-picker-close, #sv-audit-close { margin-top: 10px; min-height: 48px; }
    #survey-point-form, #survey-audit-form {
      position: fixed; inset: 0; z-index: 96; background: rgba(4,12,18,.9); backdrop-filter: blur(8px);
      display: grid; place-items: center; padding: 16px;
    }
    #survey-point-form.hidden, #survey-audit-form.hidden { display: none; }
    #survey-point-form .sv-form, #survey-audit-form .sv-form {
      width: min(340px, 100%); display: grid; gap: 10px;
      background: rgba(10,26,38,.96); border: 1px solid rgba(56,240,255,.3); border-radius: 16px;
      padding: 16px; max-height: calc(100dvh - 32px); overflow-y: auto;
    }
    #survey-point-form h3, #survey-audit-form h3 { color: #eafcff; font-size: 15px; }
    #survey-point-form label, #survey-audit-form label { color: #9fc9d8; font-size: 11px; font-weight: 700; }
    #survey-point-form input, #survey-point-form select,
    #survey-audit-form input, #survey-audit-form select, #survey-audit-form textarea {
      width: 100%; min-height: 46px; border-radius: 10px; padding: 0 12px;
      border: 1px solid rgba(56,240,255,.3); background: rgba(4,14,22,.9); color: #eafcff;
      font: 700 14px/1.2 inherit;
    }
    #survey-audit-form textarea { min-height: 76px; padding-block: 10px; resize: vertical; }
    #sv-audit-current { color: #ffffff; font-size: 16px; overflow-wrap: anywhere; }
    #sv-audit-help { color: #9fc9d8; font-size: 11px; line-height: 1.5; }
    body.nav-active #survey-panel { display: none; }
    @media (max-width: 640px) {
      #survey-panel { max-height: 58dvh; }
      #survey-panel .sv-head { margin-bottom:4px; }
    }
  `;
  document.head.appendChild(style);

  // #app は fixed 配置でスタッキングコンテキストを作るため、その内側に入れて
  // 起動時ピッカー（z:210）より下・通常UIより上の正しい重なり順にする
  const uiRoot = document.getElementById('app') ?? document.body;
  const panel = document.createElement('div');
  panel.id = 'survey-panel';
  panel.innerHTML = `
    <div class="sv-head"><span>現地MAP調査</span><span id="sv-gps">GPS待機中</span></div>
    <section id="sv-guide" aria-label="適応型調査ガイド">
      <div id="sv-guide-head"><b id="sv-phase">調査計画を作成中</b><span id="sv-score">0%</span></div>
      <div id="sv-progress-track"><div id="sv-progress-fill"></div></div>
      <div id="sv-task-card" class="hidden">
        <span id="sv-task-count">いまやること</span>
        <strong id="sv-action-title">GPSを取得しています</strong>
        <div id="sv-distance"></div>
        <div id="sv-route-key"><span class="move">青：開始点まで</span><span class="measure">ピンク：測定する道</span></div>
        <strong id="sv-task-title"></strong>
        <p id="sv-task-instruction"></p>
        <div id="sv-simple-steps"><span>① 開始点へ</span><span>② 道を歩く</span><span>③ ゴールで停止</span></div>
        <button id="sv-task-start" class="sv-btn" type="button">GPSを待っています</button>
        <div id="sv-secondary-actions">
          <button id="sv-task-speak" class="sv-btn sv-small" type="button">🔊 読み上げ</button>
          <button id="sv-plan-refresh" class="sv-btn" type="button">現在地から引き直す</button>
          <button id="sv-task-skip" class="sv-btn sv-small" type="button">別の場所</button>
        </div>
        <p id="sv-safety">安全優先：歩きながら画面を注視せず、立入禁止区域や車道には入らないでください。</p>
      </div>
    </section>
    <details id="sv-advanced">
      <summary>進捗・手動操作（通常は開かなくてOK）</summary>
      <div id="sv-progress-text"></div>
      <div id="sv-plan-controls">
        <select id="sv-budget" aria-label="調査時間">
          <option value="15">15分</option><option value="30" selected>30分</option><option value="60">60分</option>
        </select>
      </div>
      <div class="sv-stats" id="sv-stats"></div>
      <p id="sv-task-reason"></p>
      <div class="sv-row">
        <button id="sv-log" class="sv-btn" type="button">手動記録</button>
        <button id="sv-node" class="sv-btn sv-small" type="button">点追加</button>
        <button id="sv-undo" class="sv-btn sv-small" type="button">戻す</button>
      </div>
      <div class="sv-row">
        <button id="sv-poi" class="sv-btn" type="button">入口</button>
        <button id="sv-point" class="sv-btn" type="button">新規スポット</button>
        <button id="sv-audit" class="sv-btn" type="button">建物名</button>
      </div>
      <label class="sv-check"><input type="checkbox" id="sv-replace"> 進捗100%後に実測MAPへ置換</label>
      <div class="sv-row">
        <button id="sv-export" class="sv-btn sv-primary" type="button">書き出し</button>
        <button id="sv-restore" class="sv-btn" type="button"${syncToken ? '' : ' hidden'}>PC復元</button>
        <button id="sv-clear" class="sv-btn sv-danger" type="button">削除</button>
      </div>
    </details>`;
  uiRoot.appendChild(panel);

  const picker = document.createElement('div');
  picker.id = 'survey-picker';
  picker.className = 'hidden';
  picker.innerHTML = `
    <h3>どの施設の入口ですか？（近い順）</h3>
    <div id="sv-picker-list"></div>
    <button id="sv-picker-close" class="sv-btn" type="button">閉じる</button>`;
  uiRoot.appendChild(picker);

  const auditPicker = document.createElement('div');
  auditPicker.id = 'survey-audit-picker';
  auditPicker.className = 'hidden';
  auditPicker.innerHTML = `
    <h3>建物名を現地確認（未確認・近い順）</h3>
    <div id="sv-audit-list"></div>
    <button id="sv-audit-close" class="sv-btn" type="button">閉じる</button>`;
  uiRoot.appendChild(auditPicker);

  let activeAuditPoi = null;
  const auditForm = document.createElement('div');
  auditForm.id = 'survey-audit-form';
  auditForm.className = 'hidden';
  auditForm.innerHTML = `
    <div class="sv-form">
      <h3>建物名の現地確認</h3>
      <strong id="sv-audit-current"></strong>
      <div><label for="sv-audit-status">確認結果</label>
      <select id="sv-audit-status">
        <option value="ok">名称OK（現地表示と一致）</option>
        <option value="corrected">名称を修正</option>
        <option value="unconfirmed">表示がなく確認できない</option>
        <option value="not-found">建物を確認できない</option>
      </select></div>
      <div><label for="sv-audit-name">現地で確認した正しい名称</label>
      <input id="sv-audit-name" type="text" maxlength="60" placeholder="名称を修正する場合に入力"></div>
      <div><label for="sv-audit-note">メモ（別名・工事中・表札位置など）</label>
      <textarea id="sv-audit-note" maxlength="240" placeholder="任意"></textarea></div>
      <p id="sv-audit-help">「保存＋入口測定」は、この確認結果を保存した後、15秒間のGPS中央値で入口も記録します。</p>
      <button id="sv-audit-save-entry" class="sv-btn sv-primary" type="button">保存＋入口測定</button>
      <button id="sv-audit-save" class="sv-btn" type="button">名称チェックだけ保存</button>
      <button id="sv-audit-cancel" class="sv-btn" type="button">キャンセル</button>
    </div>`;
  uiRoot.appendChild(auditForm);

  // 新規スポット登録フォーム（駐輪場・自販機・喫煙所など地図に無い場所を現在地で登録）
  const pointForm = document.createElement('div');
  pointForm.id = 'survey-point-form';
  pointForm.className = 'hidden';
  pointForm.innerHTML = `
    <div class="sv-form">
      <h3>現在地にスポットを登録</h3>
      <div><label for="sv-pt-name">名前（例: 第一駐輪場）</label>
      <input id="sv-pt-name" type="text" maxlength="24" placeholder="スポット名"></div>
      <div><label for="sv-pt-cat">カテゴリ</label>
      <select id="sv-pt-cat">
        ${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}"${k === 'life' ? ' selected' : ''}>${c.label}</option>`).join('')}
      </select></div>
      <button id="sv-pt-save" class="sv-btn sv-primary" type="button">現在地に登録</button>
      <button id="sv-pt-cancel" class="sv-btn" type="button">キャンセル</button>
    </div>`;
  uiRoot.appendChild(pointForm);
  panel.querySelector('#sv-point').addEventListener('click', () => {
    if (!here()) { toast('GPSを取得中です。空の見える場所で少し待ってください'); return; }
    pointForm.classList.remove('hidden');
    setTimeout(() => pointForm.querySelector('#sv-pt-name').focus(), 60);
  });
  pointForm.querySelector('#sv-pt-cancel').addEventListener('click', () => pointForm.classList.add('hidden'));
  pointForm.addEventListener('click', (e) => { if (e.target === pointForm) pointForm.classList.add('hidden'); });
  pointForm.querySelector('#sv-pt-save').addEventListener('click', () => {
    const name = pointForm.querySelector('#sv-pt-name').value.trim();
    if (!name) { toast('スポット名を入力してください'); return; }
    const cat = pointForm.querySelector('#sv-pt-cat').value;
    pointForm.classList.add('hidden');
    pointForm.querySelector('#sv-pt-name').value = '';
    recordPoint(name, CATEGORIES[cat] ? cat : 'life');
  });

  const readAuditForm = () => ({
    status: auditForm.querySelector('#sv-audit-status').value,
    observedName: auditForm.querySelector('#sv-audit-name').value,
    note: auditForm.querySelector('#sv-audit-note').value,
  });
  function closeAuditForm() {
    auditForm.classList.add('hidden');
    activeAuditPoi = null;
  }
  auditForm.querySelector('#sv-audit-cancel').addEventListener('click', closeAuditForm);
  auditForm.addEventListener('click', (e) => { if (e.target === auditForm) closeAuditForm(); });
  auditForm.querySelector('#sv-audit-save').addEventListener('click', () => {
    if (!activeAuditPoi || !saveAudit(activeAuditPoi, readAuditForm())) return;
    closeAuditForm();
  });
  auditForm.querySelector('#sv-audit-save-entry').addEventListener('click', async () => {
    if (!activeAuditPoi || !saveAudit(activeAuditPoi, readAuditForm())) return;
    const poi = activeAuditPoi;
    closeAuditForm();
    await recordPoi(poi, false);
  });

  const ui = {
    gps: panel.querySelector('#sv-gps'),
    stats: panel.querySelector('#sv-stats'),
    log: panel.querySelector('#sv-log'),
    replace: panel.querySelector('#sv-replace'),
    phase: panel.querySelector('#sv-phase'),
    score: panel.querySelector('#sv-score'),
    progressFill: panel.querySelector('#sv-progress-fill'),
    progressText: panel.querySelector('#sv-progress-text'),
    budget: panel.querySelector('#sv-budget'),
    taskCard: panel.querySelector('#sv-task-card'),
    taskCount: panel.querySelector('#sv-task-count'),
    actionTitle: panel.querySelector('#sv-action-title'),
    distance: panel.querySelector('#sv-distance'),
    taskTitle: panel.querySelector('#sv-task-title'),
    taskReason: panel.querySelector('#sv-task-reason'),
    taskInstruction: panel.querySelector('#sv-task-instruction'),
    taskStart: panel.querySelector('#sv-task-start'),
  };
  ui.budget.value = String(state.planner.budgetMin);
  ui.replace.checked = !!state.replaceGraph;
  ui.replace.addEventListener('change', () => {
    if (ui.replace.checked) {
      const p = surveyProgress(state);
      if (!p.productionReady) {
        ui.replace.checked = false;
        toast('基準点・往復通路・名称・入口・外周・GPS品質がすべて合格するまで置換できません', 5600);
      }
    }
    state.replaceGraph = ui.replace.checked; save();
  });

  panel.querySelector('#sv-log').addEventListener('click', () => setLogging(!logging));
  panel.querySelector('#sv-plan-refresh').addEventListener('click', () => refreshPlanner(true));
  ui.budget.addEventListener('change', () => {
    state.planner.budgetMin = Number(ui.budget.value) || 30;
    save(); refreshPlanner(true);
  });
  ui.taskStart.addEventListener('click', startCurrentTask);
  panel.querySelector('#sv-task-speak').addEventListener('click', speakCurrentTask);
  panel.querySelector('#sv-task-skip').addEventListener('click', () => {
    const task = currentPlan?.tasks?.[currentTaskIndex];
    if (!task) return;
    state.planner.skipped[task.id] = Date.now();
    save(); refreshPlanner(true);
    toast('この調査を24時間後回しにしました');
  });
  panel.querySelector('#sv-node').addEventListener('click', () => {
    const p = here();
    if (!p) { toast('GPSを取得中です…'); return; }
    addNode(p, { connectNearest: true });
    toast('ノードを追加しました');
  });
  panel.querySelector('#sv-undo').addEventListener('click', undo);
  panel.querySelector('#sv-clear').addEventListener('click', clearAll);
  panel.querySelector('#sv-export').addEventListener('click', exportData);
  panel.querySelector('#sv-restore').addEventListener('click', restoreFromPc);
  panel.querySelector('#sv-poi').addEventListener('click', openPicker);
  panel.querySelector('#sv-audit').addEventListener('click', openAuditPicker);
  picker.querySelector('#sv-picker-close').addEventListener('click', () => picker.classList.add('hidden'));
  auditPicker.querySelector('#sv-audit-close').addEventListener('click', () => auditPicker.classList.add('hidden'));

  function openPicker() {
    const p = here();
    if (!p) { toast('GPSを取得中です。空の見える場所で少し待ってください'); return; }
    const w = gpsToWorld(p.lat, p.lng);
    const cands = [...SURVEY_SHOPS.map(s => ({ poi: s, isPlace: false })), ...PLACES.map(s => ({ poi: s, isPlace: true }))]
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

  function openAuditPicker() {
    const p = here();
    const w = p ? gpsToWorld(p.lat, p.lng) : null;
    const cands = SURVEY_SHOPS.map(poi => {
      const pw = toWorld(poi.pin.left, poi.pin.top);
      const d = w ? Math.hypot(pw.x - w.x, pw.z - w.z) * GEO.meterPerUnit : Infinity;
      return { poi, d, audit: state.audits[poi.id] };
    }).sort((a, b) => {
      if (!!a.audit !== !!b.audit) return a.audit ? 1 : -1;
      return a.d - b.d || a.poi.name.localeCompare(b.poi.name, 'ja');
    });
    const list = auditPicker.querySelector('#sv-audit-list');
    list.replaceChildren();
    for (const c of cands) {
      const btn = document.createElement('button');
      btn.className = 'sv-poi';
      btn.type = 'button';
      const name = document.createElement('span');
      name.textContent = c.poi.name;
      const meta = document.createElement('small');
      if (c.audit) {
        meta.className = 'sv-done';
        meta.textContent = c.audit.status === 'corrected' ? `修正: ${c.audit.observedName}` : '確認済';
      } else {
        meta.textContent = Number.isFinite(c.d) ? `約${Math.round(c.d)}m` : '未確認';
      }
      btn.append(name, meta);
      btn.addEventListener('click', () => openAuditForPoi(c.poi));
      list.appendChild(btn);
    }
    auditPicker.classList.remove('hidden');
  }

  function openAuditForPoi(poi) {
    activeAuditPoi = poi;
    const saved = state.audits[poi.id];
    auditForm.querySelector('#sv-audit-current').textContent = `登録名：${poi.name}`;
    auditForm.querySelector('#sv-audit-status').value = saved?.status ?? 'ok';
    auditForm.querySelector('#sv-audit-name').value = saved?.observedName ?? '';
    auditForm.querySelector('#sv-audit-note').value = saved?.note ?? '';
    auditPicker.classList.add('hidden');
    auditForm.classList.remove('hidden');
  }

  function refreshPlanner(reset = false) {
    if (!ui?.taskCard) return;
    if (reset) currentTaskIndex = 0;
    currentPlan = createSurveyPlan(state, here(), state.planner.budgetMin);
    const plannedHere = here();
    lastPlannerPosition = plannedHere ? gpsToWorld(plannedHere.lat, plannedHere.lng) : null;
    plannerRefreshAt = Date.now();
    const p = currentPlan.progress;
    ui.phase.textContent = p.productionReady ? '公開品質基準を達成' : currentPlan.phase.label;
    ui.score.textContent = `${p.score}%`;
    ui.progressFill.style.width = `${p.score}%`;
    ui.progressText.textContent =
      `基準点 ${p.controlsDone}/${p.controlsTotal} ・ 通路方向 ${p.edgeDirectionsDone}/${p.edgeDirectionsTotal}` +
      ` ・ 名称 ${p.namesDone}/${p.namesTotal} ・ 入口 ${p.entrancesDone}/${p.entrancesTotal}` +
      ` ・ 外周 ${p.footprintsDone}/${p.footprintsTotal} ・ 良好GPS ${Math.round(p.gpsGoodRatio * 100)}%`;
    const task = currentPlan.tasks[currentTaskIndex];
    drawPlannerTask(task);
    ui.taskCard.classList.toggle('hidden', !task);
    if (!task) {
      if (!p.productionReady) ui.progressText.textContent += ' ・ 現在条件で候補なし（後回し解除または再測定が必要）';
      return;
    }
    ui.taskCount.textContent = `いまやること ・ 約${task.estimatedMin}分`;
    ui.taskTitle.textContent = task.kind === 'path' ? `測定区間：${task.title}` : task.title;
    ui.taskReason.textContent = `理由：${task.reason}`;
    renderTaskGuidance(task);
  }

  function drawPlannerTask(task) {
    for (const child of [...guideGroup.children]) {
      guideGroup.remove(child);
      child.geometry?.dispose(); child.material?.dispose();
    }
    if (!task?.startWorld) return;
    const v3 = p => new THREE.Vector3(p.x, 1.05, p.z);
    const addRoute = (worldPoints, color, radius, opacity) => {
      const points = worldPoints?.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.z)).map(v3) ?? [];
      if (points.length < 2) return;
      const curve = points.length === 2
        ? new THREE.LineCurve3(points[0], points[1])
        : new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.12);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(16, points.length * 10), radius, 8, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false })
      );
      tube.renderOrder = 41; guideGroup.add(tube);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (a.distanceTo(b) < 2) continue;
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 1.9, radius * 4.2, 10),
          new THREE.MeshBasicMaterial({ color, depthTest: false })
        );
        const direction = b.clone().sub(a).normalize();
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        arrow.position.copy(a).lerp(b, 0.68);
        arrow.renderOrder = 44; guideGroup.add(arrow);
      }
    };
    const start = v3(task.startWorld);
    const end = task.endWorld
      ? v3(task.endWorld) : start.clone();
    if (!logging && Array.isArray(task.approachWorld)) addRoute(task.approachWorld, 0x22d3ee, 0.38, 0.72);
    if (task.kind === 'path') {
      addRoute([task.startWorld, task.endWorld], 0xff4fd8, 0.72, 0.92);
    }
    const markers = start.distanceTo(end) < 0.5
      ? [[start, 0x4ade80]] : [[start, 0x4ade80], [end, 0xff4fd8]];
    for (const [p, color] of markers) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.8, 2.65, 36),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false })
      );
      ring.rotation.x = -Math.PI / 2; ring.position.copy(p); ring.renderOrder = 43;
      guideGroup.add(ring);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.42, 6, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthTest: false })
      );
      beacon.position.copy(p).add(new THREE.Vector3(0, 3, 0)); beacon.renderOrder = 42;
      guideGroup.add(beacon);
    }
    // 指示されたルート全体を自動で画面内へ入れ、カメラを回して探す操作を不要にする。
    if (camera && mapControls) {
      const focusWorld = logging && task.kind === 'path'
        ? [task.startWorld, task.endWorld]
        : [...(task.approachWorld ?? []), task.startWorld, task.endWorld].filter(Boolean);
      if (focusWorld.length) {
        const minX = Math.min(...focusWorld.map(p => p.x)), maxX = Math.max(...focusWorld.map(p => p.x));
        const minZ = Math.min(...focusWorld.map(p => p.z)), maxZ = Math.max(...focusWorld.map(p => p.z));
        const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
        const span = Math.max(18, maxX - minX, maxZ - minZ);
        const height = Math.min(155, Math.max(34, span * 1.35));
        mapControls.target.set(cx, 0, cz);
        camera.position.set(cx, height, cz + height * 0.68);
        camera.lookAt(cx, 0, cz);
        mapControls.update();
      }
    }
  }

  function renderTaskGuidance(task) {
    if (!task) return;
    const hp = here();
    const hw = hp ? gpsToWorld(hp.lat, hp.lng) : null;
    const startM = hw ? Math.round(Math.hypot(hw.x - task.startWorld.x, hw.z - task.startWorld.z) * GEO.meterPerUnit) : null;
    const endM = hw && task.endWorld
      ? Math.round(Math.hypot(hw.x - task.endWorld.x, hw.z - task.endWorld.z) * GEO.meterPerUnit) : null;
    const steps = [...panel.querySelectorAll('#sv-simple-steps span')];
    const stepLabels = task.kind === 'path'
      ? ['① STARTへ', '② 道を歩く', '③ ゴールで停止']
      : task.kind === 'control'
        ? ['① 測定点へ', '② 15秒停止', '③ 自動保存']
        : task.kind === 'building'
          ? ['① 建物へ', '② 名称確認', '③ 入口15秒']
          : ['① 開始点へ', '② 外周一周', '③ 戻って停止'];
    steps.forEach((s, i) => { s.textContent = stepLabels[i]; });
    const measureKey = panel.querySelector('#sv-route-key .measure');
    measureKey.hidden = task.kind !== 'path';
    steps.forEach(s => s.classList.remove('active'));
    ui.taskStart.classList.toggle('stop', logging);
    ui.taskStart.disabled = !hp;

    if (!hp) {
      steps[0]?.classList.add('active');
      ui.actionTitle.textContent = 'GPSを取得しています';
      ui.distance.textContent = '空が見える場所で少し待ってください';
      ui.taskInstruction.textContent = '位置情報を許可すると、歩く道を地図上に表示します。';
      ui.taskStart.textContent = 'GPSを待っています';
      return;
    }
    if (logging) {
      const atGoal = task.kind === 'path' && endM != null && endM <= 12;
      steps[atGoal ? 2 : 1]?.classList.add('active');
      ui.actionTitle.textContent = atGoal ? '③ ゴールに着きました' : (
        task.kind === 'building-perimeter' ? '② 建物の外壁に沿って一周' : '② ピンクの矢印に沿って歩く'
      );
      ui.distance.textContent = task.kind === 'path' && endM != null
        ? `ゴールまで約 ${endM}m` : '開始地点へ戻ったら停止';
      ui.taskInstruction.textContent = atGoal
        ? '立ち止まって、下の赤いボタンを押してください。'
        : '画面を見続けず、安全を確認しながら表示ルート上を歩いてください。';
      ui.taskStart.textContent = '③ 測定を停止して品質判定';
      return;
    }

    steps[0]?.classList.add('active');
    const close = startM != null && startM <= 18;
    ui.distance.textContent = startM != null ? `緑のSTARTまで約 ${startM}m` : '';
    if (task.kind === 'path') {
      ui.actionTitle.textContent = close ? '① 緑のSTARTに到着' : '① 青い線で緑のSTARTへ移動';
      ui.taskInstruction.textContent = close
        ? 'その場で下の開始ボタンを押し、ピンクの道を矢印方向へ歩いてください。'
        : 'まず青い線をたどって緑の丸へ行きます。まだ測定開始は押さなくてOKです。';
      ui.taskStart.textContent = close ? '② このピンクの道を測定開始' : '緑のSTARTに着いたら押す';
    } else if (task.kind === 'control') {
      ui.actionTitle.textContent = close ? `① ${task.title.replace('を基準点として測定', '')}に到着` : '① 青い線で測定地点へ移動';
      ui.taskInstruction.textContent = '緑の丸の近くに着いたら立ち止まり、ボタンを押して15秒間動かないでください。';
      ui.taskStart.textContent = 'ここで15秒測定する';
    } else if (task.kind === 'building') {
      ui.actionTitle.textContent = close ? '① 建物の表札と入口を確認' : '① 青い線でこの建物へ移動';
      ui.taskInstruction.textContent = '現地の表札が見える入口前でボタンを押してください。';
      ui.taskStart.textContent = '建物名と入口を記録する';
    } else {
      ui.actionTitle.textContent = close ? '① 外周測定の開始地点に到着' : '① 青い線で建物へ移動';
      ui.taskInstruction.textContent = '開始後、外壁に沿って一周し、この緑の丸へ戻ります。';
      ui.taskStart.textContent = '② 建物外周の測定を開始';
    }
  }

  async function startCurrentTask() {
    if (logging) { await setLogging(false); return; }
    const task = currentPlan?.tasks?.[currentTaskIndex];
    if (!task) return;
    const hp = here();
    const hw = hp ? gpsToWorld(hp.lat, hp.lng) : null;
    const startM = hw ? Math.hypot(hw.x - task.startWorld.x, hw.z - task.startWorld.z) * GEO.meterPerUnit : Infinity;
    if (['path', 'perimeter'].includes(task.kind) && startM > 45) {
      toast(`まだ開始地点まで約${Math.round(startM)}mあります。青い線で緑のSTARTへ移動してください`, 5200);
      return;
    }
    if (task.kind === 'control') {
      const place = PLACES.find(p => p.id === task.targetId);
      if (place) {
        ui.taskStart.disabled = true;
        ui.taskStart.textContent = '15秒間そのまま動かないでください';
        await recordPoi(place, true);
        ui.taskStart.disabled = false;
      }
      return;
    }
    if (task.kind === 'building') {
      const shop = SURVEY_SHOPS.find(s => s.id === task.targetId);
      if (shop) openAuditForPoi(shop);
      return;
    }
    if (task.kind === 'path') {
      await setLogging(true, {
        kind: 'path', taskId: task.id, targetEdge: task.targetEdge,
        targetNodes: task.edgeNodes, direction: task.direction, task,
        expectedStartWorld: task.startWorld, expectedEndWorld: task.endWorld,
      });
      toast(`${task.title}。終点で「測定を停止して判定」を押してください`, 5200);
      return;
    }
    if (task.kind === 'perimeter') {
      await setLogging(true, {
        kind: 'building-perimeter', taskId: task.id, targetId: task.targetId, task,
      });
      toast(`${task.title}。開始地点へ戻ったら測定を停止してください`, 5200);
    }
  }

  function speakCurrentTask() {
    const task = currentPlan?.tasks?.[currentTaskIndex];
    if (!task || !('speechSynthesis' in window)) { toast('この端末は読み上げに対応していません'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      `${ui.actionTitle.textContent}。${ui.distance.textContent}。${ui.taskInstruction.textContent}`
    );
    u.lang = 'ja-JP'; u.rate = 1.02;
    speechSynthesis.speak(u);
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
    const currentPosition = here();
    if (currentPosition && !logging) {
      const world = gpsToWorld(currentPosition.lat, currentPosition.lng);
      const movedM = lastPlannerPosition
        ? Math.hypot(world.x - lastPlannerPosition.x, world.z - lastPlannerPosition.z) * GEO.meterPerUnit : Infinity;
      // 初回GPS取得時と大きく移動した時だけ再計画し、歩いている途中で指示が頻繁に変わるのを防ぐ。
      const refreshDelay = lastPlannerPosition ? 8000 : 1200;
      if ((!lastPlannerPosition || movedM >= 80) && Date.now() - plannerRefreshAt >= refreshDelay) refreshPlanner(true);
    }
    renderTaskGuidance(currentPlan?.tasks?.[currentTaskIndex]);
    const done = Object.keys(state.buildings).length + Object.keys(state.places).length;
    const total = SURVEY_SHOPS.length + PLACES.length;
    const audited = Object.keys(state.audits).length;
    const rawSamples = state.tracks.reduce((n, t) => n + (t.samples?.length ?? 0), 0);
    ui.stats.textContent =
      `ノード ${Object.keys(state.nodes).length} ・ 通路 ${state.edges.length} ・ 入口 ${done}/${total}` +
      ` ・ 名称 ${audited}/${SURVEY_SHOPS.length} ・ 生GPS ${rawSamples}点` +
      ` ・ スポット ${Object.keys(state.points).length}` +
      (syncStatus ? ` ・ ${syncStatus}` : '') +
      (logging ? ' ・ 記録中' : '');
  }

  // ---------- 起動 ----------
  save(); // PC同期URLで開いた場合は、既存の端末データも直ちにバックアップする
  startGeolocation();
  navigator.storage?.persist?.().catch(() => {});
  redraw();
  updateHud();
  refreshPlanner(true);
  toast('測量モード: 通路は往復測定、建物では「建物名をチェック」を使ってください', 5200);
}
