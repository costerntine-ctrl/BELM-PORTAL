const fs=require('fs');
const checks=[];function has(p,ns){const s=fs.readFileSync(p,'utf8');for(const n of ns)checks.push([p+': '+n,s.includes(n)])}
has('frontend/breakdown-workflow/index.html',['Sync Technicians','jobTechSyncStatus','v=223-tech-sync']);
has('frontend/breakdown-workflow/workflow.js',['loadJobTechnicians','technicians synced','Technician sync failed','Date.now()']);
has('backend/api/breakdown_workflow.php',["rr.name='Technician'",'user_roles ur','Temporary Technician Override']);
has('backend/api/engineering.php',["rr.name='Technician'",'user_roles ur']);
has('backend/api/service_requests.php',["rr.name='Technician'",'user_roles ur']);
has('frontend/belm-sw.js',['belm-app-v223-technician-sync']);
const bad=checks.filter(x=>!x[1]);for(const [n,ok] of checks)console.log((ok?'PASS':'FAIL')+' '+n);console.log(`TOTAL ${checks.length-bad.length}/${checks.length} PASS`);if(bad.length)process.exit(1);
