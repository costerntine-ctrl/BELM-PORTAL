const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'frontend/admin-sidebar.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/admin-sidebar.css'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend/schema.sql'), 'utf8');
const migrate = fs.readFileSync(path.join(root, 'backend/scripts/migrate.php'), 'utf8');
let pass = 0;
function t(name, ok) { if (!ok) { console.error('FAIL', name); process.exitCode = 1; } else { pass++; console.log('PASS', name); } }

t('sidebar uses flat nav marker', js.includes('belm-sidebar-nav belm-sidebar-nav-flat'));
t('sidebar sorts visible pages by label', js.includes('const sortedPages = [...visiblePages].sort') && js.includes('localeCompare'));
t('sidebar no longer renders details category groups', !js.includes('document.createElement("details")'));
t('sidebar no longer renders section summary headings', !js.includes('document.createElement("summary")'));
t('all sorted pages append directly to nav', js.includes('sortedPages.forEach((page) =>') && js.includes('nav.appendChild(link)'));
t('sidebar search filters direct links', js.includes('nav.querySelectorAll(".belm-sidebar-link")'));
t('refresh detection covers refresh ids', js.includes('id.includes("refresh")'));
t('refresh detection covers refresh or sync labels', js.includes('(refresh|sync)'));
t('refresh feedback uses aria-busy', js.includes('control.setAttribute("aria-busy", "true")'));
t('refresh working class is applied', js.includes('control.classList.add("belm-refresh-working")'));
t('refresh motion wiggle keyframes exist', css.includes('@keyframes belmRefreshControlWiggle'));
t('refresh glyph spin keyframes exist', css.includes('@keyframes belmRefreshGlyphSpin'));
t('working refresh shows rotating glyph', css.includes('.belm-refresh-working::before') && css.includes('content: "↻"'));
t('reduced motion is respected', css.includes('@media (prefers-reduced-motion: reduce)'));
t('no database schema V357 mutation marker', !schema.includes('V357') && !schema.includes('357-az-refresh-motion'));
t('database migration release stays V356', migrate.includes("const BELM_RELEASE = '356-bank-test-reset';"));

const spareSensitive = [
  'frontend/spare-parts-manager/manager.js',
  'backend/api/spare_parts.php'
].filter(p => fs.existsSync(path.join(root,p)));
t('spare stock implementation files remain present', spareSensitive.length >= 1);
console.log(`V357 ${pass}/17 checks passed`);
