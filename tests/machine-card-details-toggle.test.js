const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../frontend/shared-machine-card-v827.js'),
  'utf8'
);

for (const kind of ['report','checkup','parts','job','edit','delete','forget']) {
  assert.match(source, new RegExp(`\\b${kind}\\b`), `${kind} action must be represented`);
}
assert.match(source, /aria-expanded="false"/, 'View Details must start collapsed');
assert.match(source, /button\.setAttribute\('aria-expanded', String\(open\)\)/, 'View Details must toggle accessible state');
assert.match(source, /card\.classList\.toggle\('belm-shared-actions-open', open\)/, 'drawer must toggle');
assert.match(source, /!explicitlyHidden\(element\) && !element\.disabled/, 'disabled role actions must not be surfaced');
assert.match(source, /dataset\.belmSharedCard838/, 're-scans must not duplicate card wrappers');

console.log('Machine card details toggle contract passed.');
