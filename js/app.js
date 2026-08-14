// ============================================================
// 立命館大学BKC バーチャルキャンパスマップ
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  MAP_W, MAP_D, toWorld, gpsToWorld, GEO, CATEGORIES, SHOPS, PLACES, DECOR,
  FLOORS, FLOOR_ORDER, FLOOR_LINKS, WATERS, FIELDS,
} from './data.js';
import { startAR } from './ar.js';
import { SURVEY } from './survey-data.js';

const METER_PER_UNIT = GEO.meterPerUnit; // GPS変換・距離表示・到着判定で同じ換算値を使う
const isMobileDevice = matchMedia('(max-width: 640px), (pointer: coarse)').matches;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSurveyedMap = !!SURVEY?.replaceGraph;
const isSurveyMode = new URLSearchParams(location.search).has('survey');
let surveySelectedShopId = null;
window.addEventListener('bkc-survey-highlight-shop', (event) => {
  surveySelectedShopId = event.detail?.shopId ?? null;
});

// ------------------------------------------------------------
// 基本セットアップ
// ------------------------------------------------------------
const canvas = document.getElementById('scene');
if (isSurveyedMap) {
  const credit = document.querySelector('#map-credit span:last-child');
  if (credit) credit.textContent = '実測データ';
}
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !isMobileDevice,
  powerPreference: 'high-performance',
});
let renderWidth = 0;
let renderHeight = 0;
function viewportSize() {
  return {
    width: Math.max(1, Math.round(window.visualViewport?.width || document.documentElement.clientWidth || innerWidth)),
    height: Math.max(1, Math.round(window.visualViewport?.height || document.documentElement.clientHeight || innerHeight)),
  };
}
const initialViewport = viewportSize();
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobileDevice ? 1.35 : 2));
renderer.setSize(initialViewport.width, initialViewport.height, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

const DAY = { bg: 0xe8ece8, fog: 0xe3e8e4, hemi: 1.25, sun: 1.45, amb: 0.62 };
const NIGHT = { bg: 0x0a1020, fog: 0x0a1020, hemi: 0.25, sun: 0.25, amb: 0.15 };
let isNight = false;

scene.background = new THREE.Color(DAY.bg);
scene.fog = new THREE.Fog(DAY.fog, 260, 720);

const camera = new THREE.PerspectiveCamera(50, initialViewport.width / initialViewport.height, 0.1, 1600);
camera.position.set(0, 110, 100);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.15;
controls.minPolarAngle = 0.18;
controls.minDistance = 14;
controls.maxDistance = 430;
controls.enablePan = true;
controls.screenSpacePanning = false; // 指のスライドで地図が平行移動（地図アプリ操作）
controls.rotateSpeed = isMobileDevice ? 0.55 : 1;
controls.panSpeed = isMobileDevice ? 1.1 : 1;
controls.zoomSpeed = isMobileDevice ? 0.7 : 1;
// タッチ操作: 1本指=平行移動 / 2本指=回転＋ピンチズーム
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
// マウス操作: 左ドラッグ=移動 / 右ドラッグ=回転 / ホイール=ズーム
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.target.set(0, 0, -4);

// ライト
const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x8a96a8, DAY.hemi);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, DAY.amb);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff4e0, DAY.sun);
sun.position.set(-90, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobileDevice ? 1024 : 2048, isMobileDevice ? 1024 : 2048);
sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ------------------------------------------------------------
// 空（グラデーションスカイドーム）＋ 環境反射
//   空間の奥行きと没入感（VR感）を出す核。フォグ非適用のShaderMaterialで
//   遠景まで滑らかなグラデーションを描き、その色を反射環境にも使う。
// ------------------------------------------------------------
const SKY = {
  day:   { top: 0xb8cbd7, bottom: 0xf2eee6 },
  night: { top: 0x02050a, bottom: 0x140b14 },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor:    { value: new THREE.Color(SKY.day.top) },
    bottomColor: { value: new THREE.Color(SKY.day.bottom) },
    offset:      { value: 40 },
    exponent:    { value: 0.8 },
  },
  vertexShader: /* glsl */`
    varying vec3 vW;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform vec3 topColor, bottomColor; uniform float offset, exponent; varying vec3 vW;
    void main(){ float h = normalize(vW + vec3(0.0, offset, 0.0)).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0); }`,
  side: THREE.BackSide,
  depthWrite: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);
scene.background = null; // スカイドームが全天を覆うため単色背景は不要

// スカイの色を反射環境（envMap）へ焼き込む
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function refreshEnvironment() {
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), skyMat);
  envScene.add(envSky);
  const prev = envRT;
  envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  envScene.remove(envSky);
  prev?.dispose();
}
refreshEnvironment();

// ------------------------------------------------------------
// キャンパスの地面（芝生・通路・池・グラウンドをCanvasで手続き生成）
//   画像アセットに依存しないため、CDN配信・オフラインでも確実に描画できる
// ------------------------------------------------------------
function makeCampusGroundTexture() {
  const W = 2048, H = Math.round(W * MAP_D / MAP_W);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (left) => left / 100 * W;
  const py = (top) => top / 100 * H;

  // 芝生ベース（案内図として読みやすい、穏やかな昼の緑）
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.62);
  grad.addColorStop(0, '#a9bca2');
  grad.addColorStop(0.7, '#91aa8b');
  grad.addColorStop(1, '#7f9b7b');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 芝のむら（毎回同じ見た目になるようsinベースの擬似乱数で生成）
  for (let i = 0; i < 900; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * W;
    const y = (Math.sin(i * 78.233) * 0.5 + 0.5) * H;
    const r = 5 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 14;
    g.fillStyle = i % 2 ? 'rgba(224,235,218,0.055)' : 'rgba(61,86,59,0.035)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // 外周の自然緑地帯
  g.fillStyle = 'rgba(74,105,70,0.12)';
  for (let i = 0; i < 140; i++) {
    const t = i / 140 * Math.PI * 2;
    const x = W / 2 + Math.cos(t) * (W * 0.5 - 26) + Math.sin(i * 7.1) * 30;
    const y = H / 2 + Math.sin(t) * (H * 0.5 - 22) + Math.cos(i * 5.3) * 22;
    g.beginPath(); g.arc(x, y, 18 + (i % 5) * 5, 0, Math.PI * 2); g.fill();
  }

  // グラウンド・競技場。実測モードでは未測量の略図要素を非表示にし、
  // 精密なレイヤーと概略レイヤーが混ざって見えるのを防ぐ。
  for (const f of (isSurveyedMap ? [] : FIELDS)) {
    const x = px(f.left), y = py(f.top);
    const w = f.w / 100 * W, h = f.h / 100 * H;
    g.save();
    g.translate(x, y);
    if (f.kind === 'track') {
      // 陸上トラック（クインススタジアム）
      g.fillStyle = '#a76455';
      g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#76966f';
      g.beginPath(); g.ellipse(0, 0, w / 2 - 26, h / 2 - 26, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
      for (const k of [8, 14, 20]) {
        g.beginPath(); g.ellipse(0, 0, w / 2 - k, h / 2 - k, 0, 0, Math.PI * 2); g.stroke();
      }
    } else if (f.kind === 'dirt') {
      g.fillStyle = '#b39b76';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
      g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
    } else if (f.kind === 'tennis') {
      g.fillStyle = '#6e9a8b';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
      const n = 3, cw = w / n;
      for (let i = 0; i < n; i++) g.strokeRect(-w / 2 + i * cw + 6, -h / 2 + 6, cw - 12, h - 12);
    } else if (f.kind === 'turf') {
      g.fillStyle = '#5f966a';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 3;
      g.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
      g.beginPath(); g.moveTo(0, -h / 2 + 5); g.lineTo(0, h / 2 - 5); g.stroke();
    } else if (f.kind === 'plot') {
      // 薬草園（畝のある植栽区画）
      g.fillStyle = '#87956b';
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = 'rgba(214,222,180,0.35)'; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        const yy = -h / 2 + h / 4 * i;
        g.beginPath(); g.moveTo(-w / 2 + 4, yy); g.lineTo(w / 2 - 4, yy); g.stroke();
      }
    }
    g.restore();
  }

  // 池
  for (const wtr of (isSurveyedMap ? [] : WATERS)) {
    const x = px(wtr.left), y = py(wtr.top);
    const rx = wtr.rx / 100 * W, ry = wtr.ry / 100 * H;
    g.fillStyle = '#6d9eb4';
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(220,240,246,0.75)'; g.lineWidth = 3;
    g.stroke();
    g.fillStyle = 'rgba(140,200,235,0.12)';
    g.beginPath(); g.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.55, ry * 0.4, 0, 0, Math.PI * 2); g.fill();
  }

  // 通路（ナビグラフをそのまま舗装として描画。メインストリートは太く）
  const fl = FLOORS.campus;
  const mainNodes = new Set([
    'GM', 'FA1', 'FA2', 'FA3', 'BT', 'FA4', 'CS',                 // フロンティアアベニュー
    'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',                      // キャンパスプロムナード
    'B1', 'B2', 'B3', 'B4', 'B5',                                  // ビュートストリート
  ]);
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [
    { color: 'rgba(82,91,80,0.28)', extra: 10 },  // 縁取り
    { color: '#e5dfd2', extra: 0 },               // 舗装
  ]) {
    for (const [a, b] of fl.navEdges) {
      const A = fl.navNodes[a], B = fl.navNodes[b];
      const wMain = mainNodes.has(a) && mainNodes.has(b) ? 30 : 14;
      g.strokeStyle = pass.color;
      g.lineWidth = wMain + pass.extra;
      g.beginPath();
      g.moveTo(px(A.left), py(A.top));
      g.lineTo(px(B.left), py(B.top));
      g.stroke();
    }
  }

  // セントラルサーカス（円形広場）
  {
    const cs = fl.navNodes.CS;
    const x = px(cs.left), y = py(cs.top);
    g.fillStyle = '#e5dfd2';
    g.beginPath(); g.arc(x, y, 64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(141,25,55,0.48)'; g.lineWidth = 5;
    g.beginPath(); g.arc(x, y, 44, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(91,126,84,0.95)';
    g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), isMobileDevice ? 4 : 8);
  return tex;
}

const GHOST_GROUND_OPACITY = 0.16; // 非表示フロアの透け具合
const floorVisuals = {}; // fid -> { ground, frame }
for (const fid of FLOOR_ORDER) {
  const fl = FLOORS[fid];
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_D),
    new THREE.MeshBasicMaterial({
      map: makeCampusGroundTexture(),
      transparent: true,
      // 台座など下層メッシュとのZ-fighting防止の深度バイアス
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = fl.y + 0.02;
  ground.receiveShadow = true;
  ground.renderOrder = 1;
  scene.add(ground);

  // フロアを浮遊するデジタルツインのように見せる発光フレーム
  const framePoints = [
    new THREE.Vector3(-MAP_W / 2, fl.y + 0.22, -MAP_D / 2),
    new THREE.Vector3(MAP_W / 2, fl.y + 0.22, -MAP_D / 2),
    new THREE.Vector3(MAP_W / 2, fl.y + 0.22, MAP_D / 2),
    new THREE.Vector3(-MAP_W / 2, fl.y + 0.22, MAP_D / 2),
  ];
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(framePoints),
    new THREE.LineBasicMaterial({ color: 0x8d1937, transparent: true, opacity: 0.18 })
  );
  frame.renderOrder = 4;
  scene.add(frame);
  floorVisuals[fid] = { ground, frame };
}

// 外周ベース（台座）: 最下層フロアの下に置く
const base = new THREE.Mesh(
  new THREE.BoxGeometry(MAP_W + 6, 3, MAP_D + 6),
  new THREE.MeshStandardMaterial({
    color: 0xc8c3b8, emissive: 0x000000, emissiveIntensity: 0,
    roughness: 0.9, metalness: 0,
  })
);
base.position.y = FLOORS[FLOOR_ORDER[0]].y - 2.4;
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

