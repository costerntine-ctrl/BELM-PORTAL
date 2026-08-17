const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let pass=0,fail=0;
function test(name,ok){if(ok){console.log('PASS',name);pass++;}else{console.error('FAIL',name);fail++;}}
const service=read('backend/api/service_requests.php');
const bw=read('backend/api/breakdown_workflow.php');
const helpers=read('backend/config/helpers.php');
const customer=read('backend/api/customer_portal.php');
const billing=read('backend/api/billing.php');
const receipts=read('backend/api/receipts.php');
const trash=read('backend/api/trash.php');
const customers=read('backend/api/customers.php');
const reset=read('backend/scripts/reset.php');
const auth=read('backend/api/auth.php');
const schema=read('backend/schema.sql');
const health=read('backend/index.php');
const billingUi=read('frontend/billing-manager/manager.js');
const sw=read('frontend/belm-sw.js');

test('service request completion waits for Workshop case closure',service.includes("current_stage")&&service.includes('Workshop test is still pending'));
test('Service Request case cannot close with unfinished Job Cards',bw.includes('All Job Cards must be completed before Workshop can return the machine to service.')&&bw.includes("($case['source_type'] ?? '') === 'SERVICE_REQUEST'"));
test('terminal Service Requests cannot be resurrected by assignment',service.includes('A completed/cancelled Service Request cannot be assigned again.'));
test('Service Request status cannot claim OPEN/ASSIGNED/IN PROGRESS with contradictory assignment',service.includes('Unassign the Technician first')&&service.includes('Assign a Technician before setting this Service Request'));
test('started Job Card prevents Service Request status rollback',service.includes('The linked Job Card has already started. Keep the Service Request in progress'));
test('Technician Job Card work synchronizes Service Request to IN_PROGRESS',bw.includes('Synchronized from Technician Job Card')&&bw.includes("status='IN_PROGRESS'"));
test('started Service Request Job Cards must be reassigned through Job Card Dispatch',service.includes('has already started. Change Technician assignment from Job Card Dispatch'));
test('service sync never rewrites completed/cancelled Job Card technician ownership',helpers.includes("status NOT IN ('COMPLETED','CANCELLED')"));
test('RESPONDED proforma remains sent/visible billing state',helpers.includes("['SENT','RESPONDED']")&&helpers.includes("'PROFORMA_SENT'"));
test('customer service billing ignores cancelled invoices',customer.includes("ii.status<>'CANCELLED'"));

test('payment-derived invoice state cannot be manually overwritten',billing.includes('payment rows are the source of truth')&&billing.includes('calculated_invoice_status'));
test('paid invoice cannot be cancelled without reversing payment',billing.includes('Reverse/delete the related Receipt/payment first before cancelling it.'));
test('cancelled invoice cannot be reactivated',billing.includes('A cancelled Invoice is final and cannot be reactivated'));
test('invoice edit recomputes billing status for both old and new Job Card links',billing.includes("SELECT status, source_job_card_id")&&billing.includes('$oldSourceJobCardId')&&billing.includes('belm_recompute_job_billing_status($oldSourceJobCardId)'));
test('billing UI only exposes current status plus cancel action',billingUi.includes('CANCEL INVOICE')&&!billingUi.includes('const statuses = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]'));

test('schema links payment to source receipt',schema.includes('ADD COLUMN IF NOT EXISTS receipt_id')&&schema.includes('idx_payments_receipt_unique'));
test('receipt creation records receipt_id on payment',receipts.includes('paid_at, receipt_id')&&receipts.includes("$paidAt, $newId"));
test('receipt delete reverses linked payment and recalculates invoice',receipts.includes('DELETE FROM payments WHERE receipt_id=?')&&receipts.includes('calculated_invoice_status'));
test('receipt restore restores payment and blocks overpayment',trash.includes('Cannot restore this Receipt because it would overpay')&&trash.includes('INSERT INTO payments(id,invoice_id,bank_account_id,amount,method,reference,paid_at,receipt_id)'));
test('receipt restore refuses deleted/cancelled invoice',trash.includes('invoice_deleted_at')&&trash.includes('Restore/activate the Invoice first'));
test('receipt-linked payment edit syncs official receipt',billing.includes("UPDATE receipts")&&billing.includes("$paymentRow['receipt_id']"));
test('manual payment can be reversed safely',billing.includes("$method === 'DELETE' && $action === 'payment'")&&billing.includes('payment-reversed'));
test('receipt-linked payment cannot be directly reversed',billing.includes('Delete/reverse the Receipt so both records stay synchronized'));

