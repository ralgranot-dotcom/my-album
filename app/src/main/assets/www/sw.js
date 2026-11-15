/* האלבום שלי — עבודה ללא אינטרנט בגרסת הדפדפן (קודם רשת, ואם אין — מהמטמון) */
const CACHE = 'myalbum-v1';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'css/app.css', 'manifest.json'].concat(['util', 'db', 'photos', 'render', 'viewer', 'app', 'screens', 'editor', 'photoedit', 'ai', 'export', 'backup', 'system', 'cloud'].map(n => 'js/' + n + '.js'))).catch(() => {}))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
