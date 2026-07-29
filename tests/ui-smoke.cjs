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
  const billingCss = fs.readFileSync(path.join(root, "frontend/billing-manager/manager.css"), "utf8");
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
  let storedInvoices = [{
    id: "invoice-1",
    invoiceNo: "INV-001",
    customerId: customer.id,
    customer: { id: customer.id, name: customer.name },
    machineId: "machine-1",
    subtotal: 1000,
    tax: 180,
    total: 1180,
    dueDate: "2026-08-10",
    status: "PARTIALLY_PAID",
    items: [{ description: "Machine service", quantity: 1, unitPrice: 1000 }],
    payments: [{
      id: "payment-1",
      amount: 500,
      method: "Bank",
      reference: "TX-001",
      paidAt: "2026-07-29T10:00:00Z",
    }],
    paidAmount: 500,
    balance: 680,
  }];
  let storedExpenses = [{
    id: "expense-1",
    date: "2026-07-29",
    category: "FUEL",
    description: "Workshop fuel",
    amount: 75000,
    recordedBy: "Admin",
    receiptUrl: "/uploads/receipt-1.jpg",
  }];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/customers") return response([customer]);
    if (url === "/api/settings") return response({ displayTheme: "dark" });
    if (url === "/api/billing/invoices" && !options.method) return response(storedInvoices);
    if (url === "/api/company-expenses" && !options.method) return response(storedExpenses);
    if (url === "/api/proforma-invoices" && !options.method) return response([]);
    if (url === "/api/billing/invoices/invoice-1" && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      const subtotal = payload.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      storedInvoices[0] = {
        ...storedInvoices[0],
        ...payload,
        subtotal,
        total: subtotal + payload.tax,
        balance: subtotal + payload.tax - storedInvoices[0].paidAmount,
      };
      return response({ ok: true });
    }
    if (url === "/api/billing/invoices/invoice-1/payments/payment-1" && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      storedInvoices[0].payments[0] = { ...storedInvoices[0].payments[0], ...payload };
      storedInvoices[0].paidAmount = payload.amount;
      storedInvoices[0].balance = storedInvoices[0].total - payload.amount;
      return response({ ok: true });
    }
    if (url === "/api/company-expenses/expense-1" && options.method === "PUT") {
      storedExpenses[0] = { ...storedExpenses[0], ...JSON.parse(options.body) };
      return response({ ok: true });
    }
    if (url === "/api/billing/invoices" && options.method === "POST") {
      return response({ id: "invoice-2" }, 201);
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/billing-manager/manager.js"), "utf8"));
  await flush();

  assert.deepEqual(
    [...dom.window.document.querySelectorAll(".tabs [data-tab]")].map((button) =>
      button.textContent.replace(/\d+/g, "").trim()),
    ["Invoices", "Payments", "Expenses", "Proforma"],
  );
  assert.match(billingCss, /\.tabs\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*1fr/s);
  assert.match(dom.window.document.getElementById("paymentsPanel").textContent, /TX-001/);
  dom.window.document.querySelector('[data-tab="payments"]').click();
  assert.equal(dom.window.document.getElementById("paymentsPanel").classList.contains("hidden"), false);
  assert.equal(dom.window.document.getElementById("invoicesPanel").classList.contains("hidden"), true);
  dom.window.document.querySelector('[data-tab="invoices"]').click();
  dom.window.document.querySelector('[data-edit-invoice="invoice-1"]').click();
  assert.match(dom.window.document.getElementById("invoiceTitle").textContent, /Re-edit/);
  assert.equal(dom.window.document.getElementById("invoiceMachine").value, "machine-1");
  assert.equal(dom.window.document.querySelector('#invoiceItems [data-field="description"]').value, "Machine service");
  dom.window.document.querySelector('#invoiceItems [data-field="unitPrice"]').value = "1200";
  dom.window.document.getElementById("invoiceTax").value = "216";
  dom.window.document.getElementById("invoiceForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const invoiceEdit = requests.find((request) =>
    request.url === "/api/billing/invoices/invoice-1" && request.options.method === "PUT");
  assert.ok(invoiceEdit, "Invoice PUT request was not sent");
  assert.equal(JSON.parse(invoiceEdit.options.body).action, "edit");
  assert.equal(JSON.parse(invoiceEdit.options.body).items[0].unitPrice, 1200);

  dom.window.document.querySelector('[data-tab="payments"]').click();
  dom.window.document.querySelector('[data-edit-payment="payment-1"]').click();
  assert.match(dom.window.document.getElementById("paymentTitle").textContent, /Re-edit payment/);
  assert.equal(dom.window.document.getElementById("paymentReference").value, "TX-001");
  dom.window.document.getElementById("paymentAmount").value = "600";
  dom.window.document.getElementById("paymentReference").value = "TX-EDITED";
  dom.window.document.getElementById("paymentForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const paymentEdit = requests.find((request) =>
    request.url === "/api/billing/invoices/invoice-1/payments/payment-1"
    && request.options.method === "PUT");
  assert.ok(paymentEdit, "Payment PUT request was not sent");
  assert.equal(JSON.parse(paymentEdit.options.body).reference, "TX-EDITED");

  dom.window.document.querySelector('[data-edit-expense="expense-1"]').click();
  assert.match(dom.window.document.getElementById("expenseTitle").textContent, /Re-edit/);
  assert.equal(dom.window.document.getElementById("expenseDescription").value, "Workshop fuel");
  dom.window.document.getElementById("expenseDescription").value = "Workshop fuel corrected";
  dom.window.document.getElementById("expenseForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const expenseEdit = requests.find((request) =>
    request.url === "/api/company-expenses/expense-1" && request.options.method === "PUT");
  assert.ok(expenseEdit, "Expense PUT request was not sent");
  assert.equal(JSON.parse(expenseEdit.options.body).receiptUrl, "/uploads/receipt-1.jpg");

  dom.window.document.getElementById("newInvoiceButton").click();
  const select = dom.window.document.getElementById("invoiceCustomer");
  select.value = customer.id;
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.match(dom.window.document.getElementById("invoiceCustomerInfo").textContent, /Mteja Company/);
  assert.match(dom.window.document.getElementById("invoiceCustomerInfo").textContent, /TIN-123/);
  assert.equal(dom.window.document.getElementById("invoiceMachine").options.length, 2);
  assert.equal(dom.window.document.documentElement.dataset.theme, "dark");
  assert.match(dom.window.document.getElementById("mainMenuButton").href, /\/overview-manager\/$/);

  dom.window.document.querySelector('#invoiceItems [data-field="description"]').value = "New service";
  dom.window.document.getElementById("invoiceForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) =>
    request.url === "/api/billing/invoices" && request.options.method === "POST");
  assert.ok(save, "Invoice POST request was not sent");
  assert.equal(JSON.parse(save.options.body).customerId, customer.id);
}