// 現地で一周測定した建物外周を、そのまま押し出し形状へ変換する。
// ShapeのY軸はrotateX後に-world Zへ写るため、ローカルZを反転して渡す。
function surveyedFootprintGeo(footprint, centerX, centerZ, h) {
  if (!Array.isArray(footprint) || footprint.length < 4) return null;
  const pts = footprint.map(p => gpsToWorld(p.lat, p.lng))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (pts.length < 4) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x - centerX, -(pts[0].z - centerZ));
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x - centerX, -(pts[i].z - centerZ));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
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

const GLASS_OPACITY = 0.9;

// ロゴは外部画像に依存せず、公式マップ番号＋カテゴリ色のモノグラムSVGを生成して使う
// （外部リクエストゼロ = 障害点ゼロ。同時アクセスが増えても外部サーバーに負荷をかけない）
function monogramLogo(shop) {
  const color = CATEGORIES[shop.cat].css;
  const label = shop.no != null ? String(shop.no) : (shop.short ?? shop.name).slice(0, 1);
  const sub = (shop.short ?? shop.name).slice(0, 7);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<rect width="120" height="120" rx="24" fill="${color}" fill-opacity="0.14"/>` +
    `<rect x="5" y="5" width="110" height="110" rx="20" fill="none" stroke="${color}" stroke-width="4"/>` +
    `<text x="60" y="52" font-family="'Hiragino Kaku Gothic ProN',sans-serif" font-size="${label.length > 2 ? 30 : 40}" font-weight="800" fill="${color}" text-anchor="middle" dominant-baseline="central">${label}</text>` +
    `<text x="60" y="92" font-family="'Hiragino Kaku Gothic ProN',sans-serif" font-size="15" font-weight="700" fill="#5b4a52" text-anchor="middle">${sub}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
SHOPS.forEach(s => { s.logo = monogramLogo(s); });

// 建物1棟分の3D表現を生成する（起動時の全棟生成と、みんなの登録スポットの動的追加で共用）
function buildShopVisual(shop) {
  const { x, z } = toWorld(shop.pin.left, shop.pin.top);
  const fy = FLOORS[shop.floor].y;
  const col = CATEGORIES[shop.cat].color;
  // 区画（w×d）と位置は公式座標。半透明ガラスとして立体化し、公式平面図が
  // 透けて見えるようにすることで没入感と情報の正確さを両立する。
  const h = shop.size.h ?? 4;
  const geo = surveyedFootprintGeo(shop.surveyFootprint, x, z, h)
    ?? roundedBoxGeo(shop.size.w, shop.size.d, h);
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.72, metalness: 0.0,
    transparent: true, opacity: GLASS_OPACITY,
    emissive: col, emissiveIntensity: 0.0,
    envMapIntensity: 0.18, depthWrite: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, fy, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'shop', shop };
  shopGroup.add(mesh);
  shopMeshes.push(mesh);

  // 発光する輪郭フレーム（区画の外形＝ホログラム境界）
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 28),
    new THREE.LineBasicMaterial({ color: 0x34413c, transparent: true, opacity: 0.28 })
  );
  edges.position.set(x, fy, z);
  edges.renderOrder = 5;
  shopGroup.add(edges);

  // 屋上のカテゴリー色クラウン（発光アクセント）
  const crownGeo = shop.surveyFootprint
    ? surveyedFootprintGeo(shop.surveyFootprint, x, z, 0.35)
    : roundedBoxGeo(shop.size.w * 0.9, shop.size.d * 0.9, 0.35);
  const crown = new THREE.Mesh(
    crownGeo ?? roundedBoxGeo(shop.size.w * 0.9, shop.size.d * 0.9, 0.35),
    new THREE.MeshStandardMaterial({
      color: col, emissive: 0x000000, emissiveIntensity: 0,
      roughness: 0.68, metalness: 0, envMapIntensity: 0.15,
    })
  );
  crown.position.set(x, fy + h, z);
  crown.castShadow = true;
  shopGroup.add(crown);

  // ラベル
  const labelY = fy + h + 3.0;
  const label = makeLabelSprite(shop.short ?? shop.name, { border: CATEGORIES[shop.cat].css });
  label.position.set(x, labelY, z);
  label.userData = {
    type: 'shop', shop, baseY: labelY, phase: Math.random() * Math.PI * 2,
    detailScale: label.scale.clone(),
  };
  shopGroup.add(label);
  labelSprites.push(label);
  shop._mesh = mesh;
  shop._edges = edges;
  shop._crown = crown;
  shop._label = label;
  shop._categoryVisible = true;
  shop._pos = new THREE.Vector3(x, fy, z);
}
SHOPS.forEach(buildShopVisual);

// みんなの登録スポット（walk-learn.js がサーバーから取得・登録時に呼ぶ）
// 既存IDとの衝突や不正カテゴリはここで最終ガードする
function addCrowdSpot(def) {
  if (!def || typeof def.name !== 'string' || !def.name.trim()) return null;
  if (SHOPS.some(s => s.id === def.id) || PLACES.some(p => p.id === def.id)) return null;
  const shop = {
    id: def.id, floor: 'campus',
    name: def.name.slice(0, 24), en: '', tag: 'みんなの登録スポット',
    cat: CATEGORIES[def.cat] ? def.cat : 'life',
    pin: def.pin, size: { w: 3, d: 3, h: 1.2 },
    entry: def.entry,
    desc: 'ユーザーによって現地登録されたスポット。',
    url: 'https://www.ritsumei.ac.jp/',
  };
  shop.logo = monogramLogo(shop);
  SHOPS.push(shop);
  buildShopVisual(shop);
  return shop;
}

// 装飾建物
const decorGroup = new THREE.Group();
decorGroup.visible = false; // 推定形状の大型建物は公式平面図を隠すため非表示
scene.add(decorGroup);
for (const d of DECOR) {
  const { x, z } = toWorld(d.pin.left, d.pin.top);
  const mesh = new THREE.Mesh(
    roundedBoxGeo(d.size.w, d.size.d, d.size.h, 0.6),
    new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.7, transparent: true, opacity: 0.92 })
  );
  mesh.position.set(x, 0, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  decorGroup.add(mesh);
  if (d.label) {
    const label = makeLabelSprite(d.name, { bg: '#3d3630', fg: '#fff', border: '#9a8b7d', scale: 0.85 });
    label.position.set(x, d.size.h + 3.4, z);
    label.userData = { baseY: d.size.h + 3.4, phase: Math.random() * 6 };
    decorGroup.add(label);
    labelSprites.push(label);
  }
}

// ------------------------------------------------------------
// 並木・広場の演出
// ------------------------------------------------------------
const treeGroup = new THREE.Group();
treeGroup.visible = !isSurveyedMap;
scene.add(treeGroup);
{
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 });
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x567b54, roughness: 0.95, flatShading: true });
  const spots = [
    // フロンティアアベニュー並木（正門〜セントラルサーカス）
    [52, 60], [56, 60], [51.5, 67], [56, 67], [51.5, 75], [55.5, 75],
    [51.5, 83], [56.5, 83], [52.5, 91], [57.5, 91],
    // キャンパスプロムナード並木（サーカス〜第一グラウンド）
    [57, 42], [60.5, 44.5], [61, 37.5], [64.5, 40], [65, 33], [68.5, 35.5],
    [69, 28.5], [72, 31], [72, 24], [75, 26.5],
    // 自然緑地（正門の北西に広がる森）
    [42, 62], [45, 66], [40, 68], [44, 72], [37, 65], [35, 72], [38, 76],
    [31, 68], [33, 76], [28, 71], [45, 76], [47, 68], [43, 58],
    // 外周・散策路
    [10, 66], [8, 74], [12, 78], [7, 88], [30, 90], [45, 92], [62, 92],
    [72, 90], [80, 82], [82, 72], [84, 64], [88, 46], [86, 30], [80, 30],
    [60, 62], [64, 58], [68, 58], [56, 30], [50, 17], [45, 20], [34, 26],
    [30, 38], [26, 48], [20, 56], [24, 60], [18, 64],
  ];
  // 池の周りの植栽
  for (const w of WATERS) {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      spots.push([w.left + Math.cos(a) * (w.rx + 2.4), w.top + Math.sin(a) * (w.ry + 3.0)]);
    }
  }
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
  new THREE.MeshBasicMaterial({ color: 0xf6c76a, transparent: true, opacity: 0.7 })
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
    color: 0xf6c76a, size: 0.25, transparent: true, opacity: 0.18, depthWrite: false,
  }));
  scene.add(particles);
}

// ------------------------------------------------------------
// 施設を3D化（エレベーター/エスカレーター/トイレ/インフォ/AED/駐車場/連絡通路）
//   公式マップのピクトグラム位置に立体モデルを重ね、平面アイコンと3Dの混在を解消。
// ------------------------------------------------------------
function makeBadgeSprite(glyph, color = '#38bdf8') {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = '#0d1626'; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${glyph.length > 1 ? 50 : 68}px "Hiragino Kaku Gothic ProN", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(glyph, s / 2, s / 2 + 4);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(3.0, 3.0, 1); sp.renderOrder = 12;
  return sp;
}

const FAC = {
  elevator:  { col: 0x38bdf8, css: '#38bdf8', glyph: '⇅' },
  escalator: { col: 0xf59e0b, css: '#f59e0b', glyph: '⇗' },
  restroom:  { col: 0x818cf8, css: '#818cf8', glyph: 'WC' },
  info:      { col: 0x22c55e, css: '#22c55e', glyph: 'i' },
  aed:       { col: 0xef4444, css: '#f87171', glyph: '＋' },
  parking:   { col: 0x94a3b8, css: '#cbd5e1', glyph: 'P' },
  connector: { col: 0x38bdf8, css: '#7dd3fc', glyph: '↔' },
};
const facSteel = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.6, envMapIntensity: 1.1 });
const facGlass = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.34, emissive: col, emissiveIntensity: 0.18, envMapIntensity: 1.1, depthWrite: false });

const facilityGroup = new THREE.Group();
facilityGroup.visible = false;
scene.add(facilityGroup);

