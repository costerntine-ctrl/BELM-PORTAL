const fs = require('fs');
const checks = [];
function has(path, needles) {
  const s = fs.readFileSync(path, 'utf8');
  for (const n of needles) checks.push([`${path}: ${n}`, s.includes(n)]);
}
has('backend/config/helpers.php', ['belm_can_override_technician_customer', "'Super Admin', 'Engineer'"]);
has('backend/api/tasks.php', ['Customer-managed Technicians cannot be borrowed', 'temporarily assign this Technician to another customer', 'temporaryOverride']);
has('backend/api/engineering.php', ['dispatch-options', "action === 'dispatch'", 'TEMPORARY OVERRIDE', 'u.is_customer_managed=0']);
has('frontend/breakdown-workflow/workflow.js', ['/engineering?action=dispatch-options', '/engineering?action=dispatch', 'TEMPORARY OVERRIDE']);
has('frontend/engineering-manager/index.html', ['engineeringServiceRequestsPanel', 'engineeringJobCardsPanel']);
has('backend/api/service_requests.php', ['temporaryOverride', 'This override applies to this service request only', 'belm_can_override_technician_customer']);
has('frontend/service-request-manager/manager.js', ['temporaryOverride', 'Temporary Technician Override']);
has('backend/api/breakdown_workflow.php', ['Temporary Technician Override', 'temporaryOverride', 'digital_job_cards', 'is_customer_managed']);
has('frontend/breakdown-workflow/workflow.js', ['temporaryOverride', 'TEMPORARY OVERRIDE']);
has('frontend/portal-tools.js', ['Job Cards / Process', 'addTechnicianJobCardsShortcut']);
has('frontend/technician-tasks/tasks.js', ['TEMPORARY OVERRIDE', 'homeCustomerName']);
has('frontend/technician-tasks/index.html', ['v=218-tech-override']);
const failed = checks.filter(([,ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
console.log(`TOTAL ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
