// ============================================================
// ライブ位置共有 — 友達グループでお互いの現在地をリアルタイム表示
//   - 6文字のグループコードを知っている人同士だけが互いに見える
//   - 「共有中」の間だけ数秒ごとに位置を送信。停止・離脱・切断で自動削除
//   - Firebase Realtime Database（この機能を使うときだけ接続する）
//   - 友達ピンをタップ相当（リストの「案内」）で経路案内。相手が動けば自動で引き直し
// ============================================================
import * as THREE from 'three';
import { MAP_W, MAP_D, gpsToWorld } from './data.js';
import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい文字（I/L/O/0/1）を除外
const STALE_MS = 90_000;   // これより古い位置は「オフライン」として非表示
const PING_MS = 4_000;     // 位置送信間隔
const REROUTE_UNITS = 4;   // 案内中の友達がこれ以上動いたら経路を引き直す（≈16m）

const PIN_COLORS = [0x2f6fb3, 0x8a5aa0, 0x2f8a6b, 0xb3762f, 0x5a7d9e, 0xa04f6b];

let ctx = null;       // app.js から渡される依存
let fb = null;        // Firebase SDK ハンドル
let session = null;   // { code, uid, name, unsub, pingTimer, friends: Map<uid, friend> }
let followUid = null; // 経路案内の対象
let lastRoutedPos = null;
let group = null;     // 友達ピンの3Dグループ
let panel = null;

// ------------------------------------------------------------
// Firebase 読み込み（必要になった時だけ・失敗しても本体は動く）
// ------------------------------------------------------------
async function loadFirebase() {
  if (fb) return fb;
  const appMod = await import(`${SDK}firebase-app.js`);
  const dbMod = await import(`${SDK}firebase-database.js`);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const db = dbMod.getDatabase(app, FIREBASE_CONFIG.databaseURL);
  fb = { db, ...dbMod };
  return fb;
}

const genCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

const myName = () => {
  let n = localStorage.getItem('bkc-live-name') || '';
  if (!n) {
    n = (prompt('友達に表示する名前') ?? '').trim().slice(0, 12);
    if (!n) n = '名無し';
    localStorage.setItem('bkc-live-name', n);
  }
  return n;
};

// ------------------------------------------------------------
// 開始 / 停止
// ------------------------------------------------------------
export async function initLive(deps, joinCode = null) {
  ctx = deps;
  if (!group) {
    group = new THREE.Group();
    ctx.scene.add(group);
  }
  buildPanel();

  if (session) { // すでに共有中 → コードを見せるだけ
    updatePanel();
    ctx.toast(`ライブ共有中です（コード: ${session.code}）`);
    return;
  }

  let code = joinCode;
  if (!code) {
    const input = prompt('参加するグループコード（新しくグループを作る場合は空欄のままOK）') ?? '';
    code = input.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{4,8}$/.test(code)) {
      ctx.toast('コードは英数字4〜8文字です');
      return;
    }
    if (!code) code = genCode();
  }

  ctx.startGeolocation();
  ctx.toast('ライブ共有に接続しています…');
  try {
    await startSession(code);
  } catch (e) {
    console.warn('live share failed', e);
    ctx.toast('ライブ共有に接続できませんでした（Realtime Databaseの設定を確認してください）', 5000);
  }
}

async function startSession(code) {
  const { db, ref, onValue, onDisconnect, remove } = await loadFirebase();
  const uid = crypto.randomUUID().slice(0, 8);
  const name = myName();
  const roomRef = ref(db, `rooms/${code}`);
  const myRef = ref(db, `rooms/${code}/${uid}`);

  // 切断（アプリ終了・圏外）時はサーバー側で自分の位置を自動削除
  onDisconnect(myRef).remove();

  session = { code, uid, name, roomRef, myRef, friends: new Map(), unsub: null, pingTimer: null };

  // 初回送信で接続を検証する（DB未作成・ルール拒否・オフラインならここで失敗し、
  // 「開始しました」と偽って表示しない）
  const g = ctx.geoState;
  const first = {
    name,
    t: Date.now(),
    ...(g.lat != null ? { lat: Number(g.lat.toFixed(6)), lng: Number(g.lng.toFixed(6)), acc: Math.round(g.accuracy ?? 0) } : {}),
  };
  try {
    await Promise.race([
      fb.set(myRef, first),
      new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout')), 8000)),
    ]);
  } catch (e) {
    session = null;
    throw e;
  }

  session.unsub = onValue(roomRef, (snap) => updateFriends(snap.val() ?? {}), (err) => {
    console.warn('live share read error', err);
    ctx.toast('ライブ共有の受信に失敗しました（データベースのルールを確認）', 5000);
    stopLive(false);
  });
  session.pingTimer = setInterval(sendPing, PING_MS);
  updatePanel();
  ctx.toast(`ライブ共有を開始しました（コード: ${code}）。招待リンクを友達に送りましょう`, 4200);
}