// 公式図のピクトグラムを優先し、推定3D施設モデルは生成しない。
for (const f of []) {
  const { x, z } = toWorld(f.pin.left, f.pin.top);
  const def = FAC[f.type];
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  let topY = 5;

  // 足元マーカー台座（フロア色パッドで印刷アイコンをマスクし、発光リングで強調）
  const padR = { elevator: 2.7, escalator: 2.3, restroom: 3.0, info: 2.0, aed: 1.4, parking: 3.2, connector: 2.6 }[f.type] || 2.2;
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(padR, 44),
    new THREE.MeshBasicMaterial({ color: 0xeceef1, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.05; pad.renderOrder = 2;
  g.add(pad);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(padR - 0.2, padR, 48),
    new THREE.MeshBasicMaterial({ color: def.col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.renderOrder = 3;
  g.add(ring);

  if (f.type === 'elevator') {
    const w = 3.8, h = 6.5;
    const shaft = new THREE.Mesh(roundedBoxGeo(w, w, h, 0.5), facGlass(def.col));
    shaft.castShadow = true; g.add(shaft);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, w)), new THREE.LineBasicMaterial({ color: def.col }));
    frame.position.y = h / 2; g.add(frame);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, h * 0.62),
      new THREE.MeshStandardMaterial({ color: 0x1b2a3a, metalness: 0.7, roughness: 0.3, envMapIntensity: 1 }));
    door.position.set(0, h * 0.35, w / 2 + 0.02); g.add(door);
    const cap = new THREE.Mesh(roundedBoxGeo(w * 0.96, w * 0.96, 0.4, 0.35), facSteel(def.col));
    cap.position.y = h; cap.castShadow = true; g.add(cap);
    topY = h + 0.4;
  } else if (f.type === 'escalator') {
    const L = 7, W = 2.4;
    const ramp = new THREE.Group();
    const belt = new THREE.Mesh(new THREE.BoxGeometry(L, 0.4, W), facSteel(def.col));
    belt.castShadow = true; ramp.add(belt);
    for (let i = -3; i <= 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, W * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.5 }));
      st.position.set(i * 0.9, 0.25, 0); ramp.add(st);
    }
    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 0.18), facSteel(0x111827));
      rail.position.set(0, 0.95, sgn * W / 2); ramp.add(rail);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.06), facGlass(def.col));
      glass.position.set(0, 0.5, sgn * W / 2); ramp.add(glass);
    }
    ramp.rotation.z = THREE.MathUtils.degToRad(14);
    ramp.position.y = 1.0;
    g.add(ramp);
    g.rotation.y = THREE.MathUtils.degToRad(f.angle || 0);
    topY = 2.6;
  } else if (f.type === 'restroom') {
    const w = 4, d = 3, h = 3.2;
    const box = new THREE.Mesh(roundedBoxGeo(w, d, h, 0.5), facGlass(def.col));
    box.castShadow = true; g.add(box);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: def.col }));
    frame.position.y = h / 2; g.add(frame);
    topY = h + 0.4;
  } else if (f.type === 'info') {
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 1.4, 20), facSteel(0xe2e8f0));
    desk.position.y = 0.7; desk.castShadow = true; g.add(desk);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.4, 16), facGlass(def.col));
    post.position.y = 2.5; g.add(post);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12),
      new THREE.MeshStandardMaterial({ color: def.col, emissive: def.col, emissiveIntensity: 0.85, roughness: 0.3 }));
    dot.position.y = 4.5; g.add(dot);
    topY = 5.1;
  } else if (f.type === 'aed') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 10), facSteel(0x64748b));
    post.position.y = 1.2; g.add(post);
    const box = new THREE.Mesh(roundedBoxGeo(1.7, 0.9, 1.9, 0.2),
      new THREE.MeshStandardMaterial({ color: def.col, emissive: def.col, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 }));
    box.position.y = 3.0; box.castShadow = true; g.add(box);
    topY = 4.2;
  } else if (f.type === 'parking') {
    const mat = facSteel(def.col);
    const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 5.5, 12);
    const p1 = new THREE.Mesh(postGeo, mat); p1.position.set(-3, 2.75, 0); p1.castShadow = true;
    const p2 = new THREE.Mesh(postGeo, mat); p2.position.set(3, 2.75, 0); p2.castShadow = true;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 0.9),
      new THREE.MeshStandardMaterial({ color: def.col, emissive: def.col, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3 }));
    beam.position.y = 5.6; g.add(p1, p2, beam);
    topY = 6.6;
  } else if (f.type === 'connector') {
    const sm = facSteel(def.col);
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 5, 10);
    const p1 = new THREE.Mesh(postGeo, sm); p1.position.set(-2.2, 2.5, 0); p1.castShadow = true;
    const p2 = new THREE.Mesh(postGeo, sm); p2.position.set(2.2, 2.5, 0); p2.castShadow = true;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.6), sm); beam.position.y = 5.1;
    g.add(p1, p2, beam);
    topY = 6.0;
  }

  // 浮遊ピクトグラム（常に正面を向くホログラムバッジ）
  const badge = makeBadgeSprite(def.glyph, def.css);
  badge.position.y = topY + 1.6;
  badge.userData = { baseY: topY + 1.6, phase: Math.random() * 6 };
  g.add(badge); labelSprites.push(badge);

  // 名称ラベル
  if (f.name) {
    const label = makeLabelSprite(f.name, { bg: '#0d1626', fg: '#e6f6ff', border: def.css, scale: 0.68 });
    label.position.y = topY + 3.5;
    label.userData = { baseY: topY + 3.5, phase: Math.random() * 6 };
    g.add(label); labelSprites.push(label);
  }

  facilityGroup.add(g);
}

// 経路探索に使う各PLACEのワールド座標を確定（フロア高さ込み）
PLACES.forEach(p => {
  if (!p._pos) {
    const { x, z } = toWorld(p.pin.left, p.pin.top);
    p._pos = new THREE.Vector3(x, FLOORS[p.floor].y, z);
  }
});

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
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 10, 40), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
  const hereLabel = makeLabelSprite('現在地', { bg: '#063f36', fg: '#ffffff', border: '#10b981', scale: 0.72 });
  hereLabel.position.y = 4.2;
  avatar.add(body, head, ring, hereLabel);
  avatar.userData.ring = ring;
  avatar.userData.hereLabel = hereLabel;
}
scene.add(avatar);
let avatarPlaceId = 'gate-main';
avatar.position.copy(PLACES.find(p => p.id === 'gate-main')._pos);

// ------------------------------------------------------------
// フロア状態
//   viewFloor = 表示中フロア / userFloor = 自分がいるフロア
//   （屋内GPSはフロアを判別できないため、フロアチップ＝自己申告。
//     ナビ中のフロア移動・到着では自動更新される）
// ------------------------------------------------------------
let viewFloor = 'campus';
let userFloor = 'campus';
let navMode = null; // ナビモード状態（ナビ節で使用。setViewFloorが参照するためここで宣言）
const floorY = (fid = userFloor) => FLOORS[fid].y;

// ------------------------------------------------------------
// 経路探索 (A*) — 全フロアを1つのグラフに接続（ノードキー: "floor:id"）
// ------------------------------------------------------------
const nodePos = {};
const adj = {};
const addEdge = (a, b) => {
  if ((adj[a] ?? []).includes(b)) return; // 歩行学習の再適用等による重複を防ぐ
  (adj[a] ??= []).push(b); (adj[b] ??= []).push(a);
};
// 歩行学習による経路コスト係数（1=通常 / <1=みんながよく歩く道）。walk-learn.js が設定する
const edgeFactor = {};
const wKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
for (const fid of FLOOR_ORDER) {
  const fl = FLOORS[fid];
  for (const [id, p] of Object.entries(fl.navNodes)) {
    const { x, z } = toWorld(p.left, p.top);
    nodePos[`${fid}:${id}`] = new THREE.Vector3(x, fl.y, z);
  }
  for (const [a, b] of fl.navEdges) addEdge(`${fid}:${a}`, `${fid}:${b}`);
}
// フロア間リンク（エレベーター/エスカレーター）。乗換名は経路案内文に使う
const transferName = {};
for (const lk of FLOOR_LINKS) {
  const keys = Object.entries(lk.nodes).map(([f, n]) => `${f}:${n}`);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      addEdge(keys[i], keys[j]);
      transferName[`${keys[i]}|${keys[j]}`] = lk.name;
      transferName[`${keys[j]}|${keys[i]}`] = lk.name;
    }
  }
}

function astar(startId, goalId) {
  if (startId === goalId) return [startId];
  // ヒューリスティックは歩行学習の最大割引（FACTOR_MIN=0.72）に合わせて縮め、
  // 割引後も過大評価にならない（=最適経路を見逃さない）ようにする
  const H = 0.72;
  const open = new Set([startId]);
  const came = {}, gScore = { [startId]: 0 };
  const f = { [startId]: nodePos[startId].distanceTo(nodePos[goalId]) * H };
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
      // みんながよく歩く道はコストを割引 → 実際に人が通る経路が選ばれやすくなる
      const t = gScore[cur] + nodePos[cur].distanceTo(nodePos[nb]) * (edgeFactor[wKey(cur, nb)] ?? 1);
      if (t < (gScore[nb] ?? Infinity)) {
        came[nb] = cur; gScore[nb] = t;
        f[nb] = t + nodePos[nb].distanceTo(nodePos[goalId]) * H;
        open.add(nb);
      }
    }
  }
  return null;
}

function getPoi(id) {
  return SHOPS.find(s => s.id === id) || PLACES.find(p => p.id === id);
}

