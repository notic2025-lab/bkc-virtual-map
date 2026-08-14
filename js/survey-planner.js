// ============================================================
// BKC 適応型フィールド調査プランナー
//   「情報利得 / 所要時間」を最大化する順に、次の現地調査を組み立てる。
//   完成判定は名称・入口・通路往復・建物外周・GPS品質の全ゲートで行う。
//   LLMや通信に依存しない決定的アルゴリズムなのでオフラインでも動く。
// ============================================================
import { GEO, MAP_W, MAP_D, gpsToWorld, toWorld, BASE_CAMPUS_NAV, BASE_SURVEY_SHOP_IDS, SHOPS, PLACES } from './data.js';

export const SURVEY_QUALITY = Object.freeze({
  productionAccuracyM: 5,
  excellentAccuracyM: 2,
  minGoodFixRatio: 0.7,
  minPathSamples: 6,
  minStationarySamples: 3,
  minPerimeterSamples: 10,
  maxPerimeterClosureM: 20,
});

const fl = { navNodes: BASE_CAMPUS_NAV.nodes, navEdges: BASE_CAMPUS_NAV.edges };
const TARGET_SHOPS = SHOPS.filter(s => BASE_SURVEY_SHOP_IDS.includes(s.id));
const edgeKey = (a, b) => [a, b].sort().join('|');
const worldOfNode = (id) => {
  const p = fl.navNodes[id];
  return p ? toWorld(p.left, p.top) : null;
};
const meters = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) * GEO.meterPerUnit;
const currentWorld = (position) => position?.lat != null ? gpsToWorld(position.lat, position.lng) : null;

function nearestPoiLabel(nodeId) {
  const direct = [...TARGET_SHOPS, ...PLACES].find(p => p.entry === nodeId);
  if (direct) return direct.name;
  const w = worldOfNode(nodeId);
  if (!w) return `通路点 ${nodeId}`;
  let best = null, bd = Infinity;
  for (const p of [...TARGET_SHOPS, ...PLACES]) {
    const pw = toWorld(p.pin.left, p.pin.top);
    const d = meters(w, pw);
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd <= 80 ? `${best.name}付近` : `通路点 ${nodeId}`;
}

// 無向グラフの辺媒介中心性。多くの最短経路に使われる通路ほど重要度を上げる。
function edgeBetweenness() {
  const nodes = Object.keys(fl.navNodes);
  const adj = Object.fromEntries(nodes.map(n => [n, []]));
  for (const [a, b] of fl.navEdges) {
    if (!adj[a] || !adj[b]) continue;
    adj[a].push(b); adj[b].push(a);
  }
  const score = {};
  for (const s of nodes) {
    const stack = [], pred = Object.fromEntries(nodes.map(n => [n, []]));
    const sigma = Object.fromEntries(nodes.map(n => [n, 0])); sigma[s] = 1;
    const dist = Object.fromEntries(nodes.map(n => [n, -1])); dist[s] = 0;
    const q = [s];
    while (q.length) {
      const v = q.shift(); stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; q.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
      }
    }
    const delta = Object.fromEntries(nodes.map(n => [n, 0]));
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) {
        const c = sigma[w] ? sigma[v] / sigma[w] * (1 + delta[w]) : 0;
        score[edgeKey(v, w)] = (score[edgeKey(v, w)] ?? 0) + c;
        delta[v] += c;
      }
    }
  }
  const max = Math.max(1, ...Object.values(score));
  return Object.fromEntries(Object.entries(score).map(([k, v]) => [k, v / max]));
}

const EDGE_IMPORTANCE = edgeBetweenness();

