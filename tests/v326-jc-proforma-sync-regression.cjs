const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const html=read('frontend/breakdown-workflow/index.html');const js=read('frontend/breakdown-workflow/workflow.js');const css=read('frontend/breakdown-workflow/workflow.css');const eng=read('backend/api/engineering.php');const pro=read('backend/api/proforma_invoices.php');const billing=read('frontend/billing-manager/manager.js');const bcss=read('frontend/billing-manager/manager.css');const health=read('backend/index.php');const sw=read('frontend/belm-sw.js');
t('compact received Job Card field exists',html.includes('workflow-received-card-field')&&css.includes('compact received Job Card intake'));
t('JC Number Proforma field has requested instruction',html.includes('JC Number / Proforma Code')&&html.includes('Fill the received JC Number to assign technician'));
t('received selection auto fills JC code',js.includes('syncDispatchJcNumberFromSelection')&&js.includes('jc-auto-detected'));
t('manual JC code can resolve received Job Card',js.includes('resolveDispatchJobCardNumber')&&eng.includes('JC Number / Proforma Code was not found'));
t('dispatch posts JC number',js.includes('jobCardNo,technicianId')&&eng.includes("$jobCardNoInput"));
t('dispatch sets Proforma pending status',eng.includes("'PROFORMA_PENDING'")&&eng.includes("'proformaStatus'=>'PENDING'"));
t('pending Proforma endpoint exists',pro.includes("$action === 'pending-job-cards'")&&pro.includes("$row['proforma_code']=$row['job_card_no']"));
t('billing loads pending Proforma queue',billing.includes('/proforma-invoices?action=pending-job-cards')&&billing.includes('Pending Job Card Proformas'));
t('pending queue can prepare detected Job Card Proforma',billing.includes('preparePendingJobProforma')&&billing.includes('proformaSourceJobCardId'));
t('Job Card number becomes Proforma invoice code',pro.includes("$invoiceNo = $sourceJobCardId !== '' && $sourceJobCardNo !== ''")&&pro.includes('? $sourceJobCardNo'));
t('pending queue styled',bcss.includes('V326 pending Job Card Proforma queue')&&bcss.includes('.pending-proforma-status'));
t('cache and health bumped to V326',health.includes('326-jc-proforma-sync')&&sw.includes('belm-app-v326-jc-proforma-sync'));
if(!process.exitCode)console.log(`V326 checks passed ${n}/${n}`);
