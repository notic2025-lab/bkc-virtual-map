// ============================================================
// GFO 北館1F バーチャル3Dマップ
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import {
  MAP_W, MAP_D, toWorld, CATEGORIES, SHOPS, PLACES, DECOR, FACILITIES,
  NAV_NODES, NAV_EDGES, ENTRY_NODE,
} from './data.js';
import { startAR } from './ar.js';

const METER_PER_UNIT = 1.6; // 1ワールド単位 ≈ 1.6m（実寸感の目安）
const isMobileDevice = matchMedia('(max-width: 640px), (pointer: coarse)').matches;

// ------------------------------------------------------------
// 基本セットアップ
// ------------------------------------------------------------
const canvas = document.getElementById('scene');
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

const DAY = { bg: 0x101b28, fog: 0x172433, hemi: 0.9, sun: 1.6, amb: 0.35 };
const NIGHT = { bg: 0x0a1020, fog: 0x0a1020, hemi: 0.25, sun: 0.25, amb: 0.15 };
let isNight = false;

scene.background = new THREE.Color(DAY.bg);
scene.fog = new THREE.Fog(DAY.fog, 160, 380);

const camera = new THREE.PerspectiveCamera(50, initialViewport.width / initialViewport.height, 0.1, 800);
camera.position.set(0, 85, 78);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2.15;
controls.minPolarAngle = 0.18;
controls.minDistance = 12;
controls.maxDistance = 220;
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
sun.position.set(-60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobileDevice ? 1024 : 2048, isMobileDevice ? 1024 : 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ------------------------------------------------------------
// 空（グラデーションスカイドーム）＋ 環境反射
//   空間の奥行きと没入感（VR感）を出す核。フォグ非適用のShaderMaterialで
//   遠景まで滑らかなグラデーションを描き、その色を反射環境にも使う。
// ------------------------------------------------------------
const SKY = {
  day:   { top: 0x08111c, bottom: 0x172433 },
  night: { top: 0x02050a, bottom: 0x0b1320 },
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
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
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
// 地面（公式フロアマップをそのまま基準図として使用）
// ------------------------------------------------------------
function makeGroundTexture() {
  // CanvasTextureは一部のスマホGPUで更新時に黒い帯が出るため、
  // power-of-two化したJPEGをGPUへ一度だけ直接転送する。
  const tex = new THREE.TextureLoader().load(
    'assets/north1f-floor-1024.jpg',
    undefined,
    undefined,
    () => toast('公式フロアマップ画像を読み込めませんでした'),
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  // ミップマップ＋異方性フィルタで、地図を斜めに傾けても細部が破綻せず滑らかに描画する。
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), isMobileDevice ? 4 : 8);
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_W, MAP_D),
  new THREE.MeshBasicMaterial({
    map: makeGroundTexture(),
    // 台座など下層メッシュとのZ-fighting（回転時に黒くチラつく現象）を防ぐため、
    // フロアマップは常に手前へ描画されるよう深度バイアスを掛ける。
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.02; // 下層メッシュより確実に上へ
ground.receiveShadow = true;
ground.renderOrder = 1;
scene.add(ground);

// フロア全体を浮遊するデジタルツインのように見せる発光フレーム
const framePoints = [
  new THREE.Vector3(-MAP_W / 2, 0.22, -MAP_D / 2),
  new THREE.Vector3(MAP_W / 2, 0.22, -MAP_D / 2),
  new THREE.Vector3(MAP_W / 2, 0.22, MAP_D / 2),
  new THREE.Vector3(-MAP_W / 2, 0.22, MAP_D / 2),
];
const mapFrame = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(framePoints),
  new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.72 })
);
mapFrame.renderOrder = 4;
scene.add(mapFrame);

// 外周ベース（台座）: 上面をフロアマップ(y=0)より十分下げ、同一平面のZ-fightingを排除
const base = new THREE.Mesh(
  new THREE.BoxGeometry(MAP_W + 6, 3, MAP_D + 6),
  new THREE.MeshStandardMaterial({
    color: 0x101d2d, emissive: 0x08273a, emissiveIntensity: 0.55,
    roughness: 0.62, metalness: 0.28,
  })
);
base.position.y = -2.4; // 上面 = -0.9（地面より0.9下）
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

