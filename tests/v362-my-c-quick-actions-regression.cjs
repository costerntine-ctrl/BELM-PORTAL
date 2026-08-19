const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/my-c/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'frontend/my-c/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/my-c/my-c.css'), 'utf8');
const customers = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const customersHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
t('four MY C quick-action labels exist', ['View Your Machine','Workshop','Procurement','General Report'].every(v => app.includes(v)));
t('quick-action colors are black blue green yellow', css.includes('.action-black') && css.includes('#090d12') && css.includes('.action-blue') && css.includes('#2374d8') && css.includes('.action-green') && css.includes('#00a958') && css.includes('.action-yellow') && css.includes('#ffd43b'));
t('buttons point to matching admin destinations', app.includes('/customers-manager/?customer=${encodeURIComponent(customer.id)}') && app.includes('href="/engineering-manager/"') && app.includes('href="/spare-parts-manager/"') && app.includes('href="/reports-manager/"'));
t('View Your Machine auto-opens selected customer machine list', customers.includes('get("customer")') && customers.includes('openMachineList(requestedCustomer)'));
t('MY C quick-action assets retain compatible cache labels', /\/my-c\/my-c\.css\?v=(362-my-c-quick-actions|363-my-c-single-row-actions|370-my-c-compact-card)/.test(html) && /\/my-c\/app\.js\?v=(362-my-c-quick-actions-364-machine-view|370-my-c-compact-card)/.test(html));
t('customers manager deep-link code is cache-busted', /\/customers-manager\/manager\.js\?v=(362-my-c-quick-actions|365-single-procurement-main-card|366-machine-card-no-edit-delete|368-customer-contact-lines)/.test(customersHtml));
t('quick actions are responsive', css.includes('@media (max-width: 920px)') && css.includes('@media (max-width: 460px)'));
console.log(`V362 MY C quick actions ${pass}/7 checks passed`);
