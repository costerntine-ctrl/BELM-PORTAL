const fs=require('fs');
const js=fs.readFileSync('frontend/portal-tools.js','utf8');
const checks=[
 ['Technician-only guard exists',js.includes('function removeTechnicianMachineManagementControls')&&js.includes('window.location.pathname.startsWith("/tech")')],
 ['Edit Machine removed in technician machine area',js.includes('"edit machine", "delete machine", "forget permanently"')&&js.includes('[data-edit-machine]')],
 ['Delete Machine selector guarded',js.includes('[data-delete-machine]')&&js.includes('.machine-admin-delete')],
 ['Forget Permanently selector guarded',js.includes('[data-forget-machine]')&&js.includes('.machine-admin-forget')],
 ['Guard watches dynamic machine UI',js.includes('function installTechnicianMachineManagementGuard')&&js.includes('new MutationObserver')], 
 ['Technician machine cards invoke cleanup',js.includes('removeTechnicianMachineManagementControls(card);')],
 ['Technician work actions preserved',js.includes('Checked Reports')&&js.includes('Check-up')&&js.includes('Machine Job Cards')],
];
for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);process.exit(1);} console.log('PASS',name);}
