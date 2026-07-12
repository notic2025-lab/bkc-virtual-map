// ============================================================
// ARナビゲーションモード
//  - カメラ映像の上に Three.js で経路矢印をオーバーレイ
//  - デバイスの向き(コンパス)に追従して矢印が実際の進行方向を指す
//  - カメラ非対応環境では背景をシミュレーション表示にフォールバック
// ============================================================
import * as THREE from 'three';

let arActive = false;
let renderer, scene, camera, arrowGroup, video, stream;
let heading = 0;            // デバイスの方位角 (rad)
let hasOrientation = false;
let legIndex = 0;
let route = null;
let getPoiFn = null;
let meterPerUnit = 1.6;
let rafId = null;

const $ = (id) => document.getElementById(id);

// 経路点列 → レッグ（区間）配列
function buildLegs(points) {
  const legs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const v = new THREE.Vector3().subVectors(b, a);
    const dist = v.length();
    if (dist < 2 && i > 0 && legs.length) { // 短い区間は前とまとめる
      const prev = legs[legs.length - 1];
      prev.to = b; prev.dist += dist;
      continue;
    }
    // マップは上が北: -z が北, +x が東 → 方位角 = atan2(east, north)
    const bearing = Math.atan2(v.x, -v.z);
    legs.push({ from: a, to: b, dist, bearing });
  }
  return legs;
}

function turnLabel(prev, cur) {
  if (!prev) return 'まっすぐ進みます';
  let d = cur.bearing - prev.bearing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const deg = THREE.MathUtils.radToDeg(d);
  if (Math.abs(deg) < 25) return 'そのまま直進';
  if (deg >= 25 && deg < 120) return '右方向へ ↱';
  if (deg <= -25 && deg > -120) return '左方向へ ↰';
  return '後ろへ折り返し ↶';
}

export async function startAR(currentRoute, getPoi, mpu) {
  if (arActive) return;
  arActive = true;
  route = currentRoute;
  getPoiFn = getPoi;
  meterPerUnit = mpu;
  legIndex = 0;

  const view = $('ar-view');
  view.classList.remove('hidden');
  video = $('ar-video');

  // --- デバイス方位（iOSはユーザー操作直後の許可要求が必要）---
  // カメラのawaitより先に呼び、ボタンタップのユーザー操作コンテキストを維持する。
  hasOrientation = false;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p === 'granted') listenOrientation();
    } else if ('ondeviceorientationabsolute' in window || 'ondeviceorientation' in window) {
      listenOrientation();
    }
  } catch (e) { /* 方位なしでも動作 */ }

  // --- カメラ起動（失敗時はシミュレーション背景）---
  let simulated = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }, audio: false,
    });
    video.srcObject = stream;
    video.style.display = '';
  } catch (e) {
    simulated = true;
    video.style.display = 'none';
    view.style.background = 'linear-gradient(to bottom, #26374f 0%, #3d5470 55%, #55606e 55%, #3a4250 100%)';
  }

  // --- オーバーレイ用 Three.js ---
  const arCanvas = $('ar-canvas');
  renderer = new THREE.WebGLRenderer({ canvas: arCanvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.5, 0); // 目線の高さ
  camera.rotation.x = -0.22;      // 少し下向き（床の矢印が見えるように）

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));

  // 地面に並ぶ矢印の帯
  arrowGroup = new THREE.Group();
  const arrowGeo = makeArrowGeo();
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({
      color: 0x38f0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(1.15);
    m.position.set(0, -1.15, -(3.5 + i * 2.0)); // 足元から前方へ
    m.userData.base = m.position.z;
    arrowGroup.add(m);
  }
  // ゴールピン（最終レッグで表示）
  const pin = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
  ball.position.y = 1.2;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xf472b6 }));
  stick.position.y = 0.6;
  pin.add(ball, stick);
  pin.visible = false;
  pin.name = 'goalpin';
  arrowGroup.add(pin);
  scene.add(arrowGroup);

  if (simulated) {
    showToastInAR('カメラが使えないため シミュレーションAR を表示中');
  }

  updateLegUI();
  loop();

  addEventListener('resize', onResize);
}

