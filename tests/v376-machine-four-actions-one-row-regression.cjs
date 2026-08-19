const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'frontend/customers-manager/manager.js'),'utf8');
const adminCss=fs.readFileSync(path.join(root,'frontend/customers-manager/manager.css'),'utf8');
const portal=fs.readFileSync(path.join(root,'frontend/portal-tools.js'),'utf8');
const theme=fs.readFileSync(path.join(root,'frontend/belm-theme.css'),'utf8');
let pass=0,total=0;function t(name,ok){total++;if(!ok){console.error('FAIL',name);process.exitCode=1;}else{pass++;console.log('PASS',name);}}
t('admin visible machine actions are Report Check Up Service Parts Job Card', ['Report','Check Up','Service Parts','>Job Card</a>'].every(x=>admin.includes(x)));
t('admin Job Card keeps Engineering route', admin.includes('/engineering-manager/?machine=${encodeURIComponent(machine.id)}#job-cards">Job Card</a>'));
t('admin actions are four columns', adminCss.includes('#machineListDialog .machine-card .machine-actions')&&adminCss.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
t('customer direct actions use requested labels', ['>Report</button>','>Check Up</button>','>Service Parts</a>','>Job Card</a>'].every(x=>portal.includes(x)));
t('customer direct actions preserve established functions', portal.includes('data-view-operator-reports=')&&portal.includes('data-customer-checkup=')&&portal.includes('/customer-service-request/?machine=')&&portal.includes('/breakdown-workflow/?machine='));
t('customer preferred row order is Report Check Up Service Parts Job Card functions', portal.includes('["operator-reports", "check-up", "service-request", "workflow"]'));
t('customer actions are four columns', theme.includes('.belm-service-due-panel .belm-machine-quick-actions')&&theme.includes('grid-template-columns: repeat(4, minmax(0, 1fr)) !important'));
t('work/job address implementation untouched by this feature', !admin.includes('dispatchLocation') && portal.includes('breakdown-workflow'));
if(!process.exitCode) console.log(`V376 machine four actions regression: ${pass}/${total} PASS`);
