const fs = require('fs');
const assert = require('assert');
const tools = fs.readFileSync('frontend/portal-tools.js','utf8');
const index = fs.readFileSync('frontend/index.html','utf8');
const sw = fs.readFileSync('frontend/belm-sw.js','utf8');
const checks = [
  ['company direction helper exists', tools.includes('function customerCommunicationDirection(direction)')],
  ['ticker uses company direction', tools.includes('customerCommunicationDirection(update.direction)')],
  ['history uses company direction', tools.includes('customerCommunicationDirection(u.direction)')],
  ['generic ticker direction removed', !tools.includes('"CUSTOMER → BELM" : "BELM → CUSTOMER"')],
  ['rotating ticker preserved', tools.includes('customerMachineUpdateRotationTimer') && tools.includes('5500')],
  ['hide update preserved', tools.includes('data-dismiss-update') && tools.includes('dismissUpdateId(id)')],
  ['view all updates preserved', tools.includes('data-view-all-communications')],
  ['V294 portal-tools cache bust', (() => { const m = /portal-tools\.js\?v=(\d+)-/.exec(index); return m && Number(m[1]) >= 294; })()],
  ['V294 service worker cache', (() => { const m = /const CACHE='belm-app-v(\d+)-/.exec(sw); return m && Number(m[1]) >= 294; })()],
];
let passed=0;
for (const [name, ok] of checks) {
  console.log(`${ok?'PASS':'FAIL'} ${name}`);
  assert.ok(ok, name);
  passed++;
}
console.log(`${passed}/${checks.length} V294 checks passed`);
