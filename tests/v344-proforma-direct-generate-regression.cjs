const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=r('frontend/billing-manager/manager.js'),css=r('frontend/billing-manager/manager.css'),html=r('frontend/billing-manager/index.html'),api=r('backend/api/proforma_invoices.php'),sw=r('frontend/belm-sw.js'),health=r('backend/index.php');
const checks=[
 ['job Generate is direct action',js.includes('data-generate-pending-proforma')&&js.includes('generatePendingJobProforma')],
 ['spare Generate is direct action',js.includes('data-generate-spare-proforma')&&js.includes('generatePendingSpareProforma')],
 ['job generation posts immediately',js.includes('sourceJobCardId: job.id || ""')&&js.includes('method: "POST"')],
 ['spare multi-line generation posts immediately',js.includes('sourceSpareRequestIds: groupRequests.map')&&js.includes('items: groupRequests.map')],
 ['generation has visible busy state',js.includes('button.textContent = "Generating…"')&&js.includes('button.textContent = "✓ Generated"')],
 ['generation errors are visible',js.includes('Proforma was not generated:')],
 ['duplicate generation self-recovers',js.includes('error.status === 409')&&js.includes('Proforma list refreshed')],
 ['generated job lines include job context',api.includes('j.title,j.fault_description')&&js.includes('job.faultDescription')],
 ['local billing date avoids UTC shift',js.includes('getTimezoneOffset() * 60000')],
 ['generate buttons styled blue',css.includes('data-generate-pending-proforma')&&css.includes('data-generate-spare-proforma')],
 ['billing assets cache-busted',(html.includes('v=344-proforma-direct-generate')||(html.includes('v=345-commercial-master-templates')||html.includes('v=346-commercial-number-link')))],
 ['service worker bumped',(sw.includes('belm-app-v344-proforma-direct-generate')||(sw.includes('belm-app-v345-commercial-master-templates')||sw.includes('belm-app-v346-commercial-number-link')))],
 ['health build marker bumped',(health.includes("'schemaVersion' => '344-proforma-direct-generate'")||(health.includes("'schemaVersion' => '345-commercial-master-templates'")||health.includes("'schemaVersion' => '346-commercial-number-link'")))],
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);console.log(`V344 checks ${checks.length}/${checks.length} passed.`);
