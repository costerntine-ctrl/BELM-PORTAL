const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const adminJs = read('frontend/customers-manager/manager.js');
const adminCss = read('frontend/customers-manager/manager.css');
const portalJs = read('frontend/portal-tools.js');
const portalCss = read('frontend/belm-theme.css');
const globalCss = read('frontend/theme-global.css');
const adminHtml = read('frontend/customers-manager/index.html');
const shell = read('frontend/index.html');

const checks = [
  ['admin range helper', adminJs.includes('function applyAdminMachineRange(card)')],
  ['admin red/yellow/green priority', adminJs.includes('machineRangeRank = { unknown: 0, green: 1, yellow: 2, red: 3 }')],
  ['admin condition range stored', adminJs.includes('data-machine-condition-level=')],
  ['admin service range stored', adminJs.includes('card.dataset.machineServiceLevel = level')],
  ['admin service can recolor card', adminJs.includes('applyAdminMachineRange(card);')],
  ['admin readable alert area', adminJs.includes('class="machine-alert-copy"') && adminJs.includes('data-machine-service-alert-copy')],
  ['admin full green card css', adminCss.includes('.machine-card.machine-range-green')],
  ['admin full yellow card css', adminCss.includes('.machine-card.machine-range-yellow')],
  ['admin full red card css', adminCss.includes('.machine-card.machine-range-red')],
  ['admin readable alert css', adminCss.includes('.machine-alert-copy .machine-alert-reason')],
  ['customer range helper', portalJs.includes('function applyCustomerMachineRange(card)')],
  ['customer red/yellow/green priority', portalJs.includes('customerMachineRangeRank = { unknown: 0, green: 1, yellow: 2, red: 3 }')],
  ['customer condition range stored', portalJs.includes('card.dataset.belmConditionRange = condition.status')],
  ['customer service range stored', portalJs.includes('card.dataset.belmServiceRange = String(status.level || "GREEN").toUpperCase()')],
  ['customer service can recolor card', portalJs.includes('applyCustomerMachineRange(card);')],
  ['customer readable alert area', portalJs.includes('belm-customer-machine-alert-copy') && portalJs.includes('data-belm-service-alert-copy')],
  ['customer full green card css', portalCss.includes('.belm-customer-machine-card.belm-range-green')],
  ['customer full yellow card css', portalCss.includes('.belm-customer-machine-card.belm-range-yellow')],
  ['customer full red card css', portalCss.includes('.belm-customer-machine-card.belm-range-red')],
  ['dark mode admin range protected', globalCss.includes('html[data-theme="dark"] #machineListDialog .machine-card.machine-range-red')],
  ['dark mode customer range protected', globalCss.includes('html[data-theme="dark"] .belm-customer-machine-card.belm-range-red')],
  ['admin cache bumped', adminHtml.includes('v=382-full-card-alert-range')],
  ['customer cache bumped', shell.includes('/portal-tools.js?v=382-full-card-alert-range') && shell.includes('/belm-theme.css?v=382-full-card-alert-range') && shell.includes('/theme-global.css?v=382-full-card-alert-range')],
  ['existing customer activity status retained', portalJs.includes('data-customer-activity-status=')],
  ['existing admin management retained', adminJs.includes('data-edit-machine=') && adminJs.includes('data-delete-machine=') && adminJs.includes('data-forget-machine=')],
];
let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) passed++;
}
console.log(`TOTAL ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
