const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const checks = [
  ['Machine quick-action button exists', /class="customer-quick-action action-black" data-view-machines=.*?<\/button>/.test(js)],
  ['Workshop button exists', /class="customer-quick-action action-blue" href="\/engineering-manager\/">Workshop<\/a>/.test(js)],
  ['Procurement button exists', /class="customer-quick-action action-green" href="\/spare-parts-manager\/">Procurement<\/a>/.test(js)],
  ['General Report button exists', /class="customer-quick-action action-yellow" href="\/reports-manager\/">General Report<\/a>/.test(js)],
  ['Quick actions remain one row with five columns', /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(css)],
  ['Old Delete Machine shortcut removed from card markup', !/🗑 Delete Machine/.test(js)],
  ['Legacy admin shortcuts are hidden from the visible card', /class="customer-card-legacy-actions" hidden aria-hidden="true"/.test(js) && /\.customer-card-legacy-actions \{ display: none !important; \}/.test(css)],
  ['Asset cache-bust remains current', /v=(371-customer-quick-buttons|373-manage-customer|376-machine-actions-one-row|377-admin-machine-management|377-admin-machine-management-activity-status)/.test(html)],
  ['Machine list function retained', /if \(viewMachines\) openMachineList/.test(js)],
  ['Customer sync rendering retained', /loadCustomerFeeds\(filtered\)/.test(js)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`V371 customer card quick-buttons regression passed ${checks.length}/${checks.length}.`);