function sendPing() {
  if (!session || !fb) return;
  if (document.visibilityState !== 'visible') return;    // 画面を閉じている間は送らない
  const g = ctx.geoState;
  if (g.lat == null) return;
  fb.set(session.myRef, {
    name: session.name,
    lat: Number(g.lat.toFixed(6)),
    lng: Number(g.lng.toFixed(6)),
    acc: Math.round(g.accuracy ?? 0),
    t: Date.now(),
  }).catch(() => { /* 一時的な送信失敗は次のpingで回復 */ });
}

export function stopLive(clearRemote = true) {
  if (!session) return;
  clearInterval(session.pingTimer);
  session.unsub?.();
  if (clearRemote && fb) fb.remove(session.myRef).catch(() => {});
  for (const f of session.friends.values()) removePin(f);
  session = null;
  followUid = null;
  lastRoutedPos = null;
  updatePanel();
  ctx.toast('ライブ共有を停止しました');
}

// ------------------------------------------------------------
// 友達の位置の反映
// ------------------------------------------------------------
const MAX_MEMBERS = 40; // 1グループの表示上限（異常データによる描画DoSを防ぐ）

function updateFriends(data) {
  if (!session) return;
  const now = Date.now();
  const seen = new Set();

  // DBの内容は「信頼できない入力」として扱う:
  //   キー形式・値の型・鮮度・キャンパス範囲・件数をすべて検証してから使う
  for (const [uid, v] of Object.entries(data).slice(0, MAX_MEMBERS)) {
    if (uid === session.uid) continue;
    if (!/^[a-f0-9-]{4,40}$/i.test(uid)) continue;  // 想定外のキーは無視（属性注入の一次防御）
    if (!v || typeof v !== 'object') continue;
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue;
    if (!Number.isFinite(v.t) || now - v.t > STALE_MS) continue;
    const { x, z } = gpsToWorld(v.lat, v.lng);
    if (Math.abs(x) > MAP_W / 2 + 30 || Math.abs(z) > MAP_D / 2 + 30) continue; // キャンパス外は表示しない
    seen.add(uid);

    let f = session.friends.get(uid);
    if (!f) {
      const rawName = typeof v.name === 'string' ? v.name : '';
      f = { uid, name: (rawName.trim() || '友達').slice(0, 12), target: new THREE.Vector3(x, 0, z) };
      makePin(f);
      session.friends.set(uid, f);
      ctx.toast(`${f.name} がグループに参加しました`);
    }
    f.target.set(x, 0, z);
    f.t = v.t;
  }

  // いなくなった友達を削除
  for (const [uid, f] of [...session.friends]) {
    if (!seen.has(uid)) {
      removePin(f);
      session.friends.delete(uid);
      if (followUid === uid) { followUid = null; lastRoutedPos = null; }
    }
  }

  // 案内中の友達が動いたら経路を引き直す
  if (followUid) {
    const f = session.friends.get(followUid);
    if (f && lastRoutedPos && f.target.distanceTo(lastRoutedPos) > REROUTE_UNITS) {
      routeToFriend(followUid, { silent: true });
    }
  }
  updatePanel();
}

// ------------------------------------------------------------
// 3Dピン
// ------------------------------------------------------------
function makePin(f) {
  const color = PIN_COLORS[[...f.uid].reduce((a, c) => a + c.charCodeAt(0), 0) % PIN_COLORS.length];
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 4.4, 10),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  pole.position.y = 2.2;
  pole.renderOrder = 15;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 16, 12),
    new THREE.MeshBasicMaterial({ color, depthTest: false })
  );
  head.position.y = 5.0;
  head.renderOrder = 15;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.14, 10, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  ring.renderOrder = 15;
  const label = ctx.makeLabelSprite(f.name, { border: '#' + color.toString(16).padStart(6, '0'), scale: 0.85 });
  label.position.y = 7.4;
  g.add(pole, head, ring, label);
  g.position.copy(f.target);
  group.add(g);
  f._pin = g;
  f._ring = ring;
}

function removePin(f) {
  if (f._pin) group.remove(f._pin);
  f._pin = null;
}

// なめらかに追従（friend pinのアニメーション）
(function animatePins() {
  requestAnimationFrame(animatePins);
  if (!session) return;
  const t = performance.now() / 1000;
  for (const f of session.friends.values()) {
    if (!f._pin) continue;
    f._pin.position.lerp(f.target, 0.08);
    f._ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12);
  }
})();

