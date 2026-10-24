const fs = require('node:fs');
const assert = require('node:assert/strict');
const src = fs.readFileSync('backend/api/breakdown_workflow.php','utf8');
assert.match(src, /\$allowed = \$isOwner \|\| \(is_array\(\$permissions\) && in_array\('workflow', \$permissions, true\)\);/);
assert.doesNotMatch(src, /\$permissions === null/);
assert.match(src, /\$checkupEvent->execute\(\[\$caseId, 'Check Up '\.\$reportId/);
assert.match(src, /if \(!\$checkupEvent->fetchColumn\(\)\)/);
assert.match(src, /FOR UPDATE/);
console.log('PASS: role permissions fail closed and repeated checkup event guarded');
