const CACHE='pharm-cert-v1.12.0';
const ASSETS=['./','./index.html','./styles.css?v=1.12.0','./app.js?v=1.12.0','./manifest.webmanifest','./icon-192.png','./icon-512.png','./version.json'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()]))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;event.respondWith((async()=>{try{const fresh=await fetch(req,{cache:'no-store'});if(fresh&&fresh.ok){const cache=await caches.open(CACHE);cache.put(req,fresh.clone()).catch(()=>{})}return fresh}catch{const cached=await caches.match(req);if(cached)return cached;if(req.mode==='navigate')return caches.match('./index.html');throw new Error('offline')}})())});