async function testSpareParts() {
  const dom = setup("frontend/spare-parts-manager/index.html");
  const requests = [];
  let stored = [{
    id: "part-requested",
    partNumber: "KNE-4040",
    name: "Hydraulic return filter",
    category: "Reach Stacker",
    stockQty: 0,
    reorderThreshold: 1,
    purchasePrice: 0,
    sellingPrice: 0,
  }];
  let technicianRequests = [{
    id: "request-1",
    sparePartId: "part-requested",
    partNumber: "KNE-4040",
    partName: "Hydraulic return filter",
    description: "Hydraulic return filter",
    machineType: "Reach Stacker",
    machineBrand: "SANY",
    machineModel: "SRS45V",
    serialNumber: "SRS-001",
    customerName: "ECLS ICD",
    requestedByName: "Technician One",
    stockQty: 0,
    status: "PENDING",
  }];
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/settings") return response({ displayTheme: "light" });
    if (url === "/api/spare-parts/requests" && !options.method) {
      return response(technicianRequests);
    }
    if (url === "/api/spare-parts/requests/request-1" && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      if (payload.action === "purchase") {
        technicianRequests[0].status = "PURCHASE_REQUIRED";
      } else if (payload.action === "resolve") {
        technicianRequests = [];
      }
      return response({ ok: true });
    }
    if (url === "/api/spare-parts/part-requested" && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      stored = stored.map((part) => part.id === "part-requested" ? { ...part, ...payload } : part);
      return response({ ok: true });
    }
    if (url === "/api/spare-parts" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      stored.push({ id: "part-1", ...payload });
      return response({ id: "part-1" }, 201);
    }
    if (url === "/api/spare-parts") return response(stored);
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/spare-parts-manager/manager.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("requestsPanel").textContent, /KNE-4040/);
  assert.match(dom.window.document.getElementById("requestsPanel").textContent, /STOCK 0/);
  dom.window.document.querySelector('[data-purchase-request="request-1"]').click();
  await flush();
  assert.match(dom.window.document.getElementById("requestsPanel").textContent, /PURCHASE REQUIRED/);
  dom.window.document.querySelector('[data-add-request="request-1"]').click();
  dom.window.document.getElementById("stockQty").value = "2";
  dom.window.document.getElementById("purchasePrice").value = "25000";
  dom.window.document.getElementById("sellingPrice").value = "35000";
  dom.window.document.getElementById("partForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(dom.window.document.getElementById("requestsPanel").textContent, /No open Technician spare alerts/);
  assert.ok(requests.some((request) =>
    request.url === "/api/spare-parts/requests/request-1"
    && request.options.method === "PUT"
    && JSON.parse(request.options.body).action === "resolve"
  ));

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
  assert.match(htaccess, /admin\/login\|portal\/login\|tech/);
  assert.match(htaccess, /RewriteRule \. \/index\.html \[END\]/);

  const apache = fs.readFileSync(path.join(root, "docker/belm-apache.conf"), "utf8");
  assert.match(apache, /RewriteEngine On/);
  assert.match(apache, /admin\/login\|portal\/login\|tech/);
  assert.match(apache, /RewriteCond %\{REQUEST_URI\} !\^\/api/);
  assert.match(apache, /RewriteRule \^ \/index\.html \[END\]/);

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
  assert.match(tools, /function handoffTechnicianSession/);
  assert.match(tools, /localStorage\.setItem\("belm_tech_token", adminToken\)/);

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
      return response({
        id: "template-1",
        name: payload.name,
        serviceType: payload.serviceType,
        items: payload.items,
        serviceParts: payload.serviceParts,
      }, 201);
    }
    if (url === "/api/checklist-templates") return response([]);
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/checklist-manager/manager.js"), "utf8"));
  await flush();
  dom.window.document.getElementById("newButton").click();
  dom.window.document.getElementById("templateName").value = "Daily inspection";
  dom.window.document.getElementById("machineType").value = "Reach Stacker";
  dom.window.document.getElementById("serviceType").value = "500-hour Preventive Service";
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
  const servicePart = dom.window.document.querySelector("[data-service-part-key]");
  servicePart.querySelector('[data-service-part-field="spareName"]').value = "Engine oil filter";
  servicePart.querySelector('[data-service-part-field="spareName"]').dispatchEvent(
    new dom.window.Event("input", { bubbles: true })
  );
  servicePart.querySelector('[data-service-part-field="partNumber"]').value = "CAT-1R-1808";
  servicePart.querySelector('[data-service-part-field="partNumber"]').dispatchEvent(
    new dom.window.Event("input", { bubbles: true })
  );
  servicePart.querySelector('[data-service-part-field="quantity"]').value = "2";
  servicePart.querySelector('[data-service-part-field="quantity"]').dispatchEvent(
    new dom.window.Event("input", { bubbles: true })
  );
  dom.window.document.getElementById("templateForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await flush();
  const save = requests.find((request) => request.url === "/api/checklist-templates" && request.options.method === "POST");
  assert.ok(save, "Checklist template POST request was not sent");
  const body = JSON.parse(save.options.body);
  assert.deepEqual(body.items[0].options, ["OK", "Critical"]);
  assert.equal(body.items[0].optionSafety.Critical, "RED");
  assert.equal(body.serviceType, "500-hour Preventive Service");
  assert.deepEqual(body.serviceParts[0], {
    spareName: "Engine oil filter",
    partNumber: "CAT-1R-1808",
    quantity: 2,
  });
}

