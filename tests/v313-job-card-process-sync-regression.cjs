const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const bw=r('backend/api/breakdown_workflow.php'),eng=r('backend/api/engineering.php'),h=r('backend/config/helpers.php'),mig=r('backend/scripts/migrate.php'),js=r('frontend/breakdown-workflow/workflow.js'),css=r('frontend/breakdown-workflow/workflow.css');let p=0,f=0;function t(n,o){console.log((o?'PASS ':'FAIL ')+n);o?p++:f++;}
t('explicit assigned stage exists',bw.includes("'JOB_CARD_ASSIGNED' => ['department' => 'Technician'"));
t('breakdown generated assigned card stops at assigned',bw.includes("bw_set_stage($caseId,'JOB_CARD_ASSIGNED'"));
t('engineering dispatch stops at assigned',eng.includes("current_stage='JOB_CARD_ASSIGNED'"));
t('service request sync stops at assigned',h.includes("$newStage='JOB_CARD_ASSIGNED'"));
t('in progress can leave assigned stage',h.includes("'JOB_CARD_ASSIGNED','DIAGNOSIS'"));
t('deploy migration leaves assigned process state untouched',!mig.includes("SET current_stage='JOB_CARD_ASSIGNED'")&&mig.includes('DATA_SAFETY_BLOCK'));
t('main job card visible in overview',js.includes('MAIN JOB CARD')&&js.includes('main-job-card'));
t('job process visible',js.includes('MAIN JOB CARD PROCESS'));
t('process includes received assigned in-progress spares testing completed',['Received','Assigned','In Progress','Spares','Testing','Completed'].every(x=>js.includes(x)));
t('request spare sits inside job process',js.includes('job-process-actions')&&js.includes('id="requestSpare"'));
t('spare request is tied to active main job card',js.includes("jobCardId:document.getElementById('spareForm').dataset.jobCardId"));
t('main job card has download PDF',js.includes('Download Main Job Card PDF'));
t('process has responsive CSS',css.includes('.job-process-steps')&&css.includes('@media(max-width:760px)'));
console.log(`V313 checks: ${p}/${p+f}`);process.exit(f?1:0);