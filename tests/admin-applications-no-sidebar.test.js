const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(
  path.resolve(__dirname, '../frontend/admin-applications/index.html'),
  'utf8'
);
const css = fs.readFileSync(
  path.resolve(__dirname, '../frontend/admin-applications/admin.css'),
  'utf8'
);

assert.doesNotMatch(html, /admin-sidebar\.(?:css|js)/, 'Access Applications must not load the global admin sidebar');
assert.match(html, /class="heading-actions registration-page-actions-bridge" aria-label="Registration actions"/, 'registration actions must remain visible after removing the sidebar');
assert.doesNotMatch(html, /registration-page-actions-bridge"[^>]*(?:hidden|aria-hidden)/, 'registration actions must not be hidden');

for (const id of [
  'registerCustomerButton',
  'registerTechnicianButton',
  'addMachineButton',
  'refreshButton'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} must remain available on the page`);
}

assert.match(css, /main\s*\{\s*width:min\(1400px,calc\(100% - 40px\)\)/, 'main content should use the space released by the sidebar');

console.log('Access Applications no-sidebar contract passed.');
