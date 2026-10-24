const fs = require('node:fs');
const assert = require('node:assert/strict');
const code = fs.readFileSync(require('node:path').join(__dirname, '../backend/api/customer_checkup.php'), 'utf8');
assert.match(code, /\$customer = require_customer_auth\(\)/);
assert.match(code, /checkup_require_access\(\$customer\)/);
assert.doesNotMatch(code, /if \(\$permissions === null\) return/);
assert.match(code, /!is_array\(\$permissions\) \|\| !in_array\('check-up', \$permissions, true\)/);
assert.match(code, /WHERE id=\? AND customer_id=\? AND deleted_at IS NULL/);
console.log('PASS: Customer Check Up requires explicit permission and scoped machine.');
