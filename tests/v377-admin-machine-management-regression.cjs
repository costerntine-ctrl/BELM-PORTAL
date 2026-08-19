const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const manager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'backend/api/customers.php'), 'utf8');
const customerPortal = fs.readFileSync(path.join(root, 'frontend/portal-tools.js'), 'utf8');

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

ok(manager.includes('class="machine-admin-actions"'), 'Admin machine management row missing');
ok(manager.includes('>Edit Machine</button>'), 'Edit Machine button missing');
ok(manager.includes('>Delete Machine</button>'), 'Delete Machine button missing');
ok(manager.includes('>Forget Permanently</button>'), 'Forget Permanently button missing');
ok(manager.includes('data-edit-machine="${escapeHtml(machine.id)}"'), 'Edit button is not wired to existing edit machine handler');
ok(manager.includes('data-delete-machine="${escapeHtml(machine.id)}"'), 'Delete button is not wired to existing delete machine handler');
ok(manager.includes('isSuperAdmin ? `<button type="button" class="machine-admin-forget"'), 'Forget button must be Super Admin-only in the UI');
ok(manager.includes('async function forgetMachine(id)'), 'Permanent machine function missing');
ok(manager.includes('/customers/machines/${id}?permanent=1'), 'Permanent machine endpoint wiring missing');
ok(css.includes('#machineListDialog .machine-card .machine-admin-actions'), 'Admin management row CSS missing');
ok(css.includes('#machineListDialog .machine-card .operational-status-picker'), 'Balanced Activity Status CSS missing');
ok(css.includes('grid-template-columns: 86px minmax(0, 1fr)'), 'Activity Status label/select balance missing');
ok(css.includes('min-height: 54px'), 'Activity Status balanced height missing');
ok(backend.includes('function belm_forget_machine_permanently'), 'Backend permanent machine helper missing');
ok(backend.includes("if (($_GET['permanent'] ?? '') === '1')"), 'Backend permanent delete branch missing');
ok(backend.includes('require_super_admin($user);'), 'Permanent delete must require Super Admin');
ok(backend.includes("UPDATE service_requests SET machine_id=NULL"), 'Service request history must be detached, not customer-deleted');
ok(backend.includes("DELETE FROM machines WHERE id IN ($in)"), 'Machine hard delete missing');
ok(!customerPortal.includes('data-forget-machine='), 'Customer portal must not expose admin permanent-delete control');
console.log('V377 admin machine management + activity status regression: 19/19 passed');
