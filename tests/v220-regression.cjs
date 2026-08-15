const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const helpers=read('backend/config/helpers.php');
const bw=read('backend/api/breakdown_workflow.php');
const cp=read('backend/api/customer_portal.php');
const sr=read('backend/api/service_requests.php');
const cr=read('backend/api/checklist_reports.php');
const html=read('frontend/breakdown-workflow/index.html');
const js=read('frontend/breakdown-workflow/workflow.js');
const sw=read('frontend/belm-sw.js');
const checks=[
 ['service request ensure helper',helpers.includes('belm_ensure_breakdown_case_from_service_request')],
 ['idempotent source uniqueness key',helpers.includes("source_type='SERVICE_REQUEST' AND source_id=?")],
 ['backfill source sync helper',helpers.includes('belm_sync_breakdown_sources')],
 ['service status state sync',helpers.includes("$status === 'ASSIGNED'")&&helpers.includes("$status === 'IN_PROGRESS'")],
 ['service final closes case',helpers.includes("['COMPLETED','CANCELLED']")],
 ['customer support creation sync',cp.includes('belm_sync_breakdown_case_from_service_request($newId')],
 ['customer cancellation sync',cp.includes('belm_sync_breakdown_case_from_service_request($sub2')],
 ['belm service status sync',sr.includes('belm_sync_breakdown_case_from_service_request((string)$id')],
 ['operator resolution sync admin',sr.includes('belm_sync_breakdown_sources((string)$report[\'customer_id\'])')],
 ['operator resolution sync tech',cr.includes('belm_sync_breakdown_sources((string)$machine[\'customer_id\'])')],
 ['sync endpoint',bw.includes("$action === 'sync'")],
 ['provider off support exception',bw.includes("c.is_machinery_admin=0 OR bc.source_type=\\'SERVICE_REQUEST\\'")],
 ['customer tech provider gating',bw.includes("$where[]='c.is_machinery_admin=1'")],
 ['source fields in API',bw.includes("'sourceType'=>$row['source_type']")],
 ['breakdown close source sync',bw.includes('Completed from Breakdown Process')],
 ['support job card report scope',bw.includes("bcj.source_type='SERVICE_REQUEST'")],
 ['support performance scope',bw.includes("bc.source_type='SERVICE_REQUEST'")],
 ['sync refresh UI',html.includes('Sync / Refresh')&&html.includes('syncStatus')],
 ['source badges UI',js.includes('BELM SUPPORT')&&js.includes('PROBLEM REPORT')],
 ['frontend calls sync',js.includes("api('/sync')")],
 ['cache bumped',/CACHE='belm-app-v(\d+)-/.exec(sw) && Number(/CACHE='belm-app-v(\d+)-/.exec(sw)[1]) >= 220],
];
let bad=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)bad++;}
if(bad){console.error(`${bad} V220 checks failed`);process.exit(1)}
console.log(`${checks.length}/${checks.length} V220 checks passed`);
