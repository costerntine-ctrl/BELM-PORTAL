const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'frontend/my-c/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/my-c/my-c.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'frontend/my-c/index.html'), 'utf8');
let pass = 0, fail = 0;
function t(name, ok) { if (ok) { console.log('PASS', name); pass++; } else { console.error('FAIL', name); fail++; } }
t('MY C card reduced from old 980px width to compact 820px cap', css.includes('width: min(100%, 820px)'));
t('detail boxes are tighter without shrinking value text', css.includes('padding: 10px 12px') && css.includes('font-size: 13px'));
t('portal link block is completely removed', !app.includes('Working customer portal link') && !app.includes('myc-portal-box') && !app.includes('data-copy-customer-link'));
t('open customer login is removed', !app.includes('open-login') && !app.includes('target="_blank"'));
t('four requested quick actions remain in one row', css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))') && ['View Your Machine','Workshop','Procurement','General Report'].every(x => app.includes(x)));
t('quick-action destinations remain unchanged', app.includes('/customers-manager/?customer=${encodeURIComponent(customer.id)}&view=machines') && app.includes('href="/engineering-manager/">Workshop') && app.includes('href="/spare-parts-manager/">Procurement') && app.includes('href="/reports-manager/">General Report'));
t('current MY C assets are cache-busted', html.includes('/my-c/my-c.css?v=370-my-c-compact-card') && html.includes('/my-c/app.js?v=370-my-c-compact-card'));
console.log(`V370 MY C compact-card checks ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
