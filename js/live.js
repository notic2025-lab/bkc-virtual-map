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
  // 歩行学習（walk-learn.js）が先に初期化している場合があるため二重初期化を防ぐ
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
  const db = dbMod.getDatabase(app, FIREBASE_CONFIG.databaseURL);
  fb = { db, ...dbMod };
  return fb;
}

const genCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

function savedName() {
  try { return localStorage.getItem('bkc-live-name') || ''; }
  catch { return ''; }
}

function requestLiveSetup(joinCode = '') {
  return new Promise((resolve) => {
    document.getElementById('live-setup')?.remove();
    let mode = joinCode ? 'join' : 'create';
    const modal = document.createElement('div');
    modal.id = 'live-setup';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'live-setup-title');
    modal.innerHTML = `
      <form class="ls-card">
        <div class="ls-head">
          <div><p class="ls-eyebrow">リアルタイム</p><h2 id="live-setup-title">ライブ位置共有</h2></div>
          <button class="ls-close" type="button" aria-label="ライブ共有を閉じる"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
        </div>
        <p class="ls-lead">一緒に移動する友達と、現在地をリアルタイムで確認できます。</p>
        <div class="ls-tabs" role="tablist" aria-label="ライブ共有の参加方法">
          <button type="button" role="tab" data-mode="create" aria-controls="ls-fields">グループを作る</button>
          <button type="button" role="tab" data-mode="join" aria-controls="ls-fields">コードで参加</button>
        </div>
        <div id="ls-fields" class="ls-fields" role="tabpanel">
          <div class="ls-field">
            <label for="live-name">地図に表示する名前 <span>12文字まで</span></label>
            <input id="live-name" name="name" type="text" maxlength="12" autocomplete="nickname"
              value="${escHtml(savedName())}" placeholder="例：田中">
            <small>未入力の場合は「名無し」と表示されます。</small>
          </div>
          <div class="ls-field ls-code-field">
            <label for="live-code">グループコード <span>半角英数字4〜8文字</span></label>
            <input id="live-code" name="code" type="text" minlength="4" maxlength="8"
              inputmode="text" autocapitalize="characters" spellcheck="false"
              value="${escHtml(joinCode)}" placeholder="例：BKC123">
          </div>
        </div>
        <div class="ls-mode-note"><svg aria-hidden="true"><use href="#i-lock"/></svg><span></span></div>
        <div class="ls-error" role="alert" hidden></div>
        <button class="ls-submit" type="submit"></button>
        <button class="ls-back" type="button"><svg aria-hidden="true"><use href="#i-prev"/></svg>共有方法の選択に戻る</button>
      </form>`;
    document.body.appendChild(modal);
    const form = modal.querySelector('form');
    const nameInput = modal.querySelector('#live-name');
    const codeInput = modal.querySelector('#live-code');
    const codeField = modal.querySelector('.ls-code-field');
    const modeNote = modal.querySelector('.ls-mode-note span');
    const submit = modal.querySelector('.ls-submit');
    const error = modal.querySelector('.ls-error');
    const finish = (value) => {
      modal.remove();
      resolve(value);
    };
    const setMode = (nextMode, { moveFocus = false } = {}) => {
      mode = nextMode;
      modal.querySelectorAll('[data-mode]').forEach(button => {
        const selected = button.dataset.mode === mode;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
      codeField.hidden = mode !== 'join';
      codeInput.required = mode === 'join';
      submit.textContent = mode === 'join' ? 'グループに参加' : 'グループを作成';
      modeNote.textContent = mode === 'join'
        ? '友達から届いたコードを入力した人だけが参加できます。'
        : '作成後に表示される招待リンクを、参加してほしい友達へ送ります。';
      error.hidden = true;
      if (moveFocus) (mode === 'join' ? codeInput : nameInput).focus();
    };
    modal.querySelector('.ls-close').addEventListener('click', () => finish(null));
    modal.querySelector('.ls-back').addEventListener('click', () => {
      finish(null);
      setTimeout(() => ctx?.openShareSheet?.(), 0);
    });
    modal.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => setMode(button.dataset.mode, { moveFocus: true }));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const nextMode = button.dataset.mode === 'create' ? 'join' : 'create';
        setMode(nextMode);
        modal.querySelector(`[data-mode="${nextMode}"]`).focus();
      });
    });
    codeInput.addEventListener('input', () => { error.hidden = true; });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) finish(null);
    });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
      if (event.key === 'Tab') {
        const focusable = [...modal.querySelectorAll('input, button:not([disabled])')]
          .filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = nameInput.value.trim().slice(0, 12) || '名無し';
      const rawCode = codeInput.value.trim().toUpperCase();
      if (mode === 'join' && !/^[A-Z0-9]{4,8}$/.test(rawCode)) {
        error.textContent = 'グループコードは半角英数字4〜8文字で入力してください';
        error.hidden = false;
        codeInput.focus();
        return;
      }
      try { localStorage.setItem('bkc-live-name', name); } catch { /* 保存なしで継続 */ }
      finish({ name, code: mode === 'join' ? rawCode : genCode() });
    });
    setMode(mode);
    (mode === 'join' ? codeInput : nameInput).focus();
  });
}

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

  const setup = await requestLiveSetup((joinCode ?? '').trim().toUpperCase());
  if (!setup) return;

  ctx.startGeolocation();
  ctx.toast('ライブ共有に接続しています…');
  try {
    await startSession(setup.code, setup.name);
  } catch (e) {
    console.warn('live share failed', e);
    ctx.toast(liveErrorText(e), 6500);
  }
}

