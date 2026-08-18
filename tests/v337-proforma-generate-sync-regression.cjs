const fs=require('fs');const path=require('path');const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');let n=0;function t(name,ok){n++;if(!ok){console.error('FAIL',name);process.exitCode=1}else console.log('PASS',name)}
const pro=read('backend/api/proforma_invoices.php');const manager=read('frontend/billing-manager/manager.js');const html=read('frontend/billing-manager/index.html');const sw=read('frontend/belm-sw.js');const health=read('backend/index.php');
t('pending queue recovers Service Request assignment',pro.includes("LEFT JOIN service_requests sr")&&pro.includes("COALESCE(j.technician_id,sr.assigned_to_id)"));
t('legacy received/open assigned jobs become Proforma pending',pro.includes("IN ('OPEN','RECEIVED','ASSIGNED','IN_PROGRESS','WAITING_PARTS','TESTING','COMPLETED')")&&pro.includes("THEN 'PROFORMA_PENDING'"));
t('pending endpoint explains readiness blockers',pro.includes('Complete Technician Job Card')&&pro.includes('Complete Workshop testing')&&pro.includes('Upload customer-signed Job Card'));
t('ready pending row generates the JC code',manager.includes('Generate ${escapeHtml(job.proformaCode||job.jobCardNo)}'));
t('billing honors proforma deep link',manager.includes('function requestedBillingTab()')&&manager.includes("activateBillingTab(requestedBillingTab())"));
t('save remains on Proforma tab and confirms code',manager.includes("activateBillingTab('proformas')")&&manager.includes('generated and synchronized'));
t('create API returns source Job Card sync metadata',pro.includes("'sourceJobCardId' => $sourceJobCardId")&&pro.includes("'billingStatus' => $sourceJobCardId"));
t('billing assets cache version is current',/manager\.js\?v=(337-proforma-generate-sync|341-proforma-invoice-flow|344-proforma-direct-generate)/.test(html)&&/manager\.css\?v=(337-proforma-generate-sync|341-proforma-invoice-flow|344-proforma-direct-generate)/.test(html));
t('service worker and health are V337',sw.includes('belm-app-v337-proforma-generate-sync')&&health.includes("'schemaVersion' => '337-proforma-generate-sync'"));
if(!process.exitCode)console.log(`V337 checks passed ${n}/${n}`);
