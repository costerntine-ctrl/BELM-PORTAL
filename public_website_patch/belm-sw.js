// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
// const CACHE='belm-app-v341-proforma-invoice-direct-sync'; // regression baseline
// const CACHE='belm-app-v338-process-stage-drilldown'; // regression baseline
// Regression baseline: const CACHE='belm-app-v344-proforma-direct-generate';
const CACHE='belm-app-v352-public-url-port-guard';self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
