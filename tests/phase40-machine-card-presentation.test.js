const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const frontend = path.join(__dirname, '..', 'frontend');
const shared = fs.readFileSync(path.join(frontend, 'shared-machine-card-v827.js'), 'utf8');
const photos = fs.readFileSync(path.join(frontend, 'machine-card-photo-v760.js'), 'utf8');
test('machine type visible as dedicated badge and backed by type resolver', () => {
  assert.match(shared, /data-shared-type/);
  assert.match(shared, /machineVisualType\(card, info\)\.label/);
});
test('machine photographs preserve entire equipment silhouette rather than crop', () => {
  assert.match(photos, /belm-machine-photo-box img\{[^}]*object-fit:contain/);
  assert.match(photos, /belm-machine-summary-photo\{[^}]*object-fit:contain/);
});
test('narrow phone viewport uses single-column touch-friendly actions', () => {
  assert.match(shared, /@media\(max-width:420px\)/);
  assert.match(shared, /belm-shared-actions-v827\{grid-template-columns:minmax\(0,1fr\)/);
});
