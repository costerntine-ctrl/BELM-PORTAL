const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let pass=0,fail=0;
function test(name,ok){if(ok){console.log('PASS',name);pass++;}else{console.error('FAIL',name);fail++;}}
const helpers=read('backend/config/helpers.php');
const settings=read('backend/api/settings.php');
const migrate=read('backend/scripts/migrate.php');
const schema=read('backend/schema.sql');
const render=read('render.yaml');
const service=read('backend/api/service_requests.php');
const bw=read('backend/api/breakdown_workflow.php');
const billing=read('backend/api/billing.php');
const proforma=read('backend/api/proforma_invoices.php');
const customer=read('backend/api/customer_portal.php');
const engineering=read('backend/api/engineering.php');
const portal=read('frontend/portal-tools.js');
const tech=read('frontend/technician-job-cards/job-cards.js');
const health=read('backend/index.php');
const auth=read('backend/api/auth.php');
const receipts=read('backend/api/receipts.php');
const trash=read('backend/api/trash.php');
const sw=read('frontend/belm-sw.js');

test('health requires schema and admin readiness',/\$healthReady\s*=\s*\$schemaReady\s*&&\s*\$adminReady/.test(health)&&health.includes('$healthReady ? 200 : 503')&&/'schemaVersion' => '(\d+)-/.exec(health)&&Number(/'schemaVersion' => '(\d+)-/.exec(health)[1])>=306);
test('service unassign returns breakdown stage when no technician',/\$status\s*===\s*'OPEN'.*empty\(\$row\['assigned_to_id'\]\)/s.test(helpers)&&helpers.includes("'DIAGNOSIS'")&&helpers.includes("newStage='TECHNICIAN_ASSIGNMENT'"));
test('active service request cannot be silently unassigned',service.includes('Only an Open/Assigned Service Request can be unassigned'));
test('cancelled service request closes unfinished Job Card',helpers.includes("status=CASE WHEN status='COMPLETED' THEN status ELSE 'CANCELLED' END"));
test('service completion requires linked completed Job Card',service.includes('belm_sync_breakdown_case_from_service_request')&&service.includes("if ($jobStatus !== 'COMPLETED')"));
test('final service request cannot be reopened',service.includes('A completed/cancelled Service Request cannot be reopened'));

test('technician Job Card guard exists',bw.includes('function bw_require_assigned_job'));
test('technician full case/list blocked',bw.includes('full Maintenance Process detail is restricted')&&bw.includes('full Maintenance Process list is restricted'));
test('technician cannot issue Job Cards',bw.includes('Technicians cannot issue Job Cards. Workshop/Administration must issue and assign them.'));
test('technician cannot manage main stages',bw.includes('main Maintenance Process stages are restricted'));
test('technician cannot manage Store/Procurement statuses',bw.includes('Store/Procurement status is managed by authorized departments'));
test('technician cannot view machine-wide Job Card history',bw.includes('Technicians can view only their assigned Job Cards in My Job Cards.')&&bw.includes('Technicians can download only their assigned Job Card/Report PDFs.'));
test('technician cannot view department performance',bw.includes('not department performance'));
test('technician spare request validates case and assignment',bw.includes('A Technician spare request must come from an assigned Job Card')&&bw.includes('does not belong to this maintenance case')&&bw.includes('bw_require_assigned_job($ctx,$jobForSpare)'));
test('job report cannot self-claim an unassigned Job Card',bw.includes('bw_require_assigned_job($ctx,$job)')&&!bw.includes('technician_id=COALESCE(technician_id,?)'));
test('job PDF requires assigned Job Card for technician',bw.includes("$action === 'job-card-pdf'")&&bw.includes("bw_case_access($ctx,$job['case_id']); bw_require_assigned_job($ctx,$job);"));

test('dispatch list excludes completed and cancelled Job Cards',engineering.includes("j.status IN ('RECEIVED','OPEN')")&&engineering.includes("bc.status <> 'COMPLETED'"));
test('dispatch refuses final Job Cards/cases',engineering.includes("['COMPLETED','CANCELLED']")&&engineering.includes("$job['case_status'])==='COMPLETED'"));

