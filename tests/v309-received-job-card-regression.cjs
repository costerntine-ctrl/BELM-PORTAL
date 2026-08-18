const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
let pass=0, fail=0;
function test(name, ok){ if(ok){console.log('PASS',name);pass++;}else{console.error('FAIL',name);fail++;} }
const api=read('backend/api/engineering.php');
const js=read('frontend/breakdown-workflow/workflow.js');
const html=read('frontend/engineering-manager/index.html');
const health=read('backend/index.php');
const sw=read('frontend/belm-sw.js');
test('V328 dispatch lists active received and assigned Job Cards', !api.includes("AND j.technician_id IS NULL\n           AND NULLIF(TRIM(COALESCE(j.technician_name,'')),'') IS NULL") && api.includes("UPPER(COALESCE(j.issued_by_type,''))='CUSTOMER'"));
test('customer-managed customer-issued Job Cards are no longer excluded', !api.includes("c.is_machinery_admin=0 AND UPPER(COALESCE(j.issued_by_type,''))='CUSTOMER'") && !api.includes('belongs to a customer-managed workshop and was not received by BELM'));
test('backend only receives customer-issued or service-request Job Cards', api.includes('Only Customer-issued or Service Request Job Cards can be received through Technician Dispatch.'));
test('already-assigned Job Card can be selected for explicit reassignment', !api.includes('This Job Card is already assigned. Use Job Card handover/reassignment instead.') && api.includes('$assignmentChanged=$wasAlreadyAssigned'));
test('received list can filter by selected customer', js.includes('dispatchJobCards.filter(job=>!customerId||String(job.customerId)===String(customerId))'));
test('customer selector remains enabled in received mode', !js.includes("dispatchCustomer').disabled=true"));

test('V309 customer-filter logic retained even though V317 removed dispatch landing UI', js.includes('dispatchJobCards.filter(job=>!customerId||String(job.customerId)===String(customerId))') && !html.includes('id="dispatchPanel"'));
test('selecting received Job Card auto syncs customer', js.includes("customer.value=job.customerId||''"));
test('V317 intentionally removes received Job Card dispatch helper from Engineering landing UI', !html.includes('Select customer first to filter.') && !html.includes('id="refreshReceivedJobCards"'));
test('V309 engineering cache bust is present', html.includes('v=309-received-job-card'));
test('V309 health schema version is present', health.includes('309-received-job-card-dispatch'));
test('V309 service worker cache bumped', sw.includes('belm-app-v309-received-job-card-dispatch'));
console.log(`V309 checks: ${pass}/${pass+fail} passed`);
process.exit(fail?1:0);
