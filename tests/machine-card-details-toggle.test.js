const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../frontend/shared-machine-card-v827.js'),
  'utf8'
);

for (const label of [
  'Report',
  'Check Up',
  'Service Parts',
  'Job Card',
  'Edit Machine',
  'Delete Machine',
  'Forget Permanently'
]) {
  assert.match(source, new RegExp(`label:'${label}'`), `${label} must be defined once in the shared action panel`);
}

assert.match(source, /aria-expanded="false" aria-controls=/, 'View Details must expose accessible collapsed state');
assert.match(source, /button\.setAttribute\('aria-expanded',String\(!open\)\)/, 'View Details must toggle its expanded state');
assert.match(source, /panel\.hidden=open/, 'the action panel must collapse on the second click');
assert.match(source, /el\.disabled\|\|el\.hidden\|\|el\.getAttribute\('aria-disabled'\)==='true'/, 'disabled role actions must stay out of the panel');
assert.match(source, /panel\.dataset\.availableActions===actionKey/, 're-scans must not duplicate action buttons');

console.log('Machine card details toggle contract passed.');