// 最寄りの通路ノード（指定フロア内・任意のワールド座標＝GPS現在地から経路探索するため）
function nearestNode(pos, fid) {
  let best = null, bd = Infinity;
  const prefix = `${fid}:`;
  for (const [id, p] of Object.entries(nodePos)) {
    if (!id.startsWith(prefix)) continue;
    const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

// 現在地（ワールド座標＋フロア）→ 目的地POI の経路。フロアごとのレッグ配列を返す
// leg = { floor, points:[Vector3], via: 乗換名|null（このレッグへ移る手段） }
function buildRouteLegs(startPos, startFloor, toId) {
  const to = getPoi(toId);
  if (!to) return null;
  const startNodeId = nearestNode(startPos, startFloor);
  const entryCandidates = (Array.isArray(to.entries) && to.entries.length ? to.entries : [to.entry])
    .filter(id => nodePos[`${to.floor}:${id}`]);
  let nodePath = null, chosenEntry = to.entry, bestCost = Infinity;
  for (const entry of entryCandidates) {
    const candidate = astar(startNodeId, `${to.floor}:${entry}`);
    if (!candidate) continue;
    let cost = 0;
    for (let i = 1; i < candidate.length; i++) cost += nodePos[candidate[i - 1]].distanceTo(nodePos[candidate[i]]);
    if (cost < bestCost) { bestCost = cost; nodePath = candidate; chosenEntry = entry; }
  }
  if (!nodePath) return null;

  const legs = [];
  let cur = { floor: startFloor, points: [startPos.clone().setY(FLOORS[startFloor].y)], via: null };
  let prevKey = null;
  for (const key of nodePath) {
    const f = key.split(':')[0];
    if (f !== cur.floor) {
      legs.push(cur);
      cur = {
        floor: f,
        points: [nodePos[key].clone()],
        via: (prevKey && transferName[`${prevKey}|${key}`]) || 'エレベーター',
      };
    } else {
      cur.points.push(nodePos[key].clone());
    }
    prevKey = key;
  }
  // 実測入口がある建物は建物中心へ入り込まず、選択した入口ノードをゴールにする。
  // 実測入口が無い場合だけ、みんなの到着地点補正または従来の施設位置を使う。
  const measuredEntryPos = Array.isArray(to.surveyEntrances) && to.surveyEntrances.length
    ? nodePos[`${to.floor}:${chosenEntry}`] : null;
  cur.points.push((measuredEntryPos ?? to._navPos ?? to._pos).clone());
  legs.push(cur);

  // 各レッグ内の連続する近接点を除去
  for (const leg of legs) {
    const clean = [leg.points[0]];
    for (const p of leg.points) if (p.distanceTo(clean[clean.length - 1]) > 1.5) clean.push(p);
    if (clean.length < 2 && leg.points.length >= 2) clean.push(leg.points[leg.points.length - 1]);
    leg.points = clean;
  }
  return legs.filter(l => l.points.length >= 2);
}

// ------------------------------------------------------------
// 経路の描画（フロアごとのレッグ＋フロア間の乗換ビーム）
// ------------------------------------------------------------
let routeObjects = [];
let routeCurve = null;   // 進行中レッグのカーブ
let routeArrows = [];
let routeDots = [];
let activeLegIndex = 0;
let currentRoute = null; // { toId, legs, curves, lengthM }

function setActiveLeg(i) {
  activeLegIndex = i;
  routeCurve = currentRoute?.curves[i] ?? null;
  updateRouteVisibility();
  updateStepsUI();
}

// 経路は「今進んでいるレッグ」だけ表示（次の乗換ビームも予告として見せる）
function updateRouteVisibility() {
  for (const o of routeObjects) {
    if (o.userData.legIndex != null) o.visible = o.userData.legIndex === activeLegIndex;
    else if (o.userData.beamIndex != null) o.visible = o.userData.beamIndex === activeLegIndex + 1;
  }
}

// ステップリスト（経路パネル）とナビバナーの現ステップ表示を更新
function updateStepsUI() {
  document.querySelectorAll('#route-info .route-step').forEach(li => {
    li.classList.toggle('active', Number(li.dataset.leg) === activeLegIndex);
  });
  const stepEl = document.getElementById('nav-step');
  if (currentRoute) {
    const target = currentRoute.legs[activeLegIndex]?.target ?? '';
    stepEl.textContent = target ? `${target}へ` : '';
  } else {
    stepEl.textContent = '';
  }
}

function clearRoute() {
  for (const o of routeObjects) { scene.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
  routeObjects = []; routeArrows = []; routeDots = []; routeCurve = null; currentRoute = null;
  activeLegIndex = 0;
  document.getElementById('route-info').classList.add('hidden');
  document.getElementById('btn-ar').disabled = true;
  document.getElementById('route-panel-title').textContent = '経路を検索';
  document.getElementById('route-panel').classList.add('no-route');
  document.body.classList.remove('route-active');
  document.getElementById('transfer-card').classList.add('hidden');
  document.getElementById('nav-step').textContent = '';
}

function showRoute(toId, { fly = true } = {}) {
  clearRoute();
  const legs = buildRouteLegs(avatar.position, userFloor, toId);
  if (!legs || !legs.length) { toast('経路が見つかりませんでした'); return false; }

  const curves = [];
  let totalLen = 0;
  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li];
    const lifted = leg.points.map(p => p.clone().setY(FLOORS[leg.floor].y + 0.62));
    const curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal', 0.15);
    curves.push(curve);
    const len = curve.getLength();
    totalLen += len;

    // 点線の土台。公式図を隠さない細いガイドだけ残す。
    const outline = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(40, leg.points.length * 12), 0.34, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x07506c, transparent: true, opacity: 0.38, depthTest: false })
    );
    outline.renderOrder = 18;
    outline.userData.legIndex = li;
    scene.add(outline); routeObjects.push(outline);

    // 発光する点を流し、経路と進行方向を同時に伝える
    const dotCount = Math.max(8, Math.floor(len / 2.6));
    for (let i = 0; i < dotCount; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(i % 4 === 0 ? 0.46 : 0.32, 10, 8),
        new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffffff : 0x22d3ee, depthTest: false })
      );
      dot.userData.offset = i / dotCount;
      dot.userData.curve = curve;
      dot.userData.baseY = FLOORS[leg.floor].y;
      dot.userData.legIndex = li;
      dot.renderOrder = 19;
      scene.add(dot); routeObjects.push(dot); routeDots.push(dot);
    }

    // 進行方向シェブロン（動く矢印）
    const coneGeo = new THREE.ConeGeometry(0.7, 1.65, 8);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    const n = Math.max(3, Math.floor(len / 12));
    for (let i = 0; i < n; i++) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.userData.offset = i / n;
      cone.userData.curve = curve;
      cone.userData.baseY = FLOORS[leg.floor].y;
      cone.userData.legIndex = li;
      cone.renderOrder = 20;
      scene.add(cone);
      routeObjects.push(cone); routeArrows.push(cone);
    }
  }

  // フロア間の乗換ビーム＋「B1へ ↓」マーカー（次の乗換だけ表示される）
  for (let i = 1; i < legs.length; i++) {
    const from = legs[i - 1], toLeg = legs[i];
    const p = toLeg.points[0];
    const y1 = FLOORS[from.floor].y, y2 = FLOORS[toLeg.floor].y;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, Math.abs(y2 - y1), 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthTest: false })
    );
    beam.position.set(p.x, (y1 + y2) / 2, p.z);
    beam.renderOrder = 17;
    beam.userData.beamIndex = i;
    scene.add(beam); routeObjects.push(beam);
    for (const yy of [y1, y2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.13, 10, 36), new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false }));
      ring.rotation.x = Math.PI / 2; ring.position.set(p.x, yy + 0.3, p.z); ring.renderOrder = 17;
      ring.userData.beamIndex = i;
      scene.add(ring); routeObjects.push(ring);
    }
    // 乗換マーカー（今のフロア側のエレベーター上に「B1へ ↓」）
    const dirArrow = y2 > y1 ? '↑' : '↓';
    const marker = makeLabelSprite(`${FLOORS[toLeg.floor].short}へ ${dirArrow}`, { bg: '#7c2d12', fg: '#ffedd5', border: '#f59e0b', scale: 1.05 });
    marker.position.set(p.x, y1 + 6.5, p.z);
    marker.userData = { legIndex: i - 1 };
    scene.add(marker); routeObjects.push(marker);
  }

  // ゴールのビーコン（スタート＝現在地はアバター自身が示すため不要）
  const lastLeg = legs[legs.length - 1];
  const goalPos = lastLeg.points[lastLeg.points.length - 1];
  {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    pillar.position.y = 7;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.14, 10, 40), new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    g.add(pillar, ring);
    g.position.copy(goalPos);
    g.userData.legIndex = legs.length - 1;
    scene.add(g); routeObjects.push(g);
  }

  const to = getPoi(toId);
  const transfers = legs.slice(1).map(l => l.via);
  const lengthM = Math.round(totalLen * METER_PER_UNIT) + transfers.length * 15; // 乗換1回 ≈ +15m

  // 各レッグの「向かう先」（ステップ表示とナビバナーで使う）
  legs.forEach((leg, i) => {
    leg.target = i < legs.length - 1 ? legs[i + 1].via : to.name;
  });

  currentRoute = { toId, legs, curves, lengthM };

  const info = document.getElementById('route-info');
  const mins = Math.max(1, Math.round(lengthM / 67)); // 徒歩 約4km/h
  const floorNote = to.floor === userFloor ? '' : `（${esc(FLOORS[to.floor].short)}・${esc(floorRelText(to.floor))}）`;
  let html = `<b>現在地</b> → <b>${esc(to.name)}</b>${floorNote}<br>距離 約${lengthM}m ・ 徒歩 約${mins}分`;
  if (legs.length > 1) {
    // 手順を明示（① 歩く → ② 階を移動 → ③ 歩く）
    const items = [];
    legs.forEach((leg, i) => {
      const legM = Math.round(curves[i].getLength() * METER_PER_UNIT);
      items.push(`<li class="route-step" data-leg="${i}">${esc(FLOORS[leg.floor].short)}：${esc(leg.target)}へ 約${legM}m</li>`);
      if (i < legs.length - 1) {
        const up = FLOOR_ORDER.indexOf(legs[i + 1].floor) > FLOOR_ORDER.indexOf(leg.floor);
        items.push(`<li class="route-step route-step-transfer" data-leg="${i}">${esc(legs[i + 1].via)}で ${esc(FLOORS[legs[i + 1].floor].short)} へ${up ? '上る' : '下りる'}</li>`);
      }
    });
    html += `<ol class="route-steps">${items.join('')}</ol>`;
  }
  info.innerHTML = html;
  setActiveLeg(0);
  info.classList.remove('hidden');
  document.getElementById('btn-ar').disabled = false;
  document.getElementById('route-panel-title').textContent = `${to.name} への経路`;
  document.getElementById('route-panel').classList.remove('no-route');
  document.body.classList.add('route-active');

  if (fly && !navMode) {
    // 出発フロアを表示し、最初のレッグ全体が見えるようにカメラ移動
    setViewFloor(userFloor);
    const box = new THREE.Box3().setFromPoints(legs[0].points);
    const center = box.getCenter(new THREE.Vector3());
    const span = box.getSize(new THREE.Vector3()).length();
    const dist = Math.max(60, span * 0.9);
    flyTo(center.clone().add(new THREE.Vector3(0, dist, dist * 0.76)), center);
  }
  return true;
}

// ------------------------------------------------------------
// カメラ演出・お散歩モード
// ------------------------------------------------------------
let camTween = null;
function flyTo(camPos, target, dur = 1.4) {
  if (prefersReducedMotion) {
    camTween = null;
    camera.position.copy(camPos);
    controls.target.copy(target);
    controls.update();
    return;
  }
  camTween = {
    t: 0, dur,
    fromPos: camera.position.clone(), toPos: camPos,
    fromTgt: controls.target.clone(), toTgt: target,
  };
}

// ------------------------------------------------------------
// UI
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
function setControlIcon(id, icon, label) {
  const el = $(id);
  el.innerHTML = `<svg aria-hidden="true"><use href="#i-${icon}"/></svg><span>${label}</span>`;
}
// HTMLエスケープ。非文字列（undefined等）が渡ってもクラッシュしないよう防御的に扱う
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function focusableElements(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.hidden && el.getClientRects().length);
}

function trapTabKey(container, event) {
  if (event.key !== 'Tab') return;
  const focusable = focusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// ------------------------------------------------------------
// フロア切替
// ------------------------------------------------------------
function setViewFloor(fid, { alsoUser = false } = {}) {
  viewFloor = fid;
  if (alsoUser) userFloor = fid;
  // 表示は常に1フロアのみ（積層は乗換演出 flashFloorGhost でのみ使用）
  for (const f of FLOOR_ORDER) {
    const active = f === fid;
    const v = floorVisuals[f];
    v.ground.visible = active;
    v.ground.material.opacity = 1;
    v.frame.visible = active;
  }
  // 現在地ピンは「実際にいる階」を表示しているときだけ立てる（BKCは常に同一）
  avatar.visible = userFloor === viewFloor;
  if (alsoUser && !navMode) avatar.position.y = floorY();
}

// 乗換の瞬間だけ、元いたフロアをうっすら見せて上下移動を演出する
function flashFloorGhost(fid, ms = 1800) {
  const v = floorVisuals[fid];
  if (!v || fid === viewFloor) return;
  v.ground.visible = true;
  v.ground.material.opacity = GHOST_GROUND_OPACITY;
  setTimeout(() => {
    if (fid !== viewFloor) v.ground.visible = false;
    v.ground.material.opacity = 1;
  }, ms);
}

// 「1つ下の階」のような相対フロア表現（利用者にはB1/2Fより伝わりやすい）
function floorRelText(fid, base = userFloor) {
  const d = FLOOR_ORDER.indexOf(fid) - FLOOR_ORDER.indexOf(base);
  if (!d) return 'このフロア';
  return `${Math.abs(d)}つ${d > 0 ? '上' : '下'}の階`;
}

// BKCは屋外の単一マップのため、フロア切替UIは存在しない
setViewFloor('campus', { alsoUser: true });

const routePanel = $('route-panel');
const routePanelToggle = $('route-panel-toggle');
function setRoutePanelCollapsed(collapsed) {
  routePanel.classList.toggle('collapsed', collapsed);
  routePanelToggle.setAttribute('aria-expanded', String(!collapsed));
}
routePanelToggle.addEventListener('click', () => setRoutePanelCollapsed(!routePanel.classList.contains('collapsed')));
if (isMobileDevice) setRoutePanelCollapsed(true);

// ピンチが難しい場合でも使える地図操作
function zoomMap(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  flyTo(controls.target.clone().add(offset.setLength(distance)), controls.target.clone(), 0.28);
}
$('btn-zoom-in').addEventListener('click', () => zoomMap(0.72));
$('btn-zoom-out').addEventListener('click', () => zoomMap(1.38));
$('btn-north').addEventListener('click', () => {
  const distance = camera.position.distanceTo(controls.target);
  const height = Math.max(34, distance * 0.78);
  flyTo(controls.target.clone().add(new THREE.Vector3(0, height, distance * 0.58)), controls.target.clone(), 0.65);
  toast('北を上に戻しました');
});
// 現在地が画面の「手前（下側）」に来るようにカメラを構える。
// 自分の位置からキャンパス中心方向を見る構図 = 目の前に道と建物が広がり、
// 地図と実際の視界が対応しやすい（例: 第一グラウンド横の駐車場にいれば
// 駐車場が手前、キャンパスが奥に見える）。
function frameFromCurrentPosition(dur = 1.2) {
  const p = avatar.position.clone().setY(0);
  const dir = p.clone().negate().setY(0);        // キャンパス中心(0,0)へ向かう方向
  if (dir.lengthSq() < 100) dir.set(0, 0, -1);   // 中心付近にいるときは北向きで固定
  else dir.normalize();
  const target = p.clone().addScaledVector(dir, 34);            // 少し先を注視
  const camPos = p.clone().addScaledVector(dir, -34).setY(52);  // 自分の後方上空
  flyTo(camPos, target, dur);
}

$('btn-locate').addEventListener('click', () => {
  frameFromCurrentPosition(0.65);
  toast(geoState.ok ? '現在地を表示しました' : '現在地を取得中です');
  startGeolocation();
});

// 現在地にスポットを登録（誰でも・その場で全ユーザーに反映される）
$('btn-add-spot').addEventListener('click', async () => {
  startGeolocation();
  await bootWalkLearn(false); // モジュール読込（未ロード時）
  if (walkLearn.mod?.openSpotForm) walkLearn.mod.openSpotForm();
  else toast('スポット登録を読み込めませんでした。通信環境を確認してください');
});

$('btn-clear').addEventListener('click', () => { exitNav(false); clearRoute(); });
$('btn-ar').addEventListener('click', () => {
  if (!currentRoute) return;
  startAR(arRouteLeg(), getPoi, METER_PER_UNIT);
});
// AR は進行中レッグ（現在のフロア区間）を案内する
function arRouteLeg() {
  const leg = currentRoute.legs[activeLegIndex];
  return { toId: currentRoute.toId, points: leg.points, lengthM: currentRoute.lengthM };
}

// ドロワー
const drawer = $('drawer');
const drawerBackdrop = $('drawer-backdrop');
let drawerReturnFocus = null;

function openDrawer({ focusSearch = true } = {}) {
  if (drawer.classList.contains('open')) return;
  drawerReturnFocus = document.activeElement;
  drawer.inert = false;
  drawer.setAttribute('aria-hidden', 'false');
  drawer.classList.add('open');
  drawerBackdrop.hidden = false;
  $('btn-list').setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  if (focusSearch) setTimeout(() => $('search').focus(), prefersReducedMotion ? 0 : 180);
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.inert = true;
  drawerBackdrop.hidden = true;
  $('btn-list').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');
  if (restoreFocus && drawerReturnFocus?.isConnected) drawerReturnFocus.focus();
}

$('btn-list').addEventListener('click', () => {
  if (drawer.classList.contains('open')) closeDrawer();
  else openDrawer();
});
$('drawer-close').addEventListener('click', () => closeDrawer());
drawerBackdrop.addEventListener('click', () => closeDrawer());

function normalizeSearch(value) {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[^a-z0-9ぁ-ん一-龠]/g, '');
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}