// 失敗原因を、利用者が自分で対処できる言葉に変換する
function liveErrorText(e) {
  const s = `${e?.code ?? ''} ${e?.message ?? e ?? ''}`;
  if (/permission[_ ]?denied/i.test(s)) {
    return 'サーバーに書き込みを拒否されました（Realtime Databaseのルール設定を確認してください）';
  }
  if (e instanceof TypeError || /module|import|script|fetch/i.test(s)) {
    return '共有機能を読み込めませんでした。広告ブロック等で www.gstatic.com が遮断されていないか確認してください';
  }
  if (/connect timeout/.test(s)) {
    return 'サーバーに接続できませんでした。このWi-Fiでは通信が制限されている可能性があります。モバイル回線でもお試しください';
  }
  return `ライブ共有に接続できませんでした（${s.trim().slice(0, 80) || '原因不明'}）`;
}

async function startSession(code, name) {
  const { db, ref, onValue, onDisconnect, remove } = await loadFirebase();
  const uid = crypto.randomUUID().slice(0, 8);
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
  const trySet = (ms) => Promise.race([
    fb.set(myRef, first),
    new Promise((_, rej) => setTimeout(() => rej(new Error('connect timeout')), ms)),
  ]);
  try {
    await trySet(8000);
  } catch (e) {
    // タイムアウト時は、WebSocketが塞がれている回線（一部の学内・公衆Wi-Fi）を疑い、
    // HTTP長輪講（long-polling）へ切り替えて一度だけ再接続を試す
    if (String(e?.message).includes('connect timeout') && typeof fb.forceLongPolling === 'function') {
      try {
        fb.forceLongPolling();
        fb.goOffline(db);
        fb.goOnline(db);
        await trySet(10000);
      } catch (e2) {
        session = null;
        throw e2;
      }
    } else {
      session = null;
      throw e;
    }
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
      width: min(320px, calc(100vw - 76px)); max-height: min(420px, calc(100dvh - 210px));
      overflow-y: auto; box-sizing: border-box; padding: 14px;
      background: rgba(255,254,250,.97); border: 1px solid rgba(32,38,41,.13);
      border-radius: 14px; box-shadow: 0 12px 36px rgba(22,28,24,.16);
      font-size: 12.5px; color: var(--txt, #222); backdrop-filter: blur(16px);
    }
    #live-panel.hidden { display: none; }
    #live-panel .lp-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    #live-panel .lp-title { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 800; }
    #live-panel .lp-live-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #2f8a6b;
      box-shadow: 0 0 0 3px rgba(47,138,107,.12);
    }
    #live-panel .lp-code {
      min-height: 34px; padding: 0 9px; border: 1px solid rgba(141,25,55,.16);
      border-radius: 7px; background: rgba(141,25,55,.06); color: #8d1937;
      font: 700 11px/1 ui-monospace, monospace; letter-spacing: .12em; cursor: pointer;
    }
    #live-panel .lp-meta { margin: 7px 0 11px; color: var(--txt-dim, #666); font-size: 11px; }
    #live-panel .lp-row {
      display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center;
      gap: 8px; min-height: 52px; border-top: 1px solid var(--line, #eee);
    }
    #live-panel .lp-row b { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #live-panel .lp-distance { color: var(--txt-dim, #666); font-size: 11px; font-variant-numeric: tabular-nums; }
    #live-panel .lp-go {
      flex-shrink: 0; border: 1px solid var(--line, #ccc); background: transparent; cursor: pointer;
      min-height: 44px; border-radius: 8px; padding: 5px 10px; font: 700 12px/1 inherit; color: inherit;
    }
    #live-panel .lp-actions { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin-top: 10px; }
    #live-panel .lp-actions button {
      min-height: 44px; padding: 0 13px; border-radius: 9px; cursor: pointer; font: 700 12px/1 inherit;
      border: 1px solid var(--line, #ccc); background: transparent; color: inherit;
    }
    #live-panel .lp-actions .lp-invite { background: #8d1937; border-color: #8d1937; color: #fff; }
    #live-panel .lp-actions .lp-stop { color: #8d1937; }
    #live-panel .lp-empty {
      padding: 12px 0; border-top: 1px solid var(--line, #eee);
      color: var(--txt-dim, #666); font-size: 12px; line-height: 1.6;
    }
    body.nav-active #live-panel { display: none; }
    #live-setup {
      position: fixed; inset: 0; z-index: 120; display: grid; place-items: center;
      padding: 12px; background: rgba(21,24,23,.48); backdrop-filter: blur(4px);
    }
    #live-setup .ls-card {
      width: min(480px, 100%); max-height: calc(100dvh - 24px); overflow-y: auto;
      box-sizing: border-box; padding: 24px; border: 1px solid rgba(32,38,41,.13);
      border-radius: 20px; background: #fffefa; color: var(--txt, #222);
      box-shadow: 0 24px 80px rgba(17,22,19,.28);
    }
    #live-setup .ls-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    #live-setup .ls-eyebrow {
      margin: 0 0 4px; color: #8d1937; font-size: 11px; font-weight: 800; letter-spacing: .1em;
    }
    #live-setup h2 { margin: 0; font-size: 21px; line-height: 1.35; letter-spacing: -.01em; }
    #live-setup .ls-close {
      display: grid; place-items: center; flex: 0 0 auto; width: 44px; height: 44px;
      margin: -4px -4px 0 0; border: 0; border-radius: 50%; background: #f1efea;
      color: inherit; cursor: pointer;
    }
    #live-setup .ls-close svg { width: 17px; height: 17px; }
    #live-setup .ls-lead {
      margin: 10px 0 18px; color: var(--txt-dim, #666); font-size: 13px; line-height: 1.65;
    }
    #live-setup .ls-tabs {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px;
      border-radius: 10px; background: #efede7;
    }
    #live-setup .ls-tabs button {
      min-height: 44px; border: 0; border-radius: 7px; background: transparent;
      color: var(--txt-dim, #666); font: 700 12px/1 inherit; cursor: pointer;
    }
    #live-setup .ls-tabs button.active {
      background: #fff; color: #202629; box-shadow: 0 1px 4px rgba(28,34,30,.1);
    }
    #live-setup .ls-fields { padding-top: 8px; }
    #live-setup .ls-field { display: grid; gap: 7px; margin-top: 14px; }
    #live-setup .ls-field[hidden] { display: none; }
    #live-setup .ls-field label {
      display: flex; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 700;
    }
    #live-setup .ls-field label span { color: var(--txt-dim, #666); font-size: 11px; font-weight: 500; }
    #live-setup .ls-field input {
      width: 100%; min-height: 52px; box-sizing: border-box; padding: 12px 14px;
      border: 1px solid var(--line, #ccc); border-radius: 10px; background: #fff;
      color: inherit; font: 16px/1.3 inherit; text-transform: none;
    }
    #live-setup .ls-field input:focus {
      border-color: #8d1937; box-shadow: 0 0 0 3px rgba(141,25,55,.09);
    }
    #live-setup .ls-field small { color: var(--txt-dim, #666); font-size: 11px; line-height: 1.5; }
    #live-code {
      text-transform: uppercase !important; letter-spacing: .12em; font-family: ui-monospace, monospace !important;
    }
    #live-setup .ls-mode-note {
      display: flex; align-items: flex-start; gap: 8px; margin: 16px 0 0;
      color: var(--txt-dim, #666); font-size: 11.5px; line-height: 1.55;
    }
    #live-setup .ls-mode-note svg {
      flex: 0 0 auto; width: 15px; height: 15px; margin-top: 1px; color: #50705f;
    }
    #live-setup .ls-error {
      margin-top: 10px; padding: 9px 11px; border-radius: 7px;
      background: rgba(155,28,49,.07); color: #9b1c31; font-size: 12px; line-height: 1.5;
    }
    #live-setup .ls-submit {
      width: 100%; min-height: 52px; margin-top: 16px; border: 0; border-radius: 10px;
      background: #8d1937; color: #fff; font: 800 14px/1 inherit; cursor: pointer;
    }
    #live-setup .ls-submit:hover { background: #74122c; }
    #live-setup .ls-back {
      display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%;
      min-height: 44px; margin-top: 6px; border: 0; background: transparent;
      color: var(--txt-dim, #666); font: 700 12px/1 inherit; cursor: pointer;
    }
    #live-setup .ls-back svg { width: 15px; height: 15px; }
    #live-setup :focus-visible { outline: 3px solid #236bce; outline-offset: 2px; }
    @media (max-width: 420px) {
      #live-setup { place-items: end center; padding: 0; }
      #live-setup .ls-card {
        width: 100%; max-height: calc(100dvh - 12px); padding: 20px 18px max(18px, env(safe-area-inset-bottom));
        border-right: 0; border-bottom: 0; border-left: 0; border-radius: 20px 20px 0 0;
      }
      #live-setup .ls-lead { margin-bottom: 14px; }
      #live-setup .ls-field { margin-top: 12px; }
      #live-setup .ls-mode-note { margin-top: 12px; }
      #live-setup .ls-submit { margin-top: 12px; }
    }
  `;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'live-panel';
  panel.className = 'hidden';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'ライブ位置共有');
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
    return `<div class="lp-row"><b>${escHtml(f.name)}</b><span class="lp-distance">${dist}</span><button class="lp-go" data-uid="${escHtml(f.uid)}">案内</button></div>`;
  }).join('');
  panel.innerHTML = `
    <div class="lp-head">
      <div class="lp-title"><i class="lp-live-dot"></i><span>ライブ共有中</span></div>
      <button class="lp-code" type="button" aria-label="グループコード ${session.code} をコピー">${session.code}</button>
    </div>
    <div class="lp-meta">${friends.length ? `${friends.length}人の友達が参加中` : 'あなたの位置を共有しています'}</div>
    ${rows || '<div class="lp-empty">まだ友達は参加していません。<br>招待リンクを送って合流しましょう。</div>'}
    <div class="lp-actions">
      <button class="lp-invite" type="button">友達を招待</button>
      <button class="lp-stop" type="button">共有を終了</button>
    </div>`;
  panel.querySelector('.lp-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(session.code)
      .then(() => ctx.toast('グループコードをコピーしました'))
      .catch(() => ctx.toast(`グループコード: ${session.code}`));
  });
  panel.querySelector('.lp-invite').addEventListener('click', shareInvite);
  panel.querySelector('.lp-stop').addEventListener('click', () => stopLive(true));
  panel.querySelectorAll('.lp-go').forEach(b =>
    b.addEventListener('click', () => routeToFriend(b.dataset.uid)));
}

const escHtml = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ページを離れるときに自分の位置を確実に消す
addEventListener('pagehide', () => { if (session && fb) fb.remove(session.myRef).catch(() => {}); });
