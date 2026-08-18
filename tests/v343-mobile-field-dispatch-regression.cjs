const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');const r=p=>fs.readFileSync(path.join(root,p),'utf8');
const schema=r('backend/schema.sql');
const eng=r('backend/api/engineering.php');
const api=r('backend/api/breakdown_workflow.php');
const helpers=r('backend/config/helpers.php');
const wfHtml=r('frontend/breakdown-workflow/index.html');
const wfJs=r('frontend/breakdown-workflow/workflow.js');
const techHtml=r('frontend/technician-job-cards/index.html');
const techJs=r('frontend/technician-job-cards/job-cards.js');
const techCss=r('frontend/technician-job-cards/job-cards.css');
const sw=r('frontend/belm-sw.js');
const checks=[
 ['job card schema carries location',schema.includes('ADD COLUMN IF NOT EXISTS job_location VARCHAR(500)')],
 ['service request card snapshots customer address',helpers.includes('c.address AS customer_address')&&helpers.includes('job_location=COALESCE')],
 ['dispatch options expose customer address',eng.includes('SELECT id,name,address,is_machinery_admin FROM customers')],
 ['dispatch card returns job location',eng.includes("$job['jobLocation']")&&eng.includes('j.due_date,j.job_location')],
 ['dispatch accepts and saves job location',eng.includes("$jobLocationInput")&&eng.includes("job_location=COALESCE(NULLIF(?,''),job_location)")],
 ['new dispatch card saves location',eng.includes('due_date,job_location,generated_by_name')],
 ['assignment email contains maps navigation',eng.includes('google.com/maps/dir/?api=1&destination=')],
 ['dispatch UI has job site field',wfHtml.includes('id="dispatchLocation"')&&wfHtml.includes('Job site / location')],
 ['dispatch UI submits job location',wfJs.includes("jobLocation:document.getElementById('dispatchLocation')")],
 ['technician API returns portable location',api.includes("$row['jobLocation']")&&api.includes('c.address AS customer_address')],
 ['technician UI provides navigation',techJs.includes('Navigate to Job')&&techJs.includes('google.com/maps/dir/?api=1&destination=')],
 ['technician location is responsive',techCss.includes('.job-location')&&techCss.includes('.job-location .navigate')],
 ['job card PDF shows location',api.includes("['Job Location'")],
 ['technician assets cache-busted',techHtml.includes('v=343-mobile-field-dispatch')],
 ['workflow assets cache-busted',wfHtml.includes('v=343-mobile-field-dispatch')],
 ['service worker bumped',(sw.includes('belm-app-v343-mobile-field-dispatch')||sw.includes('belm-app-v344-proforma-direct-generate'))],
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++;}if(fail)process.exit(1);console.log(`V343 checks ${checks.length}/${checks.length} passed.`);
