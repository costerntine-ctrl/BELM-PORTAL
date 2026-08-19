const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const portal = fs.readFileSync(path.join(root, 'frontend/portal-tools.js'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'frontend/belm-theme.css'), 'utf8');
const customerApi = fs.readFileSync(path.join(root, 'backend/api/customer_portal.php'), 'utf8');
const adminManager = fs.readFileSync(path.join(root, 'frontend/customers-manager/manager.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');

function ok(condition, message) { if (!condition) throw new Error(message); }

ok(portal.includes('class="belm-customer-activity-selector"'), 'Customer Activity Status selector row missing');
ok(portal.includes('data-customer-activity-status="${escapeHtml(machine.id)}"'), 'Customer Activity Status select is not machine-scoped');
ok(portal.includes('/api/customer-portal/machines/${encodeURIComponent(machine.id)}/activity-status'), 'Customer Activity Status API wiring missing');
ok(portal.includes('method: "PUT"'), 'Customer Activity Status must use PUT');
ok(portal.includes('body: JSON.stringify({ operationalStatus: next })'), 'Operational status payload missing');
ok(portal.includes('Activity Status synced to BELM.'), 'Customer sync confirmation missing');
ok(portal.includes('belm-customer-activity-status-changed'), 'Customer status sync event missing');
ok(theme.includes('V378 - Customer > View Your Machine'), 'V378 customer selector CSS missing');
ok(theme.includes('.belm-service-due-panel .belm-customer-activity-selector'), 'Customer selector layout scope missing');
ok(theme.includes('grid-template-columns: minmax(0, .8fr) minmax(145px, 1.2fr)'), 'Customer selector balance columns missing');
ok(customerApi.includes("if ($sub3 === 'activity-status' && $method === 'PUT')"), 'Customer Activity Status backend endpoint missing');
ok(customerApi.includes("require_customer_any_feature_access($customer, ['check-up', 'workflow'], 'Activity Status')"), 'Customer Activity Status permission guard missing');
ok(customerApi.includes("UPDATE machines SET operational_status = ?, operational_status_updated_at = NOW()"), 'Customer Activity Status DB sync missing');
ok(customerApi.includes("'CUSTOMER_TO_BELM', 'PORTAL'"), 'Customer-to-BELM Activity Status communication sync missing');
ok(customerApi.includes("'sync' => ['customer' => true, 'belm' => true]"), 'Activity Status sync result missing');
ok(adminManager.includes('class="machine-admin-actions"'), 'BELM Admin V377 machine management must remain intact');
ok(adminManager.includes('>Forget Permanently</button>'), 'BELM Admin permanent machine action must remain intact');
ok(index.includes('/portal-tools.js?v=378-customer-activity-status'), 'V378 portal-tools cache bust missing');
ok(index.includes('/belm-theme.css?v=378-customer-activity-status'), 'V378 theme cache bust missing');
const quickEnd = portal.indexOf('</div>\n      <div class=\"belm-customer-activity-selector\"', portal.indexOf('class=\"belm-machine-quick-actions\"'));
ok(quickEnd > -1, 'Activity Status selector must sit directly below the four-button quick action row');
console.log('V378 customer Activity Status selector regression: 20/20 passed');
