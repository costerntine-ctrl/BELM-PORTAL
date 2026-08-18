const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const js=read('frontend/breakdown-workflow/workflow.js');
const php=read('backend/api/breakdown_workflow.php');
const html=read('frontend/breakdown-workflow/index.html');
const sw=read('frontend/belm-sw.js');
const health=read('backend/index.php');
t('normalizeJobCard keeps technician camel and snake aliases aligned',js.includes('technicianId,technician_id:technicianId,technicianName,technician_name:technicianName'));
t('assigned Main Job Card label shows Assigned Technician',js.includes("mainJobTechnicianName?'Assigned Technician':'Assign Technician'"));
t('assigned Technician is the selected option before roster sync finishes',js.includes("mainJobTechnicianName+' · ASSIGNED'")&&js.includes('data-current-technician-name'));
t('status line names the assigned Technician',js.includes('Assigned to ${esc(mainJobTechnicianName)}'));
t('roster sync preserves assigned selection',js.includes("let options=currentId?`<option value=\"${esc(currentId)}\">${esc((currentName||'Current Technician')+' · ASSIGNED')}</option>`"));
t('case API resolves account name when Job Card copied name is blank',php.includes('u.name AS technician_account_name')&&php.includes("$jobTechName=trim((string)($jobRow['technician_account_name'] ?? ''))"));
t('legacy Service Request assignment is exposed to assigned Job Card',php.includes("$jobRow['technician_assignment_source']='SERVICE_REQUEST'")&&php.includes("in_array($jobState,['ASSIGNED','IN_PROGRESS'],true)"));
t('case API returns both technician naming conventions',php.includes("$jobRow['technicianId']=$jobTechId")&&php.includes("$jobRow['technicianName']=$jobTechName"));
t('workflow assets are cache busted to V336',html.includes('workflow.js?v=336-assigned-tech-name')&&html.includes('workflow.css?v=336-assigned-tech-name'));
t('service worker and health version are V336 or newer',/belm-app-v3\d+/.test(sw)&&/schemaVersion' => '3\d+/.test(health));
if(!process.exitCode)console.log(`V336 checks passed ${n}/${n}`);
