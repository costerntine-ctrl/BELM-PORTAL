const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const myc = fs.readFileSync(path.join(root, 'frontend/my-c/app.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const mycHtml = fs.readFileSync(path.join(root, 'frontend/my-c/index.html'), 'utf8');
const managerHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
t('MY C View Your Machine uses explicit machine deep link', myc.includes('/customers-manager/?customer=${encodeURIComponent(customer.id)}&view=machines'));
t('customers manager reads customer and view parameters', manager.includes('deepLinkParams.get("customer")') && manager.includes('deepLinkParams.get("view")'));
t('only selected customer object is passed to machine list renderer', manager.includes('customers.find((customer) => String(customer.id) === requestedCustomerId)') && manager.includes('openMachineList(requestedCustomer)'));
t('deep link opens machines while preserving legacy customer-only links', manager.includes('requestedCustomerId && (!requestedView || requestedView === "machines")'));
t('machine card keeps non-procurement operational controls', ['Report', 'Check Up', 'Service Parts', 'Engineering / Job Cards'].every((label) => manager.includes(label)));
t('machine list renderer maps only the supplied customer machines', manager.includes('const machines = customer.machines || []') && manager.includes('machines.map((machine) => machineCard(customer.id, machine'));
t('MY C app cache label updated', /\/my-c\/app\.js\?v=(362-my-c-quick-actions-364-machine-view|370-my-c-compact-card)/.test(mycHtml));
t('customers manager cache label updated', (/\/customers-manager\/manager\.js\?v=(362-my-c-quick-actions-364-machine-view|365-single-procurement-main-card|366-machine-card-no-edit-delete|368-customer-contact-lines)/.test(managerHtml)));
console.log(`V364 MY C direct machine view ${pass}/8 checks passed`);
