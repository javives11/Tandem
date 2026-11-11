// Keeps the app's own files on the phone so it opens fast, even on a weak signal.
// Your board's data always comes fresh from Google, never from this cache.
// It also shows notifications: the server wakes it up, then it asks the server what to show.
const CACHE = 'tandem-v10', META = 'tandem-meta';
const FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icons/tandem-192.png', 'icons/tandem-512.png', 'icons/tandem-touch-180.png', 'icons/tandem-badge-96.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== META).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network first, so updates show up right away; fall back to the saved copy offline.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});

/* ---------- notifications ---------- */
async function readMeta(key) {
  try { const c = await caches.open(META); const r = await c.match(key); return r ? await r.text() : null; } catch (e) { return null; }
}
async function showNew() {
  // icon: the full-color logo shown beside the message. badge: the small status-bar icon,
  // which Android draws from the shape alone, so it's a white silhouette on a clear background.
  const icon = 'icons/tandem-192.png', badge = 'icons/tandem-badge-96.png';
  let items = [];
  try {
    const session = JSON.parse(await readMeta('session') || 'null');
    if (session && session.token && session.url) {
      const since = Number(await readMeta('since')) || 0;
      const r = await fetch(session.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'pull', token: session.token, since }) });
      const j = await r.json();
      items = (j && j.items) || [];
      if (items.length) {
        const c = await caches.open(META);
        await c.put('since', new Response(String(Math.max(...items.map(i => i.at)))));
      }
    }
  } catch (e) {}
  if (!items.length) return self.registration.showNotification('Tandem', { body: 'Open Tandem to see what’s new.', icon, badge, tag: 'tandem' });
  return Promise.all(items.slice(-4).map(i => self.registration.showNotification(i.title, { body: i.body, icon, badge, tag: i.id, data: { tab: i.tab || '' } })));
}
self.addEventListener('push', e => { e.waitUntil(showNew()); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || '';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try { await c.focus(); c.postMessage({ tab }); return; } catch (err) {}
    }
    await self.clients.openWindow('./' + (tab ? '#' + tab : ''));
  })());
});
