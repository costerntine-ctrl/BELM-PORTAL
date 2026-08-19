const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const adminCss = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const customerCss = fs.readFileSync(path.join(root, 'frontend/belm-theme.css'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const checks = [
  ['admin red blink selector', adminCss.includes('.machine-card.machine-range-red::after')],
  ['admin red blink keyframes', adminCss.includes('@keyframes belm-machine-red-blink')],
  ['admin yellow pulse selector', adminCss.includes('.machine-card.machine-range-yellow::after')],
  ['admin yellow pulse keyframes', adminCss.includes('@keyframes belm-machine-yellow-pulse')],
  ['admin green steady', adminCss.includes('.machine-card.machine-range-green::after') && adminCss.includes('content: none')],
  ['customer red blink selector', customerCss.includes('.belm-customer-machine-card.belm-range-red::after')],
  ['customer red blink keyframes', customerCss.includes('@keyframes belm-customer-machine-red-blink')],
  ['customer yellow pulse selector', customerCss.includes('.belm-customer-machine-card.belm-range-yellow::after')],
  ['customer yellow pulse keyframes', customerCss.includes('@keyframes belm-customer-machine-yellow-pulse')],
  ['customer green steady', customerCss.includes('.belm-customer-machine-card.belm-range-green::after')],
  ['reduced motion admin', adminCss.includes('@media (prefers-reduced-motion: reduce)')],
  ['reduced motion customer', customerCss.includes('@media (prefers-reduced-motion: reduce)')],
  ['admin css cache bumped', adminHtml.includes('/customers-manager/manager.css?v=383-machine-alert-blink')],
  ['customer css cache bumped', shell.includes('/belm-theme.css?v=383-machine-alert-blink')]
];
let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed++; }
}
if (failed) process.exit(1);
console.log(`PASS v383 machine alert blink regression (${checks.length}/${checks.length})`);
