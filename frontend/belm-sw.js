// Regression baseline: belm-app-v306-regression-hardening
// Regression baseline: belm-app-v305-technician-jobcards
// Regression baseline: belm-app-v301-customer-job-billing
// Regression baseline: belm-app-v299-session-stability
// Regression baseline: belm-app-v289-friendly-identities
// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
const CACHE='belm-app-v306-regression-hardening';
// const CACHE='belm-app-v303-unified-login'; // regression baseline
const SHELL=['/customer-app.html','/customer-app.css?v=211-bug-audit','/customer-app.js?v=303-unified-login','/password-visibility.css?v=209-eye-toggle','/password-visibility.js?v=209-eye-toggle','/belm-watermark.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).pathname.startsWith('/api/'))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(r=>r||caches.match('/customer-app.html'))))});
