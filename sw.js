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
//
// A gym is rarely OFFLINE, though — it is a basement with one bar of signal,
// where a request can hang for a minute before failing, and a network-first
// app hung right along with it. So when the network hasn't answered within
// NET_WAIT and the cache has a copy, the copy is served; the network's reply
// still refreshes the cache whenever it lands. Also: only good replies are
// cached (a transient 404/500 used to overwrite the working copy); the
// index.html fallback is for page loads only (a failed script or image used to
// be answered with the app's HTML — and the old `caches.match(…)||…` chain
// could never reach its last resort, a Promise being always truthy); and a
// page load the server answers with an error gets the cached app instead.
const NET_WAIT=3000;
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const nav=req.mode==='navigate';
  const fromCache=()=>caches.match(req).then(m=>m||(nav?caches.match('./index.html'):undefined))
    .catch(()=>undefined);   // never reject: the page must always get an answer
  let stored=Promise.resolve();
  const net=fetch(req).then(r=>{
    if(r.ok||r.type==='opaque'){   // opaque = the cross-origin CDN script
      const cp=r.clone();
      stored=caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{});
    }
    return r;
  });
  e.waitUntil(net.then(()=>stored,()=>{}));   // a late reply still refreshes the cache
  e.respondWith(new Promise(resolve=>{
    let done=false;
    const answer=r=>{if(!done&&r){done=true;clearTimeout(slow);resolve(r);}};
    const slow=setTimeout(()=>fromCache().then(answer),NET_WAIT);
    net.then(
      r=>nav&&!r.ok&&r.type!=='opaqueredirect'?fromCache().then(m=>answer(m||r)):answer(r),
      ()=>fromCache().then(m=>answer(m||Response.error())));
  }));
});
