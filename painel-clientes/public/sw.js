const CACHE='agentes-ia-v1';
const SHELL=['/','/manifest.webmanifest','/icons/app-icon.svg','/offline.html'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;
  const url=new URL(req.url);
  if(req.method!=='GET') return;
  if(url.pathname.startsWith('/api/')){
    e.respondWith(fetch(req).catch(()=>new Response(JSON.stringify({error:'Sem conexão com o servidor'}),{status:503,headers:{'Content-Type':'application/json'}})));
    return;
  }
  e.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res}).catch(()=>caches.match(req).then(r=>r||caches.match('/offline.html'))));
});
