const token = localStorage.getItem("belm_admin_token");
const list = document.getElementById("applicationList");
const alertBox = document.getElementById("alertBox");
const tabs = [...document.querySelectorAll(".tabs button")];
const dialog = document.getElementById("approvalDialog");
const assignmentDialog = document.getElementById("assignmentDialog");
let activeStatus = "PENDING";
let lastApproval = null;
let pendingStaffApplication = null;
let roles = [];
let customers = [];

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined && text !== null) item.textContent = String(text);
  return item;
}

function detail(label, value) {
  const box = element("div", "detail");
  box.append(element("label", "", label), element("span", "", value || "—"));
  return box;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (_) {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem("belm_admin_token");
    location.href = "/admin/login";
    throw new Error("Your session has expired.");
  }
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function renderCard(application) {
  const card = element("article", "application");
  const head = element("div", "card-head");
  const title = element("div");
  const displayName = application.displayName || application.companyName || application.fullName;
  const applicationType = application.applicationType === "SYSTEM_USER" ? "Staff / Technician" : "Customer";
  title.append(
    element("h2", "", displayName),
    element("div", "reference", `${application.referenceNo} · ${applicationType} · Submitted ${formatDate(application.submittedAt)}`)
  );
  head.append(title, element("span", `status ${application.status}`, application.status));

  const details = element("div", "details");
  const detailRows = application.applicationType === "SYSTEM_USER"
    ? [
        ["Email", application.email],
        ["Phone", application.phone],
        ["Requested role", application.requestedRole],
        ["Work responsibility", application.reason],
        ["Assigned role", application.assignedRoleName],
        ["Assigned customer", application.assignedCustomerName],
        ["Reviewed by", application.reviewedByName],
        ["Reviewed at", formatDate(application.reviewedAt)]
      ]
    : [
        ["Email", application.email],
        ["Phone", application.phone],
        ["Company address", application.address],
        ["TIN", application.tinNumber],
        ["VRN", application.vrn],
        ["Machine type", application.machineType],
        ["Machine / brand", application.brand],
        ["Model", application.model],
        ["Registration no.", application.regNumber],
        ["Reviewed by", application.reviewedByName],
        ["Reviewed at", formatDate(application.reviewedAt)]
      ];
  detailRows.forEach(([label, value]) => details.appendChild(detail(label, value)));
  card.append(head, details);

  if (application.status === "PENDING") {
    const actions = element("div", "actions");
    const cancel = element("button", "action cancel", "Cancel request");
    const approve = element(
      "button",
      "action approve",
      application.applicationType === "SYSTEM_USER" ? "Assign role & approve" : "Approve customer"
    );
    cancel.addEventListener("click", () => cancelApplication(application));
    approve.addEventListener("click", () => approveApplication(application));
    actions.append(cancel, approve);
    card.appendChild(actions);
  }
  return card;
}

async function loadApplications() {
  if (!token) {
    location.href = "/admin/login";
    return;
  }
  alertBox.classList.add("hidden");
  list.replaceChildren(element("div", "loading", "Loading applications…"));
  try {
    const suffix = activeStatus ? `?status=${encodeURIComponent(activeStatus)}` : "";
    const data = await api(`/api/applications${suffix}`);
    const applications = data.applications || [];
    list.replaceChildren();
    if (!applications.length) {
      list.append(element("div", "empty", "No applications in this section."));
    } else {
      applications.forEach(item => list.appendChild(renderCard(item)));
    }
    const pendingData = activeStatus === "PENDING"
      ? data
      : await api("/api/applications?status=PENDING");
    document.getElementById("pendingCount").textContent = (pendingData.applications || []).length;
  } catch (error) {
    list.replaceChildren(element("div", "empty", "Could not load applications."));
    showAlert(error.message);
  }
}

async function approveApplication(application) {
  if (application.applicationType === "SYSTEM_USER") {
    await openAssignment(application);
    return;
  }
  if (!confirm(`Approve ${application.companyName} and generate customer credentials?`)) return;
  await completeApproval(application, {});
}

async function completeApproval(application, payload) {
  try {
    const result = await api(`/api/applications/${application.id}/approve`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    lastApproval = result;
    document.getElementById("approvedCustomer").textContent = result.displayName || result.customerName;
    document.getElementById("approvedRole").textContent = result.assignedCustomerName
      ? `${result.assignedRole} — ${result.assignedCustomerName}`
      : result.assignedRole;
    document.getElementById("approvedEmail").textContent = result.loginEmail;
    document.getElementById("approvedPassword").textContent = result.temporaryPassword;
    document.getElementById("approvedRecovery").textContent = result.recoveryCode;
    const link = document.getElementById("approvedLink");
    link.href = result.loginUrl;
    link.textContent = result.loginUrl;
    if (assignmentDialog.open) assignmentDialog.close();
    dialog.showModal();
    await loadApplications();
  } catch (error) {
    if (assignmentDialog.open) {
      const errorBox = document.getElementById("assignmentError");
      errorBox.textContent = error.message;
      errorBox.classList.remove("hidden");
    } else {
      showAlert(error.message);
    }
  }
}

async function openAssignment(application) {
  pendingStaffApplication = application;
  document.getElementById("assignmentError").classList.add("hidden");
  document.getElementById("assignmentName").textContent = `Approve ${application.displayName || application.fullName}`;
  try {
    [roles, customers] = await Promise.all([
      api("/api/users/roles"),
      api("/api/customers")
    ]);
    const roleSelect = document.getElementById("assignmentRole");
    roleSelect.innerHTML = '<option value="">Select exact role…</option>' + roles.map(role =>
      `<option value="${escapeHtml(role.id)}" ${role.name === application.requestedRole ? "selected" : ""}>${escapeHtml(role.name)}</option>`
    ).join("");
    document.getElementById("assignmentCustomer").innerHTML =
      '<option value="">Select customer…</option>' + customers.map(customer =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
      ).join("");
    updateAssignmentCustomer();
    assignmentDialog.showModal();
  } catch (error) {
    showAlert(error.message);
  }
}

function updateAssignmentCustomer() {
  const role = roles.find(item => item.id === document.getElementById("assignmentRole").value);
  const isTechnician = role?.name === "Technician";
  document.getElementById("assignmentCustomerWrap").classList.toggle("hidden", !isTechnician);
  document.getElementById("assignmentCustomer").required = isTechnician;
  if (!isTechnician) document.getElementById("assignmentCustomer").value = "";
}

async function cancelApplication(application) {
  const name = application.displayName || application.companyName || application.fullName;
  if (!confirm(`Cancel the registration from ${name}?`)) return;
  try {
    await api(`/api/applications/${application.id}/cancel`, { method: "PUT" });
    await loadApplications();
  } catch (error) {
    showAlert(error.message);
  }
}

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(item => item.classList.remove("active"));
  tab.classList.add("active");
  activeStatus = tab.dataset.status;
  loadApplications();
}));

