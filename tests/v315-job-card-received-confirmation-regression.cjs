const fs=require('fs');
const r=p=>fs.readFileSync(p,'utf8');let p=0,f=0;function t(n,o){console.log((o?'PASS ':'FAIL ')+n);o?p++:f++;}
const cp=r('backend/api/customer_portal.php'),sr=r('backend/api/service_requests.php'),req=r('frontend/customer-service-request/request.js'),mgr=r('frontend/service-request-manager/manager.js'),wf=r('frontend/breakdown-workflow/workflow.js'),bill=r('frontend/customer-machine-expenses/expenses.js'),health=r('backend/index.php'),sw=r('frontend/belm-sw.js');
t('submit response includes linked Job Card receipt',cp.includes("'jobCard' => $jobReceipt")&&cp.includes("'receivedByBelm' => true"));
t('customer submit visibly confirms received by BELM',req.includes('JOB CARD RECEIVED BY BELM:'));
t('service request API exposes linked Job Card',sr.includes("'jobCard'] = !empty($r['linked_job_card_id'])")&&sr.includes("linked_job_card_received_at"));
t('engineering service request card shows receipt banner',mgr.includes('JOB CARD RECEIVED BY BELM')&&mgr.includes('JOB CARD RECEIPT NOT CONFIRMED'));
t('workflow first step says Received by BELM',wf.includes("['RECEIVED','Received by BELM']"));
t('workflow shows explicit BELM receipt',wf.includes('BELM Receipt')&&wf.includes('RECEIVED BY BELM'));
t('customer billing shows BELM receipt',bill.includes('RECEIVED BY BELM')&&bill.includes('Current:'));
t('health schema V315',health.includes("'schemaVersion' => '315-job-card-received-confirmation'"));
t('service worker cache V315',sw.includes("belm-app-v315-job-card-received-confirmation"));
console.log(`V315 checks: ${p}/${p+f} passed`);process.exit(f?1:0);
