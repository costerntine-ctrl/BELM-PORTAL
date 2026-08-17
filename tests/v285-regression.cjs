const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const checks = [
  ['uniform card changelog block', css.includes('V285 - Uniform customer cards')],
  ['header fixed rhythm', css.includes('.customer-card-head {\n  min-height: 126px;')],
  ['customer name limited to two lines', css.includes('-webkit-line-clamp: 2;')],
  ['customer info region aligned', css.includes('.customer-info-grid {\n  min-height: 112px;')],
  ['portal region aligned', css.includes('.portal-link-box {\n  min-height: 112px;')],
  ['communication preview fixed height', css.includes('height: 154px;') && css.includes('overflow-y: auto;')],
  ['actions stable grid', css.includes('grid-template-columns: repeat(6, minmax(0, 1fr));')],
  ['full customer name retained in tooltip', js.includes('<h2 title="${escapeHtml(customer.name)}">${escapeHtml(customer.name)}</h2>')],
  ['BELM customer switch preserved', js.includes('data-card-provider-toggle=')],
  ['V284 batched communication preserved', js.includes('/customers/communication-feed?ids=')],
  ['V285 CSS cache bust', /manager\.css\?v=(\d+)-/.exec(html) && Number(/manager\.css\?v=(\d+)-/.exec(html)[1]) >= 285],
  ['V285 JS cache bust', /customers-manager\/manager\.js\?v=(\d+)-/.exec(html) && Number(/customers-manager\/manager\.js\?v=(\d+)-/.exec(html)[1]) >= 285],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`${checks.length - failed}/${checks.length} V285 checks passed`);
if (failed) process.exit(1);