function trackQuality(track) {
  const samples = Array.isArray(track?.samples) ? track.samples : [];
  const good = samples.filter(p => Number.isFinite(p?.accuracy) && p.accuracy <= SURVEY_QUALITY.productionAccuracyM);
  const ratio = samples.length ? good.length / samples.length : 0;
  let distanceM = 0;
  for (let i = 1; i < good.length; i++) {
    const a = gpsToWorld(good[i - 1].lat, good[i - 1].lng);
    const b = gpsToWorld(good[i].lat, good[i].lng);
    const d = meters(a, b);
    if (d < 40) distanceM += d; // GPSジャンプを距離へ加算しない
  }
  const accuracy = good.length
    ? good.map(p => p.accuracy).sort((a, b) => a - b)[Math.floor(good.length / 2)]
    : Infinity;
  let startErrorM = null, endErrorM = null;
  if (good.length && track?.expectedStartWorld && track?.expectedEndWorld) {
    startErrorM = meters(gpsToWorld(good[0].lat, good[0].lng), track.expectedStartWorld);
    endErrorM = meters(gpsToWorld(good[good.length - 1].lat, good[good.length - 1].lng), track.expectedEndWorld);
  }
  const endpointsPassed = startErrorM == null || (startErrorM <= 35 && endErrorM <= 35);
  return {
    samples: samples.length, goodSamples: good.length, goodRatio: ratio, distanceM, medianAccuracyM: accuracy,
    startErrorM, endErrorM,
    passed: good.length >= SURVEY_QUALITY.minPathSamples && ratio >= SURVEY_QUALITY.minGoodFixRatio
      && distanceM >= 12 && endpointsPassed,
  };
}

function completedDirections(state) {
  const done = new Map();
  for (const track of state.tracks ?? []) {
    if (track.kind !== 'path' || !track.targetEdge || !track.direction) continue;
    const q = track.quality ?? trackQuality(track);
    if (!q.passed) continue;
    const key = track.targetEdge;
    if (!done.has(key)) done.set(key, new Set());
    done.get(key).add(track.direction);
  }
  return done;
}

function stationaryPassed(rec) {
  const candidates = Array.isArray(rec?.entrances) && rec.entrances.length
    ? rec.entrances : [rec?.entrance ?? rec?.pin];
  return candidates.some(p => !!p && Number.isFinite(p.accuracy)
    && p.accuracy <= SURVEY_QUALITY.productionAccuracyM
    && (p.samples ?? 1) >= SURVEY_QUALITY.minStationarySamples);
}

function footprintPassed(rec) {
  return Array.isArray(rec?.footprint) && rec.footprint.length >= 4
    && rec?.footprintQuality?.passed === true;
}

function calibrationFor(state) {
  const pairs = [];
  for (const place of PLACES) {
    const measured = state.places?.[place.id]?.pin;
    if (!stationaryPassed(state.places?.[place.id])) continue;
    pairs.push({ rough: toWorld(place.pin.left, place.pin.top), observed: gpsToWorld(measured.lat, measured.lng) });
  }
  if (!pairs.length) return p => ({ x: p.x, z: p.z });
  const rc = {
    x: pairs.reduce((s, p) => s + p.rough.x, 0) / pairs.length,
    z: pairs.reduce((s, p) => s + p.rough.z, 0) / pairs.length,
  };
  const oc = {
    x: pairs.reduce((s, p) => s + p.observed.x, 0) / pairs.length,
    z: pairs.reduce((s, p) => s + p.observed.z, 0) / pairs.length,
  };
  if (pairs.length === 1) return p => ({ x: p.x + oc.x - rc.x, z: p.z + oc.z - rc.z });
  let dot = 0, cross = 0, den = 0;
  for (const p of pairs) {
    const rx = p.rough.x - rc.x, rz = p.rough.z - rc.z;
    const ox = p.observed.x - oc.x, oz = p.observed.z - oc.z;
    dot += rx * ox + rz * oz;
    cross += rx * oz - rz * ox;
    den += rx * rx + rz * rz;
  }
  const a = den ? dot / den : 1;
  const b = den ? cross / den : 0;
  return p => ({
    x: oc.x + a * (p.x - rc.x) - b * (p.z - rc.z),
    z: oc.z + b * (p.x - rc.x) + a * (p.z - rc.z),
  });
}

function taskPositionForPoi(poi, calibrate) {
  return calibrate(toWorld(poi.pin.left, poi.pin.top));
}

