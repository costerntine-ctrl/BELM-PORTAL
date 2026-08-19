const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.css'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'frontend/customers-manager/index.html'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'frontend/portal-tools.js'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'frontend/belm-theme.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const customerApi = fs.readFileSync(path.join(root, 'backend/api/customer_portal.php'), 'utf8');
const customersApi = fs.readFileSync(path.join(root, 'backend/api/customers.php'), 'utf8');
function ok(condition, message) { if (!condition) throw new Error(message); }

ok(admin.includes('const fleetNumber = machine.fleetNumber || machine.fleet_number || "—";'), 'Admin Fleet Number source missing');
ok(admin.includes('class="machine-title-row"'), 'Admin machine title row missing');
ok(admin.includes('class="machine-fleet-number"'), 'Admin Fleet Number badge missing');
ok(admin.includes('<small>Fleet No.</small>'), 'Admin Fleet No label missing');
ok(admin.includes('${escapeHtml(machine.machineType)} · Reg:'), 'Machine Type line must remain below the model');
ok(adminCss.includes('grid-template-columns: repeat(auto-fill, 390px)'), 'Admin machine grid should be slightly wider at 390px');
ok(adminCss.includes('width: 390px;\n  height: 590px;'), 'Admin card must keep 590px height while widening slightly');
ok(adminCss.includes('grid-template-columns: minmax(0, 1fr) 12ch'), 'Admin Fleet Number reference width missing');
ok(adminCss.includes('width: 12ch;\n  min-width: 12ch;\n  max-width: 12ch;'), 'Admin Fleet Number fixed reference width missing');
ok(admin.includes('class="machine-admin-actions"'), 'Admin Edit/Delete/Forget row must remain');
ok(admin.includes('data-operational-status="${escapeHtml(machine.id)}"'), 'Admin Activity Status selector must remain');

ok(portal.includes('const fleetNumber = machine.fleetNumber || machine.fleet_number || "—";'), 'Customer Fleet Number source missing');
ok(portal.includes('fleetBadge.className = "belm-customer-fleet-number";'), 'Customer Fleet Number badge missing');
ok(portal.includes('nativeHead.appendChild(fleetBadge);'), 'Customer Fleet Number must be placed in machine nameplate');
ok(theme.includes('grid-template-columns: repeat(auto-fill, minmax(370px, 450px));'), 'Customer machine card width should increase only slightly');
ok(theme.includes('.belm-customer-machine-card > .belm-machine-native-head .belm-customer-fleet-number'), 'Customer Fleet Number CSS missing');
ok(theme.includes('width: 12ch;\n  min-width: 12ch;\n  max-width: 12ch;'), 'Customer Fleet Number reference width missing');
ok(portal.includes('class="belm-customer-activity-selector"'), 'Customer Activity Status selector must remain');
ok(portal.includes('>Job Card</a>'), 'Customer Job Card action must remain');
ok(portal.includes('data-belm-feature="operator-reports"'), 'Customer Report action must remain');
ok(portal.includes('data-belm-feature="check-up"'), 'Customer Check Up action must remain');
ok(portal.includes('data-belm-feature="service-request"'), 'Customer Service Parts route must remain');

ok(customersApi.includes("fleet_number, brand, service_kit"), 'Admin machine Fleet Number database persistence missing');
ok(customerApi.includes("SELECT * FROM machines WHERE customer_id = ? AND deleted_at IS NULL"), 'Customer dashboard machine source changed unexpectedly');
ok(adminHtml.includes('/customers-manager/manager.js?v=379-machine-fleet-number'), 'Admin manager cache bust missing');
ok(adminHtml.includes('/customers-manager/manager.css?v=379-machine-fleet-number'), 'Admin CSS cache bust missing');
ok(index.includes('/portal-tools.js?v=379-machine-fleet-number'), 'Customer portal JS cache bust missing');
ok(index.includes('/belm-theme.css?v=379-machine-fleet-number'), 'Customer theme cache bust missing');
console.log('V379 machine Fleet Number regression: 28/28 passed');
