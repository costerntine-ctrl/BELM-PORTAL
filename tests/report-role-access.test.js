const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const helpers = read('backend/config/helpers.php');
const reports = read('backend/api/reports.php');
const saved = read('backend/api/saved-reports.php');
const save = read('backend/api/save-report.php');
const roleReports = read('frontend/role-reports/app.js');

assert.match(helpers, /function belm_can_view_general_report\(array \$user\): bool/);
assert.match(helpers, /\['super_admin', 'customer_admin'\]/);
assert.match(reports, /require_general_report_access\(\$user\);/);
assert.match(saved, /role_name = \?/);
assert.match(helpers, /General Report is available only to BELM Admin and Customer/);
assert.doesNotMatch(saved, /fetchArray\(/, 'saved reports must use PDO fetch methods');
assert.doesNotMatch(saved, /get_db\(\)/, 'saved reports must use the project db() connection');
assert.match(save, /You can only save reports belonging to your own role/);
assert.match(save, /require_general_report_access\(\$user\);/);
assert.match(roleReports, /customer_admin:\[section\('Company Operations'.*GENERAL.*General Report/s);
assert.match(roleReports, /super_admin:\[section\('Management Reports'.*GENERAL.*General Report/s);
assert.match(roleReports, /workshop_manager:\[section\('Technical Department Reports'.*Workshop Analysis/s);
for (const report of ['Job Card Records','Machine History','Checklist Report','Diagnosis Report','Operator Report','Fuel Report','Job Card Reports','Maintenance Report']) {
  assert.match(roleReports, new RegExp('workshop_manager:[\\s\\S]*' + report.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Workshop Manager must have ${report}`);
}
const workshopBlock = roleReports.match(/workshop_manager:\[section\([\s\S]*?\n  \]\),\n  technician:/)?.[0] || '';
assert.doesNotMatch(workshopBlock, /General Report/, 'Workshop Manager must not receive General Report');

console.log('Report role-access contract passed.');
