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
// const CACHE='belm-app-v353-web-db-availability'; // regression baseline
// const CACHE='belm-app-v329-action-feedback-reset'; // regression baseline
// const CACHE='belm-app-v330-queue-company-blink'; // regression baseline
// const CACHE='belm-app-v332-service-request-history-pdf-report'; // regression baseline
// const CACHE='belm-app-v337-proforma-generate-sync'; // regression baseline
// const CACHE='belm-app-v338-process-stage-drilldown'; // regression baseline
// Regression baseline: const CACHE='belm-app-v347-expense-persistence-sync';
// Regression baseline: const CACHE='belm-app-v349-login-password-stability';
// Regression baseline: const CACHE='belm-app-v350-data-preservation-guard';
const CACHE='belm-app-v353-web-db-availability';
// const CACHE='belm-app-v310-service-requests-engineering'; // regression baseline
// const CACHE='belm-app-v309-received-job-card-dispatch'; // regression baseline
// const CACHE='belm-app-v308-job-card-assignment-state-fix'; // regression baseline
// const CACHE='belm-app-v303-unified-login'; // regression baseline
const SHELL=['/customer-app.html','/customer-app.css?v=327-login-legal','/customer-app.js?v=320-manual-login','/password-visibility.css?v=209-eye-toggle','/password-visibility.js?v=209-eye-toggle','/belm-watermark.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||caches.match('/customer-app.html'))))});