// 学生が実際に使う言葉で建物にたどり着けるようにするエイリアス
const SEARCH_ALIASES = {
  media: 'としょかん 図書館 ライブラリー ぴあら 自習 勉強',
  union: 'しょくどう 食堂 学食 生協 ランチ ごはん コンビニ ショップ ユニオン',
  link: 'しょくどう 食堂 学食 書籍 本屋 ランチ リンスク 生命科学部事務室',
  ccube: 'しょくどう 食堂 レストラン ナデシコ ランチ',
  prism: 'きょうしつ 教室 キャリアセンター 就活 プリズムホール プリズム',
  forest: 'きょうしつ 教室 フォレスト',
  across: 'ぴあら レインボー RAINBOW サービスデスク パソコン 教職 アクロス',
  colearn1: 'コラいち 演習室 パソコン',
  colearn2: 'コラに 実習室',
  adseminario: 'まなびステーション 学びステーション 履修 成績 経済学部 食マネジメント スポーツ健康科学部 事務室 アドセミ',
  'central-arc': '学生オフィス 奨学金 サークル BBP 国際 留学 障害学生支援 サポート',
  'core-station': '理工学部事務室 証明書 落とし物 キャンパス管理 保育園',
  'west-wing': '保健センター 医務室 体調 けが 診察',
  'east-wing': '研究室 実験',
  science: '薬学部事務室 研究室',
  gym: 'たいいくかん 体育館 ジム アリーナ トレーニング 部活',
  'sports-commons': 'プール 知るカフェ アリーナ トレーニング スポコモ',
  quince: 'スタジアム 陸上 クインス 競技場',
  'athlete-gym': 'トレーニング 強化',
  'green-field': 'ラグビー アメフト 人工芝',
  canopy: 'バス 定期券 近江鉄道',
  epoch: 'セミナー 合宿 宿泊 エポック',
  'act-alpha': 'サークル 部室',
  'act-mu': 'サークル 部室 音楽 バンド 軽音',
  'act-beta': 'サークル 部室',
  'act-sigma': 'サークル 部室',
  rohm: '会議室 ローム',
  'intl-house': '寮 留学生 アイハウス',
  grassroots: '起業 コワーキング ファブ 3Dプリンタ',
  incubator: '起業 スタートアップ',
  workshop: '工作 ものづくり 実習',
  tricea: '研究室',
  biolink: '研究室 サークルルーム',
};

function searchScore(shop, query) {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const category = CATEGORIES[shop.cat]?.label ?? '';
  const fields = [shop.name, shop.en, shop.tag, category, SEARCH_ALIASES[shop.id] ?? ''].map(normalizeSearch).filter(Boolean);
  let best = Infinity;
  for (const field of fields) {
    if (field === q) best = Math.min(best, 0);
    else if (field.startsWith(q)) best = Math.min(best, 1);
    else if (field.includes(q)) best = Math.min(best, 2);
    const distance = editDistance(q, field);
    const tolerance = Math.min(3, Math.max(1, Math.ceil(q.length * 0.3)));
    if (distance <= tolerance) best = Math.min(best, 3 + distance / Math.max(q.length, field.length));
    if (q.length >= 3 && field.length > q.length) {
      for (let i = 0; i <= field.length - q.length; i++) {
        const partDistance = editDistance(q, field.slice(i, i + q.length));
        if (partDistance <= tolerance) best = Math.min(best, 3.5 + partDistance / q.length);
      }
    }
  }
  return best;
}

const STUDENT_SHORTCUTS = [
  { label: '授業棟', sub: '教室を探す', query: '教室', glyph: '講' },
  { label: '学食', sub: 'ランチ・生協', query: '学食', glyph: '食' },
  { label: '自習場所', sub: '図書館・ぴあら', query: '自習', glyph: '習' },
  { label: '履修・成績', sub: '学びステーション', query: '履修', glyph: '窓' },
];
const RECENT_SHOPS_KEY = 'bkc-map-recent-shops';

function recentShopIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_SHOPS_KEY) || '[]');
    return Array.isArray(ids) ? ids.filter(id => SHOPS.some(s => s.id === id)).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function recordRecentShop(shop) {
  try {
    const ids = [shop.id, ...recentShopIds().filter(id => id !== shop.id)].slice(0, 3);
    localStorage.setItem(RECENT_SHOPS_KEY, JSON.stringify(ids));
  } catch { /* 履歴を保存できない環境では、そのまま動作を継続 */ }
}

function appendStudentHome(list) {
  const home = document.createElement('section');
  home.className = 'student-home';
  home.innerHTML = `
    <div class="list-section-title"><span>すぐ探す</span><small>在学生向け</small></div>
    <div class="student-shortcuts">
      ${STUDENT_SHORTCUTS.map((item, index) => `
        <button type="button" data-shortcut="${index}">
          <i>${item.glyph}</i><span><b>${item.label}</b><small>${item.sub}</small></span>
        </button>`).join('')}
    </div>`;
  home.querySelectorAll('[data-shortcut]').forEach(button => {
    button.addEventListener('click', () => {
      const item = STUDENT_SHORTCUTS[Number(button.dataset.shortcut)];
      $('search').value = item.query;
      renderShopList(item.query, 'all');
    });
  });
  list.appendChild(home);

  const recent = recentShopIds().map(id => SHOPS.find(s => s.id === id)).filter(Boolean);
  if (recent.length) {
    const section = document.createElement('section');
    section.className = 'recent-places';
    section.innerHTML = `
      <div class="list-section-title"><span>最近見た場所</span></div>
      <div class="recent-place-row">${recent.map(s =>
        `<button type="button" data-recent="${s.id}"><b>${esc(s.short ?? s.name)}</b><small>${esc(s.tag)}</small></button>`
      ).join('')}</div>`;
    section.querySelectorAll('[data-recent]').forEach(button => {
      button.addEventListener('click', () => {
        const shop = SHOPS.find(s => s.id === button.dataset.recent);
        if (shop) startGuidanceTo(shop);
      });
    });
    list.appendChild(section);
  }

  const heading = document.createElement('div');
  heading.className = 'list-section-title facilities-title';
  heading.innerHTML = `<span>すべての施設</span><small>${SHOPS.length}件・タップしてルート表示</small>`;
  list.appendChild(heading);
}

function renderShopList(filter = '', cat = 'all') {
  const list = $('shop-list');
  list.innerHTML = '';
  if (!filter && cat === 'all') appendStudentHome(list);
  const results = SHOPS
    .filter(s => cat === 'all' || s.cat === cat)
    .map(s => ({ shop: s, score: searchScore(s, filter) }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.shop.name.localeCompare(b.shop.name, 'ja'));
  if (!results.length) {
    list.innerHTML = '<div class="search-empty" role="status"><b>該当する施設がありません</b><br><small>通称を短くするか、「食堂」「図書館」「教室」などで検索してください</small></div>';
    return;
  }
  if (filter || cat !== 'all') {
    const summary = document.createElement('div');
    summary.className = 'result-summary';
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');
    summary.textContent = `${results.length}件の施設`;
    list.appendChild(summary);
  }
  for (const { shop: s } of results) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    row.innerHTML = `
      <button class="shop-main-btn" type="button" aria-label="${esc(s.name)}までのルートを表示">
        <img class="thumb" src="${s.logo}" alt="" loading="lazy">
        <span class="meta"><b>${esc(s.name)}</b><span>${s.no != null ? `<i class="floor-badge">${s.no}</i>` : ''}${esc(s.tag)}</span></span>
      </button>
      <button class="shop-info-btn" type="button" aria-label="${esc(s.name)}の施設情報を表示" title="施設情報">
        <svg aria-hidden="true"><use href="#i-info"/></svg>
      </button>`;
    // インラインonerrorはCSPで禁止しているため、リスナーで読み込み失敗を処理する
    row.querySelector('.thumb').addEventListener('error', (e) => { e.target.style.visibility = 'hidden'; });
    row.querySelector('.shop-main-btn').addEventListener('click', () => startGuidanceTo(s));
    row.querySelector('.shop-info-btn').addEventListener('click', () => {
      closeDrawer({ restoreFocus: false });
      openCard(s);
      focusShop(s);
    });
    list.appendChild(row);
  }
}
renderShopList();
$('search').addEventListener('input', (e) => renderShopList(e.target.value, activeCat));

$('quick-destination').addEventListener('click', () => {
  $('search').value = '';
  activeCat = 'all';
  document.querySelectorAll('.filter-chip').forEach(b => {
    const selected = b.dataset.cat === 'all';
    b.classList.toggle('active', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
  SHOPS.forEach(s => { s._categoryVisible = true; });
  renderShopList('', 'all');
  openDrawer();
});
addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('quick-destination').click();
  }
});

// カテゴリフィルタ
let activeCat = 'all';
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(b => {
      const selected = b === btn;
      b.classList.toggle('active', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
    activeCat = btn.dataset.cat;
    renderShopList($('search').value, activeCat);
    for (const s of SHOPS) {
      const on = activeCat === 'all' || s.cat === activeCat;
      s._categoryVisible = on;
    }
  });
});

