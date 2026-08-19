const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'frontend', 'customers-manager', 'manager.js'), 'utf8');
const customer = fs.readFileSync(path.join(root, 'frontend', 'portal-tools.js'), 'utf8');

const checks = [
  ['BELM Admin customer card uses Customer Machine label', /class="customer-quick-action action-black" data-view-machines=.*?>Customer Machine<\/button>/.test(admin)],
  ['Admin machine button keeps existing data-view-machines hook', /data-view-machines="\$\{escapeHtml\(customer\.id\)\}"/.test(admin)],
  ['Customer dashboard still says View Your Machine', />View Your Machine<\/a>/.test(customer)],
  ['Customer dashboard does not use Customer Machine label', !/>Customer Machine<\/a>/.test(customer)],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS: ${name}`);
  else { console.error(`FAIL: ${name}`); failed++; }
}
if (failed) process.exit(1);
console.log(`V381 admin label regression passed: ${checks.length}/${checks.length}`);
