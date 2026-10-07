const CACHE='gelo-tutoia-controle-v1';
const SHELL=[
  '/controle.html',
  '/controle-manifest.webmanifest',
  '/icons/gelo-tutoia.svg',
  '/offline.html'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('gelo-tutoia-controle-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  if(url.pathname.startsWith('/api/')){
    event.respondWith(
      fetch(req).catch(()=>new Response(
        JSON.stringify({ok:false,error:'Sem conexão com o servidor'}),
        {status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}
      ))
    );
    return;
  }

  if(url.pathname==='/controle.html'||url.pathname==='/controle-manifest.webmanifest'||url.pathname==='/icons/gelo-tutoia.svg'){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(req,copy));
        return res;
      }).catch(()=>caches.match(req).then(hit=>hit||caches.match('/offline.html')))
    );
    return;
  }

  event.respondWith(fetch(req).catch(()=>caches.match(req).then(hit=>hit||caches.match('/offline.html'))));
});