const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const myc = fs.readFileSync(path.join(root, 'frontend/my-c/app.js'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const managerHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
const quickActions = myc.match(/<nav class="myc-quick-actions"[\s\S]*?<\/nav>/)?.[0] || '';
const labels = [...quickActions.matchAll(/>(View Your Machine|Workshop|Procurement|General Report)<\/a>/g)].map(m => m[1]);
t('MY C quick actions remain in requested order', JSON.stringify(labels) === JSON.stringify(['View Your Machine','Workshop','Procurement','General Report']));
t('Procurement is main-card button number 3', labels[2] === 'Procurement' && quickActions.includes('action-green'));
t('only one visible Procurement quick action exists in MY C main card', (quickActions.match(/>Procurement<\/a>/g) || []).length === 1);
t('machine card no longer shows Procurement Receipts button', !manager.includes('privacyButton("Procurement Receipts"'));
t('machine card keeps Report Check Up Service Parts Engineering', ['Report','Check Up','Service Parts','Engineering / Job Cards'].every(label => manager.includes(label)));
t('customers manager changed asset is cache-busted', (/\/customers-manager\/manager\.js\?v=(365-single-procurement-main-card|366-machine-card-no-edit-delete|368-customer-contact-lines|371-customer-quick-buttons)/.test(managerHtml)));
console.log(`V365 single Procurement main card ${pass}/6 checks passed`);
