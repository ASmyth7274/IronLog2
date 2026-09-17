/* IronLog service worker — rest-timer notifications + offline cache.
   Kept separate from index.html because browsers require service workers
   to be real same-origin JS files (no inline/blob registration). */
const CACHE='ironlog-v3';   // bumped for v5.7 — drops the v5.6 precached shell
// precached so a fresh install is installable and works offline immediately,
// rather than only after the network-first handler has seen each request once
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png',
  './icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./favicon-64.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',e=>e.waitUntil(
  caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())));

// Focus (or reopen) the app when a notification is tapped.
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    for(const c of cs)if('focus' in c)return c.focus();
    return self.clients.openWindow('./');
  }));
});

// Network-first with cache fallback: always fresh while online, and the app
// (plus the Chart.js CDN file) keeps working offline after the first load.
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(
    fetch(e.request).then(r=>{
      const cp=r.clone();
      caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});
      return r;
    }).catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html')||Response.error()))
  );
});
