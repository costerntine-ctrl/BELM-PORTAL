const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const html=read('frontend/breakdown-workflow/index.html');const js=read('frontend/breakdown-workflow/workflow.js');const eng=read('backend/api/engineering.php');const health=read('backend/index.php');const sw=read('frontend/belm-sw.js');
t('dispatch selector labels received and assigned Job Cards',html.includes('Received / Assigned Job Card')&&html.includes('Select Existing Job Card'));
t('dispatch API no longer filters out already assigned cards',eng.includes("IN ('RECEIVED','OPEN','ASSIGNED')")&&!eng.includes("AND j.technician_id IS NULL\n           AND NULLIF(TRIM(COALESCE(j.technician_name,'')),'') IS NULL"));
t('dispatch API returns all active cards with compatibility alias',eng.includes("'jobCards'=>$receivedJobCards")&&eng.includes("'receivedJobCards'=>$receivedJobCards"));
t('dispatch API exposes assigned and waiting counts',eng.includes("'assignedJobCards'=>$assignedJobCards")&&eng.includes("'totalJobCards'=>count($receivedJobCards)"));
t('assigned Job Cards show actual status and Technician in selector',js.includes("const assigned=job.technicianName?` · Technician: ${job.technicianName}`:''")&&js.includes("const status=String(job.dispatchStatus||job.status||'RECEIVED').toUpperCase()"));
t('selecting assigned Job Card can preselect its Technician',js.includes("if(technician&&job.technicianId&&dispatchTechnicians.some")&&js.includes('technician.value=job.technicianId'));
t('reassignment requires explicit confirmation in UI',js.includes('Reassign it to ${tech?.name')&&js.includes('const reassigning='));
t('backend permits assigned-card reassignment and records previous Technician',eng.includes('$assignmentChanged=$wasAlreadyAssigned')&&eng.includes('reassigned from '));
t('manual JC lookup includes assigned Job Cards',eng.includes('active received/assigned Job Cards')&&!eng.includes('waiting for Technician assignment. Refresh or check the code.'));
t('success response tells UI whether card was reassigned',eng.includes("'reassigned'=>($assignmentChanged??false)")&&js.includes("result.reassigned?'reassigned':'assigned/confirmed'"));
t('V328 workflow assets are cache-busted',(/workflow\.js\?v=(328-assigned-job-card-select|329-action-feedback-reset)/.test(html))&&(/workflow\.css\?v=(328-assigned-job-card-select|329-action-feedback-reset)/.test(html)));
t('health and service worker identify V328',(/(328-assigned-job-card-select|329-action-feedback-reset)/.test(health))&&(/belm-app-v(328-assigned-job-card-select|329-action-feedback-reset)/.test(sw)));
if(!process.exitCode)console.log(`V328 checks passed ${n}/${n}`);
