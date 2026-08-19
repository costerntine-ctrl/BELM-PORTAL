const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const managerHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
const machineCardSource = manager.match(/function machineCard\([\s\S]*?\n  }\n\n  \/\/ Uses the SAME endpoint/)?.[0] || '';
t('machine card keeps Report', machineCardSource.includes('Report'));
t('machine card keeps Check Up', machineCardSource.includes('Check Up'));
t('machine card keeps Service Parts', machineCardSource.includes('Service Parts'));
t('machine card keeps Engineering Job Cards', machineCardSource.includes('Engineering / Job Cards'));
t('V377 supersedes V366 by restoring Edit only in BELM Admin management row', machineCardSource.includes('class=\"machine-admin-actions\"') && machineCardSource.includes('data-edit-machine='));
t('V377 supersedes V366 by restoring Delete only in BELM Admin management row', machineCardSource.includes('class=\"machine-admin-actions\"') && machineCardSource.includes('data-delete-machine='));
t('machine card still has no Procurement Receipts duplicate', !machineCardSource.includes('Procurement Receipts'));
t('customers manager asset is cache-busted for V366', /\/customers-manager\/manager\.js\?v=(366-machine-card-no-edit-delete|368-customer-contact-lines|371-customer-quick-buttons|373-manage-customer|376-machine-actions-one-row|377-admin-machine-management)/.test(managerHtml));
console.log(`V366/V377 machine action compatibility ${pass}/8 checks passed`);