test('permanent customer delete clears checklist/report children',customers.includes('DELETE FROM checklist_answers')&&customers.includes('DELETE FROM checklist_reports'));
test('permanent customer delete clears service history and proforma items',customers.includes('DELETE FROM service_request_history')&&customers.includes('DELETE FROM proforma_invoice_items'));
test('permanent customer delete clears receipts before invoices',customers.indexOf('DELETE FROM receipts WHERE customer_id') < customers.indexOf('DELETE FROM invoices WHERE customer_id'));
test('customer merge moves Store Procurement Breakdown and Job Card data',customers.includes("'customer_store_items'")&&customers.includes("'customer_procurement_requests'")&&customers.includes("'breakdown_cases'")&&customers.includes("'digital_job_cards'"));
test('customer merge blocks Store part-number collision',customers.includes('Merge blocked: both customers have Customer Store stock for part'));
test('customer merge permanently removes source shell',customers.includes('belm_forget_customer_permanently($pdo,$sourceId)')&&!customers.includes("send_to_trash('customer', $sourceId"));

test('machine reset deletes operator child rows before machine operator',reset.indexOf('DELETE FROM machine_operator_shifts WHERE machine_id') < reset.indexOf('DELETE FROM machine_operators WHERE machine_id'));
test('user reset detaches all newer user FKs',reset.includes('service_request_history SET actor_id=NULL')&&reset.includes('receipts SET received_by=NULL')&&reset.includes('controller_pinouts SET created_by_id=NULL')&&reset.includes('digital_job_cards SET technician_id=NULL'));
test('service reset clears history and linked Service Request workflow',reset.includes("DELETE FROM breakdown_cases WHERE source_type='SERVICE_REQUEST'")&&reset.includes('DELETE FROM service_request_history'));
test('bank reset detaches receipts bank account',reset.includes('UPDATE receipts SET bank_account_id=NULL'));
test('billing reset includes receipts',reset.includes("'payments', 'receipts', 'invoices'"));
test('reset all preserves current admin password hash, not plaintext body',reset.includes("SELECT name,email,password_hash FROM users")&&reset.includes('$preservedAdminPasswordHash')&&!reset.includes("$body['adminPassword']"));

test('unified login resolves legacy duplicate email by password across account types',auth.includes("SELECT 'staff' AS account_type")&&auth.includes("SELECT 'customer' AS account_type")&&auth.includes("SELECT 'assistant' AS account_type")&&auth.includes('count($identityMatches) > 1'));
test('legacy staff login fails closed on duplicate password-matching email accounts',auth.includes('foreach ($stmt->fetchAll() as $candidateUser)')&&auth.includes('count($staffMatches) > 1'));
test('legacy customer login checks all owner/assistant matches and fails closed on ambiguity',auth.includes("$identityMatches[] = ['type' => 'owner'")&&auth.includes("$identityMatches[] = ['type' => 'assistant'")&&auth.includes('count($identityMatches) > 1'));
test('health checks V307 receipt/payment schema',health.includes("307-second-pass-hardening")&&health.includes("['payments', 'receipt_id']")&&health.includes("'receipts'"));
test('health advertises unified login endpoint',health.includes("'unified' => '/api/auth/unified-login'"));
test('health payload ok=false whenever schema/admin readiness fails',health.includes('$healthReady = $schemaReady && $adminReady')&&health.includes("'ok' => $healthReady")&&health.includes('$healthReady ? 200 : 503'));
test('V307 service worker cache bumped',sw.includes('belm-app-v307-second-pass-hardening'));

console.log(`\n${pass}/${pass+fail} V307 checks passed`);
process.exit(fail?1:0);
