// ============================================================
// GFO 北館1F バーチャル3Dマップ
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  MAP_W, MAP_D, toWorld, CATEGORIES, SHOPS, PLACES, DECOR,
  NAV_NODES, NAV_EDGES, ENTRY_NODE,
} from './data.js';
import { startAR } from './ar.js';

const METER_PER_UNIT = 1.6; // 1ワールド単位 ≈ 1.6m（実寸感の目安）

// ------------------------------------------------------------
// 基本セットアップ
// ------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const DAY = { bg: 0xbfe3f2, fog: 0xbfe3f2, hemi: 0.9, sun: 1.6, amb: 0.35 };
const NIGHT = { bg: 0x0a1020, fog: 0x0a1020, hemi: 0.25, sun: 0.25, amb: 0.15 };
let isNight = false;

scene.background = new THREE.Color(DAY.bg);
scene.fog = new THREE.Fog(DAY.fog, 160, 380);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 800);
camera.position.set(0, 85, 78);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.15;
controls.minDistance = 12;
controls.maxDistance = 220;
controls.target.set(0, 0, -4);

// ライト
const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a96a8, DAY.hemi);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, DAY.amb);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff4e0, DAY.sun);
sun.position.set(-60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ------------------------------------------------------------
// 地面（キャンバステクスチャで通路・広場を描画）
// ------------------------------------------------------------
function makeGroundTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = Math.round(2048 * MAP_D / MAP_W);
  const g = c.getContext('2d');
  const px = (l) => l / 100 * c.width;
  const py = (t) => t / 100 * c.height;

  // ベース
  g.fillStyle = '#e9edf1';
  g.fillRect(0, 0, c.width, c.height);

  // 敷地外周を少し暗く
  g.strokeStyle = '#d3d9e0'; g.lineWidth = 40;
  g.strokeRect(20, 20, c.width - 40, c.height - 40);

  // 緑地帯（北側・西側 = せせらぎと並木）
  g.fillStyle = '#cfe8cf';
  g.fillRect(px(8), py(9), px(84), py(6));
  g.fillRect(px(4), py(15), px(6), py(45));
  // せせらぎ（水路）
  g.fillStyle = '#aadcec';
  g.fillRect(px(8), py(11.5), px(84), py(1.6));

  // 通路（ナビグラフのエッジを描く）
  g.strokeStyle = '#f8fafc';
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = c.width * 0.045;
  for (const [a, b] of NAV_EDGES) {
    const A = NAV_NODES[a], B = NAV_NODES[b];
    g.beginPath();
    g.moveTo(px(A.left), py(A.top));
    g.lineTo(px(B.left), py(B.top));
    g.stroke();
  }

  // ナレッジプラザ（円形広場）
  const plaza = PLACES.find(p => p.id === 'plaza').pin;
  const grd = g.createRadialGradient(px(plaza.left), py(plaza.top), 0, px(plaza.left), py(plaza.top), c.width * 0.09);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(1, '#eef3f7');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(px(plaza.left), py(plaza.top), c.width * 0.09, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#c9d4de'; g.lineWidth = 6;
  g.stroke();

  // 通路の点線センターライン
  g.strokeStyle = '#dbe4ec'; g.lineWidth = 5; g.setLineDash([26, 30]);
  for (const [a, b] of NAV_EDGES) {
    const A = NAV_NODES[a], B = NAV_NODES[b];
    g.beginPath();
    g.moveTo(px(A.left), py(A.top));
    g.lineTo(px(B.left), py(B.top));
    g.stroke();
  }
  g.setLineDash([]);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_W, MAP_D),
  new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 外周ベース（台座）
const base = new THREE.Mesh(
  new THREE.BoxGeometry(MAP_W + 6, 3, MAP_D + 6),
  new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.9 })
);
base.position.y = -1.52;
scene.add(base);

// ------------------------------------------------------------
// 建物（角丸押し出し）
// ------------------------------------------------------------
function roundedBoxGeo(w, d, h, r = 0.8) {
  const shape = new THREE.Shape();
  const hw = w / 2, hd = d / 2;
  r = Math.min(r, hw * 0.4, hd * 0.4);
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd); shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r); shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd); shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r); shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2); // 押し出し方向(+z)を上(+y)へ: y=0〜h
  return geo;
}

