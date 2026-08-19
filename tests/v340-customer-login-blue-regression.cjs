const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'frontend/belm-sw.js'), 'utf8');
const checks = [
  ['customer login anchor preserved', js.includes('>Open customer login</a>')],
  ['blue fill applied to portal login action', css.includes('.portal-actions a { color: #fff; border-color: #2f7cf5; background: #2f7cf5')],
  ['hover state blue', css.includes('.portal-actions a:hover') && css.includes('background: #2563eb')],
  ['pressed state blue', css.includes('.portal-actions a:active') && css.includes('background: #1d4ed8')],
  ['keyboard focus visible', css.includes('.portal-actions a:focus-visible')],
  ['customer manager css cache bumped', html.includes('manager.css?v=340-customer-login-blue')],
  ['unchanged manager js retains compatible cache label', /manager\.js\?v=(320-engineering-single-owner|351-dev-expense-access|352-public-url-port-guard)/.test(html)],
  ['service worker cache bumped', (/belm-app-v(?:340-customer-login-blue|341-proforma-invoice-direct-sync|342-technician-job-card-visibility)/.test(sw))],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log(`V340 checks: ${checks.length}/${checks.length} passed`);
