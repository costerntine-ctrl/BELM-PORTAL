const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const router = read("backend/index.php");
const users = read("backend/api/users.php");
const customers = read("backend/api/customers.php");
const auth = read("backend/api/auth.php");
const helpers = read("backend/config/helpers.php");
const adminHtml = read("frontend/admin-applications/index.html");
const adminJs = read("frontend/admin-applications/admin.js");
const rolesJs = read("frontend/roles-manager/manager.js");

assert.match(router, /reset-password'\)dispatch\('users\.php'/, "staff password reset route must be dispatched");
assert.match(router, /dispatch\('users\.php',\['id'=>\$segments\[1\]\]\)/, "staff edit route must be dispatched");

assert.match(users, /\$b\['email'\] \?\? \$existingUser\['email'\]/, "staff edit must accept a new email and preserve it for cached clients");
assert.match(users, /SELECT 1 FROM users WHERE LOWER\(email\) = \? AND id <> \?/, "staff edit must exclude only the edited staff account");
assert.match(users, /SELECT 1 FROM customers WHERE LOWER\(email\) = \?/, "staff email must be checked against customer owners");
assert.match(users, /SELECT 1 FROM customer_users WHERE LOWER\(email\) = \?/, "staff email must be checked against customer team users");
assert.match(users, /UPDATE users SET name=\?, email=\?/, "staff edit must persist the login email");
assert.match(users, /sync_extra_user_roles\(\$id, \$roleId, \$roleIds\)/, "staff edit must retain the role synchronization path");
assert.match(users, /password_hash\(\$newPassword, PASSWORD_BCRYPT, \['cost' => 12\]\)/, "staff reset must persist a cost-12 password hash");
assert.match(users, /clear_unified_login_lockout\(\(string\)\$resetUser\['email'\]\)/, "staff reset must release stale login locks");
assert.doesNotMatch(users, /SELECT u\.\*, r\.name AS role_name/, "staff listing must not expose password or recovery hashes");

assert.match(auth, /SELECT 'staff' AS account_type/, "unified login must include staff identities");
assert.match(auth, /SELECT 'customer' AS account_type/, "unified login must include customer-owner identities");
assert.match(auth, /SELECT 'assistant' AS account_type/, "unified login must include customer team identities");
assert.match(auth, /count\(\$identityMatches\) > 1/, "unified login must fail closed on ambiguous credentials");

assert.match(helpers, /\['unified-login', 'staff-login', 'customer-login'\]/, "credential changes must unlock canonical and legacy login paths");
assert.match(customers, /clear_unified_login_lockout\(\$details\['email'\], \$portalLink\)/, "customer email edits must release the new login identity");

assert.doesNotMatch(adminHtml, /id="editRegisteredUserEmail"[^>]*readonly/, "registered-user email must be editable");
assert.match(adminJs, /email: document\.getElementById\("editRegisteredUserEmail"\)\.value\.trim\(\)/, "registered-user editor must submit email");
assert.match(rolesJs, /email: document\.getElementById\("userEmail"\)\.value\.trim\(\)/, "roles editor must submit email for edits and creates");

console.log("Account credential route contract passed.");
