const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../backend/api/breakdown_workflow.php'), 'utf8');
const start = source.indexOf("if ($method === 'PUT' && $action === 'spare-status'");
const end = source.indexOf('\nif ($method ===', start + 10);
assert.ok(start !== -1, 'Spare status endpoint exists');
const endpoint = source.slice(start, end === -1 ? undefined : end);
for (const term of ["$ctx['kind'] === 'belm'", "'store keeper'", "'procurement'", "'accounts'", "'super admin'", "'is_machinery_admin'", "'SERVICE_REQUEST'", "'BELM controls this spare workflow.'", "'Customer workshop controls this spare workflow.'"]) {
  assert.ok(endpoint.includes(term), `Missing API guard: ${term}`);
}
console.log('Spare status authorization guard checks passed (static checks only).');
