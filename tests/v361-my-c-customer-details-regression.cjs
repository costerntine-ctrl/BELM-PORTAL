const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'frontend/admin-sidebar.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/my-c/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'frontend/my-c/app.js'), 'utf8');
const customerManager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const checks = [
  ['MY C uses dedicated page', sidebar.includes('label: "MY C"') && sidebar.includes('href: "/my-c/"') && sidebar.includes('paths: ["/my-c/"]')],
  ['MY C is an admin standalone path', sidebar.includes('"/my-c/"')],
  ['MY C reads customer data from existing customers API', app.includes('api("/customers")')],
  ['registered date is shown in MY C', app.includes('Registered ${escapeHtml(formatRegisteredDate(customer.createdAt))}')],
  ['email phone address and tax details are shown in MY C', app.includes('customer.email') && app.includes('customer.phone') && app.includes('customer.address') && app.includes('customer.tinNumber') && app.includes('customer.vrn')],
  ['portal link block is removed from MY C', !app.includes('Working customer portal link') && !app.includes('new URL("/login", window.location.origin).href')],
  ['copy link control is removed from MY C', !app.includes('data-copy-customer-link') && !app.includes('navigator.clipboard.writeText')],
  ['open customer login control is removed from MY C', !app.includes('class="open-login"') && !app.includes('target="_blank"')],
  ['highlighted block remains absent from customer operation card', !customerManager.includes('<div class="customer-info-grid">') && !customerManager.includes('<div class="portal-link-box">')],
  ['MY C page loads current sidebar version', html.includes('/admin-sidebar.js?v=361-my-c-customer-details')],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`V361 checks: ${checks.length}/${checks.length} passed`);