// ショップカード
let cardShop = null;
let cardReturnFocus = null;
function openCard(shop) {
  if (document.body.classList.contains('nav-active')) return;
  cardReturnFocus = document.activeElement;
  recordRecentShop(shop);
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
  document.body.classList.add('detail-active');
  routePanel.classList.add('card-covered');
  $('map-controls').classList.add('hidden');
  setTimeout(() => $('card-close').focus(), prefersReducedMotion ? 0 : 80);
}
function closeCard({ restoreFocus = true } = {}) {
  if ($('shop-card').classList.contains('hidden')) return;
  $('shop-card').classList.add('hidden');
  document.body.classList.remove('detail-active');
  routePanel.classList.remove('card-covered');
  $('map-controls').classList.remove('hidden');
  if (restoreFocus && cardReturnFocus?.isConnected) cardReturnFocus.focus();
}
$('card-close').addEventListener('click', (event) => {
  event.stopPropagation();
  closeCard();
});

function startGuidanceTo(shop) {
  if (!showRoute(shop.id)) return;
  recordRecentShop(shop);
  closeCard({ restoreFocus: false });
  closeDrawer({ restoreFocus: false });
  setRoutePanelCollapsed(false);
  toast(`「${shop.name}」までの経路を表示しました`);
}

$('card-goto').addEventListener('click', () => {
  if (!cardShop) return;
  startGuidanceTo(cardShop);
});

function focusShop(shop) {
  if (shop.floor !== viewFloor) setViewFloor(shop.floor); // 表示だけ切替（現在地フロアは維持）
  const p = shop._pos;
  flyTo(p.clone().add(new THREE.Vector3(0, 34, 30)), p.clone().add(new THREE.Vector3(0, 2, 0)));
}

// ------------------------------------------------------------
// GPS現在地（実際の位置情報でアバターとナビが動く）
// ------------------------------------------------------------
const geoState = {
  watchId: null, ok: false, world: null, course: null,
  lat: null, lng: null, accuracy: null, timestamp: null,
};

// 実方位（真北から時計回り）→ ワールドのyaw角。GEO.rotationDegを考慮する
function courseToWorldYaw(course) {
  const rot = THREE.MathUtils.degToRad(GEO.rotationDeg);
  const e = Math.sin(course), n = Math.cos(course);
  return Math.atan2(
    e * Math.cos(rot) - n * Math.sin(rot),
    -(n * Math.cos(rot) + e * Math.sin(rot))
  );
}

// ------------------------------------------------------------
// マップマッチング — 現在地ピンを最寄りの通路（みんなの道含む）へスナップ表示
//   GPS誤差や略図の歪みで「道の外・建物の中を歩いて見える」問題を吸収する。
//   スナップするのは表示だけで、経路探索・逸脱判定のしきい値・歩行学習・
//   位置共有はすべて生のGPS位置のまま動く。
// ------------------------------------------------------------
const SNAP_DIST = 8 / METER_PER_UNIT; // 最大8mだけ通路へ吸着。大きな地図ズレを隠さない
function snapToPath(pos) {
  let bx = 0, bz = 0, bd = Infinity;
  for (const a of Object.keys(adj)) {
    const pa = nodePos[a];
    if (!pa) continue;
    for (const b of adj[a]) {
      if (b < a) continue; // 双方向登録のエッジを1回だけ処理
      const pb = nodePos[b];
      if (!pb) continue;
      const vx = pb.x - pa.x, vz = pb.z - pa.z;
      const len2 = vx * vx + vz * vz || 1e-9;
      let u = ((pos.x - pa.x) * vx + (pos.z - pa.z) * vz) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const x = pa.x + vx * u, z = pa.z + vz * u;
      const d = (pos.x - x) ** 2 + (pos.z - z) ** 2;
      if (d < bd) { bd = d; bx = x; bz = z; }
    }
  }
  return bd <= SNAP_DIST * SNAP_DIST ? new THREE.Vector3(bx, 0, bz) : null;
}

