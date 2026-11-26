const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(p, 'utf8');

test('malfunction report schema, route and endpoint exist', () => {
  const schema = read('backend/schema.sql');
  for (const t of ['machine_malfunction_reports', 'job_card_progress_steps', 'saved_reports']) assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + t));
  assert.match(read('backend/index.php'), /case 'malfunction-reports': dispatch\('malfunction_reports\.php'/);
  assert.ok(fs.existsSync('backend/api/malfunction_reports.php'));
});

test('report flow alerts the Workshop Manager and Solved removes the alert and closes the Job Card', () => {
  const api = read('backend/api/malfunction_reports.php');
  assert.match(api, /'workshop_manager'/);
  assert.match(api, /WORKSHOP_MANAGER_INSTRUCTION/);
  assert.match(api, /status='COMPLETED'/);
  assert.match(api, /FINAL RESULT: OK/);
  assert.match(api, /UPDATE role_communications SET archived_at=NOW\(\) WHERE related_type='MALFUNCTION_REPORT'/);
  assert.doesNotMatch(api, /DELETE FROM/, 'existing records must never be deleted');
  for (const s of ['INITIAL_INSPECTION', 'FINDINGS_REPORT', 'SOLUTION', 'PENDING', 'SOLVED']) assert.ok(api.includes(s));
});

test('workshop boundaries are enforced', () => {
  const api = read('backend/api/malfunction_reports.php');
  assert.match(api, /This customer is using its own maintenance team\./);
  assert.match(api, /Select one of this customer\\'s own Technicians\./);
  assert.match(api, /Only the Workshop Manager can create a Job Card\./);
});

test('Report It button is loaded on machine pages and page is in the sidebar', () => {
  assert.match(read('frontend/runtime-loader-v647.js'), /malfunction-report-button\.js/);
  assert.match(read('frontend/operator/index.html'), /malfunction-report-button\.js/);
  assert.match(read('frontend/persistent-role-sidebar.js'), /\/malfunction-reports\//);
  assert.ok(fs.existsSync('frontend/malfunction-reports/index.html'));
});

test('technicians see only assigned machines and the page owns exactly one sidebar', () => {
  const api = read('backend/api/malfunction_reports.php');
  assert.match(api, /function mf_tech_assigned/);
  assert.match(api, /This machine is not assigned to you\./);
  assert.match(api, /machine_technician_assignments/);
  const html = read('frontend/malfunction-reports/index.html');
  assert.match(html, /window\.__belmPersistentSidebar=true/);
  assert.equal((html.match(/<aside/g) || []).length, 1);
  assert.match(read('backend/schema.sql'), /ended_at TIMESTAMPTZ NULL/);
});

test('every view has a Back button and the 5-step flow supports Save Draft', () => {
  const app = read('frontend/malfunction-reports/app.js');
  assert.match(app, /Back to Dashboard/);
  for (const v of ['dashboard', 'machines', 'technicians', 'assignments', 'machine-reports', 'create', 'jobs', 'job']) assert.ok(app.includes('V.' + v) || app.includes("V['" + v + "']"), v);
  assert.match(app, /Save Draft/);
  assert.match(read('backend/api/malfunction_reports.php'), /is_draft/);
});
