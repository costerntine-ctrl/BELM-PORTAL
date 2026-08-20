const fs=require('fs'); const path=require('path'); const root=path.resolve(__dirname,'..');
const portal=fs.readFileSync(path.join(root,'frontend/portal-tools.js'),'utf8');
const index=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(portal.includes('["finance", "Finance Report"'),'Finance Report category missing');
ok(portal.includes('async function openCustomerFinanceReport()'),'Finance Report function missing');
ok(portal.includes('/api/customer-portal/analysis'),'Finance analysis endpoint missing');
ok(portal.includes('/api/customer-portal/invoices'),'Finance invoices endpoint missing');
ok(portal.includes('/api/customer-portal/proformas'),'Finance proformas endpoint missing');
ok(portal.includes('Payments received'),'Finance payments summary missing');
ok(portal.includes('Petty Cash balance'),'Finance petty cash summary missing');
ok(portal.includes('Recent Invoices'),'Recent invoices section missing');
ok(portal.includes('Recent Proformas'),'Recent proformas section missing');
ok(portal.includes('if (type === "finance") { dialog.close(); openCustomerFinanceReport(); return; }'),'Finance Report action wiring missing');
ok(index.includes('/portal-tools.js?v=389-customer-finance-report'),'V389 cache bust missing');
console.log('V389 customer Finance Report regression: 11/11 passed');