function geoStatusText() {
  if (!('geolocation' in navigator)) return 'GPS非対応';
  if (geoState.watchId == null) return 'GPS待機中';
  if (!geoState.world) return 'GPS取得中…';
  return geoState.ok ? 'GPS追従中' : 'エリア外';
}
function updateGeoChip() {
  $('nav-gps').querySelector('span').textContent = geoStatusText();
}
function startGeolocation({ silentError = false } = {}) {
  if (geoState.watchId != null || !('geolocation' in navigator)) return;
  geoState.watchId = navigator.geolocation.watchPosition((pos) => {
    const { latitude, longitude, heading, accuracy } = pos.coords;
    geoState.lat = latitude;
    geoState.lng = longitude;
    geoState.accuracy = accuracy;
    geoState.timestamp = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
    const { x, z } = gpsToWorld(latitude, longitude);
    // マップ範囲＋余白の内側にいるときだけ実位置へ追従する（それ以外は入口基準）
    geoState.ok = Math.abs(x) < MAP_W / 2 + 15 && Math.abs(z) < MAP_D / 2 + 15;
    geoState.world = new THREE.Vector3(
      THREE.MathUtils.clamp(x, -MAP_W / 2 + 1.5, MAP_W / 2 - 1.5), 0,
      THREE.MathUtils.clamp(z, -MAP_D / 2 + 1.5, MAP_D / 2 - 1.5));
    // マップマッチング: 表示用に最寄りの通路上へスナップした座標も持つ
    geoState.snap = geoState.ok ? snapToPath(geoState.world) : null;
    geoState.course = (typeof heading === 'number' && !Number.isNaN(heading))
      ? THREE.MathUtils.degToRad(heading) : null;
    // キャンパス内でGPS追従が始まったら歩行学習を起動（匿名の通行量集計＋学習適用）
    if (geoState.ok && (accuracy ?? 99) <= 30) bootWalkLearn(true);
    updateGeoChip();
  }, () => {
    if (geoState.watchId != null) navigator.geolocation.clearWatch(geoState.watchId);
    geoState.watchId = null;
    if (!silentError) toast('位置情報を取得できませんでした。ブラウザ設定で位置情報を許可してください');
    updateGeoChip();
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  updateGeoChip();
}
// ------------------------------------------------------------
// ナビモード（GPS追従。追従(三人称)/俯瞰をワンタップ切替、逸脱時は自動リルート）
// ------------------------------------------------------------
const NAV_OFFROUTE_DIST = 12 / METER_PER_UNIT; // 経路から12mで再探索
const NAV_ARRIVE_DIST = 10 / METER_PER_UNIT;   // 目的地から10mで到着
// navMode: { view, heading, headingOffset, zoom, samples, goal, len, rerouteAt }（宣言はフロア状態節）

// ナビ中の見回し（1本指ドラッグ=回転 / ピンチ=ズーム / ホイール=ズーム）
const navPointers = new Map();
canvas.addEventListener('pointerdown', (e) => { if (navMode) navPointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
canvas.addEventListener('pointermove', (e) => {
  if (!navMode || !navPointers.has(e.pointerId)) return;
  const prev = navPointers.get(e.pointerId);
  if (navPointers.size === 1) {
    navMode.headingOffset -= (e.clientX - prev.x) * 0.007;
  } else if (navPointers.size === 2) {
    const other = [...navPointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other) {
      const dPrev = Math.hypot(prev.x - other.x, prev.y - other.y);
      const dNow = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (dNow > 4) navMode.zoom = THREE.MathUtils.clamp(navMode.zoom * (dPrev / dNow), 6.5, 20);
    }
  }
  navPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
const navPointerEnd = (e) => navPointers.delete(e.pointerId);
canvas.addEventListener('pointerup', navPointerEnd);
canvas.addEventListener('pointercancel', navPointerEnd);
canvas.addEventListener('wheel', (e) => {
  if (!navMode) return;
  e.preventDefault();
  navMode.zoom = THREE.MathUtils.clamp(navMode.zoom * (1 + e.deltaY * 0.0012), 6.5, 20);
}, { passive: false });

function refreshNavRoute() {
  const curve = currentRoute.curves[activeLegIndex];
  navMode.samples = curve.getSpacedPoints(160);
  navMode.goal = currentRoute.curves[currentRoute.curves.length - 1].getPointAt(1);
  navMode.len = curve.getLength();
}

function startNav() {
  if (!routeCurve || !currentRoute) { toast('先に目的地を選んでください'); return; }
  startGeolocation();
  camTween = null;
  controls.enabled = false;
  avatar.userData.hereLabel.visible = false; // 追従視点では自分の目印は不要
  setActiveLeg(0);
  setViewFloor(currentRoute.legs[0].floor, { alsoUser: true });
  const t0 = routeCurve.getTangentAt(0);
  navMode = {
    view: 'follow',
    heading: Math.atan2(t0.x, t0.z),
    headingOffset: 0,
    zoom: 14,
    rerouteAt: 0,
  };
  refreshNavRoute();
  document.body.classList.add('nav-active');
  $('nav-hud').classList.remove('hidden');
  $('nav-offroute').classList.add('hidden');
  $('nav-dest').textContent = `${getPoi(currentRoute.toId).name} へ案内中`;
  setControlIcon('nav-view', 'overview', '俯瞰');
  updateGeoChip();
  setRoutePanelCollapsed(true);
  closeCard({ restoreFocus: false });
  closeDrawer({ restoreFocus: false });
}

function exitNav(arrived = false) {
  if (!navMode) return;
  navMode = null;
  navPointers.clear();
  $('transfer-card').classList.add('hidden');
  document.body.classList.remove('nav-active');
  $('nav-hud').classList.add('hidden');
  avatar.userData.hereLabel.visible = true;
  controls.enabled = true;
  const target = avatar.position.clone().setY(0);
  flyTo(target.clone().add(new THREE.Vector3(0, 64, 50)), target, 1.1);
  if (arrived) {
    avatarPlaceId = currentRoute?.toId ?? avatarPlaceId;
    // 到着地点を匿名集計へ（みんなの到着位置の平均が「本当の入口」になっていく）
    walkLearn.mod?.reportArrival?.(avatarPlaceId);
    clearRoute();
    toast('目的地に到着しました');
  } else {
    setRoutePanelCollapsed(false);
  }
  setViewFloor(userFloor);
}

function turnTo(target, k) {
  let dh = target - navMode.heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  navMode.heading += dh * Math.min(1, k);
}

function updateNav(dt, t) {
  // GPS現在地へ追従（取得できない間は経路の始点で待機）
  let moving = false;
  if (geoState.ok && geoState.world) {
    const gp = geoState.snap ?? geoState.world; // 表示は道の上にスナップ
    const dist = Math.hypot(gp.x - avatar.position.x, gp.z - avatar.position.z);
    moving = dist > 0.6;
    const k = 1 - Math.pow(0.02, dt);
    const dx = (gp.x - avatar.position.x) * k;
    const dz = (gp.z - avatar.position.z) * k;
    avatar.position.x += dx;
    avatar.position.z += dz;
    // 向き: GPSの進行方位 > 実際の移動ベクトル の優先順（方位はマップ回転を補正）
    if (geoState.course != null) turnTo(courseToWorldYaw(geoState.course), dt * 4);
    else if (moving && Math.hypot(dx, dz) > 0.01) turnTo(Math.atan2(dx, dz), dt * 4);
  }
  avatar.position.y = floorY() + (moving ? Math.abs(Math.sin(t * 10)) * 0.2 : 0);

  // ルート進捗（進行中レッグの最寄りサンプル点）
  const s = navMode.samples;
  let bi = 0, bd = Infinity;
  for (let i = 0; i < s.length; i++) {
    const ddx = s[i].x - avatar.position.x, ddz = s[i].z - avatar.position.z;
    const d = ddx * ddx + ddz * ddz;
    if (d < bd) { bd = d; bi = i; }
  }

  // レッグ終端（エレベーター等）に到達 → 乗換カードを表示して確認を待つ
  const lastLeg = activeLegIndex >= currentRoute.legs.length - 1;
  const legEnd = s[s.length - 1];
  const legEndDist = Math.hypot(legEnd.x - avatar.position.x, legEnd.z - avatar.position.z);
  if (!lastLeg && (bi >= s.length - 4 || legEndDist < 3.5) && !navMode.waitingTransfer) {
    navMode.waitingTransfer = true;
    const cur = currentRoute.legs[activeLegIndex];
    const next = currentRoute.legs[activeLegIndex + 1];
    const up = FLOOR_ORDER.indexOf(next.floor) > FLOOR_ORDER.indexOf(cur.floor);
    $('transfer-text').innerHTML =
      `<b>${esc(next.via)}</b>で<br><b>${esc(FLOORS[next.floor].short)}（${esc(floorRelText(next.floor, cur.floor))}）</b>へ${up ? '上がって' : '下りて'}ください`;
    $('transfer-done').textContent = `${FLOORS[next.floor].short} に着いた`;
    $('transfer-card').classList.remove('hidden');
    return;
  }

  // 立ち止まっているときは経路の進む向きへ自然に向き直る
  if (!moving && geoState.course == null) {
    const ni = Math.min(s.length - 1, bi + 3);
    const dir = s[ni].clone().sub(s[bi]);
    if (dir.lengthSq() > 0.01) turnTo(Math.atan2(dir.x, dir.z), dt * 2);
  }
  avatar.rotation.y = navMode.heading;

  // カメラ（追従=三人称 / 俯瞰=真上から北上）
  const k = 1 - Math.pow(0.001, dt);
  if (navMode.view === 'follow') {
    const yaw = navMode.heading + navMode.headingOffset;
    const camF = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    camera.position.lerp(
      avatar.position.clone().addScaledVector(camF, -navMode.zoom * 0.8)
        .add(new THREE.Vector3(0, navMode.zoom * 0.78, 0)), k);
    controls.target.lerp(
      avatar.position.clone().addScaledVector(camF, navMode.zoom * 0.42).setY(floorY() + 1.2), k);
  } else {
    camera.position.lerp(avatar.position.clone().add(new THREE.Vector3(0, navMode.zoom * 4, navMode.zoom * 1.2)), k);
    controls.target.lerp(avatar.position.clone().setY(floorY()), k);
  }
  camera.lookAt(controls.target);

  // 残距離表示（進行中レッグの残り＋後続レッグ）
  let remain = (1 - bi / (s.length - 1)) * navMode.len;
  for (let i = activeLegIndex + 1; i < currentRoute.curves.length; i++) remain += currentRoute.curves[i].getLength();
  const remainM = Math.max(0, Math.round(remain * METER_PER_UNIT));
  const remainText = `目的地まで 約${remainM}m`;
  const remainEl = $('nav-remain');
  if (remainEl.textContent !== remainText) remainEl.textContent = remainText;

  // 経路逸脱 → 現在地から最短経路を自動で引き直す（乗換待ち中は判定しない）
  const off = !navMode.waitingTransfer && geoState.ok && Math.sqrt(bd) > NAV_OFFROUTE_DIST;
  $('nav-offroute').classList.toggle('hidden', !off);
  if (off && t - navMode.rerouteAt > 4) {
    navMode.rerouteAt = t;
    const toId = currentRoute.toId;
    if (showRoute(toId, { fly: false })) {
      refreshNavRoute();
      toast('現在地からルートを引き直しました');
    }
  }

  // 到着判定（最終レッグのみ）
  if (lastLeg && !navMode.waitingTransfer) {
    const g = navMode.goal;
    if (Math.hypot(g.x - avatar.position.x, g.z - avatar.position.z) < NAV_ARRIVE_DIST) exitNav(true);
  }
}

$('btn-nav').addEventListener('click', () => navMode ? exitNav(false) : startNav());
$('nav-exit').addEventListener('click', () => exitNav(false));

// 乗換カード「◯F に着いた」→ フロアを切替えて続きの経路を表示
$('transfer-done').addEventListener('click', () => {
  $('transfer-card').classList.add('hidden');
  if (!navMode || !currentRoute) return;
  const prevFloor = userFloor;
  const next = currentRoute.legs[activeLegIndex + 1];
  if (!next) { navMode.waitingTransfer = false; return; }
  setActiveLeg(activeLegIndex + 1);
  userFloor = next.floor;
  setViewFloor(next.floor);
  flashFloorGhost(prevFloor); // 元のフロアが一瞬透けて、上下移動したことが分かる
  avatar.position.set(next.points[0].x, floorY(), next.points[0].z);
  navMode.waitingTransfer = false;
  navMode.rerouteAt = clock.elapsedTime + 6; // 切替直後の誤リルート防止
  refreshNavRoute();
  toast(`${FLOORS[next.floor].label} — 続きの経路を案内します`, 2800);
});
$('nav-view').addEventListener('click', () => {
  if (!navMode) return;
  navMode.view = navMode.view === 'follow' ? 'top' : 'follow';
  setControlIcon('nav-view', navMode.view === 'follow' ? 'overview' : 'walk', navMode.view === 'follow' ? '俯瞰' : '追従');
});
$('nav-ar').addEventListener('click', () => {
  if (currentRoute) startAR(arRouteLeg(), getPoi, METER_PER_UNIT);
});

// ------------------------------------------------------------
// ピッキング（クリック/タップでお店を選択）
// ------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointercancel', () => { downAt = null; });
canvas.addEventListener('pointerup', (e) => {
  if (navMode) { downAt = null; return; } // ナビ中はドラッグ見回しに専念
  if (!downAt) return;
  const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
  downAt = null;
  if (dx * dx + dy * dy > 36) return; // ドラッグは無視
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([
    ...shopMeshes.filter(m => m.userData.shop.floor === viewFloor),
    ...labelSprites.filter(l => l.userData.shop && l.userData.shop.floor === viewFloor),
  ], false);
  const hit = hits.find(h => h.object.userData?.shop || h.object.userData?.type === 'shop');
  if (hit) {
    const shop = hit.object.userData.shop;
    if (isSurveyMode) {
      surveySelectedShopId = shop.id;
      window.dispatchEvent(new CustomEvent('bkc-survey-select-shop', { detail: { shopId: shop.id } }));
      return;
    }
    openCard(shop);
    focusShop(shop);
  } else if (!$('shop-card').classList.contains('hidden')) {
    // 店情報カードを開いている状態で地図の何もない場所をタップ → 地図に戻る
    closeCard({ restoreFocus: false });
  } else if (!routePanel.classList.contains('collapsed')) {
    // 経路パネルが開いた状態で地図の何もない場所をタップ → パネルを畳んでマップをメインに
    setRoutePanelCollapsed(true);
  }
});

// ホバーで建物を光らせる
let hovered = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(shopMeshes.filter(mm => mm.userData.shop.floor === viewFloor), false);
  const m = hits[0]?.object ?? null;
  if (hovered && hovered !== m) hovered.material.emissiveIntensity = isNight ? 0.6 : 0.0;
  hovered = m;
  if (hovered) hovered.material.emissiveIntensity = 1.0;
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
  const motionT = prefersReducedMotion ? 0 : t;

  // 視点に応じた情報量の最適化（Overview / Area / Detail）
  const viewDistance = camera.position.distanceTo(controls.target);
  const viewAngle = controls.getPolarAngle();
  const detailView = viewDistance < 70 && viewAngle < 1.12;
  const areaView = viewDistance < 130;
  for (const s of SHOPS) {
    const on = s._categoryVisible && s.floor === viewFloor; // 表示中フロアのみ描画
    const selected = cardShop === s || hovered === s._mesh || (isSurveyMode && surveySelectedShopId === s.id);
    s._mesh.visible = on;
    // 遠景では主要施設のみラベル表示（画面の情報量を抑える）
    s._label.visible = on && (areaView || s.landmark || selected);
    let labelScale = selected ? 1.1 : detailView ? 1 : areaView ? 0.72 : 0.5;
    let labelOpacity = selected ? 1 : detailView ? 1 : areaView ? 0.92 : 0.78;
    if (isSurveyMode) {
      // 現地測量では建物をタップできる余白を優先し、選択中の名称だけ大きく見せる。
      labelScale = selected ? 0.72 : detailView ? 0.5 : areaView ? 0.38 : 0.3;
      labelOpacity = selected ? 1 : 0.76;
    }
    if (navMode) {
      // 追従視点では至近距離のラベルが画面を塞ぐため、近づくほどフェードアウト
      const dAv = s._pos.distanceTo(avatar.position);
      labelScale = 0.6;
      labelOpacity = dAv < 10 ? Math.max(0, (dAv - 4) / 6) * 0.9 : 0.9;
    }
    s._label.scale.copy(s._label.userData.detailScale).multiplyScalar(labelScale);
    s._label.material.opacity = labelOpacity;
    s._edges.visible = on;
    s._edges.material.opacity = selected ? 1 : detailView ? 0.8 : areaView ? 0.48 : 0.3;
    s._crown.visible = on;
    s._crown.material.transparent = true;
    s._crown.material.opacity = selected ? 1 : detailView ? 0.82 : areaView ? 0.55 : 0.45;
    s._mesh.material.opacity = on
      ? (selected ? 1 : detailView ? 0.96 : areaView ? 0.92 : 0.88)
      : 0.015;
  }
  $('zoom-hint').classList.toggle('hidden', areaView);

  // ラベル浮遊（ごく控えめに）
  for (const l of labelSprites) {
    if (l.userData.baseY != null) {
      l.position.y = l.userData.baseY + (prefersReducedMotion ? 0 : Math.sin(motionT * 1.1 + l.userData.phase) * 0.12);
    }
  }

  // プラザ演出
  plazaRing.scale.setScalar(1 + Math.sin(motionT * 1.2) * 0.04);
  plazaRing.material.opacity = 0.5 + Math.sin(motionT * 1.2) * 0.2;
  if (particles && !prefersReducedMotion) {
    const arr = particles.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += dt * 1.2;
      if (arr[i] > 13) arr[i] = 0;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // 経路の矢印を流す（各レッグは自フロアの高さで流れる）
  if (currentRoute) {
    for (const dot of routeDots) {
      const u = (dot.userData.offset + motionT * 0.055) % 1;
      dot.position.copy(dot.userData.curve.getPointAt(u)).setY(dot.userData.baseY + 0.88);
      const pulse = 0.88 + Math.sin(motionT * 4 + dot.userData.offset * 18) * 0.18;
      dot.scale.setScalar(pulse);
    }
    for (const cone of routeArrows) {
      const u = (cone.userData.offset + motionT * 0.06) % 1;
      const p = cone.userData.curve.getPointAt(u);
      const tan = cone.userData.curve.getTangentAt(u);
      cone.position.copy(p).setY(cone.userData.baseY + 0.9);
      cone.lookAt(cone.position.clone().add(tan));
    }
  }

  // アバター（GPSが取れていれば俯瞰中も現在地に追従して動く）
  avatar.userData.ring.rotation.z = t * 1.5;
  if (navMode && routeCurve) {
    updateNav(dt, t);
  } else if (geoState.ok && geoState.world) {
    const gp = geoState.snap ?? geoState.world; // 表示は道の上にスナップ
    const k = Math.min(1, dt * 3);
    avatar.position.x += (gp.x - avatar.position.x) * k;
    avatar.position.z += (gp.z - avatar.position.z) * k;
  }

  // カメラトゥイーン
  if (camTween && !navMode) {
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

let resizeFrame = 0;
function resizeRenderer() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
  const { width, height } = viewportSize();
  if (width === renderWidth && height === renderHeight) return;
  renderWidth = width; renderHeight = height;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobileDevice ? 1.35 : 2));
  renderer.setSize(width, height, false);
  });
}
addEventListener('resize', resizeRenderer, { passive: true });
addEventListener('orientationchange', resizeRenderer, { passive: true });
window.visualViewport?.addEventListener('resize', resizeRenderer, { passive: true });
resizeRenderer();

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  toast('描画を復旧しています…', 1800);
});
canvas.addEventListener('webglcontextrestored', () => {
  resizeRenderer();
  toast('描画を復旧しました');
});

// 起動
animate();

// ------------------------------------------------------------
// 友達と待ち合わせ（位置共有）
//   「位置を送る」→ 現在地入りのリンクを生成してLINE等で共有。
//   受け取った側がリンクを開くと、その場所に友達ピンが立ち経路案内できる。
//   スナップショット共有のためサーバー不要（リンクを渡した相手にしか伝わらない）。
// ------------------------------------------------------------
function shareMyLocation() {
  if (geoState.lat == null) return false;
  const name = $('share-name').value.trim().slice(0, 12);
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('meet', `${geoState.lat.toFixed(6)},${geoState.lng.toFixed(6)}`);
  url.searchParams.set('t', String(Date.now()));
  if (name) url.searchParams.set('n', name);
  const title = `${name || '友達'}の現在地 | BKCキャンパスマップ`;
  const copyLink = () => {
    navigator.clipboard?.writeText(url.toString())
      .then(() => toast('位置リンクをコピーしました。LINEなどで送ってください', 3600))
      .catch(() => toast('このURLを送ってください: ' + url.toString(), 8000));
  };
  // スマホはOSの共有シート（LINE等に直接送れる）、PCはリンクコピー
  if (isMobileDevice && navigator.share) {
    // キャンセル（AbortError）は正常系。それ以外の失敗はコピーにフォールバック
    navigator.share({ title, url: url.toString() }).catch((e) => {
      if (e?.name !== 'AbortError') copyLink();
    });
  } else {
    copyLink();
  }
  return true;
}
// 共有ボタン → 共有方法の選択シート（1回きりのリンク or ライブ共有）
const shareSheet = $('share-sheet');
const shareMethodView = $('share-method-view');
const shareSnapshotView = $('share-snapshot-view');
const shareSendButton = $('share-send');
let shareReturnFocus = null;
let shareRequestId = 0;

function setShareView(view) {
  const snapshot = view === 'snapshot';
  shareMethodView.hidden = snapshot;
  shareSnapshotView.hidden = !snapshot;
  $('share-form-status').textContent = '';
  $('share-form-status').classList.remove('error');
  setTimeout(() => (snapshot ? $('share-name') : $('share-snapshot')).focus(), prefersReducedMotion ? 0 : 70);
}

function openShareSheet() {
  shareReturnFocus = document.activeElement;
  setShareView('methods');
  shareSheet.classList.remove('hidden');
  setTimeout(() => $('share-snapshot').focus(), prefersReducedMotion ? 0 : 80);
}

function closeShareSheet({ restoreFocus = true } = {}) {
  if (shareSheet.classList.contains('hidden')) return;
  shareRequestId++;
  shareSheet.classList.add('hidden');
  if (restoreFocus && shareReturnFocus?.isConnected) shareReturnFocus.focus();
}

$('btn-share').addEventListener('click', openShareSheet);
$('share-close').addEventListener('click', () => closeShareSheet());
$('share-sheet').addEventListener('click', (e) => {
  if (e.target.id === 'share-sheet') closeShareSheet();
});
$('share-snapshot').addEventListener('click', () => setShareView('snapshot'));
$('share-back').addEventListener('click', () => setShareView('methods'));

async function waitForSharePosition(ms = 8000) {
  if (geoState.lat != null) return true;
  startGeolocation({ silentError: true });
  const started = performance.now();
  while (performance.now() - started < ms) {
    if (geoState.lat != null) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

$('share-snapshot-view').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (shareSendButton.disabled) return;
  const label = shareSendButton.querySelector('span');
  const status = $('share-form-status');
  shareSendButton.disabled = true;
  shareSendButton.setAttribute('aria-busy', 'true');
  label.textContent = '現在地を取得中…';
  status.textContent = 'ブラウザの位置情報を許可してください。';
  status.classList.remove('error');

  const requestId = ++shareRequestId;
  const ready = await waitForSharePosition();
  shareSendButton.disabled = false;
  shareSendButton.removeAttribute('aria-busy');
  label.textContent = '現在地リンクを作成';
  if (requestId !== shareRequestId) return;
  if (!ready) {
    status.textContent = '現在地を取得できませんでした。ブラウザ設定で位置情報を許可して、もう一度お試しください。';
    status.classList.add('error');
    return;
  }
  closeShareSheet({ restoreFocus: false });
  shareMyLocation();
});

$('share-live').addEventListener('click', () => {
  closeShareSheet({ restoreFocus: false });
  startLiveShare();
});

addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    if (!shareSheet.classList.contains('hidden')) trapTabKey(shareSheet, event);
    else if (drawer.classList.contains('open')) trapTabKey(drawer, event);
    return;
  }
  if (event.key !== 'Escape') return;
  if (!shareSheet.classList.contains('hidden')) closeShareSheet();
  else if (drawer.classList.contains('open')) closeDrawer();
  else if (!$('shop-card').classList.contains('hidden')) closeCard();
  else if (navMode) exitNav(false);
});