function buildCandidates(state) {
  const tasks = [];
  const dirs = completedDirections(state);
  const calibrate = calibrationFor(state);
  const calibratedNode = (id) => {
    const p = worldOfNode(id);
    return p ? calibrate(p) : null;
  };

  // まず広く分布した基準点を揃え、全体の位置合わせを安定させる。
  for (const place of PLACES) {
    if (stationaryPassed(state.places?.[place.id])) continue;
    tasks.push({
      id: `control:${place.id}`, kind: 'control', targetId: place.id,
      title: `${place.name}を基準点として測定`,
      instruction: `${place.name}の明確な地点で15秒停止し、基準点を測定してください。`,
      reason: 'キャンパス全体の位置合わせを安定させるため',
      gain: 45, serviceMin: 1.2, startWorld: taskPositionForPoi(place, calibrate), endWorld: taskPositionForPoi(place, calibrate),
    });
  }

  for (const [index, [a, b]] of fl.navEdges.entries()) {
    const key = edgeKey(a, b);
    const measured = dirs.get(key) ?? new Set();
    const aw = calibratedNode(a), bw = calibratedNode(b);
    if (!aw || !bw) continue;
    const importance = 1 + (EDGE_IMPORTANCE[key] ?? 0) * 1.8;
    for (const direction of ['forward', 'reverse']) {
      if (measured.has(direction)) continue;
      const startId = direction === 'forward' ? a : b;
      const endId = direction === 'forward' ? b : a;
      const sw = direction === 'forward' ? aw : bw;
      const ew = direction === 'forward' ? bw : aw;
      const counterpart = direction === 'forward' ? 'reverse' : 'forward';
      tasks.push({
        id: `path:${index}:${direction}`, kind: 'path', targetEdge: key, direction,
        edgeNodes: [startId, endId],
        title: `${nearestPoiLabel(startId)}から${nearestPoiLabel(endId)}へ歩く`,
        instruction: `通路中央を${nearestPoiLabel(startId)}から${nearestPoiLabel(endId)}まで歩いてください。終点で記録を停止します。`,
        reason: measured.has(counterpart) ? '反対方向の軌跡と平均化してGPS偏りを減らすため' : '未測定の通路形状と接続を確定するため',
        gain: (measured.size ? 21 : 31) * importance,
        serviceMin: Math.max(1, meters(sw, ew) / 65), startWorld: sw, endWorld: ew,
      });
    }
  }

  for (const shop of TARGET_SHOPS) {
    const audit = state.audits?.[shop.id];
    const auditDone = audit && ['ok', 'corrected'].includes(audit.status);
    const entranceDone = stationaryPassed(state.buildings?.[shop.id]);
    const pos = taskPositionForPoi(shop, calibrate);
    if (!auditDone || !entranceDone) {
      tasks.push({
        id: `building:${shop.id}`, kind: 'building', targetId: shop.id,
        title: `${shop.name}の名称と入口を確認`,
        instruction: `現地の表札で正式名称を確認し、入口前で15秒停止して測定してください。`,
        reason: !auditDone && !entranceDone ? '名称とナビ到着点が未確認のため' : (!auditDone ? '正式名称が未確認のため' : '入口の測位品質が不足しているため'),
        gain: (!auditDone ? 17 : 0) + (!entranceDone ? 24 : 0),
        serviceMin: 2.0, startWorld: pos, endWorld: pos,
      });
    }
    if (auditDone && entranceDone && !footprintPassed(state.buildings?.[shop.id])) {
      tasks.push({
        id: `perimeter:${shop.id}`, kind: 'perimeter', targetId: shop.id,
        title: `${shop.name}の外周を一周`,
        instruction: `建物の外壁にできるだけ沿って一周し、開始地点へ戻ってください。立入禁止区域には入らないでください。`,
        reason: '建物中心と外形がデフォルメ図のまま残っているため',
        gain: shop.landmark ? 34 : 22, serviceMin: 5.5, startWorld: pos, endWorld: pos,
      });
    }
  }
  const now = Date.now();
  return tasks.filter(t => {
    const skippedAt = Number(state.planner?.skipped?.[t.id]);
    return !Number.isFinite(skippedAt) || now - skippedAt >= 24 * 60 * 60 * 1000;
  });
}

function phaseOf(state, candidates) {
  const controls = candidates.filter(t => t.kind === 'control').length;
  if (controls) return { id: 'anchors', label: '基準点を確立中', allowed: new Set(['control']) };
  const pathRemaining = candidates.filter(t => t.kind === 'path').length;
  const buildingRemaining = candidates.filter(t => t.kind === 'building').length;
  if (pathRemaining > fl.navEdges.length * 0.7) return { id: 'backbone', label: '主要通路を測定中', allowed: new Set(['path', 'building']) };
  if (buildingRemaining) return { id: 'semantic', label: '名称・入口を確認中', allowed: new Set(['path', 'building']) };
  if (pathRemaining) return { id: 'closure', label: '往復・再測定中', allowed: new Set(['path']) };
  return { id: 'footprints', label: '建物外周を測定中', allowed: new Set(['perimeter']) };
}

