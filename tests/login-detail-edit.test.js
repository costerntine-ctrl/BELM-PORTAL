const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

// V835 regression contract: every login-detail editor must stay usable.
const helpers = read("backend/config/helpers.php");
const users = read("backend/api/users.php");
const customers = read("backend/api/customers.php");
const passwordSecurity = read("backend/api/customer_password_security.php");
const customerPortal = read("backend/api/customer_portal.php");
const editConfirm = read("frontend/edit-confirm.js");
const rolesJs = read("frontend/roles-manager/manager.js");
const customersJs = read("frontend/customers-manager/manager.js");
const customerUsersJs = read("frontend/customer-users/users.js");
const customerUsersHtml = read("frontend/customer-users/index.html");
const passwordSecurityJs = read("frontend/customer-users/password-security.js");
const roleReportNav = read("frontend/role-report-nav-v819.js");
const rolesUsersBelm = read("frontend/customer-users/roles-users-belm-v788.js");
const customerMode = read("frontend/customer-mode-v752.js");
const customerRouting = read("frontend/portal-cwm/customer-routing-v754.js");
const loginHtml = read("frontend/customer-app.html");

// Backend: PIN OR admin password for staff-side login edits.
assert.match(helpers, /function require_account_edit_confirmation\(array \$actor, array \$body\)/, "account edit confirmation helper must exist");
assert.match(helpers, /function belm_is_unique_violation/, "unique-violation helper must exist");
assert.match(customers, /require_account_edit_confirmation\(\$user, \$b\);/, "customer login email edit must accept PIN or admin password");
assert.match(customers, /require_account_edit_confirmation\(\$user, body\(\)\);/, "customer login reset must accept PIN or admin password");
assert.match(users, /belm_is_unique_violation\(\$error\)/, "staff email collisions must return 409, not 500");

// Customer password control must not need BELM's internal PIN or a missing column.
assert.doesNotMatch(passwordSecurity, /require_edit_confirmation\(/, "customers never receive the BELM Edit PIN");
assert.doesNotMatch(passwordSecurity, /customer_users SET[^']*updated_at/, "customer_users has no updated_at column");
assert.doesNotMatch(passwordSecurityJs, /psPinV559|editPin/, "customer password control must not ask for the BELM PIN");
assert.match(passwordSecurityJs, /#portalUserAccounts/, "customer password control must anchor to the current Roles & Users layout");
assert.match(customerPortal, /clear_unified_login_lockout\(\$email\);/, "customer team email edits must release login lockouts");

// Frontend: confirmation dialog offers admin password; editors use it.
assert.match(editConfirm, /allowPassword/, "edit confirmation must support the admin-password option");
assert.match(editConfirm, /resolve\(\{ adminPassword \}\)/, "edit confirmation must resolve the admin password");
assert.match(rolesJs, /allowPassword: true/, "roles editor must allow admin-password confirmation");
assert.match(customersJs, /ensurePendingConfirmation\(/, "customer editor must ask for confirmation at Save time instead of silently ignoring Save");
assert.doesNotMatch(customersJs, /if \(!pendingEditPin\) return;/, "Save must never silently return");

// Customer Roles & Users init must not abort on the removed logout button.
assert.match(customerUsersJs, /getElementById\("logoutButton"\)\?\.addEventListener/, "missing logout button must not stop Edit/Save bindings");
assert.doesNotMatch(customerUsersHtml, /id="logoutButton"/, "guard exists because the page has no logout button");

// Observer loops that froze role pages must stay idempotent and coalesced.
assert.match(roleReportNav, /let scanQueued=false;/, "role report nav must coalesce observer scans");
assert.doesNotMatch(roleReportNav, /MutationObserver\(\(\)=>requestAnimationFrame\(scan\)\)/, "role report nav must not queue one frame per mutation batch");
assert.match(rolesUsersBelm, /function setText\(el,value\)\{if\(el&&el\.textContent!==value\)/, "roles & users enhancer must write text only when changed");
assert.match(customerMode, /!window\.__belmCustomerRouting754/, "customer mode must not fight customer routing over the role card");
assert.match(customerRouting, /function setText\(el,value\)\{if\(el&&el\.textContent!==value\)/, "customer routing must write text only when changed");

// Login page stays free of dashboard runtime scripts.
assert.doesNotMatch(loginHtml, /navigation-context-v763\.js/, "login page must not load dashboard navigation runtime");

console.log("Login detail edit contract passed.");

// V836: BELM Super Admin's General Report must open the BELM report centre,
// never the customer-only /general-report/ page (which redirected to /login).
const gr = read("frontend/general-report/index.html");
assert.match(roleReportNav, /isCustomer\?'\/general-report\/':'\/reports-manager\/\?module=reports'/, "staff General Report must route to the BELM report centre");
assert.match(gr, /belm_admin_token'\)\?'\/reports-manager\/\?module=reports':'\/login'/, "customer report page must send a BELM session to the BELM report centre, not login");
console.log("General Report routing contract passed.");

// V838: a valid session must survive Back/Reload/start page, and Logout must end it.
const loginJs = read("frontend/customer-app.js");
const navCtx = read("frontend/navigation-context-v763.js");
assert.match(loginJs, /async function resumeSession\(\)/, "sign-in page must resume a valid session");
assert.match(loginJs, /params\.has\('signed_out'\)/, "explicit logout must always show the sign-in form");
assert.match(loginJs, /belm_login_resume_at/, "session resume must have a redirect-loop guard");
assert.match(read("frontend/logout.php"), /\/login\?signed_out=1/, "logout page must mark an explicit sign-out");
assert.match(navCtx, /#logout,#logoutButton,\.btn-logout/, "logout controls must clear every session token");
console.log("Session resume contract passed.");
