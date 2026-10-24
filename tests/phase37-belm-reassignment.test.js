const fs=require('node:fs');
const assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../backend/api/engineering.php','utf8');
assert.match(code,/received_at=CASE WHEN technician_id IS DISTINCT FROM \? THEN NULL ELSE received_at END/);
assert.match(code,/started_at=CASE WHEN technician_id IS DISTINCT FROM \? THEN NULL ELSE started_at END/);
assert.match(code,/execute\(\[\$technicianId,\$tech\['name'\],\$technicianId,\$technicianId,\$priority/);
console.log('Phase 37 BELM reassignment checks passed');
