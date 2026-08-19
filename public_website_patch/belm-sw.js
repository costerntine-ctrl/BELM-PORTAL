// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
// const CACHE='belm-app-v355-json-api-clean-response'; // regression baseline
// const CACHE='belm-app-v338-process-stage-drilldown'; // regression baseline
// Regression baseline: const CACHE='belm-app-v344-proforma-direct-generate';
const CACHE='belm-app-v354-fast-wake-loading-guard';self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