export function surveyProgress(state) {
  const directions = completedDirections(state);
  const edgeDirectionsDone = [...directions.values()].reduce((n, s) => n + Math.min(2, s.size), 0);
  const namesDone = TARGET_SHOPS.filter(s => ['ok', 'corrected'].includes(state.audits?.[s.id]?.status)).length;
  const entrancesDone = TARGET_SHOPS.filter(s => stationaryPassed(state.buildings?.[s.id])).length;
  const controlsDone = PLACES.filter(p => stationaryPassed(state.places?.[p.id])).length;
  const footprintsDone = TARGET_SHOPS.filter(s => footprintPassed(state.buildings?.[s.id])).length;
  const allSamples = (state.tracks ?? []).flatMap(t => t.samples ?? []);
  const goodSamples = allSamples.filter(p => Number.isFinite(p.accuracy) && p.accuracy <= SURVEY_QUALITY.productionAccuracyM).length;
  const gpsGoodRatio = allSamples.length ? goodSamples / allSamples.length : 0;
  const gates = {
    controls: controlsDone === PLACES.length,
    paths: edgeDirectionsDone === fl.navEdges.length * 2,
    names: namesDone === TARGET_SHOPS.length,
    entrances: entrancesDone === TARGET_SHOPS.length,
    footprints: footprintsDone === TARGET_SHOPS.length,
    gps: allSamples.length > 0 && gpsGoodRatio >= SURVEY_QUALITY.minGoodFixRatio,
  };
  const score = Math.round(100 * (
    0.10 * controlsDone / Math.max(1, PLACES.length) +
    0.32 * edgeDirectionsDone / Math.max(1, fl.navEdges.length * 2) +
    0.18 * namesDone / Math.max(1, TARGET_SHOPS.length) +
    0.18 * entrancesDone / Math.max(1, TARGET_SHOPS.length) +
    0.17 * footprintsDone / Math.max(1, TARGET_SHOPS.length) +
    0.05 * Math.min(1, gpsGoodRatio / SURVEY_QUALITY.minGoodFixRatio)
  ));
  return {
    score, productionReady: Object.values(gates).every(Boolean), gates,
    controlsDone, controlsTotal: PLACES.length,
    edgeDirectionsDone, edgeDirectionsTotal: fl.navEdges.length * 2,
    namesDone, namesTotal: TARGET_SHOPS.length,
    entrancesDone, entrancesTotal: TARGET_SHOPS.length,
    footprintsDone, footprintsTotal: TARGET_SHOPS.length,
    gpsGoodRatio, rawSamples: allSamples.length,
  };
}

export function createSurveyPlan(state, position, budgetMin = 30) {
  const all = buildCandidates(state);
  const phase = phaseOf(state, all);
  const candidates = all.filter(t => phase.allowed.has(t.kind));
  const origin = currentWorld(position);
  let cursor = origin;
  const plan = [], remaining = new Map(candidates.map(t => [t.id, t]));
  let used = 0;
  while (remaining.size && plan.length < 12) {
    let best = null, bestScore = -Infinity, bestCost = 0;
    for (const task of remaining.values()) {
      const travelMin = cursor ? meters(cursor, task.startWorld) / 72 : 0;
      const cost = travelMin + task.serviceMin;
      const returnMin = origin ? meters(task.endWorld, origin) / 72 : 0;
      if (plan.length && used + cost + returnMin > budgetMin) continue;
      const clusterBonus = cursor && meters(cursor, task.startWorld) < 70 ? 1.25 : 1;
      const reliability = learnedGpsReliability(state, task.startWorld);
      const score = task.gain * clusterBonus * (0.55 + 0.45 * reliability) / Math.pow(Math.max(0.7, cost), 1.12);
      if (score > bestScore) { best = { ...task, expectedGpsReliability: reliability }; bestScore = score; bestCost = cost; }
    }
    if (!best) break;
    plan.push({ ...best, estimatedMin: Math.max(1, Math.ceil(bestCost)), priorityScore: Math.round(bestScore * 10) / 10 });
    used += bestCost;
    cursor = best.endWorld;
    remaining.delete(best.id);
  }
  const progress = surveyProgress(state);
  const returnMin = origin && cursor ? meters(cursor, origin) / 72 : 0;
  return { phase, tasks: plan, estimatedMin: Math.ceil(used + returnMin), progress };
}