async function testSupplierCards() {
  const dom = setup("frontend/suppliers-manager/index.html");
  const requests = [];
  const openedWindows = [];
  dom.window.open = (url, target, features) => {
    openedWindows.push({ url, target, features });
    return { opener: dom.window };
  };
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
  dom.window.document.getElementById("googleSearchInput").value = "CAT 320D 1R-1808";
  dom.window.document.getElementById("googleSearchType").value = "parts-diagrams";
  dom.window.document.getElementById("googleSearchForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  assert.equal(openedWindows.length, 1);
  assert.equal(openedWindows[0].target, "_blank");
  assert.match(openedWindows[0].features, /noopener/);
  const googleUrl = new URL(openedWindows[0].url);
  assert.equal(googleUrl.origin, "https://www.google.com");
  assert.match(googleUrl.searchParams.get("q"), /CAT 320D 1R-1808 parts diagram exploded view parts catalogue/);
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

async function testSidebarStartsWithAllOverview() {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "frontend/overview-manager/index.html"), "utf8"),
    { url: "https://belm-portal.onrender.com/overview-manager/", runScripts: "outside-only" }
  );
  dom.window.localStorage.setItem("belm_admin_token", "test-token");
  dom.window.localStorage.setItem("belm_admin_user", JSON.stringify({
    id: "user-admin",
    name: "Admin",
    role: "Super Admin",
    allowedPages: null,
  }));
  dom.window.fetch = async () => response({ applications: [] });
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/admin-sidebar.js"), "utf8"));

  const labels = Array.from(dom.window.document.querySelectorAll(".belm-sidebar-link"))
    .map((link) => link.textContent.trim());
  assert.equal(labels.some((label) => /Main Menu/i.test(label)), false);
  assert.match(labels[0], /All Overview/);
  assert.match(labels[1], /Registration & Role Approval/);
  assert.match(labels[2], /Service Requests/);
  assert.match(labels[3], /Reports, Analysis & Comparison/);
  assert.equal(dom.window.document.querySelectorAll(".belm-sidebar-link.workflow").length, 3);
  const sections = Array.from(dom.window.document.querySelectorAll(".belm-sidebar-section"))
    .map((heading) => heading.textContent.trim());
  assert.deepEqual(sections, [
    "Main workflow",
    "Customers & maintenance",
    "Finance & administration",
  ]);
  assert.match(dom.window.document.querySelector(".belm-sidebar-brand").href, /\/overview-manager\/$/);
  assert.ok(dom.window.document.querySelector(".belm-admin-sidebar #activityList"));
  assert.match(dom.window.document.querySelector(".belm-sidebar-activity-head").textContent, /Recent Employee Activity/);
  assert.equal(dom.window.document.querySelector(".management-shell #activityList"), null);

  const retiredPage = fs.readFileSync(path.join(root, "frontend/admin-menu/index.html"), "utf8");
  assert.doesNotMatch(retiredPage, /<h1>Main Menu<\/h1>/);
  assert.match(retiredPage, /url=\/overview-manager\//);
}

async function testAllBackLinks() {
  const adminPages = [
    "frontend/admin-applications/index.html",
    "frontend/billing-manager/index.html",
    "frontend/checklist-manager/index.html",
    "frontend/customers-manager/index.html",
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
    const backLink = Array.from(dom.window.document.querySelectorAll('a[href="/overview-manager/"]'))
      .find((link) => /all overview|belm general tech|belm admin/i.test(link.textContent));
    assert.ok(backLink, `${page} does not have a working All Overview link`);
    assert.match(html, /\/admin-sidebar\.css/, `${page} is missing the shared sidebar stylesheet`);
    assert.match(html, /\/admin-sidebar\.js/, `${page} is missing the shared sidebar script`);
  }

  const overview = fs.readFileSync(path.join(root, "frontend/overview-manager/index.html"), "utf8");
  assert.doesNotMatch(overview, /Main Menu/);
  assert.match(overview, /\/admin-sidebar\.js/);

  const customerUsers = fs.readFileSync(path.join(root, "frontend/customer-users/index.html"), "utf8");
  assert.match(customerUsers, /href="\/portal\/dashboard">← Customer dashboard/);
  const technicianTasks = fs.readFileSync(path.join(root, "frontend/technician-tasks/index.html"), "utf8");
  assert.match(technicianTasks, /href="\/tech">← Checklist app/);
  const publicApply = fs.readFileSync(path.join(root, "frontend/apply/index.html"), "utf8");
  assert.match(publicApply, /href="\/">Return to portal home/);
}