function makeLabelSprite(text, { bg = '#ffffff', fg = '#1a2233', border = '#38bdf8', scale = 1 } = {}) {
  const pad = 28, fs = 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `700 ${fs}px "Hiragino Kaku Gothic ProN", sans-serif`;
  const tw = g.measureText(text).width;
  c.width = Math.ceil(tw + pad * 2 + 16);
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = `700 ${fs}px "Hiragino Kaku Gothic ProN", sans-serif`;
  // 吹き出しピル
  const r = 40, w = c.width - 8, h = 84, x = 4, y = 4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = border; ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, y + h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sp = new THREE.Sprite(mat);
  const aspect = c.width / c.height;
  sp.scale.set(3.4 * aspect * scale, 3.4 * scale, 1);
  sp.renderOrder = 10;
  return sp;
}

const shopMeshes = [];   // raycast対象
const labelSprites = [];
const shopGroup = new THREE.Group();
scene.add(shopGroup);

for (const shop of SHOPS) {
  const { x, z } = toWorld(shop.pin.left, shop.pin.top);
  const col = CATEGORIES[shop.cat].color;
  const geo = roundedBoxGeo(shop.size.w, shop.size.d, shop.size.h);
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.55, metalness: 0.05,
    emissive: col, emissiveIntensity: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'shop', shop };
  shopGroup.add(mesh);
  shopMeshes.push(mesh);

  // 白い縁取り（屋根のアクセント）
  const roof = new THREE.Mesh(
    roundedBoxGeo(shop.size.w * 0.86, shop.size.d * 0.86, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
  );
  roof.position.set(x, shop.size.h + 0.28, z);
  shopGroup.add(roof);

  // ラベル
  const label = makeLabelSprite(shop.name.length > 14 ? shop.en : shop.name, { border: CATEGORIES[shop.cat].css });
  label.position.set(x, shop.size.h + 3.2, z);
  label.userData = { type: 'shop', shop, baseY: shop.size.h + 3.2, phase: Math.random() * Math.PI * 2 };
  shopGroup.add(label);
  labelSprites.push(label);
  shop._mesh = mesh;
  shop._label = label;
  shop._pos = new THREE.Vector3(x, 0, z);
}

// 装飾建物
for (const d of DECOR) {
  const { x, z } = toWorld(d.pin.left, d.pin.top);
  const mesh = new THREE.Mesh(
    roundedBoxGeo(d.size.w, d.size.d, d.size.h, 0.6),
    new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.7, transparent: true, opacity: 0.92 })
  );
  mesh.position.set(x, 0, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  if (d.label) {
    const label = makeLabelSprite(d.name, { bg: '#3d3630', fg: '#fff', border: '#9a8b7d', scale: 0.85 });
    label.position.set(x, d.size.h + 3.4, z);
    label.userData = { baseY: d.size.h + 3.4, phase: Math.random() * 6 };
    scene.add(label);
    labelSprites.push(label);
  }
}

// ------------------------------------------------------------
// 並木・広場の演出
// ------------------------------------------------------------
const treeGroup = new THREE.Group();
scene.add(treeGroup);
{
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x62b06a, roughness: 0.9, flatShading: true });
  const spots = [];
  for (let l = 10; l <= 90; l += 4.5) spots.push([l + (Math.sin(l) * 0.8), 12.2]); // 北側並木
  for (let t = 18; t <= 58; t += 5) spots.push([6, t]);                            // 西側並木
  spots.push([46, 44], [59, 44], [46, 30]);                                        // プラザ周り
  for (const [l, t] of spots) {
    const { x, z } = toWorld(l, t);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    const s = 0.8 + ((l * 7 + t * 13) % 10) / 18;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 2.4; leaf.scale.setScalar(s);
    leaf.castShadow = true;
    tree.add(trunk, leaf);
    tree.position.set(x, 0, z);
    treeGroup.add(tree);
  }
}

// プラザの光の柱＆パーティクル
const plazaPos = (() => { const p = PLACES.find(p => p.id === 'plaza').pin; const { x, z } = toWorld(p.left, p.top); return new THREE.Vector3(x, 0, z); })();
const plazaRing = new THREE.Mesh(
  new THREE.TorusGeometry(9, 0.18, 12, 80),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 })
);
plazaRing.rotation.x = Math.PI / 2;
plazaRing.position.copy(plazaPos).setY(0.15);
scene.add(plazaRing);

