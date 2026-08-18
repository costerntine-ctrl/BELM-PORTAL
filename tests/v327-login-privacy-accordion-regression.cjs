const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/customer-app.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/customer-app.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'frontend/belm-sw.js'), 'utf8');
const health = fs.readFileSync(path.join(root, 'backend/index.php'), 'utf8');

const checks = [
  ['login has expandable legal details', /<details class="login-legal" id="loginLegal">/.test(html)],
  ['summary label is present', /View Privacy Policy &amp; Terms/.test(html)],
  ['privacy summary mentions service records', /Digital Job Cards/.test(html)],
  ['full privacy policy link exists', /href="\/legal\/privacy-policy\.html"/.test(html)],
  ['full terms link exists', /href="\/legal\/terms\.html"/.test(html)],
  ['login stylesheet cache-busted', /customer-app\.css\?v=327-login-legal/.test(html)],
  ['accordion css exists', /\.login-legal\{/.test(css)],
  ['mobile legal styling exists', /@media\(max-width:760px\).*\.login-legal/s.test(css)],
  ['service worker caches new login stylesheet', /belm-app-v(327-login-legal|328-assigned-job-card-select)/.test(sw) && /customer-app\.css\?v=327-login-legal/.test(sw)],
  ['health build marker bumped', /(327-login-legal|328-assigned-job-card-select)/.test(health)],
];

let passed = 0;
for (const [name, ok] of checks) {
  assert.ok(ok, name);
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`V327 checks: ${passed}/${checks.length}`);
