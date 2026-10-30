// Service Worker: 全ファイルを事前キャッシュし、cache-first で返す。
// コードを直したら CACHE_VERSION を上げる（古いキャッシュは新しい版が有効になったときに消える）
const CACHE_VERSION = 'v1';
const CACHE = `shogi-${CACHE_VERSION}`;
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/rules.js',
  './js/sfen.js',
  './js/handicap.js',
  './js/piece-svg.js',
  './js/render.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // HTTP キャッシュに残った古い版を拾わないよう、ネットワークから取り直す
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shogi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))),
  );
});