async function testCustomerMachineExpenseCards() {
  const token = testJwt({
    type: "customer",
    id: "customer-1",
    actorType: "owner",
    customerRole: "owner",
  });
  const dom = new JSDOM(
    '<!doctype html><html><body><button id="generic-service">+ Request service</button><button id="machine-card">CAT 320 <span>Forklift · SN-1</span><span>Never checked</span></button></body></html>',
    {
      url: "https://belm-portal.onrender.com/portal/dashboard",
      runScripts: "outside-only",
    }
  );
  dom.window.localStorage.setItem("belm_customer_token", token);
  dom.window.setInterval = () => 1;
  dom.window.fetch = async (url) => {
    if (url === "/api/customer-portal/dashboard") {
      return response({
        machines: [{
          id: "machine-1",
          model: "CAT 320",
          machineType: "Forklift",
          serialNumber: "SN-1",
        }],
      });
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/portal-tools.js"), "utf8"));
  await flush();

  const card = dom.window.document.getElementById("machine-card");
  assert.equal(card.classList.contains("belm-customer-machine-card"), true);
  assert.match(card.querySelector(".belm-machine-expense-link").textContent, /Machine Expenses/);
  assert.match(card.querySelector(".belm-machine-service-link").textContent, /Request Service/);
  assert.equal(dom.window.document.getElementById("generic-service").hidden, true);
}

async function testCheckedChecklistReportViewer() {
  const token = testJwt({
    type: "customer",
    id: "customer-1",
    actorType: "owner",
    customerRole: "owner",
  });
  const dom = new JSDOM(
    '<!doctype html><html><body><main><h2>SRS45V — Checklist reports</h2><div class="report-actions"><span>GREEN</span><a href="/api/customer-portal/reports/report-1/download">Download</a></div></main></body></html>',
    {
      url: "https://belm-portal.onrender.com/portal/dashboard",
      runScripts: "outside-only",
    }
  );
  dom.window.localStorage.setItem("belm_customer_token", token);
  dom.window.setInterval = () => 1;
  let printed = false;
  dom.window.print = () => { printed = true; };
  dom.window.fetch = async (url) => {
    if (url === "/api/customer-portal/dashboard") return response({ machines: [] });
    if (url === "/api/customer-portal/reports/report-1/download") {
      return response({
        id: "report-1",
        machine: {
          id: "machine-1",
          brand: "SANY",
          model: "SRS45V",
          machineType: "Reach Stacker",
          serialNumber: "SRS-001",
        },
        customerName: "ECLS ICD",
        templateName: "500-hour Service Checklist",
        filledBy: "Technician One",
        hourMeterReading: 1250,
        overallStatus: "YELLOW",
        createdAt: "2026-07-29T10:00:00Z",
        answers: [{
          label: "Engine oil level",
          value: "Low",
          safetyLevel: "YELLOW",
          photoUrl: "https://example.com/oil.jpg",
        }],
      });
    }
    return response(null, 404);
  };

  dom.window.eval(fs.readFileSync(path.join(root, "frontend/portal-tools.js"), "utf8"));
  await flush();

  const viewButton = dom.window.document.querySelector(".belm-view-checked-report");
  assert.ok(viewButton, "Checklist report is missing the View Checked Report button");
  assert.match(viewButton.textContent, /View Checked Report/);
  viewButton.click();
  await flush();

  const modal = dom.window.document.getElementById("belmCheckedReportModal");
  assert.ok(modal, "Checked report modal did not open");
  assert.match(modal.textContent, /SANY SRS45V — Checked Report/);
  assert.match(modal.textContent, /Technician One/);
  assert.match(modal.textContent, /Engine oil level/);
  assert.match(modal.textContent, /Low/);
  assert.match(modal.textContent, /YELLOW/);
  assert.match(modal.querySelector('a[target="_blank"]').href, /example\.com\/oil\.jpg/);
  modal.querySelector("[data-print-checked-report]").click();
  assert.equal(printed, true);

  const backend = fs.readFileSync(path.join(root, "backend/api/customer_portal.php"), "utf8");
  assert.match(backend, /customer_checklist_report_view/);
  assert.match(backend, /m\.model AS machine_model/);
  assert.match(backend, /customer_checklist_answer_view/);
}

async function testTechnicianCheckedReportFlow() {
  const token = testJwt({
    type: "staff",
    id: "tech-1",
    roleName: "Technician",
    assignedCustomerId: "customer-1",
  });
  const dom = new JSDOM(
    '<!doctype html><html><body><main><section class="p-5 max-w-3xl mx-auto"><div id="tech-page"><div><h2>ECLS ICD</h2></div><div class="grid"><button id="srs-machine">SRS45V <span>Reach Stacker · SRS-001</span></button></div></div><button id="save-checklist">Submit report</button><input id="photo-input" required placeholder="Photo upload — wire up file input for production"></section></main></body></html>',
    {
      url: "https://belm-portal.onrender.com/tech",
      runScripts: "outside-only",
    }
  );
  dom.window.localStorage.setItem("belm_tech_token", token);
  dom.window.localStorage.setItem("belm_tech_user", JSON.stringify({
    id: "tech-1",
    name: "Technician One",
    assignedCustomerId: "customer-1",
    assignedCustomerName: "ECLS ICD",
  }));
  dom.window.setInterval = () => 1;
  dom.window.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/jpeg;base64,QUJD";
      if (this.onload) this.onload();
    }
  };
  dom.window.Image = class {
    constructor() {
      this.naturalWidth = 1600;
      this.naturalHeight = 1200;
    }
    set src(value) {
      this._src = value;
      if (this.onload) this.onload();
    }
    get src() {
      return this._src;
    }
  };
  const createElement = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = (tagName, options) => {
    const element = createElement(tagName, options);
    if (String(tagName).toLowerCase() === "canvas") {
      element.getContext = () => ({
        fillStyle: "",
        fillRect() {},
        drawImage() {},
      });
      element.toDataURL = () => `data:image/jpeg;base64,${"A".repeat(1200)}`;
    }
    return element;
  };
  class FakeChecklistXhr extends dom.window.EventTarget {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send() {
      this.status = 201;
      this.response = null;
      this.responseText = JSON.stringify({
        id: "report-srs45v",
        machineId: "machine-srs45v",
        machine: {
          id: "machine-srs45v",
          brand: "SANY",
          model: "SRS45V",
          machineType: "Reach Stacker",
          serialNumber: "SRS-001",
        },
        customerName: "ECLS ICD",
        templateName: "Daily Inspection",
        filledBy: "Technician One",
        hourMeterReading: 1880,
        overallStatus: "GREEN",
        createdAt: "2026-07-29T11:00:00Z",
        expiresAt: "2026-07-30T00:00:00+03:00",
        isExpired: false,
        canEdit: true,
        answers: [{
          templateItemId: "item-oil",
          label: "Engine oil level",
          value: "OK",
          safetyLevel: "GREEN",
          inputType: "DROPDOWN",
          options: ["OK", "Low"],
          isRequired: true,
        }],
      });
      this.dispatchEvent(new dom.window.Event("load"));
      this.dispatchEvent(new dom.window.Event("loadend"));
    }
  }
  dom.window.XMLHttpRequest = FakeChecklistXhr;
  let reportValue = "OK";
  let reportStatus = "GREEN";
  const checklistUpdates = [];
  const technicianSpareRequests = [];
  const technicianSpareEdits = [];
  const inventoryRequests = [];
  dom.window.fetch = async (url, options = {}) => {
    if (url === "/api/customers/customer-1") {
      return response({
        id: "customer-1",
        name: "ECLS ICD",
        email: "operations@ecls.co.tz",
        phone: "+255 700 123 456",
        address: "Kurasini, Dar es Salaam",
        tinNumber: "1242456",
        vrn: "12456566",
        isActive: 1,
        machines: [{
          id: "machine-srs45v",
          brand: "SANY",
          model: "SRS45V",
          machineType: "Reach Stacker",
          serialNumber: "SRS-001",
          regNumber: "T 123 ABC",
          serviceKit: "OK",
          status: "RED",
          lastCheckedAt: "2026-07-29T11:00:00Z",
        }],
      });
    }
    if (url === "/api/tasks/user/tech-1") return response([]);
    if (url === "/api/spare-parts/requests" && !options.method) {
      return response(inventoryRequests);
    }
    if (url === "/api/spare-parts/requests" && options.method === "POST") {
      const payload = JSON.parse(options.body);
      technicianSpareRequests.push(payload);
      inventoryRequests.unshift({
        id: "spare-request-1",
        machineId: payload.machineId,
        machineType: payload.machineType,
        partNumber: payload.partNumber,
        description: payload.description,
        status: "PENDING",
        machineBrand: "SANY",
        machineModel: "SRS45V",
        customerName: "ECLS ICD",
        createdAt: "2026-07-29T11:30:00Z",
      });
      return response({
        id: "spare-request-1",
        stockQty: 0,
        status: "PENDING",
        message: "Spare request sent to Inventory. Stock is 0; addition or purchase is required.",
      }, 201);
    }
    if (url === "/api/spare-parts/requests/spare-request-1" && options.method === "PUT") {
      const payload = JSON.parse(options.body);
      technicianSpareEdits.push(payload);
      Object.assign(inventoryRequests[0], payload);
      return response({
        ok: true,
        id: "spare-request-1",
        status: "PENDING",
        message: "Inventory Request updated successfully.",
      });
    }
    if (
      url === "/api/checklist-reports/report-srs45v"
      && String(options.method || "GET").toUpperCase() === "PUT"
    ) {
      const payload = JSON.parse(options.body);
      checklistUpdates.push(payload);
      reportValue = payload.answers[0].value;
      reportStatus = reportValue === "Low" ? "YELLOW" : "GREEN";
      return response({
        id: "report-srs45v",
        overallStatus: reportStatus,
        canEdit: true,
        expiresAt: "2026-07-30T00:00:00+03:00",
      });
    }
    if (url === "/api/checklist-reports/machine/machine-srs45v") {
      return response([{
        id: "report-srs45v",
        machine: {
          id: "machine-srs45v",
          brand: "SANY",
          model: "SRS45V",
          machineType: "Reach Stacker",
          serialNumber: "SRS-001",
        },
        customerName: "ECLS ICD",
        templateName: "Daily Inspection",
        filledBy: "Technician One",
        hourMeterReading: 1880,
        overallStatus: reportStatus,
        createdAt: "2026-07-29T11:00:00Z",
        expiresAt: "2026-07-30T00:00:00+03:00",
        isExpired: false,
        canEdit: true,
        answers: [{
          templateItemId: "item-oil",
          label: "Engine oil level",
          value: reportValue,
          safetyLevel: reportStatus,
          inputType: "DROPDOWN",
          options: ["OK", "Low"],
          isRequired: true,
        }],
      }]);
    }
    return response(null, 404);
  };

  dom.window.eval(fs.readFileSync(path.join(root, "frontend/portal-tools.js"), "utf8"));
  await flush();

  const customerCard = dom.window.document.getElementById("belmTechnicianCustomerCard");
  assert.ok(customerCard, "Technician dashboard is missing the assigned customer card");
  assert.match(customerCard.textContent, /ECLS ICD/);
  assert.match(customerCard.textContent, /Kurasini, Dar es Salaam/);
  assert.match(customerCard.textContent, /\+255 700 123 456/);
  assert.match(customerCard.textContent, /operations@ecls\.co\.tz/);
  assert.match(customerCard.textContent, /1242456 \/ 12456566/);
  assert.match(dom.window.document.getElementById("belmTechnicianMachineListHeading").textContent, /Machine List/);
  const photoInput = dom.window.document.getElementById("photo-input");
  assert.equal(photoInput.hidden, true);
  const photoUploader = photoInput.parentElement.querySelector(".belm-checklist-photo-uploader");
  assert.ok(photoUploader, "PHOTO checklist item is missing the low-MB uploader");
  assert.match(photoUploader.textContent, /compressed automatically below about 0.5 MB/);
  const photoFileInput = photoUploader.querySelector('input[type="file"]');
  assert.equal(photoFileInput.accept, "image/jpeg,image/png,image/webp");
  Object.defineProperty(photoFileInput, "files", {
    configurable: true,
    value: [{ type: "image/jpeg", size: 2 * 1024 * 1024 }],
  });
  photoFileInput.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await flush();
  assert.match(photoInput.value, /^data:image\/jpeg;base64,/);
  assert.match(photoUploader.textContent, /2\.00 MB reduced to 1 KB/);

  const addSpareButton = dom.window.document.getElementById("belm-tech-spare-shortcut");
  assert.ok(addSpareButton, "Technician dashboard is missing Add Spare");
  addSpareButton.click();
  await flush();
  const spareModal = dom.window.document.getElementById("belmTechnicianSpareModal");
  assert.ok(spareModal, "Technician Add Spare form did not open");
  assert.equal(spareModal.querySelector('[name="machineType"]').value, "Reach Stacker");
  spareModal.querySelector('[name="partNumber"]').value = "kne-4040";
  spareModal.querySelector('[name="description"]').value = "Hydraulic return filter";
  spareModal.querySelector("form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  assert.equal(technicianSpareRequests.length, 1);
  assert.equal(technicianSpareRequests[0].machineId, "machine-srs45v");
  assert.equal(technicianSpareRequests[0].machineType, "Reach Stacker");
  assert.equal(technicianSpareRequests[0].partNumber, "kne-4040");
  assert.match(spareModal.textContent, /Stock is 0/);
  await flush();
  const reeditButton = spareModal.querySelector("[data-reedit-tech-spare]");
  assert.ok(reeditButton, "Technician Inventory Request is missing Re-edit");
  reeditButton.click();
  assert.match(spareModal.querySelector("#belmTechnicianSpareTitle").textContent, /Re-edit Inventory Request/);
  spareModal.querySelector('[name="description"]').value = "Hydraulic return filter — corrected";
  spareModal.querySelector("form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  await flush();
  assert.equal(technicianSpareEdits.length, 1);
  assert.equal(technicianSpareEdits[0].action, "edit");
  assert.equal(technicianSpareEdits[0].description, "Hydraulic return filter — corrected");
  assert.match(spareModal.textContent, /Inventory Request updated successfully/);
  spareModal.querySelector("[data-close-tech-spare]").click();

  const machineCard = dom.window.document.getElementById("srs-machine");
  assert.equal(dom.window.document.getElementById("save-checklist").textContent, "Save Checklist");
  assert.equal(machineCard.classList.contains("belm-technician-machine-card"), true);
  assert.match(machineCard.querySelector(".belm-technician-machine-data").textContent, /SANY/);
  assert.match(machineCard.querySelector(".belm-technician-machine-data").textContent, /T 123 ABC/);
  assert.match(machineCard.querySelector(".belm-technician-machine-health").textContent, /RED/);
  assert.match(machineCard.querySelector(".belm-technician-machine-health").textContent, /Critical condition/);
  assert.match(machineCard.querySelector(".belm-technician-machine-health").textContent, /Do not operate/);
  const checkedReports = machineCard.querySelector(".belm-technician-report-link");
  assert.ok(checkedReports, "Technician machine card is missing Checked Reports");
  checkedReports.click();
  await flush();

  const history = dom.window.document.getElementById("belmTechnicianReportHistory");
  assert.ok(history, "Technician checklist report history did not open");
  assert.match(history.textContent, /SANY SRS45V — Checklist Reports/);
  assert.match(history.textContent, /Daily Inspection/);
  assert.match(history.textContent, /View Checked Report/);
  history.querySelector("[data-view-technician-report]").click();

  const report = dom.window.document.getElementById("belmCheckedReportModal");
  assert.ok(report, "Technician checked report did not open");
  assert.match(report.textContent, /SANY SRS45V — Checked Report/);
  assert.match(report.textContent, /Engine oil level/);
  assert.match(report.textContent, /OK/);
  assert.match(report.textContent, /Editable until/);
  const editButton = report.querySelector("[data-edit-checked-report]");
  assert.ok(editButton, "Same-day Technician report is missing Edit Checklist");
  editButton.click();

  const editModal = dom.window.document.getElementById("belmCheckedReportModal");
  assert.match(editModal.textContent, /Editing closes automatically at 00:00/);
  const editAnswer = editModal.querySelector('[data-checklist-answer="0"]');
  editAnswer.value = "Low";
  editModal.querySelector("form").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();
  await flush();
  assert.equal(checklistUpdates.length, 1);
  assert.equal(checklistUpdates[0].answers[0].templateItemId, "item-oil");
  assert.equal(checklistUpdates[0].answers[0].value, "Low");
  const editedReport = dom.window.document.getElementById("belmCheckedReportModal");
  assert.match(editedReport.textContent, /Low/);
  assert.match(editedReport.textContent, /YELLOW/);
  editedReport.querySelector("[data-close-checked-report]").click();

  const saveXhr = new dom.window.XMLHttpRequest();
  saveXhr.open("POST", "https://belm-portal.onrender.com/api/checklist-reports");
  saveXhr.send(JSON.stringify({
    machineId: "machine-srs45v",
    templateId: "template-daily",
    hourMeterReading: 1880,
    answers: [],
  }));
  await flush();
  await flush();
  await flush();
  const autoOpenedReport = dom.window.document.getElementById("belmCheckedReportModal");
  assert.ok(autoOpenedReport, "Saved Technician checklist did not open its Checked Report");
  assert.match(autoOpenedReport.textContent, /SANY SRS45V — Checked Report/);
  assert.equal(
    dom.window.document.documentElement.dataset.belmChecklistSaveViewer,
    "ready"
  );

  const backend = fs.readFileSync(path.join(root, "backend/api/checklist_reports.php"), "utf8");
  assert.match(backend, /checklist_report_api_view/);
  assert.match(backend, /json_out\(\$savedReport, 201\)/);
  assert.match(backend, /SELECT cr\.\*, ct\.name AS template_name/);
  assert.match(backend, /CHECKLIST_REPORT_TIMEZONE = 'Africa\/Dar_es_Salaam'/);
  assert.match(backend, /checklist_report_is_expired/);
  assert.match(backend, /expired at 00:00 Tanzania time/);
  assert.match(backend, /\$method === 'PUT' && \$action === 'update'/);
  assert.match(backend, /customer_name/);
  assert.match(backend, /template_name/);
  assert.match(backend, /validated_checklist_photo_url/);
  assert.match(backend, /500 \* 1024/);
  assert.match(backend, /data:image/);
  const spareBackend = fs.readFileSync(path.join(root, "backend/api/spare_part_requests.php"), "utf8");
  assert.match(spareBackend, /Only a BELM Technician/);
  assert.match(spareBackend, /assignedCustomerId/);
  assert.match(spareBackend, /stock_qty.*> 0/s);
  assert.match(spareBackend, /PURCHASE_REQUIRED/);
  assert.match(spareBackend, /Technicians can only re-edit a pending Inventory Request/);
  assert.match(spareBackend, /Inventory Request updated successfully/);
  const customerBackend = fs.readFileSync(path.join(root, "backend/api/customers.php"), "utf8");
  assert.match(customerBackend, /SELECT id, name, email, phone, address, tin_number, vrn, is_active/);
  const theme = fs.readFileSync(path.join(root, "frontend/belm-theme.css"), "utf8");
  assert.match(theme, /\.belm-technician-customer-card/);
  assert.match(theme, /\.belm-technician-machine-grid/);
  assert.match(theme, /min-height: 330px !important/);
  assert.match(theme, /\.belm-checklist-photo-uploader/);
  assert.match(theme, /\.belm-technician-request-history/);
  const checklistManager = fs.readFileSync(
    path.join(root, "frontend/checklist-manager/manager.js"),
    "utf8"
  );
  assert.match(checklistManager, /camera\/file uploader/);
  assert.match(checklistManager, /compressed automatically to 0\.5 MB or less/);
}

async function testCustomerMachineExpenses() {
  const token = testJwt({
    type: "customer",
    id: "customer-1",
    actorType: "owner",
    customerRole: "owner",
  });
  const html = fs.readFileSync(
    path.join(root, "frontend/customer-machine-expenses/index.html"),
    "utf8"
  );
  const dom = new JSDOM(html, {
    url: "https://belm-portal.onrender.com/customer-machine-expenses/?machine=machine-1",
    runScripts: "outside-only",
  });
  dom.window.localStorage.setItem("belm_customer_token", token);
  const requests = [];
  const expenseData = {
    machine: {
      id: "machine-1",
      model: "CAT 320",
      machineType: "Forklift",
      serialNumber: "SN-1",
      regNumber: "T 123 ABC",
      brand: "CAT",
    },
    summary: {
      recordCount: 1,
      totalQuantity: 2,
      totalCost: 300000,
      averageCost: 300000,
      receiptCount: 1,
    },
    expenses: [{
      date: "2026-07-29",
      part_number: "P-1",
      description: "Oil filter",
      quantity: 2,
      unit: "PC",
      unit_price: 150000,
      cost: 300000,
      has_receipt: true,
      logged_by: "Customer",
    }],
  };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/customer-portal/machine-expenses/machine-1" && options.method === "POST") {
      return response({ id: "expense-2", cost: 300 }, 201);
    }
    if (url === "/api/customer-portal/machine-expenses/machine-1") {
      return response(expenseData);
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(
    path.join(root, "frontend/customer-machine-expenses/expenses.js"),
    "utf8"
  ));
  await flush();

  assert.match(dom.window.document.getElementById("pageTitle").textContent, /CAT CAT 320 expenses/);
  assert.match(dom.window.document.getElementById("totalCost").textContent, /300,000/);
  assert.match(dom.window.document.getElementById("expenseRows").textContent, /Oil filter/);
  assert.equal(dom.window.document.getElementById("receiptCount").textContent, "1");
  assert.match(dom.window.document.getElementById("expenseRows").textContent, /View photo/);
  assert.ok(dom.window.document.getElementById("csvButton"));
  assert.ok(dom.window.document.getElementById("pdfButton"));

  dom.window.document.getElementById("description").value = "Fuel filter";
  dom.window.document.getElementById("partNumber").value = "P-2";
  dom.window.document.getElementById("quantity").value = "3";
  dom.window.document.getElementById("unitPrice").value = "100";
  dom.window.document.getElementById("expenseForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();

  const save = requests.find(request =>
    request.url === "/api/customer-portal/machine-expenses/machine-1"
    && request.options.method === "POST"
  );
  assert.ok(save, "Machine expense POST request was not sent");
  const payload = JSON.parse(save.options.body);
  assert.equal(payload.description, "Fuel filter");
  assert.equal(payload.partNumber, "P-2");
  assert.equal(payload.quantity, 3);
  assert.equal(payload.unitPrice, 100);
  assert.equal(payload.receiptPhoto, "");

  const backend = fs.readFileSync(path.join(root, "backend/api/customer_portal.php"), "utf8");
  const schema = fs.readFileSync(path.join(root, "backend/schema.sql"), "utf8");
  assert.match(backend, /Content-Type: application\/pdf/);
  assert.match(backend, /Content-Type: text\/csv/);
  assert.match(schema, /ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS part_number/);
  assert.match(schema, /receipt_photo_data/);
}

async function testMachineAwareServiceRequest() {
  const token = testJwt({
    type: "customer",
    id: "customer-1",
    actorType: "owner",
    customerRole: "owner",
  });
  const html = fs.readFileSync(
    path.join(root, "frontend/customer-service-request/index.html"),
    "utf8"
  );
  const dom = new JSDOM(html, {
    url: "https://belm-portal.onrender.com/customer-service-request/?machine=machine-1",
    runScripts: "outside-only",
  });
  dom.window.localStorage.setItem("belm_customer_token", token);
  const requests = [];
  const optionData = {
    machine: {
      id: "machine-1",
      machineType: "Reach Stacker",
      brand: "Konecranes",
      model: "SMV4531TB6",
      serialNumber: "SN-1",
      regNumber: "T 123 ABC",
    },
    serviceOptions: [{
      id: "template-1",
      name: "Reach Stacker 500 Hour",
      serviceType: "500-hour Preventive Service",
      serviceParts: [{
        id: "template-part-1",
        spareName: "Engine oil filter",
        partNumber: "CAT-1R-1808",
        quantity: 2,
      }],
    }],
  };
  dom.window.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/customer-portal/service-options/machine-1") {
      return response(optionData);
    }
    if (url === "/api/customer-portal/service-requests" && options.method === "POST") {
      return response({
        id: "service-request-1",
        serviceType: "500-hour Preventive Service",
        serviceParts: optionData.serviceOptions[0].serviceParts,
      }, 201);
    }
    return response(null, 404);
  };
  dom.window.eval(fs.readFileSync(
    path.join(root, "frontend/customer-service-request/request.js"),
    "utf8"
  ));
  await flush();

  assert.match(dom.window.document.getElementById("pageTitle").textContent, /Konecranes SMV4531TB6/);
  assert.match(dom.window.document.getElementById("partsList").textContent, /Engine oil filter/);
  assert.match(dom.window.document.getElementById("partsList").textContent, /CAT-1R-1808/);
  dom.window.document.getElementById("serviceForm").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true })
  );
  await flush();

  const save = requests.find(request =>
    request.url === "/api/customer-portal/service-requests"
    && request.options.method === "POST"
  );
  assert.ok(save, "Machine-aware service request POST was not sent");
  const payload = JSON.parse(save.options.body);
  assert.equal(payload.machineId, "machine-1");
  assert.equal(payload.templateId, "template-1");
  assert.equal(payload.serviceType, "500-hour Preventive Service");

  const schema = fs.readFileSync(path.join(root, "backend/schema.sql"), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS checklist_template_parts/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS service_request_parts/);
}

