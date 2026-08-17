const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'frontend/portal-tools.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'backend/api/checklist_reports_helpers.php'), 'utf8');
const checks = [
  ['technician uses staff PDF route', portal.includes('/api/checklist-reports/${encodeURIComponent(id)}/pdf')],
  ['technician bearer token used', portal.includes('localStorage.getItem("belm_tech_token")')],
  ['download click intercepted', portal.includes('data-checked-report-download') && portal.includes('downloadCheckedReportPdf(')],
  ['old hard-coded customer download href removed', !portal.includes('href="/api/customer-portal/reports/${escapeHtml(report.id)}/download"')],
  ['customer report download preserved contextually', portal.includes('/api/customer-portal/reports/${encodeURIComponent(id)}/download')],
  ['summary watermark preserved', helper.includes('/Wm Do')],
  ['photo pages include watermark resource', helper.includes('$photoXObjects .= " /Wm {$watermarkObject} 0 R"')],
  ['portal tools cache busted', /portal-tools\.js\?v=(\d+)-/.exec(index) && Number(/portal-tools\.js\?v=(\d+)-/.exec(index)[1]) >= 287],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`${checks.length - failed}/${checks.length} V287 checks passed`);
if (failed) process.exit(1);