let particles;
{
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
    pos[i * 3] = plazaPos.x + Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 12;
    pos[i * 3 + 2] = plazaPos.z + Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  particles = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x7dd3fc, size: 0.35, transparent: true, opacity: 0.8, depthWrite: false,
  }));
  scene.add(particles);
}

// エントランスゲート
for (const p of PLACES.filter(p => p.kind === 'entrance')) {
  const { x, z } = toWorld(p.pin.left, p.pin.top);
  const gate = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.35, roughness: 0.4 });
  const post = new THREE.CylinderGeometry(0.3, 0.3, 5, 10);
  const p1 = new THREE.Mesh(post, mat); p1.position.set(-2.4, 2.5, 0);
  const p2 = new THREE.Mesh(post, mat); p2.position.set(2.4, 2.5, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 0.6), mat); beam.position.y = 5.1;
  gate.add(p1, p2, beam);
  gate.position.set(x, 0, z);
  scene.add(gate);
  const label = makeLabelSprite(p.name.split('（')[0].replace(' エレベーター',''), { bg: '#123249', fg: '#a5f3fc', border: '#38bdf8', scale: 0.8 });
  label.position.set(x, 7.4, z);
  label.userData = { baseY: 7.4, phase: Math.random() * 6 };
  scene.add(label);
  labelSprites.push(label);
  p._pos = new THREE.Vector3(x, 0, z);
}
PLACES.forEach(p => { if (!p._pos) { const { x, z } = toWorld(p.pin.left, p.pin.top); p._pos = new THREE.Vector3(x, 0, z); } });

// ------------------------------------------------------------
// アバター
// ------------------------------------------------------------
const avatar = new THREE.Group();
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.8, 6, 14), bodyMat);
  body.position.y = 1.15; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), new THREE.MeshStandardMaterial({ color: 0xffd9a0, roughness: 0.6 }));
  head.position.y = 2.35;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 10, 40), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
  avatar.add(body, head, ring);
  avatar.userData.ring = ring;
}
scene.add(avatar);
let avatarPlaceId = 'ent-north2';
avatar.position.copy(PLACES.find(p => p.id === 'ent-north2')._pos);

// ------------------------------------------------------------
// 経路探索 (A*)
// ------------------------------------------------------------
const nodePos = {};
for (const [id, p] of Object.entries(NAV_NODES)) {
  const { x, z } = toWorld(p.left, p.top);
  nodePos[id] = new THREE.Vector3(x, 0, z);
}
const adj = {};
for (const [a, b] of NAV_EDGES) {
  (adj[a] ??= []).push(b);
  (adj[b] ??= []).push(a);
}

function astar(startId, goalId) {
  if (startId === goalId) return [startId];
  const open = new Set([startId]);
  const came = {}, gScore = { [startId]: 0 };
  const f = { [startId]: nodePos[startId].distanceTo(nodePos[goalId]) };
  while (open.size) {
    let cur = null, best = Infinity;
    for (const n of open) if ((f[n] ?? Infinity) < best) { best = f[n]; cur = n; }
    if (cur === goalId) {
      const path = [cur];
      while (came[cur]) { cur = came[cur]; path.unshift(cur); }
      return path;
    }
    open.delete(cur);
    for (const nb of adj[cur] ?? []) {
      const t = gScore[cur] + nodePos[cur].distanceTo(nodePos[nb]);
      if (t < (gScore[nb] ?? Infinity)) {
        came[nb] = cur; gScore[nb] = t;
        f[nb] = t + nodePos[nb].distanceTo(nodePos[goalId]);
        open.add(nb);
      }
    }
  }
  return null;
}

function getPoi(id) {
  return SHOPS.find(s => s.id === id) || PLACES.find(p => p.id === id);
}