async function testAllOverview() {
  const dom = setup("frontend/overview-manager/index.html");
  dom.window.fetch = async (url) => {
    if (url === "/api/applications?status=PENDING") return response({ applications: [] });
    assert.match(url, /^\/api\/reports\/all-overview\?/);
    return response({
      period: { label: "Month", from: "2026-07-01", to: "2026-07-29" },
      totals: {
        customers: 2, machines: 3, employees: 4, activeEmployees: 4,
        pendingApplications: 1, openRequests: 2, pendingTasks: 3,
        completedTasks: 5, lowStockParts: 1,
      },
      finance: { sales: 1000000, revenue: 700000, expenses: 200000, profitLoss: 500000 },
      inventory: {
        summary: {
          totalPartTypes: 2,
          totalStockQty: 13,
          lowStockParts: 1,
          outOfStockParts: 0,
          purchaseStockValue: 850000,
          sellingStockValue: 1100000,
          potentialMargin: 250000,
        },
        items: [{
          id: "part-1",
          name: "Engine oil filter",
          partNumber: "CAT-1R-1808",
          category: "Filters",
          stockQty: 3,
          reorderThreshold: 5,
          purchaseStockValue: 300000,
          stockStatus: "LOW_STOCK",
        }],
      },
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
  const activitySidebar = dom.window.document.createElement("aside");
  activitySidebar.className = "belm-admin-sidebar";
  activitySidebar.innerHTML = '<div id="activityList" class="belm-sidebar-activity-list"></div>';
  dom.window.document.body.prepend(activitySidebar);
  dom.window.eval(fs.readFileSync(path.join(root, "frontend/overview-manager/app.js"), "utf8"));
  await flush();
  assert.match(dom.window.document.getElementById("primaryMetrics").textContent, /Customers/);
  assert.match(dom.window.document.getElementById("roleGrid").textContent, /Technician/);
  assert.match(dom.window.document.getElementById("activityList").textContent, /Tech One/);
  assert.ok(dom.window.document.querySelector(".belm-admin-sidebar #activityList"));
  assert.equal(dom.window.document.querySelector(".management-shell #activityList"), null);
  assert.doesNotMatch(dom.window.document.querySelector(".management-shell").textContent, /Recent employee activity/i);
  assert.match(dom.window.document.getElementById("inventoryMetrics").textContent, /Purchase stock value/);
  assert.match(dom.window.document.getElementById("inventoryRows").textContent, /Engine oil filter/);
  assert.match(dom.window.document.getElementById("inventoryRows").textContent, /CAT-1R-1808/);
  assert.match(dom.window.document.getElementById("inventoryRows").textContent, /LOW STOCK/);

  const backend = fs.readFileSync(path.join(root, "backend/api/reports.php"), "utf8");
  assert.match(backend, /purchase_stock_value/);
  assert.match(backend, /OUT_OF_STOCK/);
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
  await testSidebarStartsWithAllOverview();
  await testAllBackLinks();
  await testCustomerMachineExpenseCards();
  await testCheckedChecklistReportViewer();
  await testTechnicianCheckedReportFlow();
  await testCustomerMachineExpenses();
  await testMachineAwareServiceRequest();
  await testAllOverview();
  await testReportsAndAttendance();
  console.log("BELM UI smoke tests passed: vertical Billing Review sidebar and separate Payments review, invoice/payment/expense Re-edit, original role login routes, managers, settings, approvals, customer links, Technician Inventory Request history and pending Re-edit, low-MB checklist PHOTO uploader, Add Spare zero-stock Inventory alerts and purchase/addition workflow, Technician Save Checklist auto-opens Checked Report, same-day checklist editing with Tanzania-midnight expiry lock, Technician machine checked-report history, customer checked-report viewer, receipt-backed machine expenses, model-aware service requests, synchronized checklist parts, Google technical supplier search, live inventory overview, role isolation, All Overview navigation, reports, attendance, and arranged left workflow sidebar access.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
