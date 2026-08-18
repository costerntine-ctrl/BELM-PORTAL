const fs = require('fs');
const assert = require('assert');
const js = fs.readFileSync('frontend/portal-tools.js','utf8');
const css = fs.readFileSync('frontend/belm-theme.css','utf8');
const html = fs.readFileSync('frontend/index.html','utf8');

const checks = [
  ['machine card passes machine data into update loader', js.includes('loadCustomerMachineRecentUpdates(machine.id, machine)')],
  ['operational summary updates exist', js.includes('function machineLiveSummaryUpdates(machine)')],
  ['condition live update exists', js.includes('typeLabel: "CONDITION"')],
  ['activity live update exists', js.includes('typeLabel: "ACTIVITY"')],
  ['service plan update merges after service status', js.includes('mergeMachineServiceLiveUpdate(machine.id, status)')],
  ['one global rotation timer is used', js.includes('customerMachineUpdateRotationTimer') && js.includes('window.setInterval')],
  ['rotation interval is 5.5 seconds', js.includes('}, 5500);')],
  ['only one update slide is rendered at a time', js.includes('belm-machine-update-slide') && !js.includes('updates.map((u) => `\n          <div class="belm-machine-recent-update-row"')],
  ['HIDE persists IDs as strings', js.includes('dismissed.add(String(id))') && js.includes('dismissed.has(String(u.id))')],
  ['View all updates remains available', js.includes('View all updates')],
  ['Proforma PDF action remains available', js.includes('data-open-customer-proforma')],
  ['rotation pauses on hover/focus', js.includes('box.onmouseenter') && js.includes('box.onfocusin')],
  ['ticker styling exists', css.includes('.belm-machine-update-progress') && css.includes('@keyframes belmMachineUpdateIn')],
  ['dark mode ticker styling exists', css.includes('html[data-theme="dark"] .belm-machine-update-slide')],
  ['cache bust points to V293', (() => { const m1 = /portal-tools\.js\?v=(\d+)-/.exec(html); const m2 = /belm-theme\.css\?v=(\d+)-/.exec(html); return m1 && m2 && Number(m1[1]) >= 293 && Number(m2[1]) >= 293; })()],
];
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  assert.ok(ok, name);
}
console.log(`V293 regression: ${checks.length}/${checks.length} PASS`);
