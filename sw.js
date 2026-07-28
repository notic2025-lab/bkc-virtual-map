// ============================================================
// Service Worker — オフラインキャッシュ & 高速再訪
//   完全静的アプリのため、全アセットをキャッシュすれば
//   2回目以降はネットワークなしでも動作する。
//   （大人数の同時アクセス時もサーバー負荷は初回取得分だけになる）
// ============================================================
const CACHE_VERSION = 'bkc-map-v19-map-matching';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=20260728k',
  './js/app.js?v=20260729c',
  './js/walk-learn.js?v=20260729b',
  './js/data.js',
  './js/survey-data.js',
  './js/firebase-config.js',
  './js/live.js?v=20260729b',
  './js/boot.js?v=20260728k',
  './js/survey.js',
  './js/ar.js',
  './vendor/three.module.js',
  './vendor/OrbitControls.js',
  './assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 外部リクエストは扱わない（そもそも発生しない設計）

  if (req.mode === 'navigate') {
    // HTMLはネットワーク優先（更新を確実に配る）。オフライン時はキャッシュへフォールバック
    // 404等の異常応答はキャッシュしない（不良ページがオフライン時に固定化されるのを防ぐ）
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html')))
    );
    return;
  }

  // 静的アセットはキャッシュ優先（バージョンはURLの ?v= で管理）
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
