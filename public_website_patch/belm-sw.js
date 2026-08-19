// Regression baseline: belm-app-v215-petty-checkup
// Regression baseline: belm-app-v211-bug-audit
// const CACHE='belm-app-v353-web-db-availability'; // regression baseline
// const CACHE='belm-app-v338-process-stage-drilldown'; // regression baseline
// Regression baseline: const CACHE='belm-app-v344-proforma-direct-generate';
const CACHE='belm-app-v353-web-db-availability';self.addEventListener('install',e=>{self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