test('customer outstanding debt uses remaining invoice balance',customer.includes('SUM(GREATEST(i.total-COALESCE(pay.paid,0),0))'));
test('customer outstanding debt excludes cancelled/deleted invoices',customer.includes("i.deleted_at IS NULL AND i.status<>'CANCELLED'"));
test('invoice source machine must match Job Card',billing.includes('Selected machine does not match the source Job Card.'));
test('invoice waits for completed closed signed Service Job Card',billing.includes('customer signed-copy upload before invoicing'));
test('duplicate active invoice creation blocked',billing.includes('An active Invoice already exists for this Job Card'));
test('duplicate source invoice relink on edit blocked',billing.includes('Another active Invoice already exists for this Job Card'));
test('proforma source machine and signoff enforced',proforma.includes('Selected machine does not match the source Job Card.')&&proforma.includes('customer signed-copy upload before preparing a Proforma'));
test('duplicate active proforma blocked',proforma.includes('An active Proforma already exists for this Job Card'));
test('proforma spare request machine must match selection',proforma.includes('Selected machine does not match the source spare request.'));
test('receipt invoice must belong to selected customer',receipts.includes('Selected invoice does not belong to the selected customer.'));
test('cancelled invoice cannot receive receipt payment',receipts.includes('A cancelled invoice cannot receive a Receipt/payment.'));
test('recycle bin maps receipt and controller pinout',trash.includes("'receipt' => 'receipts'")&&trash.includes("'controllerPinout' => 'controller_pinouts'"));
test('authoritative Job Card billing recompute exists',helpers.includes('function belm_recompute_job_billing_status')&&helpers.includes('INVOICE_OUTSTANDING')&&helpers.includes('PROFORMA_SENT')&&helpers.includes('READY_FOR_PROCUREMENT'));
test('restoring billing documents resyncs Job Card billing status',trash.includes("$entry['entity_type'] === 'invoice'")&&trash.includes("$entry['entity_type'] === 'proformaInvoice'")&&trash.includes('belm_recompute_job_billing_status($linkedJobId)'));
test('restore blocks duplicate active Invoice or Proforma',trash.includes('Cannot restore this Invoice because another active Invoice already exists')&&trash.includes('Cannot restore this Proforma because another active Proforma already exists'));
test('invoice/proforma deletion recomputes Job Card billing state',billing.includes('belm_recompute_job_billing_status')&&proforma.includes('belm_recompute_job_billing_status'))

test('known default action PINs removed from runtime fallbacks',helpers.includes("belm_read_stored_pin('adminDeletePin', '')")&&helpers.includes("belm_read_stored_pin('adminEditPin', '')"));
test('schema does not seed public 1234 delete PIN',!schema.includes("'adminDeletePin',\n  '\"1234\"'::jsonb"));
test('migration replaces missing/legacy action PIN securely',migrate.includes('INITIAL_ADMIN_ACTION_PIN')&&migrate.includes("['adminEditPin' => '2026', 'adminDeletePin' => '1234']"));
test('Render requests initial action PIN secret',render.includes('INITIAL_ADMIN_ACTION_PIN')&&render.includes('sync: false'));
test('settings GET does not expose action PINs',settings.includes("NOT IN ('adminEditPin','adminDeletePin')"));
test('generic settings PUT cannot overwrite action PINs',settings.includes('Security PINs can only be changed through the protected change-PIN action'));
test('PIN verifier is rate limited',settings.includes("assert_not_rate_limited('delete-pin-verify'")&&settings.includes("record_failed_attempt('delete-pin-verify'"));
test('password reset code is account-specific',schema.includes('password_reset_codes ADD COLUMN IF NOT EXISTS account_id')&&health.includes("['password_reset_codes', 'account_id']")&&auth.includes('account_type, account_id')&&auth.includes('WHERE id = ? AND LOWER(email) = ?'));
test('legacy duplicate reset emails are not guessed',auth.includes('matches LIMIT 2')&&auth.includes('count($matches) === 1'));
test('forgot-password email generation is rate limited',auth.includes("assert_not_rate_limited('forgot-password'")&&auth.includes("record_failed_attempt('forgot-password'"));
test('recovery code can disambiguate legacy accounts safely',auth.includes('foreach ($stmt->fetchAll() as $candidate)')&&auth.includes('count($candidates) === 1'));

test('Technician shortcut uses assigned-jobs endpoint',portal.includes("/api/breakdown-workflow/technician-jobs"));
test('Technician active UI excludes cancelled cards',tech.includes("!['COMPLETED','CANCELLED'].includes"));
test('Technician machine action routes directly to My Job Cards',portal.includes('`/technician-job-cards/?machine='));
test('V306 service worker cache bumped',(() => { const m = /const CACHE='belm-app-v(\d+)-/.exec(sw); return m && Number(m[1]) >= 306; })());

console.log(`\n${pass}/${pass+fail} V306 checks passed`);
process.exit(fail?1:0);