// ------------------------------------------------------------
// 友達への経路案内（動く目的地）
// ------------------------------------------------------------
function routeToFriend(uid, { silent = false } = {}) {
  const f = session?.friends.get(uid);
  if (!f) return;
  const id = 'friend-' + uid;
  let pl = ctx.PLACES.find(p => p.id === id);
  if (!pl) {
    pl = { id, floor: 'campus', kind: 'friend' };
    ctx.PLACES.push(pl);
  }
  pl.name = `${f.name}（移動中）`;
  pl._pos = f.target.clone().setY(0);
  pl.pin = { left: f.target.x / MAP_W * 100 + 50, top: f.target.z / MAP_D * 100 + 50 };
  pl.entry = (ctx.nearestNode(f.target, 'campus') ?? 'campus:CS').split(':')[1];
  followUid = uid;
  lastRoutedPos = f.target.clone();
  if (ctx.showRoute(id, { fly: !silent }) && !silent) {
    ctx.toast(`${f.name} まで案内します（相手が動くと自動で引き直します）`, 3600);
  }
}

// ------------------------------------------------------------
// パネルUI
// ------------------------------------------------------------
function buildPanel() {
  if (panel) return;
  const style = document.createElement('style');
  style.textContent = `
    #live-panel {
      position: fixed; z-index: 60; left: 10px; top: calc(max(14px, env(safe-area-inset-top)) + 118px);
      width: min(250px, calc(100vw - 90px));
      background: var(--surface-solid, #fff); border: 1px solid var(--line, #ddd);
      border-radius: 14px; padding: 10px 12px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
      font-size: 12.5px; color: var(--txt, #222);
    }
    #live-panel.hidden { display: none; }
    #live-panel .lp-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 6px; }
    #live-panel .lp-code { font-family: ui-monospace, monospace; letter-spacing: .12em; background: rgba(157,21,53,.08); color: #9d1535; border-radius: 6px; padding: 2px 7px; }
    #live-panel .lp-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 0; border-top: 1px solid var(--line, #eee); }
    #live-panel .lp-row b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #live-panel .lp-go {
      flex-shrink: 0; border: 1px solid var(--line, #ccc); background: transparent; cursor: pointer;
      border-radius: 8px; padding: 5px 10px; font: 700 11.5px/1 inherit; color: inherit;
    }
    #live-panel .lp-actions { display: flex; gap: 6px; margin-top: 8px; }
    #live-panel .lp-actions button {
      flex: 1; min-height: 38px; border-radius: 9px; cursor: pointer; font: 700 12px/1 inherit;
      border: 1px solid var(--line, #ccc); background: transparent; color: inherit;
    }
    #live-panel .lp-actions .lp-invite { background: #9d1535; border-color: #9d1535; color: #fff; }
    #live-panel .lp-empty { color: var(--txt-dim, #888); padding: 6px 0; border-top: 1px solid var(--line, #eee); }
    body.nav-active #live-panel { display: none; }
  `;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'live-panel';
  panel.className = 'hidden';
  (document.getElementById('app') ?? document.body).appendChild(panel);
}

function inviteLink() {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('join', session.code);
  return url.toString();
}

function shareInvite() {
  const url = inviteLink();
  const title = `ライブ位置共有に参加（コード: ${session.code}）| BKCキャンパスマップ`;
  if (ctx.isMobileDevice && navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(url)
      .then(() => ctx.toast('招待リンクをコピーしました'))
      .catch(() => ctx.toast(url, 8000));
  }
}

function updatePanel() {
  if (!panel) return;
  if (!session) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const friends = [...session.friends.values()];
  const my = ctx.geoState;
  const rows = friends.map(f => {
    let dist = '';
    if (my.lat != null) {
      const me = gpsToWorld(my.lat, my.lng);
      dist = `${Math.round(Math.hypot(f.target.x - me.x, f.target.z - me.z) * 4)}m`;
    }
    return `<div class="lp-row"><b>${escHtml(f.name)}</b><span>${dist}</span><button class="lp-go" data-uid="${escHtml(f.uid)}">案内</button></div>`;
  }).join('');
  panel.innerHTML = `
    <div class="lp-head"><span>ライブ共有</span><span class="lp-code">${session.code}</span></div>
    ${rows || '<div class="lp-empty">友達の参加を待っています…<br>招待リンクを送ってください</div>'}
    <div class="lp-actions">
      <button class="lp-invite" type="button">招待リンク</button>
      <button class="lp-stop" type="button">停止</button>
    </div>`;
  panel.querySelector('.lp-invite').addEventListener('click', shareInvite);
  panel.querySelector('.lp-stop').addEventListener('click', () => stopLive(true));
  panel.querySelectorAll('.lp-go').forEach(b =>
    b.addEventListener('click', () => routeToFriend(b.dataset.uid)));
}

const escHtml = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ページを離れるときに自分の位置を確実に消す
addEventListener('pagehide', () => { if (session && fb) fb.remove(session.myRef).catch(() => {}); });