const GLASS_OPACITY = 0.32;

for (const shop of SHOPS) {
  const { x, z } = toWorld(shop.pin.left, shop.pin.top);
  const col = CATEGORIES[shop.cat].color;
  // 区画（w×d）と位置は公式座標。半透明ガラスとして立体化し、公式平面図が
  // 透けて見えるようにすることで没入感と情報の正確さを両立する。
  const h = shop.size.h ?? 4;
  const geo = roundedBoxGeo(shop.size.w, shop.size.d, h);
  const mat = new THREE.MeshStandardMaterial({
    color: col, roughness: 0.12, metalness: 0.0,
    transparent: true, opacity: GLASS_OPACITY,
    emissive: col, emissiveIntensity: 0.0,
    envMapIntensity: 1.1, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'shop', shop };
  shopGroup.add(mesh);
  shopMeshes.push(mesh);

  // 発光する輪郭フレーム（区画の外形＝ホログラム境界）
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(shop.size.w, h, shop.size.d)),
    new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 })
  );
  edges.position.set(x, h / 2, z);
  edges.renderOrder = 5;
  shopGroup.add(edges);

  // 屋上のカテゴリー色クラウン（発光アクセント）
  const crown = new THREE.Mesh(
    roundedBoxGeo(shop.size.w * 0.9, shop.size.d * 0.9, 0.35),
    new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.45,
      roughness: 0.3, metalness: 0.25, envMapIntensity: 1.1,
    })
  );
  crown.position.set(x, h, z);
  crown.castShadow = true;
  shopGroup.add(crown);

  // ラベル
  const labelY = h + 3.0;
  const label = makeLabelSprite(shop.name.length > 14 ? shop.en : shop.name, { border: CATEGORIES[shop.cat].css });
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
  shop._pos = new THREE.Vector3(x, 0, z);
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
treeGroup.visible = false; // 公式図にも植栽表現があるため、推定3D装飾は重ねない
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
plazaRing.visible = false;

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
  particles.visible = false;
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

// 経路探索に使う各PLACEのワールド座標を確定
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
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 10, 40), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
  const hereLabel = makeLabelSprite('現在地', { bg: '#063f36', fg: '#ffffff', border: '#10b981', scale: 0.72 });
  hereLabel.position.y = 4.2;
  avatar.add(body, head, ring, hereLabel);
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
let routeDots = [];
let currentRoute = null; // { fromId, toId, points, lengthM }

function clearRoute() {
  for (const o of routeObjects) { scene.remove(o); o.geometry?.dispose(); o.material?.dispose(); }
  routeObjects = []; routeArrows = []; routeDots = []; routeCurve = null; currentRoute = null;
  document.getElementById('route-info').classList.add('hidden');
  document.getElementById('btn-ar').disabled = true;
  document.getElementById('route-panel-title').textContent = '経路を検索';
}

