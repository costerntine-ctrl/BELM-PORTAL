const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");

const toolsRequire = createRequire(path.join(process.env.BELM_JS_TOOLS, "package.json"));
const { JSDOM } = toolsRequire("jsdom");
const root = path.resolve(__dirname, "..");

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => data === null ? "" : JSON.stringify(data),
    json: async () => data,
  };
}

function setup(pagePath, origin = "https://portal.belmgeneraltech.co.tz") {
  const html = fs.readFileSync(path.join(root, pagePath), "utf8");
  const dom = new JSDOM(html, {
    url: `${origin}/${pagePath.replace("/index.html", "/")}`,
    runScripts: "outside-only",
  });
  dom.window.localStorage.setItem("belm_admin_token", "test-token");
  dom.window.localStorage.setItem("belm_admin_user", JSON.stringify({
    id: "user-admin",
    name: "Admin",
    role: "Super Admin",
  }));
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.confirm = () => true;
  dom.window.alert = () => {};
  return dom;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

function testJwt(payload = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  })}.signature`;
}

async function testBilling() {
  const dom = setup("frontend/billing-manager/index.html");
  const requests = [];
  const customer = {
    id: "customer-1",
    name: "Mteja Company",
    email: "mteja@example.com",
    phone: "+255700000000",
    address: "Dar es Salaam",
    tinNumber: "TIN-123",
    vrn: "VRN-456",
    machines: [{ id: "machine-1", model: "CAT 320", regNumber: "T 123 ABC" }],
  };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/customers") return response([customer]);
    if (url === "/api/settings") return response({ displayTheme: "dark" });
    if (options.method === "POST") return response({ id: "invoice-1" }, 201);
    return response([]);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/billing-manager/manager.js"), "utf8"));
  await flush();
  dom.window.document.getElementById("newInvoiceButton").click();
  const select = dom.window.document.getElementById("invoiceCustomer");
  select.value = customer.id;
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.match(dom.window.document.getElementById("invoiceCustomerInfo").textContent, /Mteja Company/);
  assert.match(dom.window.document.getElementById("invoiceCustomerInfo").textContent, /TIN-123/);
  assert.equal(dom.window.document.getElementById("invoiceMachine").options.length, 2);
  assert.equal(dom.window.document.documentElement.dataset.theme, "dark");
  assert.match(dom.window.document.getElementById("mainMenuButton").href, /\/admin-menu\/$/);

  dom.window.document.querySelector('#invoiceItems [data-field="description"]').value = "Service";
  dom.window.document.getElementById("invoiceForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/billing/invoices" && request.options.method === "POST");
  assert.ok(save, "Invoice POST request was not sent");
  assert.equal(JSON.parse(save.options.body).customerId, customer.id);
}

async function testSpareParts() {
  const dom = setup("frontend/spare-parts-manager/index.html");
  const requests = [];
  let stored = [];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/settings") return response({ displayTheme: "light" });
    if (url === "/api/spare-parts" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      stored = [{ id: "part-1", ...payload }];
      return response({ id: "part-1" }, 201);
    }
    if (url === "/api/spare-parts") return response(stored);
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/spare-parts-manager/manager.js"), "utf8"));
  await flush();
  dom.window.document.getElementById("addButton").click();
  dom.window.document.getElementById("partNumber").value = "cat-001";
  dom.window.document.getElementById("partName").value = "Oil filter";
  dom.window.document.getElementById("stockQty").value = "4";
  dom.window.document.getElementById("purchasePrice").value = "10000";
  dom.window.document.getElementById("sellingPrice").value = "14000";
  dom.window.document.getElementById("partForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/spare-parts" && request.options.method === "POST");
  assert.ok(save, "Spare-part POST request was not sent");
  assert.equal(JSON.parse(save.options.body).name, "Oil filter");
  assert.match(dom.window.document.getElementById("partsPanel").textContent, /Oil filter/);
}

async function testRoleChange() {
  const dom = setup("frontend/roles-manager/index.html");
  const requests = [];
  const roles = [
    { id: "role-admin", name: "Super Admin", allowedPages: null },
    { id: "role-tech", name: "Technician", allowedPages: [] },
  ];
  const users = [{
    id: "user-2",
    name: "Technician One",
    email: "tech@example.com",
    phone: "",
    isActive: 1,
    role: { id: "role-admin", name: "Super Admin" },
    assignedCustomer: null,
  }];
  const customers = [{ id: "customer-1", name: "Mteja Company" }];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/users" && !options.method) return response(users);
    if (url === "/api/users/roles") return response(roles);
    if (url === "/api/customers") return response(customers);
    if (url === "/api/settings") return response({ displayTheme: "light" });
    if (url === "/api/users/user-2" && options.method === "PUT") return response({ ok: true });
    if (url === "/api/users" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return response({
        id: "user-3",
        temporaryPassword: payload.password,
        recoveryCode: "BELM-ABCD-EFGH-JKLM-NPQR",
        loginUrl: "https://belm-portal.onrender.com/tech",
      }, 201);
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/roles-manager/manager.js"), "utf8"));
  await flush();
  dom.window.document.querySelector('[data-edit-user="user-2"]').click();
  const roleSelect = dom.window.document.getElementById("userRole");
  roleSelect.value = "role-tech";
  roleSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  dom.window.document.getElementById("assignedCustomer").value = "customer-1";
  dom.window.document.getElementById("userForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/users/user-2" && request.options.method === "PUT");
  assert.ok(save, "User role PUT request was not sent");
  const body = JSON.parse(save.options.body);
  assert.equal(body.roleId, "role-tech");
  assert.equal(body.assignedCustomerId, "customer-1");

  dom.window.document.getElementById("addUserButton").click();
  assert.ok(dom.window.document.getElementById("userPassword").value.length >= 8);
  dom.window.document.getElementById("userName").value = "Technician Two";
  dom.window.document.getElementById("userEmail").value = "tech2@example.com";
  dom.window.document.getElementById("userRole").value = "role-tech";
  dom.window.document.getElementById("userRole").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  dom.window.document.getElementById("assignedCustomer").value = "customer-1";
  dom.window.document.getElementById("userForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  const create = requests.find((request) => request.url === "/api/users" && request.options.method === "POST");
  assert.ok(create, "System-user POST request was not sent");
  assert.ok(dom.window.document.getElementById("userCredentialsDialog").open);
  assert.equal(dom.window.document.getElementById("systemCredentialEmail").value, "tech2@example.com");
  assert.equal(dom.window.document.getElementById("systemCredentialLink").value, "https://belm-portal.onrender.com/tech");
}

async function testSettingsSaving() {
  const dom = setup("frontend/settings-manager/index.html");
  const requests = [];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/settings" && !options.method) return response({ displayTheme: "light" });
    if (url === "/api/settings/displayTheme" && options.method === "PUT") return response({ ok: true });
    if (url.startsWith("/api/settings/") && options.method === "PUT") return response({ ok: true });
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/settings-manager/app.js"), "utf8"));
  await flush();
  dom.window.document.getElementById("darkTheme").click();
  await flush();
  assert.equal(dom.window.localStorage.getItem("belm_theme"), "dark");
  assert.equal(dom.window.document.documentElement.dataset.theme, "dark");
  assert.ok(dom.window.document.documentElement.classList.contains("dark"));
  const save = requests.find((request) => request.url === "/api/settings/displayTheme" && request.options.method === "PUT");
  assert.ok(save, "Theme preference PUT request was not sent");
  assert.equal(JSON.parse(save.options.body).value, "dark");
  dom.window.close();
}

async function testOriginalLoginStructure() {
  assert.equal(
    fs.existsSync(path.join(root, "frontend/login/index.html")),
    false,
    "The second static login page must not be shipped"
  );

  const htaccess = fs.readFileSync(path.join(root, "frontend/.htaccess"), "utf8");
  assert.doesNotMatch(htaccess, /admin\/login\/?\?\$.*R=302/);
  assert.doesNotMatch(htaccess, /portal\/login\/?\?\$.*R=302/);
  assert.match(htaccess, /RewriteRule \. \/index\.html \[L\]/);

  const bundle = fs.readFileSync(path.join(root, "frontend/assets/index-CAwFm9Z4.js"), "utf8");
  assert.match(bundle, /"\/admin\/login"/);
  assert.match(bundle, /"\/portal\/login"/);
  assert.match(bundle, /"\/tech"/);
  assert.match(bundle, /"\/auth\/login"/);
  assert.match(bundle, /"\/auth\/customer-login"/);

  const tools = fs.readFileSync(path.join(root, "frontend/portal-tools.js"), "utf8");
  assert.doesNotMatch(tools, /leaveLegacyLoginRoutes/);
  assert.doesNotMatch(tools, /installUnifiedLegacyLogin/);
  assert.doesNotMatch(tools, /\/auth\/unified-login/);

  const html = `<!doctype html><html><body>
    <form>
      <label for="legacyLogin">Email <input id="legacyLogin" type="email" required></label>
      <label for="legacyPassword">Password <input id="legacyPassword" type="password" required></label>
      <button type="submit">Login</button>
    </form>
  </body></html>`;
  const dom = new JSDOM(html, {
    url: "https://belm-portal.onrender.com/admin/login",
    runScripts: "outside-only",
  });
  dom.window.setInterval = () => 1;
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/portal-tools.js"), "utf8"));
  const submitEvent = new dom.window.Event("submit", { bubbles: true, cancelable: true });
  const wasAccepted = dom.window.document.querySelector("form").dispatchEvent(submitEvent);
  assert.equal(
    wasAccepted,
    true,
    "portal-tools must not intercept the original React login form"
  );
  dom.window.close();
}

async function testChecklistDropdownValues() {
  const dom = setup("frontend/checklist-manager/index.html");
  const requests = [];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/checklist-templates" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return response({ id: "template-1", name: payload.name, items: payload.items }, 201);
    }
    if (url === "/api/checklist-templates") return response([]);
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/checklist-manager/manager.js"), "utf8"));
  await flush();
  dom.window.document.getElementById("newButton").click();
  dom.window.document.getElementById("templateName").value = "Daily inspection";
  dom.window.document.getElementById("machineType").value = "Reach Stacker";
  let card = dom.window.document.querySelector("[data-key]");
  card.querySelector('[data-field="label"]').value = "Hydraulic level";
  card.querySelector('[data-field="label"]').dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const type = card.querySelector('[data-field="inputType"]');
  type.value = "DROPDOWN";
  type.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  card = dom.window.document.querySelector("[data-key]");
  card.querySelector('[data-option-field="value"]').value = "OK";
  card.querySelector('[data-option-field="value"]').dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  card.querySelector("[data-add-option]").click();
  card = dom.window.document.querySelector("[data-key]");
  const values = card.querySelectorAll('[data-option-field="value"]');
  values[1].value = "Critical";
  values[1].dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  const safety = card.querySelectorAll('[data-option-field="safetyLevel"]')[1];
  safety.value = "RED";
  safety.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  dom.window.document.getElementById("templateForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/checklist-templates" && request.options.method === "POST");
  assert.ok(save, "Checklist template POST request was not sent");
  const body = JSON.parse(save.options.body);
  assert.deepEqual(body.items[0].options, ["OK", "Critical"]);
  assert.equal(body.items[0].optionSafety.Critical, "RED");
}

async function testSupplierCards() {
  const dom = setup("frontend/suppliers-manager/index.html");
  const requests = [];
  let stored = [{
    id: "supplier-1",
    name: "Trusted Parts Ltd",
    specialty: "Heavy equipment parts",
    phone: "+255700111222",
    whatsapp: "+255700111222",
    email: "sales@trustedparts.co.tz",
    website: "https://trustedparts.co.tz",
    location: "Dar es Salaam",
    notes: "Verified documents",
    verified: true,
    trustScore: 95,
    trustStatus: "TRUSTED",
    trustReasons: ["Business-domain email", "Website recorded", "Verified by BELM admin"],
  }];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/settings") return response({ displayTheme: "light" });
    if (url === "/api/suppliers" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      stored.push({ id: "supplier-2", ...payload, trustScore: 70, trustStatus: "TRUSTED", trustReasons: ["WhatsApp available"] });
      return response({ id: "supplier-2", trustScore: 70, trustStatus: "TRUSTED" }, 201);
    }
    if (url === "/api/suppliers") return response(stored);
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/suppliers-manager/manager.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("supplierGrid").textContent, /Trusted Parts Ltd/);
  assert.match(dom.window.document.querySelector(".whatsapp").href, /wa\.me\/255700111222/);
  dom.window.document.getElementById("addButton").click();
  dom.window.document.getElementById("supplierName").value = "New Supplier";
  dom.window.document.getElementById("whatsapp").value = "0712345678";
  dom.window.document.getElementById("supplierForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/suppliers" && request.options.method === "POST");
  assert.ok(save, "Supplier POST request was not sent");
  assert.equal(JSON.parse(save.options.body).name, "New Supplier");
}

async function testCustomerCardsAndLinks() {
  const dom = setup("frontend/customers-manager/index.html", "https://belm-portal.onrender.com");
  const requests = [];
  const customer = {
    id: "customer-1",
    name: "ECLS ICD",
    email: "ops@ecls.co.tz",
    phone: "+255700000000",
    address: "Kurasini",
    tinNumber: "TIN-1",
    vrn: "VRN-1",
    portalLink: "ecls-icd",
    isActive: 1,
    machines: [{
      id: "machine-1",
      machineType: "Reach Stacker",
      brand: "Konecranes",
      model: "SMV4531TB6",
      regNumber: "T 123 ABC",
      serialNumber: "SN-1",
      status: "RED",
      serviceKit: "CRITICAL",
    }],
  };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/customers") return response([customer]);
    if (url === "/api/settings") return response({ displayTheme: "light" });
    if (url === "/api/customers/customer-1/reset-password" && options.method === "PUT") {
      return response({
        temporaryPassword: "TempPassword!2",
        recoveryCode: "BELM-ABCD-EFGH-JKLM-NPQR",
      });
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/customers-manager/manager.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("customerGrid").textContent, /ECLS ICD/);
  assert.ok(dom.window.document.querySelector(".machine-card.RED"));
  const portalLink = dom.window.document.querySelector(".portal-actions a").href;
  assert.equal(portalLink, "https://belm-portal.onrender.com/portal/login?customer=ecls-icd");
  assert.match(dom.window.document.querySelector(".machine-status").textContent, /Don't operate/);
  dom.window.document.querySelector('[data-reset-customer="customer-1"]').click();
  await flush();
  assert.ok(requests.some(request =>
    request.url === "/api/customers/customer-1/reset-password" && request.options.method === "PUT"
  ));
  assert.equal(dom.window.document.getElementById("credentialRecovery").value, "BELM-ABCD-EFGH-JKLM-NPQR");
}

async function testPublicRegistrationAndApprovalFlow() {
  const home = fs.readFileSync(path.join(root, "frontend/portal-home.html"), "utf8");
  assert.match(home, /Administrator Login/);
  assert.match(home, /href="\/admin\/login"/);
  assert.match(home, /Request Registration/);
  assert.match(home, /href="\/apply\/"/);

  const apply = fs.readFileSync(path.join(root, "frontend/apply/index.html"), "utf8");
  assert.match(apply, /id="applicationForm"/);
  assert.match(apply, /No password is requested here/);

  const dom = new JSDOM(apply, {
    url: "https://belm-portal.onrender.com/apply/",
    runScripts: "outside-only",
  });
  const requests = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  dom.window.scrollTo = function () {};
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return response({
      ok: true,
      reference: "BELM-C-12345678",
      status: "PENDING",
    }, 201);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/apply/app.js"), "utf8"));

  const setValue = (selector, value) => {
    dom.window.document.querySelector(selector).value = value;
  };
  setValue('#customerFields [name="companyName"]', "ECLS ICD");
  setValue('#customerFields [name="email"]', "customer@example.com");
  setValue('#customerFields [name="phone"]', "+255700000001");
  setValue('#customerFields [name="address"]', "Dar es Salaam");
  setValue('#customerFields [name="tinNumber"]', "TIN-1");
  setValue('#customerFields [name="vrn"]', "VRN-1");
  setValue('#customerFields [name="regNumber"]', "T 123 ABC");

  const machineType = dom.window.document.getElementById("machineType");
  machineType.value = "Reach Stacker";
  machineType.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  const brand = dom.window.document.getElementById("brand");
  brand.value = "Konecranes";
  brand.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  dom.window.document.getElementById("model").value = "SMV4531TB6";
  dom.window.document.querySelector('[name="consent"]').checked = true;

  dom.window.document.getElementById("applicationForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();

  const request = requests.find(item =>
    item.url === "/api/applications" && item.options.method === "POST"
  );
  assert.ok(request, "Public registration request was not submitted");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.applicationType, "CUSTOMER");
  assert.equal(payload.companyName, "ECLS ICD");
  assert.equal(payload.model, "SMV4531TB6");
  assert.equal(payload.password, undefined);
  assert.equal(dom.window.document.getElementById("referenceNo").textContent, "BELM-C-12345678");
  assert.ok(dom.window.document.getElementById("successCard").classList.contains("hidden") === false);
  dom.window.close();
}

async function testStaffRoleApproval() {
  const dom = setup("frontend/admin-applications/index.html");
  const requests = [];
  const application = {
    id: "application-1",
    applicationType: "SYSTEM_USER",
    displayName: "Technician One",
    fullName: "Technician One",
    email: "tech@example.com",
    phone: "+255700000001",
    requestedRole: "Technician",
    reason: "Machine inspections",
    referenceNo: "BELM-U-12345678",
    status: "PENDING",
    submittedAt: "2026-07-28T10:00:00Z",
  };
  dom.window.navigator.clipboard = { writeText: async () => {} };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.startsWith("/api/applications?")) return response({ applications: [application] });
    if (url === "/api/users/roles") return response([
      { id: "role-tech", name: "Technician", allowedPages: [] },
    ]);
    if (url === "/api/customers") return response([
      { id: "customer-1", name: "ECLS ICD" },
    ]);
    if (url === "/api/applications/application-1/approve" && options.method === "PUT") {
      return response({
        applicationType: "SYSTEM_USER",
        displayName: "Technician One",
        assignedRole: "Technician",
        assignedCustomerName: "ECLS ICD",
        loginEmail: "tech@example.com",
        temporaryPassword: "TempPass!234",
        recoveryCode: "BELM-ABCD-EFGH-JKLM-NPQR",
        loginUrl: "https://belm-portal.onrender.com/tech",
      });
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/admin-applications/admin.js"), "utf8"));
  await flush();
  dom.window.document.querySelector(".approve").click();
  await flush();
  assert.ok(dom.window.document.getElementById("assignmentDialog").open);
  dom.window.document.getElementById("assignmentRole").value = "role-tech";
  dom.window.document.getElementById("assignmentRole").dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  dom.window.document.getElementById("assignmentCustomer").value = "customer-1";
  dom.window.document.getElementById("assignmentForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  const approval = requests.find(request =>
    request.url === "/api/applications/application-1/approve" && request.options.method === "PUT"
  );
  assert.ok(approval, "Staff approval request was not sent");
  const payload = JSON.parse(approval.options.body);
  assert.equal(payload.roleId, "role-tech");
  assert.equal(payload.assignedCustomerId, "customer-1");
  assert.equal(dom.window.document.getElementById("approvedPassword").textContent, "TempPass!234");
  assert.match(dom.window.document.getElementById("approvedRecovery").textContent, /^BELM-/);
  assert.match(dom.window.document.getElementById("approvedLink").href, /\/tech$/);
}

async function testForgotPassword() {
  const dom = setup("frontend/forgot-password/index.html");
  const requests = [];
  dom.window.navigator.clipboard = { writeText: async () => {} };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return response({
      ok: true,
      newRecoveryCode: "BELM-NEW1-NEW2-NEW3-NEW4",
    });
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/forgot-password/app.js"), "utf8"));
  dom.window.document.getElementById("email").value = "tech@example.com";
  dom.window.document.getElementById("recoveryCode").value = "BELM-OLD1-OLD2-OLD3-OLD4";
  dom.window.document.getElementById("newPassword").value = "NewPassword!2";
  dom.window.document.getElementById("confirmPassword").value = "NewPassword!2";
  dom.window.document.getElementById("resetForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  const reset = requests.find(request => request.url === "/api/auth/recover");
  assert.ok(reset, "Self-service recovery request was not sent");
  assert.equal(JSON.parse(reset.options.body).newPassword, "NewPassword!2");
  assert.equal(dom.window.document.getElementById("newRecoveryCode").textContent, "BELM-NEW1-NEW2-NEW3-NEW4");
}

async function testRoleNavigationIsolation() {
  const dom = new JSDOM(
    '<!doctype html><html><body><nav><a id="customers" href="/customers-manager/">Customers</a><a id="billing" href="/billing-manager/">Billing</a></nav></body></html>',
    { url: "https://belm-portal.onrender.com/billing-manager/", runScripts: "outside-only" }
  );
  dom.window.localStorage.setItem("belm_admin_token", "test-token");
  dom.window.localStorage.setItem("belm_admin_user", JSON.stringify({
    role: "Accounts",
    allowedPages: ["billing"],
  }));
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/admin-access.js"), "utf8"));
  assert.equal(dom.window.document.getElementById("customers").hidden, true);
  assert.equal(dom.window.document.getElementById("billing").hidden, false);
}

async function testAdminMainMenu() {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "frontend/admin-menu/index.html"), "utf8"),
    { url: "https://belm-portal.onrender.com/admin-menu/", runScripts: "outside-only" }
  );
  dom.window.localStorage.setItem("belm_admin_token", "test-token");
  dom.window.localStorage.setItem("belm_admin_user", JSON.stringify({
    id: "user-accounts",
    name: "Accounts User",
    role: "Accounts",
    allowedPages: ["billing", "reports"],
  }));
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/admin-access.js"), "utf8"));
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/admin-menu/menu.js"), "utf8"));

  const visiblePages = Array.from(dom.window.document.querySelectorAll(".menu-card"))
    .filter((card) => !card.hidden)
    .map((card) => card.dataset.page);
  assert.deepEqual(visiblePages, ["billing", "reports"]);
  assert.match(dom.window.document.getElementById("signedInUser").textContent, /Accounts User/);
  assert.ok(dom.window.document.querySelector('.menu-card[href="/billing-manager/"]'));
  assert.ok(dom.window.document.querySelector('.menu-card[href="/reports-manager/"]'));
}

async function testAllBackLinks() {
  const adminPages = [
    "frontend/admin-menu/index.html",
    "frontend/admin-applications/index.html",
    "frontend/billing-manager/index.html",
    "frontend/checklist-manager/index.html",
    "frontend/customers-manager/index.html",
    "frontend/overview-manager/index.html",
    "frontend/reports-manager/index.html",
    "frontend/roles-manager/index.html",
    "frontend/service-request-manager/index.html",
    "frontend/settings-manager/index.html",
    "frontend/spare-parts-manager/index.html",
    "frontend/suppliers-manager/index.html",
  ];

  for (const page of adminPages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const dom = new JSDOM(html, {
      url: `https://belm-portal.onrender.com/${page.replace("frontend/", "").replace("index.html", "")}`,
    });
    const backLink = Array.from(dom.window.document.querySelectorAll('a[href="/admin-menu/"]'))
      .find((link) => /main menu|belm general tech/i.test(link.textContent));
    assert.ok(backLink, `${page} does not have a working Main Menu link`);
    assert.match(html, /\/admin-sidebar\.css/, `${page} is missing the shared sidebar stylesheet`);
    assert.match(html, /\/admin-sidebar\.js/, `${page} is missing the shared sidebar script`);
  }

  const customerUsers = fs.readFileSync(path.join(root, "frontend/customer-users/index.html"), "utf8");
  assert.match(customerUsers, /href="\/portal\/dashboard">← Customer dashboard/);
  const technicianTasks = fs.readFileSync(path.join(root, "frontend/technician-tasks/index.html"), "utf8");
  assert.match(technicianTasks, /href="\/tech">← Checklist app/);
  const publicApply = fs.readFileSync(path.join(root, "frontend/apply/index.html"), "utf8");
  assert.match(publicApply, /href="\/">Return to portal home/);
}

