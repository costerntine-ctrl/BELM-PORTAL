const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const api=r('backend/api/breakdown_workflow.php');
const js=r('frontend/technician-job-cards/job-cards.js');
const html=r('frontend/technician-job-cards/index.html');
const css=r('frontend/technician-job-cards/job-cards.css');
const sw=r('frontend/belm-sw.js');
const checks=[
  ['technician page shows logged-in technician name',html.includes('id="techIdentity"')&&js.includes('technicianName')&&js.includes('identity.textContent=technicianName')],
  ['technician job API self-heals source request assignment',api.includes('V342 self-heal')&&api.includes("sr.assigned_to_id=?")&&api.includes('j.technician_id IS NULL')],
  ['recovered job card becomes assigned',api.includes("IN ('OPEN','RECEIVED') THEN 'ASSIGNED'")],
  ['technician jobs fallback reads service request assignment',api.includes('sr_fix.assigned_to_id=?')],
  ['technician jobs returns assignee identity',api.includes("$row['assignedTechnicianName']")&&api.includes('j.technician_id,j.technician_name')],
  ['assigned-job authorization self-heals safely',api.includes('legacy/interrupted Service Request sync')&&api.includes("WHERE id=? AND technician_id IS NULL")],
  ['explicit different technician is not overwritten',api.includes("if ($actorId !== '' && $jobTechId === '' && !empty($job['id']))")],
  ['empty state names the logged-in technician',js.includes('No active Job Cards assigned to ${esc(technicianName)}')],
  ['job card heading includes technician name',js.includes('Technician: ${esc(assignedName)}')],
  ['technician identity has responsive styling',css.includes('.tech-identity')&&css.includes('.hero{align-items:stretch;flex-direction:column}')],
  ['technician assets cache-busted',/v=(342-technician-assignment-sync|343-mobile-field-dispatch)/.test(html)],
  ['service worker bumped to v342',/belm-app-v(342-technician-job-card-visibility|343-mobile-field-dispatch|344-proforma-direct-generate)/.test(sw)],
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}
if(fail)process.exit(1);console.log(`V342 checks ${checks.length}/${checks.length} passed.`);
