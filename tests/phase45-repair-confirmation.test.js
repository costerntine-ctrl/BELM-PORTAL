const assert = require('node:assert/strict');
const fs = require('node:fs');
const {test} = require('node:test');
const api=fs.readFileSync('backend/api/customer_portal.php','utf8');
const schema=fs.readFileSync('backend/schema.sql','utf8');
test('confirmation requires customer write and machine management access',()=>{
  const block=api.split("if ($sub3 === 'repair-confirmations' && $method === 'POST')")[1].split('// Phase 42:')[0];
  assert.match(block,/require_customer_write_access\(\$customer\)/);
  assert.match(block,/require_customer_machine_management_access\(\$customer\)/);
  assert.match(block,/machine_id=\? AND customer_id=\?/);
});
test('issued quantities are capped in locked transaction',()=>{
  assert.match(api,/movement_type='ISSUE' FOR UPDATE/);
  assert.match(api,/SUM\(quantity_installed\)/);
  assert.match(api,/Installed quantity cannot exceed issued quantity/);
});
test('timeline distinguishes confirmed costs from store issues',()=>{
  assert.match(api,/kind'=>'REPAIR_CONFIRMED'/);
  assert.match(api,/confirmedCostSummary/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_repair_confirmations/);
});
