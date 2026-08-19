const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const sidebar = fs.readFileSync(path.join(root, 'frontend/admin-sidebar.js'), 'utf8');
let pass = 0, fail = 0;
function t(name, ok) { if (ok) { console.log('PASS', name); pass++; } else { console.error('FAIL', name); fail++; } }

t('MY C route directory is removed', !fs.existsSync(path.join(root, 'frontend/my-c')));
t('MY C sidebar label is removed', !sidebar.includes('label: "MY C"') && !sidebar.includes('short: "MC"'));
t('MY C route is removed from admin path allowlist', !sidebar.includes('/my-c/'));

const frontendFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(html|js|css)$/.test(entry.name)) frontendFiles.push(p);
  }
}
walk(path.join(root, 'frontend'));
const joined = frontendFiles.map(p => fs.readFileSync(p, 'utf8')).join('\n');
t('deployed frontend has no MY C label/route references', !/MY C|\/my-c\//.test(joined));
t('all admin sidebar pages use current cache version', frontendFiles.filter(p => fs.readFileSync(p, 'utf8').includes('/admin-sidebar.js?v=')).every(p => fs.readFileSync(p, 'utf8').includes('/admin-sidebar.js?v=380-admin-cleanup')));

console.log(`V380 remove MY C ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
