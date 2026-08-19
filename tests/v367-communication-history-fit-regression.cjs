const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const manager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
const renderCustomers = manager.match(/function renderCustomers\(\)[\s\S]*?\n  }\n\n  let currentMachineListCustomerName/)?.[0] || '';
t('communication history remains on customer card', renderCustomers.includes('<strong>Communication history</strong>'));
t('customer card still excludes removed contact grid', !renderCustomers.includes('customer-info-grid'));
t('customer card still excludes removed portal-link box', !renderCustomers.includes('portal-link-box'));
t('desktop communication history expands into freed area', /\/\* V367[\s\S]*?\.customer-feed\s*\{[\s\S]*?height:\s*394px;[\s\S]*?min-height:\s*394px;/.test(css));
t('mobile communication history remains usable and bounded', /@media \(max-width: 620px\)[\s\S]*?\.customer-feed\s*\{[\s\S]*?height:\s*320px;[\s\S]*?min-height:\s*320px;/.test(css));
t('customer card width remains compact', css.includes('.customer-card { display: flex; flex-direction: column; width: 370px;'));
t('communication body keeps internal scrolling', /\.customer-feed-body\s*\{[\s\S]*?overflow-y:\s*auto;/.test(css));
t('customer manager CSS cache is bumped for V367', /\/customers-manager\/manager\.css\?v=(367-communication-history-fit|368-customer-contact-lines|371-customer-quick-buttons)/.test(html));
console.log(`V367 communication history fit ${pass}/8 checks passed`);
