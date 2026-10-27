// ============================================================
//  SERVICE WORKER
//  - Permite instalar la web como app (Android e iPhone).
//  - Red primero: con conexión siempre carga la última versión;
//    sin conexión tira de la copia guardada.
//  - Muestra notificaciones: las que pide la propia web y las push
//    que envían las Cloud Functions con la app cerrada.
// ============================================================
const CACHE = 'mn-v21';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/style.css',
  'js/config.js', 'js/store.js', 'js/chart.js', 'js/app.js',
  'js/mod-app.js', 'js/mod-tables.js', 'js/mod-events.js', 'js/mod-extras.js',
  'js/mod-bets.js', 'js/mod-market.js', 'js/mod-fx.js', 'js/mod-tv.js', 'js/mod-shows.js', 'js/mod-photo.js', 'js/mod-tutorial.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});

// Push (Cloud Functions vía Firebase Cloud Messaging): { data: { title, body, url, tag } }
const isIOS = /iphone|ipad|ipod|macintosh/i.test(self.navigator.userAgent);
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  const n = data.data || data.notification || data;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    // Con la app a la vista ya sale el aviso dentro (en iPhone hay que mostrarla siempre)
    if (!isIOS && list.some((c) => c.visibilityState === 'visible' && c.focused)) return null;
    return self.registration.showNotification(n.title || 'Mercado Negro', {
      body: n.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      tag: n.tag || undefined,
      data: { url: n.url || './' },
      vibrate: [120, 60, 120],
    });
  }));
});

// Al tocar una notificación: abre (o enfoca) la app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow(url);
    })
  );
});