document.getElementById("refreshButton").addEventListener("click", loadApplications);
document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem("belm_admin_token");
  localStorage.removeItem("belm_admin_user");
  location.href = "/admin/login";
});
document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
document.querySelector(".assignment-close").addEventListener("click", () => assignmentDialog.close());
document.getElementById("assignmentRole").addEventListener("change", updateAssignmentCustomer);
document.getElementById("assignmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!pendingStaffApplication) return;
  const button = document.getElementById("confirmAssignmentButton");
  button.disabled = true;
  button.textContent = "Approving…";
  await completeApproval(pendingStaffApplication, {
    applicationType: "SYSTEM_USER",
    roleId: document.getElementById("assignmentRole").value,
    assignedCustomerId: document.getElementById("assignmentCustomer").value || null
  });
  button.disabled = false;
  button.textContent = "Approve and generate credentials";
});
document.getElementById("copyMessageButton").addEventListener("click", async () => {
  if (!lastApproval) return;
  const message = [
    `Hello ${lastApproval.displayName || lastApproval.customerName},`,
    "Your BELM Portal registration has been approved.",
    `Assigned role: ${lastApproval.assignedRole}${lastApproval.assignedCustomerName ? ` — ${lastApproval.assignedCustomerName}` : ""}`,
    `Login: ${lastApproval.loginUrl}`,
    `Email: ${lastApproval.loginEmail}`,
    `Temporary password: ${lastApproval.temporaryPassword}`,
    `Recovery code: ${lastApproval.recoveryCode}`,
    "Use the recovery code on Forgot Password if you lose your password. Save it securely.",
    "BELM General Tech Service Limited"
  ].join("\n");
  await copyText(message);
  document.getElementById("copyMessageButton").textContent = "Credentials copied";
});
document.getElementById("copyApprovedLinkButton").addEventListener("click", async () => {
  if (!lastApproval) return;
  await copyText(lastApproval.loginUrl || "");
  document.getElementById("copyApprovedLinkButton").textContent = "Login link copied";
});
document.getElementById("copyApprovedPasswordButton").addEventListener("click", async () => {
  if (!lastApproval) return;
  await copyText(lastApproval.temporaryPassword || "");
  document.getElementById("copyApprovedPasswordButton").textContent = "Password copied";
});

loadApplications();