// POI → 経路のワールド座標列
function buildRoutePoints(fromId, toId) {
  const from = getPoi(fromId), to = getPoi(toId);
  if (!from || !to) return null;
  const nodePath = astar(ENTRY_NODE[fromId], ENTRY_NODE[toId]);
  if (!nodePath) return null;
  const pts = [from._pos.clone()];
  for (const n of nodePath) pts.push(nodePos[n].clone());
  pts.push(to._pos.clone());
  // 連続する近接点を除去
  const clean = [pts[0]];
  for (const p of pts) if (p.distanceTo(clean[clean.length - 1]) > 1.5) clean.push(p);
  return clean;
}

// ------------------------------------------------------------
// 経路の描画
// ------------------------------------------------------------
let routeObjects = [];
let routeCurve = null;
let routeArrows = [];
let currentRoute = null; // { fromId, toId, points, lengthM }

function clearRoute() {
  for (const o of routeObjects) { scene.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
  routeObjects = []; routeArrows = []; routeCurve = null; currentRoute = null;
  document.getElementById('route-info').classList.add('hidden');
  document.getElementById('btn-ar').disabled = true;
}

function showRoute(fromId, toId) {
  clearRoute();
  const points = buildRoutePoints(fromId, toId);
  if (!points || points.length < 2) { toast('経路が見つかりませんでした'); return false; }

  const lifted = points.map(p => p.clone().setY(0.4));
  routeCurve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal', 0.15);
  const len = routeCurve.getLength();

  // 発光チューブ
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(routeCurve, Math.max(40, points.length * 12), 0.45, 10, false),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
  );
  scene.add(tube); routeObjects.push(tube);

  // 進行方向シェブロン（動く矢印）
  const coneGeo = new THREE.ConeGeometry(0.55, 1.3, 8);
  coneGeo.rotateX(Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const n = Math.max(6, Math.floor(len / 6));
  for (let i = 0; i < n; i++) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.userData.offset = i / n;
    scene.add(cone);
    routeObjects.push(cone); routeArrows.push(cone);
  }

  // スタート/ゴールのビーコン
  const mkBeacon = (pos, color) => {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    pillar.position.y = 7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 10, 40), new THREE.MeshBasicMaterial({ color }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    g.add(pillar, ring);
    g.position.copy(pos);
    g.userData.ring = ring;
    scene.add(g); routeObjects.push(g);
    return g;
  };
  mkBeacon(points[0], 0x34d399);
  mkBeacon(points[points.length - 1], 0xf472b6);

  const lengthM = Math.round(len * METER_PER_UNIT);
  currentRoute = { fromId, toId, points, lengthM };

  const from = getPoi(fromId), to = getPoi(toId);
  const info = document.getElementById('route-info');
  const mins = Math.max(1, Math.round(lengthM / 67)); // 徒歩 約4km/h
  info.innerHTML = `<b>${esc(from.name)}</b> → <b>${esc(to.name)}</b><br>距離 約${lengthM}m ・ 徒歩 約${mins}分`;
  info.classList.remove('hidden');
  document.getElementById('btn-ar').disabled = false;

  // 経路全体が見えるようにカメラ移動
  const box = new THREE.Box3().setFromPoints(points);
  const center = box.getCenter(new THREE.Vector3());
  flyTo(center.clone().add(new THREE.Vector3(0, 60, 46)), center);
  return true;
}

// ------------------------------------------------------------
// カメラ演出・お散歩モード
// ------------------------------------------------------------
let camTween = null;
function flyTo(camPos, target, dur = 1.4) {
  camTween = {
    t: 0, dur,
    fromPos: camera.position.clone(), toPos: camPos,
    fromTgt: controls.target.clone(), toTgt: target,
  };
}

let walking = null; // { t, dur }
function startWalk() {
  if (!routeCurve) { toast('先に経路を表示してください 🧭'); return; }
  const dur = Math.max(6, routeCurve.getLength() / 7);
  walking = { t: 0, dur };
  controls.enabled = false;
  toast('お散歩モード：経路を歩いています… 🚶');
}
function stopWalk() {
  if (!walking) return;
  walking = null;
  controls.enabled = true;
  avatarPlaceId = currentRoute?.toId ?? avatarPlaceId;
  syncFromSelect();
  const target = avatar.position.clone();
  flyTo(target.clone().add(new THREE.Vector3(0, 55, 42)), target);
  toast('目的地に到着しました！ 🎉');
}

