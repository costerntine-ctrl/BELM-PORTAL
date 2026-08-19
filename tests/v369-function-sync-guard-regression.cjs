const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
let pass = 0, fail = 0;
function test(name, ok) {
  if (ok) { console.log('PASS', name); pass++; }
  else { console.error('FAIL', name); fail++; }
}

// V368 runtime fingerprints. V369 is a verification/guard release: no runtime
// behavior is intentionally changed. If one of these files changes, this test
// must fail until the change is deliberately reviewed.
const baseline = {
  'backend/config/helpers.php': '5e4fc6b5296a790f96f02af4c616c04f5b34cc8ff4d05c77086a523064ac0cf4',
  'backend/api/breakdown_workflow.php': 'd6e792e8243f9455c46506c36079c40c914218a39e05adcf83f5bacb8ac747ab',
  'backend/api/customer_portal.php': '31459d6a10d87a2144e3e60c2c8c4dc5cc1231d630f402aaf4539143ce65e8ca',
  'backend/api/engineering.php': '6ea6d5f2f3ad16a9b6343dd7666c7304f7de30b51a915b7452741b2aa6dca63e',
  'backend/api/service_requests.php': '66c9e8378092db5c0e914e994d12e8b41521fb8ca004850099358131fd602d05',
  'backend/api/spare_recommendations.php': 'eeec8df6b3f4c631000b3d09b5ad032c2f7ecf289879955cee05892713359507',
  'frontend/my-c/app.js': '0b01c58784d3783fa68a471ebfd6a653d1f1f92ed25679fd62dbfbba9ce28d19',
  'frontend/customers-manager/manager.js': 'df0cfa1603d40553cb8a227233647db297c3de4daa1bee1744f12d77d684e25d',
  'frontend/engineering-manager/manager.js': '401c91e9731e257a31f67ee09a4b84602149e10c817c04b9e761052fb7e18695',
  'frontend/spare-parts-manager/manager.js': 'befcbfb959dbbca87f258f2e3d6ec9e7725a273dac6fc3d206ba5aebe9e5ea2c',
  'frontend/reports-manager/app.js': '387a3a0964839d8d4c6dbf17c0d0d89e09f82bc957dc9e972003491b2a4ece97',
  'frontend/customer-app.js': '231cc641d487a96f56c58290d63dabc1d5d467b8c93ce0ed1dbdb28cea6bb3f7'
};
for (const [file, hash] of Object.entries(baseline)) {
  test(`runtime unchanged: ${file}`, sha256(file) === hash);
}

const helpers = read('backend/config/helpers.php');
const breakdown = read('backend/api/breakdown_workflow.php');
const customerPortal = read('backend/api/customer_portal.php');
const engineering = read('backend/api/engineering.php');
const serviceRequests = read('backend/api/service_requests.php');
const spare = read('backend/api/spare_recommendations.php');
const myc = read('frontend/my-c/app.js');
const customers = read('frontend/customers-manager/manager.js');

test('central strict sync function remains available',
  helpers.includes('function belm_sync_breakdown_case_from_service_request') &&
  helpers.includes('function belm_sync_breakdown_sources') &&
  helpers.includes("'System Sync',true") &&
  helpers.includes("'failedSources'=>$failedSources") &&
  helpers.includes("'inconsistencies'=>$inconsistencies"));

test('breakdown workflow still calls central reconciliation',
  breakdown.includes('belm_sync_breakdown_sources($scopeCustomer ?: null)'));

test('engineering dispatch still reconciles all sources',
  engineering.includes('belm_sync_breakdown_sources(null)'));

test('customer portal create/cancel still synchronizes service requests',
  (customerPortal.match(/belm_sync_breakdown_case_from_service_request/g) || []).length >= 2);

test('service request transitions still synchronize linked process',
  (serviceRequests.match(/belm_sync_breakdown_case_from_service_request/g) || []).length >= 5 &&
  serviceRequests.includes('belm_sync_breakdown_sources'));

test('procurement/spare confirmation still synchronizes linked process',
  spare.includes('belm_sync_breakdown_case_from_service_request'));

test('MY C four main actions keep their established destinations',
  myc.includes('View Your Machine') && myc.includes('/customers-manager/?customer=${encodeURIComponent(customer.id)}&view=machines') &&
  myc.includes('href="/engineering-manager/">Workshop') &&
  myc.includes('href="/spare-parts-manager/">Procurement') &&
  myc.includes('href="/reports-manager/">General Report'));

test('machine view keeps only intended operational controls',
  ['Report', 'Check Up', 'Service Parts', 'Engineering / Job Cards'].every(x => customers.includes(x)) &&
  !customers.includes('privacyButton("Procurement Receipts"'));

const machineCard = customers.match(/function machineCard\([\s\S]*?\n  function renderCustomers\(\)/)?.[0] || '';
test('machine card still has no Edit/Delete buttons',
  !machineCard.includes('data-edit-machine=') && !machineCard.includes('data-delete-machine='));

test('customer card retains communication and existing lower actions',
  customers.includes('<strong>Communication history</strong>') &&
  customers.includes('data-view-machines=') &&
  customers.includes('data-edit-customer=') &&
  customers.includes('data-reset-customer='));

test('customer contact lines are display-only additions under the name',
  customers.includes('customer-card-contact-lines') &&
  customers.includes('<span>Phone</span>') &&
  customers.includes('<span>Email</span>') &&
  customers.includes('<span>Address</span>'));

console.log(`\n${pass}/${pass + fail} V369 function/sync guard checks passed`);
process.exit(fail ? 1 : 0);