// ライブ共有（Firebase）は使うときだけ動的読み込み。通常利用者のペイロードに影響しない
let liveShareLoading = false; // 連打による多重初期化を防ぐ
async function startLiveShare(code = null) {
  if (liveShareLoading) return;
  liveShareLoading = true;
  try {
    const m = await import('./live.js?v=20260729b');
    await m.initLive({
      scene, geoState, startGeolocation, toast, showRoute, PLACES, nearestNode,
      makeLabelSprite, isMobileDevice, openShareSheet,
    }, code);
  } catch (e) {
    console.warn('live share load failed', e);
    toast('ライブ共有を読み込めませんでした（通信環境をご確認ください）');
  } finally {
    liveShareLoading = false;
  }
}

// 受信側: ?meet=lat,lng を「友達の位置」として登録し、マーカーを立てる
function setupMeetPoint() {
  const q = new URLSearchParams(location.search);
  const meet = q.get('meet');
  if (!meet) return null;
  const [lat, lng] = meet.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const { x, z } = gpsToWorld(lat, lng);
  if (Math.abs(x) > MAP_W / 2 + 20 || Math.abs(z) > MAP_D / 2 + 20) {
    toast('共有された位置はキャンパスの外のようです');
    return null;
  }
  const rawName = (q.get('n') ?? '').trim().slice(0, 12);
  const name = rawName ? `${rawName}の位置` : '共有された位置';
  const pos = new THREE.Vector3(x, 0, z);
  // nearestNode は "campus:U1" 形式のグラフキーを返すため、entry にはノードIDだけを渡す
  const entryKey = nearestNode(pos, 'campus');
  if (!entryKey) return null;
  const place = {
    id: 'meet', floor: 'campus', kind: 'meet', name,
    entry: entryKey.split(':')[1],
    pin: { left: x / MAP_W * 100 + 50, top: z / MAP_D * 100 + 50 },
    _pos: pos,
  };
  PLACES.push(place);

  // 友達ピン（青のビーコン＋名前ラベル）
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 12, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x2f6fb3, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false })
  );
  pillar.position.y = 6;
  pillar.renderOrder = 16;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.8, 0.16, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0x2f6fb3, depthTest: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  ring.renderOrder = 16;
  const label = makeLabelSprite(name, { border: '#2f6fb3', scale: 0.9 });
  label.position.y = 9;
  label.userData = { baseY: 9, phase: 0 };
  labelSprites.push(label);
  g.add(pillar, ring, label);
  g.position.copy(pos);
  scene.add(g);

  const t = Number(q.get('t'));
  const mins = Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
  return { place, mins };
}
const meetPoint = setupMeetPoint();

// ---- 起動: 位置情報が「許可済み」の場合だけ自動で現在地へ移動 ----
//   未選択・拒否状態では起動時に許可を要求しない。現在地・ナビ・共有など、
//   位置情報を必要とする操作を選んだ時点で初めてブラウザへ許可を要求する。
function waitForGpsFix(ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const timer = setInterval(() => {
      if (geoState.ok && geoState.world) { clearInterval(timer); resolve(true); }
      else if (performance.now() - t0 > ms) { clearInterval(timer); resolve(false); }
    }, 250);
  });
}

async function initStartLocation() {
  if (!('geolocation' in navigator) || !navigator.permissions?.query) return false;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state !== 'granted') return false;
  } catch {
    return false;
  }
  startGeolocation({ silentError: true });
  const ok = await waitForGpsFix(9000);
  if (ok) {
    avatar.position.set(geoState.world.x, 0, geoState.world.z);
    frameFromCurrentPosition(1.4); // 現在地が手前に来る構図でキャンパスを望む
    toast('現在地から案内します');
  } else if (geoState.lat != null) {
    toast('キャンパス外のため、出発地点を正門にしています');
  }
  return ok;
}

// ------------------------------------------------------------
// クラウド歩行学習（walk-learn.js）
//   歩けば歩くほど「よく歩かれる道」が学習され、経路探索がそれを優先する。
//   キャンパス内でGPS追従が始まったときだけ本格起動（収集＋最新データ取得）。
//   学習結果のキャッシュがあれば、GPSなしのユーザーにも起動時に適用する。
// ------------------------------------------------------------
const walkLearn = { mod: null, loading: false, started: false };
async function bootWalkLearn(full) {
  if (walkLearn.loading || (full && walkLearn.started)) return;
  walkLearn.loading = true;
  try {
    if (!walkLearn.mod) {
      const m = await import('./walk-learn.js?v=20260730b');
      m.setup({
        THREE, scene, geoState, nodePos, adj, addEdge,
        setEdgeFactor: (a, b, f) => { edgeFactor[wKey(a, b)] = f; },
        makeVec: (x, z) => new THREE.Vector3(x, 0, z),
        addCrowdSpot, toast, startGeolocation,
      });
      walkLearn.mod = m;
    }
    if (full) {
      walkLearn.started = true;
      await walkLearn.mod.start();
    } else {
      await walkLearn.mod.ensureData();
    }
  } catch { /* 学習は任意機能 — 失敗しても本体は略図グラフで動作する */ }
  walkLearn.loading = false;
}
// 起動時に全ユーザーへ学習データを適用（キャッシュ優先・なければ軽量フェッチ）。
// GPSを使わない人にも「みんなの道」「入口補正」「登録スポット」が届く
bootWalkLearn(false);

// 現地測量モード（?survey）— 通常利用者のペイロードに影響しないよう動的読み込み
if (isSurveyMode) {
  import('./survey.js?v=20260814f')
    .then(m => m.initSurvey({ scene, camera, mapControls: controls, geoState, startGeolocation, toast }))
    .catch(() => toast('測量モードを読み込めませんでした'));
}

setTimeout(() => {
  $('loader').classList.add('done');
  // オープニングカメラ演出 → 許可済みの場合のみGPS取得
  camera.position.set(-120, 180, 200);
  flyTo(new THREE.Vector3(0, 96, 108), new THREE.Vector3(0, 0, -4), 2.4);
  initStartLocation().then(() => {
    // 位置共有リンクで開かれた場合は、友達の位置まで自動で経路案内
    if (meetPoint) {
      const ago = meetPoint.mins != null && meetPoint.mins > 0 ? `（${meetPoint.mins}分前に共有）` : '';
      if (showRoute('meet')) toast(`「${meetPoint.place.name}」へ案内します${ago}`, 3800);
    }
    // 招待リンク（?join=CODE）で開かれた場合はライブ共有グループに参加
    const joinCode = new URLSearchParams(location.search).get('join');
    if (joinCode && /^[A-Za-z0-9]{4,8}$/.test(joinCode)) startLiveShare(joinCode.toUpperCase());
  });
}, 600);
