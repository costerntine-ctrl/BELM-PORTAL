// BELM portal service worker — V730 canonical shared Home Dashboard.
// API stays network-only. Cache only the common login + common Home shell to avoid stale/overlapping role pages.
const CACHE='belm-portal-v730-shared-home';
const SHELL=[
  '/customer-app.html?v=730-shared-home',
  '/customer-app.css?v=680-home-confirm-login',
  '/customer-app.js?v=730-shared-home',
  '/password-visibility.css?v=209-eye-toggle',
  '/password-visibility.js?v=209-eye-toggle',
  '/belm-watermark.jpg',
  '/portal-v2/index.html?v=730-shared-home',
  '/portal-v2/landing.css?v=730-shared-home',
  '/portal-v2/landing.js?v=730-shared-home'
];
self.addEventListener('install',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k))))
    .then(()=>caches.open(CACHE))
    .then(cache=>cache.addAll(SHELL))
    .then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='CLEAR_BELM_CACHES'){
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
  }
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/'))return;
  const isLoginShell=event.request.mode==='navigate'&&(url.pathname==='/login'||url.pathname==='/login/'||url.pathname==='/customer-app.html');
  const isSharedHome=event.request.mode==='navigate'&&(url.pathname==='/portal-v2'||url.pathname==='/portal-v2/'||url.pathname==='/portal-v2/index.html');
  if(isLoginShell||isSharedHome){
    const cacheKey=isLoginShell?'/customer-app.html':'/portal-v2/index.html';
    const refresh=fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(response&&response.ok){const copy=response.clone();await caches.open(CACHE).then(cache=>cache.put(cacheKey,copy));}
      return response;
    }).catch(()=>null);
    event.respondWith(refresh.then(response=>response||caches.match(cacheKey)));
    return;
  }
  if(event.request.mode==='navigate'){
    // Role pages are always network-first and are not persisted in the app shell.
    // This prevents an older dashboard from visually overlapping a newly deployed one.
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>BELM - Connection interrupted</title><body style="margin:0;font-family:Arial,sans-serif;background:linear-gradient(180deg,#0d57b3,#03284f);color:#fff;padding:32px"><main style="max-width:520px;margin:12vh auto;background:#041b33;padding:28px;border-radius:18px;border:1px solid #ffc61a"><h2>Connection interrupted</h2><p>Your BELM login has not been removed. Reconnect and retry.</p><button onclick="location.reload()" style="padding:11px 18px;border:0;border-radius:9px;background:#ffc61a;color:#172c47;font-weight:800">Retry</button></main></body>`,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));
});