function showRoute(fromId, toId) {
  clearRoute();
  const points = buildRoutePoints(fromId, toId);
  if (!points || points.length < 2) { toast('経路が見つかりませんでした'); return false; }

  const lifted = points.map(p => p.clone().setY(0.62));
  routeCurve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal', 0.15);
  const len = routeCurve.getLength();

  // 点線の土台。公式図を隠さない細いガイドだけ残す。
  const routeOutline = new THREE.Mesh(
    new THREE.TubeGeometry(routeCurve, Math.max(40, points.length * 12), 0.34, 8, false),
    new THREE.MeshBasicMaterial({ color: 0x07506c, transparent: true, opacity: 0.38, depthTest: false })
  );
  routeOutline.renderOrder = 18;
  scene.add(routeOutline); routeObjects.push(routeOutline);

  // 発光する点を流し、経路と進行方向を同時に伝える
  const dotCount = Math.max(10, Math.floor(len / 2.6));
  for (let i = 0; i < dotCount; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(i % 4 === 0 ? 0.46 : 0.32, 10, 8),
      new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0xffffff : 0x22d3ee, depthTest: false })
    );
    dot.userData.offset = i / dotCount;
    dot.renderOrder = 19;
    scene.add(dot); routeObjects.push(dot); routeDots.push(dot);
  }

  // 進行方向シェブロン（動く矢印）
  const coneGeo = new THREE.ConeGeometry(0.7, 1.65, 8);
  coneGeo.rotateX(Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const n = Math.max(4, Math.floor(len / 12));
  for (let i = 0; i < n; i++) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.userData.offset = i / n;
    cone.renderOrder = 20;
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
  document.getElementById('route-panel-title').textContent = `${to.name} への経路`;

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
  setRoutePanelCollapsed(true); // パネルを畳んでマップ全体を見せる
  toast('お散歩モード：経路を歩いています… 🚶');
}
function stopWalk() {
  if (!walking) return;
  walking = null;
  controls.enabled = true;
  setRoutePanelCollapsed(false); // 到着したらパネルを再表示
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

function updateRouteFromSelections() {
  const from = resolveFrom($('route-from').value);
  const to = $('route-to').value;
  if (from === to) { toast('出発地と目的地が同じです'); return; }
  if (showRoute(from, to)) {
    setRoutePanelCollapsed(false);
  }
}
$('route-from').addEventListener('change', updateRouteFromSelections);
$('route-to').addEventListener('change', updateRouteFromSelections);
$('btn-clear').addEventListener('click', () => { clearRoute(); stopWalk(); setRoutePanelCollapsed(false); });
$('btn-walk').addEventListener('click', () => walking ? stopWalk() : startWalk());
$('btn-ar').addEventListener('click', () => {
  if (!currentRoute) return;
  startAR(currentRoute, getPoi, METER_PER_UNIT);
});

// ドロワー
$('btn-list').addEventListener('click', () => $('drawer').classList.toggle('open'));
$('drawer-close').addEventListener('click', () => $('drawer').classList.remove('open'));

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

const SEARCH_ALIASES = {
  noom: 'ヌーム イタリアン', 'pelle-morbida': 'ペッレモルビダ バッグ',
  starbucks: 'スターバックス スタバ コーヒー', 'global-style': 'グローバルスタイル スーツ',
  'the-lab': 'ザラボ ラボ カフェラボ', 'ring-jacket': 'リングジャケット',
  'g-shock': 'ジーショック 時計', 'tsuchiya-kaban': '土屋鞄 つちやかばん',
  yondoshi: 'ヨンドシー 4度 ジュエリー', 'zara-home': 'ザラホーム 雑貨',
  'il-ghiottone': 'イルギオットーネ イタリアン', tullys: 'タリーズ コーヒー カフェ',
  soholm: 'スーホルム カフェ', actus: 'アクタス 家具 インテリア',
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

function renderShopList(filter = '', cat = 'all') {
  const list = $('shop-list');
  list.innerHTML = '';
  const results = SHOPS
    .filter(s => cat === 'all' || s.cat === cat)
    .map(s => ({ shop: s, score: searchScore(s, filter) }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.shop.name.localeCompare(b.shop.name, 'ja'));
  if (!results.length) {
    list.innerHTML = '<div class="search-empty">近い店舗が見つかりませんでした<br><small>店舗名・カテゴリ・「カフェ」などで検索できます</small></div>';
    return;
  }
  for (const { shop: s } of results) {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `
      <img class="thumb" src="${s.logo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="meta"><b>${esc(s.name)}</b><span>${esc(s.tag)}</span></div>
      <button class="shop-route-btn" type="button">経路案内</button>`;
    div.addEventListener('click', (event) => {
      if (event.target.closest('.shop-route-btn')) return;
      openCard(s); focusShop(s); $('drawer').classList.remove('open');
    });
    div.querySelector('.shop-route-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      startGuidanceTo(s);
    });
    list.appendChild(div);
  }
}
renderShopList();
$('search').addEventListener('input', (e) => renderShopList(e.target.value, activeCat));

$('quick-destination').addEventListener('click', () => {
  $('drawer').classList.add('open');
  $('search').value = '';
  activeCat = 'all';
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  SHOPS.forEach(s => { s._categoryVisible = true; });
  renderShopList('', 'all');
  setTimeout(() => $('search').focus(), 280);
});

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
      s._categoryVisible = on;
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
  routePanel.classList.add('card-covered');
  $('map-controls').classList.add('hidden');
}
function closeCard() {
  $('shop-card').classList.add('hidden');
  routePanel.classList.remove('card-covered');
  $('map-controls').classList.remove('hidden');
}
$('card-close').addEventListener('click', (event) => {
  event.stopPropagation();
  closeCard();
});
addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });

