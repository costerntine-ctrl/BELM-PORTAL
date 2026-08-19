const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'frontend/admin-sidebar.js'), 'utf8');
let pass = 0;
function t(name, ok) {
  if (!ok) { console.error('FAIL', name); process.exitCode = 1; }
  else { pass++; console.log('PASS', name); }
}

t('MY C sidebar entry exists', js.includes('label: "MY C"') && js.includes('short: "MC"'));
t('MY C has a valid destination', js.includes('href: "/my-c/"') || js.includes('href: "/settings-manager/#company-profile"'));

const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
walk(path.join(root, 'frontend'));
const sidebarPages = htmlFiles.filter((file) => fs.readFileSync(file, 'utf8').includes('admin-sidebar.js?v='));
t('admin sidebar is cache-busted on every sidebar page', sidebarPages.length > 0 && sidebarPages.every((file) => /admin-sidebar\.js\?v=(359-my-c-sidebar|361-my-c-customer-details)/.test(fs.readFileSync(file, 'utf8'))));
console.log(`MY C compatibility ${pass}/3 checks passed`);
