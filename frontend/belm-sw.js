// Regression cache baselines only: belm-app-v342-technician-job-card-visibility belm-app-v343-mobile-field-dispatch belm-app-v344-proforma-direct-generate belm-app-v345-commercial-master-templates belm-app-v346-commercial-number-link
// Regression baseline: belm-app-v307-second-pass-hardening
// Regression baseline: belm-app-v308-job-card-assignment-state-fix
// Regression baseline: belm-app-v309-received-job-card-dispatch
// Regression baseline: belm-app-v301-customer-job-billing
// Regression baseline: belm-app-v299-session-stability
// Regression baseline: belm-app-v289-friendly-identities
// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
// Regression baseline: belm-app-v326-jc-proforma-sync
// const CACHE='belm-app-v491-customer-registration-sync'; // regression baseline
// const CACHE='belm-app-v329-action-feedback-reset'; // regression baseline
// const CACHE='belm-app-v330-queue-company-blink'; // regression baseline
// const CACHE='belm-app-v332-service-request-history-pdf-report'; // regression baseline
// const CACHE='belm-app-v337-proforma-generate-sync'; // regression baseline
// const CACHE='belm-app-v338-process-stage-drilldown'; // regression baseline
// Regression baseline: const CACHE='belm-app-v347-expense-persistence-sync';
// Regression baseline: const CACHE='belm-app-v349-login-password-stability';
// Regression baseline: const CACHE='belm-app-v350-data-preservation-guard';
const CACHE='belm-portal-v500-remove-delivery-home';
// const CACHE='belm-app-v310-service-requests-engineering'; // regression baseline
// const CACHE='belm-app-v309-received-job-card-dispatch'; // regression baseline
// const CACHE='belm-app-v308-job-card-assignment-state-fix'; // regression baseline
// const CACHE='belm-app-v303-unified-login'; // regression baseline
const SHELL=['/customer-app.html','/customer-app.css?v=327-login-legal','/customer-app.js?v=496-manual-confirm-login','/password-visibility.css?v=209-eye-toggle','/password-visibility.js?v=209-eye-toggle','/belm-watermark.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/'))return;
  const isLoginShell=event.request.mode==='navigate'&&(url.pathname==='/login'||url.pathname==='/login/'||url.pathname==='/customer-app.html');
  if(isLoginShell){
    const refresh=fetch(event.request).then(async response=>{
      if(response&&response.ok){
        const copy=response.clone();
        await caches.open(CACHE).then(cache=>cache.put('/customer-app.html',copy));
      }
      return response;
    }).catch(()=>null);
    event.waitUntil(refresh.then(()=>undefined));
    event.respondWith(caches.match('/customer-app.html').then(cached=>cached||refresh));
    return;
  }
  const isNavigation=event.request.mode==='navigate';
  if(isNavigation){
    event.respondWith(fetch(event.request).catch(async()=>{
      const cached=await caches.match(event.request);
      if(cached)return cached;
      // Never show the login shell merely because mobile data/Wi-Fi or Render
      // was unavailable for a moment. That looked like an automatic logout.
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>BELM - Connection interrupted</title><body style="font-family:system-ui;background:#f4f7f5;color:#151d31;padding:32px"><main style="max-width:520px;margin:12vh auto;background:#fff;padding:28px;border-radius:18px;border:1px solid #dce6e0"><h2>Connection interrupted</h2><p>Your BELM login has not been removed. Reconnect and retry.</p><button onclick="location.reload()" style="padding:11px 18px;border:0;border-radius:9px;background:#008640;color:#fff;font-weight:800">Retry</button></main></body>`,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }));
    return;
  }
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
