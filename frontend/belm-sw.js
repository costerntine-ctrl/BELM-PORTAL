// BELM portal service worker — V717 dashboard-led structure.
// Keep API requests network-only; cache only the login shell and approved dashboard structure assets.
const CACHE='belm-portal-v717-dashboard-led-structure';
const SHELL=[
  '/customer-app.html?v=680-home-confirm-login',
  '/customer-app.css?v=680-home-confirm-login',
  '/customer-app.js?v=707-dashboard-lock',
  '/password-visibility.css?v=209-eye-toggle',
  '/password-visibility.js?v=209-eye-toggle',
  '/belm-watermark.jpg',
  '/portal-v2/index.html?v=710-supplied-dashboards-live',
  '/portal-v2/portal.css?v=712-workshop-manager-role',
  '/portal-v2/portal.js?v=712-workshop-manager-role',
  '/dashboard-live-v710.js?v=717-dashboard-led-structure',
  '/concept-dashboards/01-admin-home/index.html',
  '/concept-dashboards/02-technician/index.html',
  '/concept-dashboards/03-procurement/index.html',
  '/concept-dashboards/04-customer-registration/index.html',
  '/concept-dashboards/05-inspection-repair/index.html',
  '/concept-dashboards/06-storekeeper/index.html',
  '/concept-dashboards/07-operator/index.html',
  '/concept-dashboards/08-daily-checklist/index.html',
  '/concept-dashboards/09-finance-accounts/index.html',
  '/concept-dashboards/10-system-settings/index.html',
  '/concept-dashboards/11-workshop-manager/index.html'
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
  if(isLoginShell){
    const refresh=fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(response&&response.ok){const copy=response.clone();await caches.open(CACHE).then(cache=>cache.put('/customer-app.html',copy));}
      return response;
    }).catch(()=>null);
    event.respondWith(refresh.then(response=>response||caches.match('/customer-app.html')));
    return;
  }
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).catch(async()=>{
      const cached=await caches.match(event.request);if(cached)return cached;
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>BELM - Connection interrupted</title><body style="font-family:system-ui;background:#f4f7f5;color:#151d31;padding:32px"><main style="max-width:520px;margin:12vh auto;background:#fff;padding:28px;border-radius:18px;border:1px solid #dce6e0"><h2>Connection interrupted</h2><p>Your BELM login has not been removed. Reconnect and retry.</p><button onclick="location.reload()" style="padding:11px 18px;border:0;border-radius:9px;background:#008640;color:#fff;font-weight:800">Retry</button></main></body>`,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }));return;
  }
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request)));
});
