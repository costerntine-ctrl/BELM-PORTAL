const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const checks = [
  ['registered date removed from customer card', !js.includes('<p>Registered ${customer.createdAt')],
  ['customer info block removed from customer card', !js.includes('<div class="customer-info-grid">')],
  ['working portal link box removed from customer card', !js.includes('<div class="portal-link-box">')],
  ['copy-link button removed from customer card', !js.includes('data-copy-link="${escapeHtml(customer.id)}"')],
  ['open-customer-login action removed from customer card', !js.includes('>Open customer login</a>')],
  ['copy-link delegated handler removed', !js.includes('event.target.closest("[data-copy-link]")')],
  ['customer manager cache bust bumped', /customers-manager\/manager\.js\?v=(360-customer-card-cleanup|362-my-c-quick-actions|365-single-procurement-main-card|366-machine-card-no-edit-delete|368-customer-contact-lines)/.test(html)],
  ['communication history remains', js.includes('<strong>Communication history</strong>')],
  ['lower customer actions remain', js.includes('data-view-machines=') && js.includes('data-edit-customer=') && js.includes('data-reset-customer=')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log(`V360 checks: ${checks.length}/${checks.length} passed`);
