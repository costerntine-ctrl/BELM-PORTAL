const fs=require('fs');
const checks=[];function has(p,ns){const s=fs.readFileSync(p,'utf8');for(const n of ns)checks.push([p+': '+n,s.includes(n)])}
has('frontend/breakdown-workflow/index.html',['Sync Technicians','jobTechSyncStatus']);
{
  const html = fs.readFileSync('frontend/breakdown-workflow/index.html','utf8');
  const m = /workflow\.js\?v=(\d+)-/.exec(html);
  checks.push(['frontend/breakdown-workflow/index.html: workflow.js cache bumped >= v223', !!m && Number(m[1]) >= 223]);
}
has('frontend/breakdown-workflow/workflow.js',['loadJobTechnicians','technicians synced','Technician sync failed','Date.now()']);
has('backend/api/breakdown_workflow.php',["rr.name='Technician'",'user_roles ur','Temporary Technician Override']);
has('backend/api/engineering.php',["rr.name='Technician'",'user_roles ur']);
has('backend/api/service_requests.php',["rr.name='Technician'",'user_roles ur']);
{
  const sw = fs.readFileSync('frontend/belm-sw.js','utf8');
  const m = /CACHE='belm-app-v(\d+)-/.exec(sw);
  checks.push(['frontend/belm-sw.js: cache bumped >= v223', !!m && Number(m[1]) >= 223]);
}
const bad=checks.filter(x=>!x[1]);for(const [n,ok] of checks)console.log((ok?'PASS':'FAIL')+' '+n);console.log(`TOTAL ${checks.length-bad.length}/${checks.length} PASS`);if(bad.length)process.exit(1);