// 過去ログから周辺のGPS成功率をベイズ平滑化して学習する。
// データが無い場所は中立値、建物際などで失敗が蓄積すると低くなる。
function learnedGpsReliability(state, world) {
  let good = 2, total = 4; // Beta(2,2)事前分布
  for (const track of state.tracks ?? []) {
    for (const p of track.samples ?? []) {
      if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng) || !Number.isFinite(p?.accuracy)) continue;
      const w = gpsToWorld(p.lat, p.lng);
      if (meters(w, world) > 60) continue;
      total++;
      if (p.accuracy <= SURVEY_QUALITY.productionAccuracyM) good++;
    }
  }
  return good / total;
}

export function evaluateTrack(track) {
  return trackQuality(track);
}

export function perimeterFromTrack(track) {
  const all = track?.samples ?? [];
  const raw = all.filter(p => Number.isFinite(p?.accuracy)
    && p.accuracy <= SURVEY_QUALITY.productionAccuracyM);
  if (raw.length < SURVEY_QUALITY.minPerimeterSamples) {
    return { passed: false, reason: `有効GPSが${raw.length}点しかありません`, footprint: [] };
  }
  const clean = [];
  for (const p of raw) {
    if (!clean.length) { clean.push(p); continue; }
    const a = gpsToWorld(clean[clean.length - 1].lat, clean[clean.length - 1].lng);
    const b = gpsToWorld(p.lat, p.lng);
    const d = meters(a, b);
    if (d >= 1.5 && d <= 30) clean.push(p);
  }
  if (clean.length < 6) return { passed: false, reason: '外周として使える点が不足しています', footprint: [] };
  const first = gpsToWorld(clean[0].lat, clean[0].lng);
  const last = gpsToWorld(clean[clean.length - 1].lat, clean[clean.length - 1].lng);
  const closureM = meters(first, last);
  const footprint = clean.map(p => ({ lat: p.lat, lng: p.lng }));
  if (closureM <= SURVEY_QUALITY.maxPerimeterClosureM) footprint.push({ ...footprint[0] });
  const world = clean.map(p => gpsToWorld(p.lat, p.lng));
  let areaUnits = 0;
  for (let i = 0; i < world.length; i++) {
    const a = world[i], b = world[(i + 1) % world.length];
    areaUnits += a.x * b.z - b.x * a.z;
  }
  const areaM2 = Math.abs(areaUnits) / 2 * GEO.meterPerUnit ** 2;
  const center = {
    lat: clean.reduce((s, p) => s + p.lat, 0) / clean.length,
    lng: clean.reduce((s, p) => s + p.lng, 0) / clean.length,
  };
  const goodRatio = all.length ? raw.length / all.length : 0;
  const passed = closureM <= SURVEY_QUALITY.maxPerimeterClosureM && areaM2 >= 20 && areaM2 <= 100000
    && goodRatio >= SURVEY_QUALITY.minGoodFixRatio;
  return {
    passed,
    reason: passed ? '' : (closureM > SURVEY_QUALITY.maxPerimeterClosureM
      ? `開始地点とのズレが${Math.round(closureM)}mあります`
      : (areaM2 < 20 || areaM2 > 100000
        ? `外周面積${Math.round(areaM2)}㎡が妥当範囲外です`
        : `良好GPSが${Math.round(goodRatio * 100)}%しかありません`)),
    footprint, center, closureM,
    areaM2,
    medianAccuracyM: raw.map(p => p.accuracy).sort((a, b) => a - b)[Math.floor(raw.length / 2)],
    samples: raw.length, goodRatio,
  };
}

const geoDistM = (a, b) => {
  const dN = (b.lat - a.lat) * 111320;
  const dE = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dN, dE);
};

