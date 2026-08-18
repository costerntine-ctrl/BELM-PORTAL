const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
let pass=0,fail=0;function test(n,c){if(c){pass++;console.log('PASS',n)}else{fail++;console.error('FAIL',n)}}
const eng=read('backend/api/engineering.php');
const helpers=read('backend/config/helpers.php');
const bw=read('backend/api/breakdown_workflow.php');
const sr=read('backend/api/service_requests.php');
const schema=read('backend/schema.sql');
const migrate=read('backend/scripts/migrate.php');
const js=read('frontend/breakdown-workflow/workflow.js');
const html=read('frontend/engineering-manager/index.html');
const health=read('backend/index.php');
const sw=read('frontend/belm-sw.js');
test('unassigned active cards migrate to RECEIVED',schema.includes("SET status='RECEIVED'")&&schema.includes("status IN ('OPEN','ASSIGNED')")&&schema.includes("technician_id IS NULL"));
test('legacy assigned OPEN cards migrate to ASSIGNED',schema.includes("SET status='ASSIGNED'")&&schema.includes("technician_id IS NOT NULL"));
test('service-request cards are created RECEIVED',helpers.includes("VALUES (?,?,?,?,?,?,?,'RECEIVED'"));
test('sync assignment advances RECEIVED to ASSIGNED',helpers.includes("WHEN ?='ASSIGNED' AND status IN ('OPEN','RECEIVED') THEN 'ASSIGNED'"));
test('sync unassign returns card to RECEIVED',helpers.includes("status='RECEIVED'")&&helpers.includes("status IN ('OPEN','RECEIVED','ASSIGNED')"));
test('breakdown card initial status depends on technician',bw.includes("$initialJobStatus=$techId!==''?'ASSIGNED':'RECEIVED'"));
test('dispatch list keeps RECEIVED/OPEN plus legacy unassigned ASSIGNED compatibility',eng.includes("IN ('RECEIVED','OPEN','ASSIGNED')")&&eng.includes('j.technician_id IS NULL'));
test('dispatch assignment marks same Job Card ASSIGNED',eng.includes("status='ASSIGNED',priority=?"));
test('service request rules accept RECEIVED pre-start lifecycle',sr.includes("['OPEN','RECEIVED']")&&sr.includes("['OPEN','RECEIVED','ASSIGNED']"));
test('pre-start unassign returns ASSIGNED card to RECEIVED without allowing silent handover',sr.includes("['OPEN','RECEIVED','ASSIGNED']")&&sr.includes('Change Technician from Job Card Dispatch'));
test('dispatch dropdown visibly labels each card by actual lifecycle status',js.includes("const status=String(job.dispatchStatus||job.status||'RECEIVED').toUpperCase()")&&js.includes('${status} · ${job.jobCardNo}'));
test('dispatch helper text explains waiting and assigned counts',js.includes('${waiting} waiting, ${assigned} assigned')&&js.includes('Assigned cards are selectable'));
test('migration logs V312 normalization',migrate.includes('V312 Job Card lifecycle normalized'));
test('health schema is V312',(() => { const m = /'schemaVersion' => '(\d+)-/.exec(health); return m && Number(m[1]) >= 312; })());
test('service worker cache is V312',(() => { const m = /const CACHE='belm-app-v(\d+)-/.exec(sw); return m && Number(m[1]) >= 312; })());
console.log(`V312 checks: ${pass}/${pass+fail} passed`);process.exit(fail?1:0);