// ---------------------------------------------------------------------
// MANUAL REGISTRATION — Register Customer (+ optional first machine) and
// Register Technician/system user, without going through the
// applications approval queue. Lives here so every registration path
// (self-service application review AND manual entry) is on one page.
// ---------------------------------------------------------------------
const registerCustomerDialog = document.getElementById("registerCustomerDialog");
const registerTechnicianDialog = document.getElementById("registerTechnicianDialog");
const registerCredentialsDialog = document.getElementById("registerCredentialsDialog");
let rolesForRegisterCache = null;
let customersForRegisterCache = null;

async function ensureRolesAndCustomersLoaded() {
  if (!rolesForRegisterCache) rolesForRegisterCache = await api("/api/users/roles");
  if (!customersForRegisterCache) customersForRegisterCache = await api("/api/customers");
  return [rolesForRegisterCache, customersForRegisterCache];
}

function showRegisterError(boxId, message) {
  const box = document.getElementById(boxId);
  box.textContent = message;
  box.classList.remove("hidden");
}

function openRegisterCredentials({ name, role, email, password, recoveryCode, loginUrl }) {
  document.getElementById("regCredName").textContent = name;
  document.getElementById("regCredRole").textContent = role;
  document.getElementById("regCredEmail").textContent = email;
  document.getElementById("regCredPassword").textContent = password;
  document.getElementById("regCredRecovery").textContent = recoveryCode || "—";
  const link = document.getElementById("regCredLink");
  link.href = loginUrl || "#";
  link.textContent = loginUrl || "—";
  registerCredentialsDialog.showModal();
}

document.getElementById("registerCustomerButton").addEventListener("click", () => {
  document.getElementById("registerCustomerForm").reset();
  document.getElementById("regMachineFields").classList.add("hidden");
  document.getElementById("registerCustomerError").classList.add("hidden");
  registerCustomerDialog.showModal();
});
document.getElementById("closeRegisterCustomer").addEventListener("click", () => registerCustomerDialog.close());

document.getElementById("regAddMachineToggle").addEventListener("change", event => {
  document.getElementById("regMachineFields").classList.toggle("hidden", !event.target.checked);
});

document.getElementById("registerCustomerForm").addEventListener("submit", async event => {
  event.preventDefault();
  document.getElementById("registerCustomerError").classList.add("hidden");
  const button = document.getElementById("saveRegisterCustomerButton");
  button.disabled = true;
  button.textContent = "Registering…";
  try {
    const customer = await api("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("regCustomerName").value.trim(),
        email: document.getElementById("regCustomerEmail").value.trim(),
        phone: document.getElementById("regCustomerPhone").value.trim(),
        address: document.getElementById("regCustomerAddress").value.trim(),
        tinNumber: document.getElementById("regCustomerTin").value.trim(),
        vrn: document.getElementById("regCustomerVrn").value.trim()
      })
    });

    if (document.getElementById("regAddMachineToggle").checked) {
      const machineType = document.getElementById("regMachineType").value.trim();
      const machineModel = document.getElementById("regMachineModel").value.trim();
      if (machineType && machineModel) {
        await api(`/api/customers/${customer.id}/machines`, {
          method: "POST",
          body: JSON.stringify({
            machineType,
            model: machineModel,
            brand: document.getElementById("regMachineBrand").value.trim(),
            regNumber: document.getElementById("regMachineRegNumber").value.trim(),
            fleetNumber: document.getElementById("regMachineFleetNumber").value.trim(),
            serialNumber: document.getElementById("regMachineSerialNumber").value.trim()
          })
        });
      }
    }

    registerCustomerDialog.close();
    customersForRegisterCache = null;
    openRegisterCredentials({
      name: document.getElementById("regCustomerName").value.trim(),
      role: "Customer",
      email: document.getElementById("regCustomerEmail").value.trim(),
      password: customer.portalLoginInfo.temporaryPassword,
      recoveryCode: customer.portalLoginInfo.recoveryCode,
      loginUrl: customer.portalLoginInfo.portalUrl
    });
    await loadApplications();
  } catch (error) {
    showRegisterError("registerCustomerError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Register customer";
  }
});

