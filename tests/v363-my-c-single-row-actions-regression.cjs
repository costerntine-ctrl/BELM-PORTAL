const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/my-c/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/my-c/my-c.css'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL:', name); process.exitCode = 1; } else { pass++; } }
t('MY C CSS cache-busted for v363', html.includes('/my-c/my-c.css?v=363-my-c-single-row-actions'));
t('profile card stays compact', css.includes('width: min(100%, 980px)') && css.includes('margin-inline: auto'));
t('quick actions use four equal columns', css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
t('tablet breakpoint no longer stacks quick actions to two columns', !/@media \(max-width: 920px\)[\s\S]*?\.myc-quick-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css));
t('mobile breakpoint no longer stacks to one column', !/@media \(max-width: 460px\)[\s\S]*?\.myc-quick-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr/.test(css));
t('small-screen buttons are tightened without overlap', css.includes('gap: 6px') && css.includes('min-height: 58px') && css.includes('overflow-wrap: anywhere'));
console.log(`V363 MY C single-row actions ${pass}/6 checks passed`);
