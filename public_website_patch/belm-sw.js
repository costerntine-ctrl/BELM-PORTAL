// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
const CACHE='belm-app-v223-technician-sync';self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
