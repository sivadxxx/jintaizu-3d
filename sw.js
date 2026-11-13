// 人体図3D：オフライン用のキャッシュ（build.py が生成）
const CACHE = 'jintaizu3d-30e62c995e06';
const ASSETS = ["./", "index.html", "app.js", "lib/three.module.min.js", "lib/OrbitControls.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "models/skin.bin", "models/muscle.bin", "models/bone.bin"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('jintaizu3d-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {            // 画面本体：つながっていれば新しいものを、なければ保存したものを
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));   // 部品・モデル：保存したものを優先
});