async function testAllOverview() {
  const dom = setup("frontend/overview-manager/index.html");
  dom.window.fetch = async (url) => {
    assert.match(url, /^\/api\/reports\/all-overview\?/);
    return response({
      period: { label: "Month", from: "2026-07-01", to: "2026-07-29" },
      totals: {
        customers: 2, machines: 3, employees: 4, activeEmployees: 4,
        pendingApplications: 1, openRequests: 2, pendingTasks: 3,
        completedTasks: 5, lowStockParts: 1,
      },
      finance: { sales: 1000000, revenue: 700000, expenses: 200000, profitLoss: 500000 },
      serviceStatus: { OPEN: 2, DONE: 3 },
      machineStatus: { GREEN: 2, RED: 1 },
      attendanceToday: { PRESENT: 3, LATE: 1 },
      roles: [{
        name: "Technician", staffTotal: 2, activeTotal: 2,
        pendingTasks: 3, completedTasks: 5,
      }],
      recentActivities: [{
        userName: "Tech One", roleName: "Technician", action: "Updated",
        entity: "Service Request", createdAt: "2026-07-29T10:00:00Z",
      }],
    });
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/overview-manager/app.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("primaryMetrics").textContent, /Customers/);
  assert.match(dom.window.document.getElementById("roleGrid").textContent, /Technician/);
  assert.match(dom.window.document.getElementById("activityList").textContent, /Tech One/);
}