function makeArrowGeo() {
  const s = new THREE.Shape();
  // シェブロン形 (⌃)
  s.moveTo(-0.55, -0.35); s.lineTo(0, 0.35); s.lineTo(0.55, -0.35);
  s.lineTo(0.55, -0.75); s.lineTo(0, -0.05); s.lineTo(-0.55, -0.75);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function listenOrientation() {
  const handler = (e) => {
    let deg = null;
    if (typeof e.webkitCompassHeading === 'number') deg = e.webkitCompassHeading;       // iOS: 北=0 時計回り
    else if (e.absolute && typeof e.alpha === 'number') deg = 360 - e.alpha;            // Android absolute
    else if (typeof e.alpha === 'number') deg = 360 - e.alpha;
    if (deg != null) { heading = THREE.MathUtils.degToRad(deg); hasOrientation = true; }
  };
  addEventListener('deviceorientationabsolute', handler, true);
  addEventListener('deviceorientation', handler, true);
}

let legs = [];
function updateLegUI() {
  legs = buildLegs(route.points);
  legIndex = Math.max(0, Math.min(legIndex, legs.length - 1));
  const leg = legs[legIndex];
  const prev = legs[legIndex - 1];
  const goal = getPoiFn(route.toId);
  const distM = Math.round(leg.dist * meterPerUnit);
  const isLast = legIndex === legs.length - 1;

  $('ar-instruction').textContent = isLast
    ? `🏁 まもなく「${goal.name}」に到着（約${distM}m）`
    : `${turnLabel(prev, leg)} — 約${distM}m進む`;
  $('ar-distance').textContent =
    `区間 ${legIndex + 1} / ${legs.length}　目的地: ${goal.name}`;

  const pin = arrowGroup.getObjectByName('goalpin');
  if (pin) { pin.visible = isLast; pin.position.set(0, -1.15, -Math.min(12, 3 + leg.dist)); }
}

let tPrev = 0;
function loop(ts = 0) {
  if (!arActive) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - tPrev) / 1000); tPrev = ts;
  const t = ts / 1000;

  const leg = legs[legIndex];
  if (leg) {
    // 矢印帯の向き = 経路方位 - デバイス方位（方位が取れない場合は正面固定）
    const target = hasOrientation ? (leg.bearing - heading) : 0;
    // なめらかに回頭
    let d = target - arrowGroup.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    arrowGroup.rotation.y += d * Math.min(1, dt * 6);

    // 矢印を前方へ流す
    for (const m of arrowGroup.children) {
      if (m.name === 'goalpin') continue;
      let z = m.userData.base - ((t * 1.6) % 2.0);
      m.position.z = z;
      m.material.opacity = 0.2 + 0.7 * Math.min(1, Math.max(0, (-z - 2.5) / 3));
    }
  }
  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function showToastInAR(msg) {
  const el = $('ar-distance');
  const orig = el.textContent;
  el.textContent = msg;
  setTimeout(() => { if (arActive) updateLegUI(); }, 3200);
}

export function stopAR() {
  arActive = false;
  cancelAnimationFrame(rafId);
  if (stream) { stream.getTracks().forEach(tr => tr.stop()); stream = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  $('ar-view').classList.add('hidden');
  removeEventListener('resize', onResize);
}

// HUDボタン
document.getElementById('ar-next').addEventListener('click', () => {
  if (legIndex < legs.length - 1) { legIndex++; updateLegUI(); }
  else { stopAR(); }
});
document.getElementById('ar-prev').addEventListener('click', () => {
  if (legIndex > 0) { legIndex--; updateLegUI(); }
});
document.getElementById('ar-exit').addEventListener('click', stopAR);
