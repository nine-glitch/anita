// sw.js — Anita Service Worker
// Cambiá el número de versión cada vez que deployás para limpiar el cache
const CACHE = 'anita-v3';
const ASSETS = ['/'];

// Instalar
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar — elimina caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first para HTML, cache first para el resto
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;

  const isHTML = e.request.headers.get('accept')?.includes('text/html')
    || e.request.url.endsWith('.html')
    || e.request.url.endsWith('/');

  if (isHTML) {
    // Network first: siempre busca la versión nueva, cae al cache si no hay red
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache first para assets estáticos (fuentes, etc.)
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

// Push notification
self.addEventListener('push', e => {
  if (!e.data) return;

  let data;
  try { data = e.data.json(); }
  catch { data = { title: 'anita', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'anita', {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/badge.png',
      tag: data.tag || 'anita',
      renotify: data.renotify || false,
      data: data.data || {}
    })
  );
});

// Click en notificación
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const existing = clientList.find(c => c.url === url && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