// 実測点群の主軸（PCA）から、キャンパス全体が既存の3Dキャンバスへ収まる
// 地理原点・回転・縮尺を求める。緯度経度の平均だけで原点を決めるより、
// 外周の偏りがある測量でも表示範囲の中央が安定する。
export function deriveGeoReference(points) {
  const clean = (points ?? []).filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (clean.length < 2) return null;
  let lat0 = clean.reduce((s, p) => s + p.lat, 0) / clean.length;
  let lng0 = clean.reduce((s, p) => s + p.lng, 0) / clean.length;
  const cosLat = Math.cos(lat0 * Math.PI / 180);
  const local = clean.map(p => ({
    e: (p.lng - lng0) * 111320 * cosLat,
    n: (p.lat - lat0) * 111320,
  }));
  const meanE = local.reduce((s, p) => s + p.e, 0) / local.length;
  const meanN = local.reduce((s, p) => s + p.n, 0) / local.length;
  let ee = 0, nn = 0, en = 0;
  for (const p of local) {
    const e = p.e - meanE, n = p.n - meanN;
    ee += e * e; nn += n * n; en += e * n;
  }
  const majorAxisFromEast = 0.5 * Math.atan2(2 * en, ee - nn);
  const rawRotation = -majorAxisFromEast * 180 / Math.PI;
  const rotationDeg = ((rawRotation + 90) % 180 + 180) % 180 - 90;
  const th = rotationDeg * Math.PI / 180;
  const project = p => ({
    x: p.e * Math.cos(th) - p.n * Math.sin(th),
    z: -(p.n * Math.cos(th) + p.e * Math.sin(th)),
  });
  const projected = local.map(project);
  const midX = (Math.min(...projected.map(p => p.x)) + Math.max(...projected.map(p => p.x))) / 2;
  const midZ = (Math.min(...projected.map(p => p.z)) + Math.max(...projected.map(p => p.z))) / 2;
  const offsetE = midX * Math.cos(th) - midZ * Math.sin(th);
  const offsetN = -midX * Math.sin(th) - midZ * Math.cos(th);
  lat0 += offsetN / 111320;
  lng0 += offsetE / (111320 * cosLat);
  const spanX = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x));
  const spanZ = Math.max(...projected.map(p => p.z)) - Math.min(...projected.map(p => p.z));
  const meterPerUnit = Math.max(4, spanX / (MAP_W * 0.92), spanZ / (MAP_D * 0.92));
  return { lat0, lng0, rotationDeg, meterPerUnit };
}

function resampleTrack(samples, count) {
  if (samples.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + geoDistM(samples[i - 1], samples[i]));
  const total = cum[cum.length - 1];
  if (total <= 0) return [];
  const result = [];
  for (let k = 0; k < count; k++) {
    const target = total * k / (count - 1);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const span = Math.max(1e-9, cum[i] - cum[i - 1]);
    const u = (target - cum[i - 1]) / span;
    result.push({
      lat: samples[i - 1].lat + (samples[i].lat - samples[i - 1].lat) * u,
      lng: samples[i - 1].lng + (samples[i].lng - samples[i - 1].lng) * u,
      accuracy: samples[i - 1].accuracy + (samples[i].accuracy - samples[i - 1].accuracy) * u,
    });
  }
  return result;
}

const medianNumber = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

// 同じ進捗位置にある複数軌跡を、中央値から大きく外れた観測を除いて統合する。
// 端末が一時的に過信した accuracy を返した場合でも、再測定の多数側を優先できる。
function robustGeoMean(points) {
  if (!points.length) return null;
  const seed = { lat: medianNumber(points.map(p => p.lat)), lng: medianNumber(points.map(p => p.lng)) };
  const deviations = points.map(p => geoDistM(seed, p));
  const medianDeviation = medianNumber(deviations);
  const mad = medianNumber(deviations.map(d => Math.abs(d - medianDeviation)));
  const cutoffM = Math.max(4, medianDeviation + Math.max(2, mad * 3));
  const kept = points.filter((_, i) => deviations[i] <= cutoffM);
  const accepted = kept.length ? kept : points;
  let weight = 0, lat = 0, lng = 0;
  for (const p of accepted) {
    const w = 1 / Math.max(1, p.accuracy ?? SURVEY_QUALITY.productionAccuracyM) ** 2;
    weight += w; lat += p.lat * w; lng += p.lng * w;
  }
  return {
    lat: lat / weight,
    lng: lng / weight,
    accuracy: medianNumber(accepted.map(p => p.accuracy)),
    observations: accepted.length,
    rejectedObservations: points.length - accepted.length,
  };
}

