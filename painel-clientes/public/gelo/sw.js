const CACHE='gelo-tutoia-pwa-v2';
const SHELL=['/gelo/','/gelo/index.html','/gelo/manifest.webmanifest','/gelo/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('gelo-tutoia-pwa-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')) return;
  if(url.pathname.startsWith('/gelo/')){
    event.respondWith(
      fetch(req).then(res=>{
        if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
        return res;
      }).catch(()=>caches.match(req).then(hit=>hit||caches.match('/gelo/index.html')))
    );
  }
});