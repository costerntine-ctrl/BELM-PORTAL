const fs=require('fs'); const path=require('path'); const root=path.resolve(__dirname,'..');
const portal=fs.readFileSync(path.join(root,'frontend/portal-tools.js'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/belm-theme.css'),'utf8');
const index=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
[
  'Checklist Report','Fuel Consumption Report','Machine Expenses Report','Maintenance Report',
  'Operator Report','Technician Report','Statistics Analysis','Store Keeping'
].forEach(label=>ok(portal.includes(label),`Missing General Report category: ${label}`));
ok(portal.includes('openCustomerGeneralReportCenter()'),'General Report center function missing');
ok(portal.includes('data-customer-report-type'),'General Report category actions missing');
ok(portal.includes('/customer-fuel-usage/'),'Fuel report route missing');
ok(portal.includes('/customer-machine-expenses/'),'Machine expenses report route missing');
ok(portal.includes('openCustomerGeneralAnalysisDialog()'),'Statistics Analysis wiring missing');
ok(portal.includes('openCustomerStoreKeepingReport()'),'Store Keeping report wiring missing');
ok(portal.includes('openCustomerChecklistReport'),'Checklist report detail flow missing');
ok(portal.includes('openCustomerMaintenanceReport'),'Maintenance report detail flow missing');
ok(portal.includes('openOperatorReportsDialog(machine.id, false)'),'Operator report flow missing');
ok(portal.includes('openCustomerTechnicianReport'),'Technician report flow missing');
ok(portal.includes('face.querySelector("[data-customer-face-general-report]")?.addEventListener("click", () => openCustomerGeneralReportCenter());'),'Customer dashboard General Report does not open report center');
ok(css.includes('V388 - Customer General Report Center'),'V388 report-center CSS missing');
ok(css.includes('.belm-customer-report-center-grid'),'Report-center grid CSS missing');
ok(index.includes('/portal-tools.js?v=388-customer-general-report-center'),'V388 portal-tools cache bust missing');
ok(index.includes('/belm-theme.css?v=388-customer-general-report-center'),'V388 CSS cache bust missing');
console.log('V388 customer General Report center regression: 22/22 passed');