async function testReportsAndAttendance() {
  const dom = setup("frontend/reports-manager/index.html");
  const requests = [];
  dom.window.URL.createObjectURL = () => "blob:test";
  dom.window.URL.revokeObjectURL = () => {};
  dom.window.print = () => {};
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.startsWith("/api/reports/analytics")) {
      return response({
        period: { label: "Month", from: "2026-07-01", to: "2026-07-29" },
        current: { sales: 1000, revenue: 800, expenses: 200, profitLoss: 600, outstanding: 200 },
        previous: { sales: 500, revenue: 400, expenses: 100, profitLoss: 300, outstanding: 100 },
        trend: [{ month: "2026-07", sales: 1000, revenue: 800, expenses: 200, profitLoss: 600 }],
        attendance: { PRESENT: 1 },
        tasks: { PENDING: 1, DONE: 2 },
        serviceRequests: { OPEN: 1, COMPLETED: 2 },
        roleActivity: [{ name: "Technician", activeUsers: 1, activities: 4, pendingTasks: 1, completedTasks: 2 }],
      });
    }
    if (url.startsWith("/api/reports/attendance") && !options.method) {
      return response({
        date: "2026-07-29",
        employees: [{
          userId: "user-1", name: "Tech One", email: "tech@example.com",
          roleName: "Technician", status: "PRESENT", checkIn: "2026-07-29T08:00:00Z",
          checkOut: null, notes: "",
        }],
      });
    }
    if (url === "/api/reports/attendance" && options.method === "POST") {
      return response({ ok: true, message: "Attendance saved successfully." });
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/reports-manager/app.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("financeMetrics").textContent, /Sales invoiced/);
  assert.match(dom.window.document.getElementById("roleTable").textContent, /Technician/);
  const saveButton = dom.window.document.querySelector("[data-save-attendance]");
  assert.ok(saveButton, "Attendance save button was not rendered");
  saveButton.click();
  await flush();
  assert.ok(requests.some((request) =>
    request.url === "/api/reports/attendance" && request.options.method === "POST"
  ));
}

(async () => {
  await testBilling();
  await testSpareParts();
  await testRoleChange();
  await testSettingsSaving();
  await testOriginalLoginStructure();
  await testChecklistDropdownValues();
  await testSupplierCards();
  await testCustomerCardsAndLinks();
  await testPublicRegistrationAndApprovalFlow();
  await testStaffRoleApproval();
  await testForgotPassword();
  await testRoleNavigationIsolation();
  await testAdminMainMenu();
  await testAllBackLinks();
  await testAllOverview();
  await testReportsAndAttendance();
  console.log("BELM UI smoke tests passed: original role login routes, managers, settings, approvals, customer links, role isolation, overview, reports, attendance, and all sidebar/Main Menu navigation.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