// ------------------------------------------------------------
// UI
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// 経路セレクト
function fillSelects() {
  const opts = [];
  opts.push({ group: '現在地', items: [{ id: '__here__', name: '📍 現在地（アバター）' }] });
  opts.push({ group: 'エントランス・施設', items: PLACES.map(p => ({ id: p.id, name: p.name })) });
  opts.push({ group: 'ショップ', items: SHOPS.map(s => ({ id: s.id, name: s.name })) });
  for (const selId of ['route-from', 'route-to']) {
    const sel = $(selId);
    sel.innerHTML = '';
    for (const g of opts) {
      if (selId === 'route-to' && g.group === '現在地') continue;
      const og = document.createElement('optgroup');
      og.label = g.group;
      for (const it of g.items) {
        const o = document.createElement('option');
        o.value = it.id; o.textContent = it.name;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
  }
  $('route-from').value = '__here__';
  $('route-to').value = 'soholm';
}
function resolveFrom(v) { return v === '__here__' ? avatarPlaceId : v; }
function syncFromSelect() { /* 現在地表示は __here__ のまま */ }
fillSelects();

$('btn-route').addEventListener('click', () => {
  const from = resolveFrom($('route-from').value);
  const to = $('route-to').value;
  if (from === to) { toast('出発地と目的地が同じです'); return; }
  if (showRoute(from, to)) toast('経路を表示しました。🚶ボタンでお散歩できます');
});
$('btn-clear').addEventListener('click', () => { clearRoute(); stopWalk(); });
$('btn-walk').addEventListener('click', () => walking ? stopWalk() : startWalk());
$('btn-ar').addEventListener('click', () => {
  if (!currentRoute) return;
  startAR(currentRoute, getPoi, METER_PER_UNIT);
});

// 昼夜切替
$('btn-night').addEventListener('click', () => {
  isNight = !isNight;
  const s = isNight ? NIGHT : DAY;
  scene.background.set(s.bg);
  scene.fog.color.set(s.fog);
  hemi.intensity = s.hemi; sun.intensity = s.sun; amb.intensity = s.amb;
  for (const m of shopMeshes) m.material.emissiveIntensity = isNight ? 0.5 : 0.0;
  $('btn-night').textContent = isNight ? '☀️' : '🌙';
  toast(isNight ? '夜モード ✨ お店が光ります' : '昼モード ☀️');
});

// ドロワー
$('btn-list').addEventListener('click', () => $('drawer').classList.toggle('open'));
$('drawer-close').addEventListener('click', () => $('drawer').classList.remove('open'));

function renderShopList(filter = '', cat = 'all') {
  const list = $('shop-list');
  list.innerHTML = '';
  for (const s of SHOPS) {
    if (cat !== 'all' && s.cat !== cat) continue;
    if (filter && !(s.name + s.en + s.tag).toLowerCase().includes(filter.toLowerCase())) continue;
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <img class="thumb" src="${s.logo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="meta"><b>${esc(s.name)}</b><span>${esc(s.tag)}</span></div>
      <span class="cat-dot" style="background:${CATEGORIES[s.cat].css}"></span>`;
    div.addEventListener('click', () => { openCard(s); focusShop(s); $('drawer').classList.remove('open'); });
    list.appendChild(div);
  }
}
renderShopList();
$('search').addEventListener('input', (e) => renderShopList(e.target.value, activeCat));

// カテゴリフィルタ
let activeCat = 'all';
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCat = btn.dataset.cat;
    renderShopList($('search').value, activeCat);
    for (const s of SHOPS) {
      const on = activeCat === 'all' || s.cat === activeCat;
      s._mesh.material.opacity = on ? 1 : 0.15;
      s._mesh.material.transparent = !on;
      s._label.visible = on;
    }
  });
});

// ショップカード
let cardShop = null;
function openCard(shop) {
  cardShop = shop;
  $('card-logo-img').src = shop.logo;
  $('card-tag').textContent = shop.tag;
  $('card-tag').style.background = CATEGORIES[shop.cat].css + '33';
  $('card-tag').style.color = CATEGORIES[shop.cat].css;
  $('card-name').textContent = shop.name;
  $('card-en').textContent = shop.en;
  $('card-desc').textContent = shop.desc;
  $('card-link').href = shop.url;
  $('shop-card').classList.remove('hidden');
}
$('card-close').addEventListener('click', () => $('shop-card').classList.add('hidden'));
$('card-goto').addEventListener('click', () => {
  if (!cardShop) return;
  $('route-to').value = cardShop.id;
  const from = resolveFrom($('route-from').value);
  if (from === cardShop.id) { toast('すでに目的地にいます'); return; }
  if (showRoute(from, cardShop.id)) {
    $('shop-card').classList.add('hidden');
    toast(`${cardShop.name} への経路を表示しました 🧭`);
  }
});

function focusShop(shop) {
  const p = shop._pos;
  flyTo(p.clone().add(new THREE.Vector3(0, 26, 24)), p.clone().setY(2));
}

// ------------------------------------------------------------
// ピッキング（クリック/タップでお店を選択）
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
  downAt = null;
  if (dx * dx + dy * dy > 36) return; // ドラッグは無視
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...shopMeshes, ...labelSprites.filter(l => l.userData.shop)], false);
  const hit = hits.find(h => h.object.userData?.shop || h.object.userData?.type === 'shop');
  if (hit) {
    const shop = hit.object.userData.shop;
    openCard(shop);
    focusShop(shop);
  }
});

// ホバーで建物を光らせる
let hovered = null;
canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(shopMeshes, false);
  const m = hits[0]?.object ?? null;
  if (hovered && hovered !== m) hovered.material.emissiveIntensity = isNight ? 0.5 : 0.0;
  hovered = m;
  if (hovered) hovered.material.emissiveIntensity = 0.85;
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
});

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // ラベル浮遊
  for (const l of labelSprites) {
    if (l.userData.baseY != null) l.position.y = l.userData.baseY + Math.sin(t * 1.6 + l.userData.phase) * 0.35;
  }

  // プラザ演出
  plazaRing.scale.setScalar(1 + Math.sin(t * 1.2) * 0.04);
  plazaRing.material.opacity = 0.5 + Math.sin(t * 1.2) * 0.2;
  if (particles) {
    const arr = particles.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * 1.2;
      if (arr[i] > 13) arr[i] = 0;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // 経路の矢印を流す
  if (routeCurve) {
    for (const cone of routeArrows) {
      const u = (cone.userData.offset + t * 0.06) % 1;
      const p = routeCurve.getPointAt(u);
      const tan = routeCurve.getTangentAt(u);
      cone.position.copy(p).setY(0.9);
      cone.lookAt(p.clone().add(tan));
    }
  }

  // アバター
  avatar.userData.ring.rotation.z = t * 1.5;
  if (walking && routeCurve) {
    walking.t += dt;
    const u = Math.min(1, walking.t / walking.dur);
    const p = routeCurve.getPointAt(u);
    const tan = routeCurve.getTangentAt(Math.min(0.999, u));
    avatar.position.copy(p).setY(0);
    avatar.lookAt(p.clone().add(tan).setY(0));
    avatar.position.y = Math.abs(Math.sin(walking.t * 9)) * 0.25; // 歩く弾み
    // 追従カメラ
    const camPos = p.clone().sub(tan.clone().multiplyScalar(11)).add(new THREE.Vector3(0, 7.5, 0));
    camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
    controls.target.lerp(p.clone().add(tan.clone().multiplyScalar(6)).setY(2), 1 - Math.pow(0.001, dt));
    camera.lookAt(controls.target);
    if (u >= 1) stopWalk();
  } else if (Math.sin(t * 2) > 0.99) {
    avatar.position.y = 0;
  }

  // カメラトゥイーン
  if (camTween && !walking) {
    camTween.t += dt;
    const k = Math.min(1, camTween.t / camTween.dur);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTgt, camTween.toTgt, e);
    if (k >= 1) camTween = null;
  }

  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 起動
animate();
setTimeout(() => {
  $('loader').classList.add('done');
  toast('ようこそ！グランフロント大阪 北館1F バーチャルマップへ 🏙️ お店をタップしてみてください');
  // オープニングカメラ演出
  camera.position.set(-70, 120, 130);
  flyTo(new THREE.Vector3(0, 62, 66), new THREE.Vector3(0, 0, -4), 2.4);
}, 600);