// 往路・復路を平均中心線へ統合し、交差点端点と建物入口を接続した公開用グラフを作る。
export function buildProductionGraph(state) {
  const groups = new Map();
  for (const track of state.tracks ?? []) {
    if (track.kind !== 'path' || !track.targetEdge || !track.direction || !Array.isArray(track.targetNodes)) continue;
    const q = track.quality ?? trackQuality(track);
    if (!q.passed) continue;
    const g = groups.get(track.targetEdge) ?? { forward: [], reverse: [] };
    g[track.direction].push(track);
    groups.set(track.targetEdge, g);
  }

  const nodes = {}, edges = [], endpointObservations = new Map();
  let edgeSeq = 0;
  for (const [, g] of groups) {
    if (!g.forward.length || !g.reverse.length) continue;
    const canonicalNodes = g.forward[0].targetNodes;
    const good = (t) => (t.samples ?? []).filter(p => Number.isFinite(p.accuracy)
      && p.accuracy <= SURVEY_QUALITY.productionAccuracyM);
    const expected = worldOfNode(canonicalNodes[0]) && worldOfNode(canonicalNodes[1])
      ? meters(worldOfNode(canonicalNodes[0]), worldOfNode(canonicalNodes[1])) : 30;
    const count = Math.max(3, Math.min(40, Math.ceil(expected / 8) + 1));
    const forwardLines = g.forward.map(t => resampleTrack(good(t), count)).filter(a => a.length === count);
    const reverseLines = g.reverse.map(t => resampleTrack(good(t).reverse(), count)).filter(a => a.length === count);
    if (!forwardLines.length || !reverseLines.length) continue;
    const allLines = [...forwardLines, ...reverseLines];
    const center = Array.from({ length: count }, (_, i) => robustGeoMean(allLines.map(line => line[i])));
    if (center.some(p => !p)) continue;
    const startId = `G_${canonicalNodes[0]}`;
    const endId = `G_${canonicalNodes[1]}`;
    const ids = center.map((p, i) => i === 0 ? startId : (i === center.length - 1 ? endId : `G${edgeSeq}_${i}`));
    for (let i = 0; i < center.length; i++) {
      const id = ids[i];
      if (i === 0 || i === center.length - 1) {
        const arr = endpointObservations.get(id) ?? [];
        arr.push(center[i]); endpointObservations.set(id, arr);
      } else {
        nodes[id] = center[i];
      }
      if (i) edges.push([ids[i - 1], id]);
    }
    edgeSeq++;
  }
  for (const [id, obs] of endpointObservations) {
    nodes[id] = robustGeoMean(obs);
  }

  const graphNodeIds = Object.keys(nodes);
  const nearestGraphNode = (p) => {
    let best = null, bd = Infinity;
    for (const id of graphNodeIds) {
      const d = geoDistM(p, nodes[id]);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
  const buildings = clone(state.buildings), places = clone(state.places), points = clone(state.points);
  let poiSeq = 0;
  for (const rec of Object.values(buildings)) {
    const source = Array.isArray(rec?.entrances) && rec.entrances.length
      ? rec.entrances : (rec?.entrance ? [rec.entrance] : []);
    const measured = [];
    for (const p of source) {
      if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) continue;
      if (!Number.isFinite(p.accuracy) || p.accuracy > SURVEY_QUALITY.productionAccuracyM
          || (p.samples ?? 1) < SURVEY_QUALITY.minStationarySamples) continue;
      const id = `BE${poiSeq++}`;
      const near = nearestGraphNode(p);
      nodes[id] = { lat: p.lat, lng: p.lng, accuracy: p.accuracy };
      if (near) edges.push([near, id]);
      measured.push({ ...p, entry: id });
    }
    if (measured.length) {
      rec.entrances = measured;
      rec.entrance = measured[0];
      rec.entries = measured.map(e => e.entry);
      rec.entry = rec.entries[0];
    }
  }
  const attach = (bucket, prefix, pointField) => {
    for (const [key, rec] of Object.entries(bucket)) {
      const p = rec?.[pointField];
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)
          || !Number.isFinite(p.accuracy) || p.accuracy > SURVEY_QUALITY.productionAccuracyM
          || (p.samples ?? 1) < SURVEY_QUALITY.minStationarySamples) {
        delete bucket[key];
        continue;
      }
      const id = `${prefix}${poiSeq++}`;
      const near = nearestGraphNode(p);
      nodes[id] = { lat: p.lat, lng: p.lng, accuracy: p.accuracy };
      if (near) edges.push([near, id]);
      rec.entry = id;
    }
  };
  attach(places, 'PE', 'pin');
  attach(points, 'PT', 'pin');
  return { nodes, edges, buildings, places, points };
}