document.getElementById("registerTechnicianButton").addEventListener("click", async () => {
  document.getElementById("registerTechnicianForm").reset();
  document.getElementById("registerTechnicianError").classList.add("hidden");
  try {
    const [roleList, customerList] = await ensureRolesAndCustomersLoaded();
    const roleSelect = document.getElementById("regUserRole");
    roleSelect.innerHTML = '<option value="">Select role…</option>' + roleList.map(role =>
      `<option value="${escapeHtml(role.id)}" ${role.name === "Technician" ? "selected" : ""}>${escapeHtml(role.name)}</option>`
    ).join("");
    document.getElementById("regUserCustomer").innerHTML =
      '<option value="">Select customer…</option>' + customerList.map(customer =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
      ).join("");
    updateRegisterUserCustomerVisibility();
    registerTechnicianDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});
document.getElementById("closeRegisterTechnician").addEventListener("click", () => registerTechnicianDialog.close());

function updateRegisterUserCustomerVisibility() {
  const role = (rolesForRegisterCache || []).find(item => item.id === document.getElementById("regUserRole").value);
  const isTechnician = role?.name === "Technician";
  document.getElementById("regUserCustomerWrap").classList.toggle("hidden", !isTechnician);
  document.getElementById("regUserCustomer").required = isTechnician;
  if (!isTechnician) document.getElementById("regUserCustomer").value = "";
}
document.getElementById("regUserRole").addEventListener("change", updateRegisterUserCustomerVisibility);

document.getElementById("registerTechnicianForm").addEventListener("submit", async event => {
  event.preventDefault();
  document.getElementById("registerTechnicianError").classList.add("hidden");
  const button = document.getElementById("saveRegisterTechnicianButton");
  button.disabled = true;
  button.textContent = "Registering…";
  try {
    const roleId = document.getElementById("regUserRole").value;
    const role = (rolesForRegisterCache || []).find(item => item.id === roleId);
    const result = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("regUserName").value.trim(),
        email: document.getElementById("regUserEmail").value.trim(),
        phone: document.getElementById("regUserPhone").value.trim(),
        roleId,
        assignedCustomerId: document.getElementById("regUserCustomer").value || null
      })
    });
    registerTechnicianDialog.close();
    openRegisterCredentials({
      name: document.getElementById("regUserName").value.trim(),
      role: role ? role.name : "System user",
      email: document.getElementById("regUserEmail").value.trim(),
      password: result.temporaryPassword,
      recoveryCode: result.recoveryCode,
      loginUrl: result.loginUrl
    });
  } catch (error) {
    showRegisterError("registerTechnicianError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Register technician";
  }
});

document.getElementById("closeRegisterCredentials").addEventListener("click", () => registerCredentialsDialog.close());
document.getElementById("copyRegCredButton").addEventListener("click", async () => {
  const message = [
    `Name: ${document.getElementById("regCredName").textContent}`,
    `Role: ${document.getElementById("regCredRole").textContent}`,
    `Login: ${document.getElementById("regCredLink").textContent}`,
    `Email: ${document.getElementById("regCredEmail").textContent}`,
    `Temporary password: ${document.getElementById("regCredPassword").textContent}`,
    `Recovery code: ${document.getElementById("regCredRecovery").textContent}`
  ].join("\n");
  await copyText(message);
  document.getElementById("copyRegCredButton").textContent = "Credentials copied";
});

// ---------------------------------------------------------------------
// ADD MACHINE — to an existing, already-registered customer. Pick the
// customer from a dropdown, fill in machine details, save.
// ---------------------------------------------------------------------
const addMachineDialog = document.getElementById("addMachineDialog");

document.getElementById("addMachineButton").addEventListener("click", async () => {
  document.getElementById("addMachineForm").reset();
  document.getElementById("addMachineError").classList.add("hidden");
  try {
    const [, customerList] = await ensureRolesAndCustomersLoaded();
    document.getElementById("addMachineCustomer").innerHTML =
      '<option value="">Select customer…</option>' + customerList.map(customer =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
      ).join("");
    addMachineDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});
document.getElementById("closeAddMachine").addEventListener("click", () => addMachineDialog.close());

document.getElementById("addMachineForm").addEventListener("submit", async event => {
  event.preventDefault();
  document.getElementById("addMachineError").classList.add("hidden");
  const button = document.getElementById("saveAddMachineButton");
  const customerId = document.getElementById("addMachineCustomer").value;
  if (!customerId) {
    showRegisterError("addMachineError", "Select a customer.");
    return;
  }
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api(`/api/customers/${customerId}/machines`, {
      method: "POST",
      body: JSON.stringify({
        machineType: document.getElementById("addMachineType").value.trim(),
        model: document.getElementById("addMachineModel").value.trim(),
        brand: document.getElementById("addMachineBrand").value.trim(),
        regNumber: document.getElementById("addMachineRegNumber").value.trim(),
        fleetNumber: document.getElementById("addMachineFleetNumber").value.trim(),
        serialNumber: document.getElementById("addMachineSerialNumber").value.trim()
      })
    });
    addMachineDialog.close();
    showAlert("Machine added successfully.");
  } catch (error) {
    showRegisterError("addMachineError", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Save machine";
  }
});