function startGuidanceTo(shop) {
  const from = resolveFrom($('route-from').value);
  if (from === shop.id) { toast('すでに目的地にいます'); return; }
  $('route-to').value = shop.id;
  if (!showRoute(from, shop.id)) return;
  closeCard();
  $('drawer').classList.remove('open');
  setRoutePanelCollapsed(false);
  toast(`${shop.name} への経路を表示しました。ARナビも利用できます`);
}

$('card-goto').addEventListener('click', () => {
  if (!cardShop) return;
  startGuidanceTo(cardShop);
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
canvas.addEventListener('pointercancel', () => { downAt = null; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
  downAt = null;
  if (dx * dx + dy * dy > 36) return; // ドラッグは無視
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...shopMeshes, ...labelSprites.filter(l => l.userData.shop)], false);
  const hit = hits.find(h => h.object.userData?.shop || h.object.userData?.type === 'shop');
  if (hit) {
    const shop = hit.object.userData.shop;
    openCard(shop);
    focusShop(shop);
  } else if (!$('shop-card').classList.contains('hidden')) {
    // 店情報カードを開いている状態で地図の何もない場所をタップ → 地図に戻る
    closeCard();
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
  const hits = raycaster.intersectObjects(shopMeshes, false);
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

  // 視点に応じた情報量の最適化（Overview / Area / Detail）
  const viewDistance = camera.position.distanceTo(controls.target);
  const viewAngle = controls.getPolarAngle();
  const detailView = viewDistance < 48 && viewAngle < 1.12;
  const areaView = viewDistance < 74;
  for (const s of SHOPS) {
    const on = s._categoryVisible;
    const selected = cardShop === s || hovered === s._mesh;
    s._label.visible = on;
    const labelScale = selected ? 1.1 : detailView ? 1 : areaView ? 0.72 : 0.5;
    s._label.scale.copy(s._label.userData.detailScale).multiplyScalar(labelScale);
    s._label.material.opacity = selected ? 1 : detailView ? 1 : areaView ? 0.92 : 0.78;
    s._edges.visible = on;
    s._edges.material.opacity = selected ? 1 : detailView ? 0.8 : areaView ? 0.48 : 0.24;
    s._crown.visible = on && (selected || detailView || areaView);
    s._crown.material.transparent = true;
    s._crown.material.opacity = selected ? 1 : detailView ? 0.82 : 0.46;
    s._mesh.material.opacity = on
      ? (selected ? 0.56 : detailView ? 0.38 : areaView ? 0.24 : 0.1)
      : 0.015;
  }
  $('zoom-hint').classList.toggle('hidden', areaView);

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
    for (const dot of routeDots) {
      const u = (dot.userData.offset + t * 0.055) % 1;
      dot.position.copy(routeCurve.getPointAt(u)).setY(0.88);
      const pulse = 0.88 + Math.sin(t * 4 + dot.userData.offset * 18) * 0.18;
      dot.scale.setScalar(pulse);
    }
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
setTimeout(() => {
  $('loader').classList.add('done');
  toast('ようこそ！グランフロント大阪 北館1F バーチャルマップへ 🏙️ お店をタップしてみてください');
  // オープニングカメラ演出
  camera.position.set(-70, 120, 130);
  flyTo(new THREE.Vector3(0, 54, 64), new THREE.Vector3(0, 0, -2), 2.4);
}, 600);
