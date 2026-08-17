const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = {
  serviceHtml: read('frontend/customer-service-request/index.html'),
  serviceJs: read('frontend/customer-service-request/request.js'),
  portalTools: read('frontend/portal-tools.js'),
  procHtml: read('frontend/customer-procurement/index.html'),
  procJs: read('frontend/customer-machine-expenses/expenses.js'),
  procCss: read('frontend/customer-machine-expenses/expenses.css'),
  customerApi: read('backend/api/customer_portal.php'),
  spareApi: read('backend/api/spare_part_requests.php'),
  schema: read('backend/schema.sql'),
};
let pass = 0, fail = 0;
function test(name, cond) {
  if (cond) { console.log('PASS', name); pass++; }
  else { console.log('FAIL', name); fail++; }
}

test('customer page renamed Spare & Service Request', files.serviceHtml.includes('Spare &amp; Service Request'));
test('dashboard machine action renamed', files.portalTools.includes('Spare & Service Request'));
test('machine spare list remains persistent before procurement', files.serviceJs.includes('Save the current machine list first'));
test('server also persists procurement items to machine spare master list', files.customerApi.includes('every spare submitted as a requirement also becomes/remains'));
test('procurement has Select Shortage button', files.procHtml.includes('id="selectShortageButton"'));
test('procurement has Download Selected CSV', files.procHtml.includes('Download Selected CSV'));
test('procurement has Send Selected to BELM', files.procHtml.includes('id="sendBelmSupplyButton"'));
test('procurement rows have selection checkboxes', files.procJs.includes('data-procurement-select'));
test('shortage calculated from required minus store', files.procJs.includes('return Math.max(0, required - Math.max(0, current));'));
test('csv exports shortage quantity', files.procJs.includes('"Shortage Qty"') && files.procJs.includes('procurementShortage(item)'));
test('BELM handoff uses shortage endpoint', files.procJs.includes('/procurement-belm-supply/'));
test('backend BELM handoff route exists', files.customerApi.includes("$sub === 'procurement-belm-supply'"));
test('backend sends only shortage', files.customerApi.includes('$shortage = max(0.0, $required - $available);'));
test('procurement status includes BELM requested', files.customerApi.includes("status='BELM_REQUESTED'") && files.procCss.includes('.procurement-status.belm_requested'));
test('maintenance blocker shows waiting BELM supply', files.customerApi.includes('Waiting BELM supply via Procurement'));
test('BELM spare request links procurement request', files.schema.includes('procurement_request_id VARCHAR(36) NULL') && files.spareApi.includes('sync_customer_procurement_from_belm'));
test('BELM fulfillment advances customer maintenance', files.spareApi.includes("SET status='PARTS_READY'") && files.spareApi.includes('BELM supply fulfilled'));
test('procurement page keeps store issue flow', files.procJs.includes('ISSUE_STORE') && files.procJs.includes('Issue from Store'));
test('request screen no direct spare BELM submit', files.serviceHtml.includes('Send Requirements to Procurement'));
test('new cache bust present', read('frontend/index.html').includes('298-spare-service-shortage') && files.procHtml.includes('298-shortage-select'));

console.log(`\n${pass}/${pass + fail} V298 checks passed`);
process.exit(fail ? 1 : 0);
