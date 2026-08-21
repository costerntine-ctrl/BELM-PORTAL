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
let registeredUsers = [];
let registeredUserRoles = [];
let registeredUserCustomers = [];
const currentAdminUser = (() => {
  try { return JSON.parse(localStorage.getItem("belm_admin_user") || "{}"); } catch (_) { return {}; }
})();

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


let registeredUserActionResolver = null;
let registeredUserActionNeedsReason = false;

function finishRegisteredUserAction(result) {
  const dialog = document.getElementById("registeredUserActionDialog");
  if (dialog.open) dialog.close();
  const resolve = registeredUserActionResolver;
  registeredUserActionResolver = null;
  registeredUserActionNeedsReason = false;
  if (resolve) resolve(result);
}

function confirmRegisteredUserAction(options = {}) {
  const dialog = document.getElementById("registeredUserActionDialog");
  const password = document.getElementById("registeredUserAdminPassword");
  const reason = document.getElementById("registeredUserDeleteReason");
  const reasonWrap = document.getElementById("registeredUserDeleteReasonWrap");
  const errorBox = document.getElementById("registeredUserActionError");
  const submit = document.getElementById("confirmRegisteredUserAction");

  if (registeredUserActionResolver) finishRegisteredUserAction(null);
  registeredUserActionNeedsReason = Boolean(options.requireReason);
  document.getElementById("registeredUserActionEyebrow").textContent = options.destructive ? "CONFIRM DELETION" : "ACCOUNT SECURITY";
  document.getElementById("registeredUserActionTitle").textContent = options.title || "Confirm account action";
  document.getElementById("registeredUserActionMessage").textContent = options.message || "Enter your current BELM Admin password to continue.";
  password.value = "";
  reason.value = "";
  reasonWrap.classList.toggle("hidden", !registeredUserActionNeedsReason);
  reason.required = registeredUserActionNeedsReason;
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
  submit.textContent = options.confirmLabel || "Confirm";
  submit.classList.toggle("danger-action", Boolean(options.destructive));
  dialog.showModal();
  setTimeout(() => password.focus(), 0);

  return new Promise(resolve => {
    registeredUserActionResolver = resolve;
  });
}

function displayRoleName(name) { return name === "Engineer" ? "Workshop Manager" : (name || ""); }

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
    location.href = "/login";
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
        ["Assigned role", displayRoleName(application.assignedRoleName)],
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
    location.href = "/login";
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


function registeredUserRoleLabel(user) {
  const names = Array.isArray(user.roleNames) && user.roleNames.length
    ? user.roleNames
    : [user.role?.name || "—"];
  return names.join(", ");
}

function registeredUserCustomerLabel(user) {
  if (user.assignedCustomer?.name) return user.assignedCustomer.name;
  return (user.roleNames || [user.role?.name]).includes("Technician") ? "Not assigned" : "All customers";
}

function renderRegisteredUsers() {
  const panel = document.getElementById("registeredUsersList");
  const count = document.getElementById("registeredUsersCount");
  const search = document.getElementById("registeredUsersSearch").value.trim().toLowerCase();
  count.textContent = String(registeredUsers.length);
  const rows = registeredUsers.filter(user => [
    user.name,
    user.email,
    user.phone,
    registeredUserRoleLabel(user),
    registeredUserCustomerLabel(user),
  ].some(value => String(value || "").toLowerCase().includes(search)));

  if (!rows.length) {
    panel.innerHTML = `<div class="empty">${search ? "No registered users match this search." : "No registered users found."}</div>`;
    return;
  }

  panel.innerHTML = `<div class="registered-users-table-wrap"><table class="registered-users-table">
    <thead><tr><th>User</th><th>Role</th><th>Customer</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${rows.map(user => {
      const isSelf = user.id === currentAdminUser.id;
      const active = Number(user.isActive) === 1;
      return `<tr>
        <td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small><small>${escapeHtml(user.phone || "—")}</small></td>
        <td>${escapeHtml(registeredUserRoleLabel(user))}</td>
        <td>${escapeHtml(registeredUserCustomerLabel(user))}</td>
        <td><span class="user-status ${active ? "active" : "inactive"}">${active ? "Active" : "Inactive"}</span></td>
        <td><div class="user-row-actions">
          <button class="user-edit" type="button" data-edit-registered-user="${escapeHtml(user.id)}">Edit</button>
          <button class="user-reset" type="button" data-reset-registered-user="${escapeHtml(user.id)}">Reset Password</button>
          ${isSelf ? '<span class="you-badge">You</span>' : `<button class="user-delete" type="button" data-delete-registered-user="${escapeHtml(user.id)}">Delete</button>`}
        </div></td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

async function loadRegisteredUsers() {
  const panel = document.getElementById("registeredUsersList");
  panel.innerHTML = '<div class="loading">Loading registered users…</div>';
  try {
    const [userList, roleList, customerList] = await Promise.all([
      api("/api/users"),
      api("/api/users/roles"),
      api("/api/customers"),
    ]);
    registeredUsers = Array.isArray(userList) ? userList : [];
    registeredUserRoles = Array.isArray(roleList) ? roleList : [];
    registeredUserCustomers = Array.isArray(customerList) ? customerList : [];
    registeredUsers.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    renderRegisteredUsers();
  } catch (error) {
    document.getElementById("registeredUsersCount").textContent = "—";
    panel.innerHTML = `<div class="empty">Could not load registered users. ${escapeHtml(error.message)}</div>`;
  }
}

function selectedRegisteredUserRoleIds() {
  return [...document.querySelectorAll('#editRegisteredUserRoles input[type="checkbox"]:checked')].map(input => input.value);
}

function updateRegisteredUserCustomerField() {
  const selected = selectedRegisteredUserRoleIds();
  const technicianRole = registeredUserRoles.find(role => role.name === "Technician");
  const needsCustomer = Boolean(technicianRole && selected.includes(technicianRole.id));
  const wrap = document.getElementById("editRegisteredUserCustomerWrap");
  const select = document.getElementById("editRegisteredUserCustomer");
  wrap.classList.toggle("hidden", !needsCustomer);
  select.required = needsCustomer;
  if (!needsCustomer) select.value = "";
}

function openRegisteredUserEditor(user) {
  if (!user) return;
  document.getElementById("editRegisteredUserForm").reset();
  document.getElementById("editRegisteredUserError").classList.add("hidden");
  document.getElementById("editRegisteredUserId").value = user.id;
  document.getElementById("editRegisteredUserTitle").textContent = `Edit ${user.name}`;
  document.getElementById("editRegisteredUserName").value = user.name || "";
  document.getElementById("editRegisteredUserEmail").value = user.email || "";
  document.getElementById("editRegisteredUserPhone").value = user.phone || "";
  document.getElementById("editRegisteredUserActive").checked = Number(user.isActive) === 1;
  const selectedRoles = new Set(user.roleIds || (user.role?.id ? [user.role.id] : []));
  document.getElementById("editRegisteredUserRoles").innerHTML = registeredUserRoles.map(role => `
    <label class="user-role-option"><input type="checkbox" value="${escapeHtml(role.id)}" ${selectedRoles.has(role.id) ? "checked" : ""}> <span>${escapeHtml(displayRoleName(role.name))}</span></label>
  `).join("");
  document.getElementById("editRegisteredUserCustomer").innerHTML =
    '<option value="">Select customer…</option>' + registeredUserCustomers.map(customer =>
      `<option value="${escapeHtml(customer.id)}" ${user.assignedCustomer?.id === customer.id ? "selected" : ""}>${escapeHtml(customer.name)}</option>`
    ).join("");
  updateRegisteredUserCustomerField();
  document.getElementById("editRegisteredUserDialog").showModal();
}

async function saveRegisteredUser(event) {
  event.preventDefault();
  const id = document.getElementById("editRegisteredUserId").value;
  const user = registeredUsers.find(item => item.id === id);
  if (!user) return;
  const payload = {
    name: document.getElementById("editRegisteredUserName").value.trim(),
    phone: document.getElementById("editRegisteredUserPhone").value.trim(),
    roleIds: selectedRegisteredUserRoleIds(),
    assignedCustomerId: document.getElementById("editRegisteredUserCustomer").value || null,
    isActive: document.getElementById("editRegisteredUserActive").checked,
  };
  const errorBox = document.getElementById("editRegisteredUserError");
  errorBox.classList.add("hidden");
  if (!payload.name) {
    errorBox.textContent = "User name is required.";
    errorBox.classList.remove("hidden");
    return;
  }
  if (!payload.roleIds.length) {
    errorBox.textContent = "Select at least one role.";
    errorBox.classList.remove("hidden");
    return;
  }
  const confirmation = await confirmRegisteredUserAction({
    title: "Save user changes?",
    message: `Enter your current admin password to save changes to ${payload.name}.`,
    confirmLabel: "Save user",
  });
  if (!confirmation) return;
  Object.assign(payload, confirmation);
  const button = document.getElementById("saveEditRegisteredUser");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    document.getElementById("editRegisteredUserDialog").close();
    await loadRegisteredUsers();
    showAlert("User updated successfully.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Save user";
  }
}

let lastRegisteredUserReset = null;

function openRegisteredUserResetCredentials(user, result) {
  const loginUrl = result.loginUrl || `${window.location.origin}/login`;
  lastRegisteredUserReset = {
    name: user.name || "",
    email: user.email || "",
    password: result.newPassword || result.temporaryPassword || "",
    recoveryCode: result.recoveryCode || "",
    loginUrl,
  };
  document.getElementById("resetCredName").textContent = lastRegisteredUserReset.name;
  document.getElementById("resetCredEmail").textContent = lastRegisteredUserReset.email;
  document.getElementById("resetCredPassword").textContent = lastRegisteredUserReset.password;
  document.getElementById("resetCredRecovery").textContent = lastRegisteredUserReset.recoveryCode;
  const link = document.getElementById("resetCredLink");
  link.href = loginUrl;
  link.textContent = loginUrl;
  document.getElementById("resetRegisteredUserCredentialsDialog").showModal();
}

async function resetRegisteredUserPassword(id) {
  const user = registeredUsers.find(item => item.id === id);
  if (!user) return;
  const confirmation = await confirmRegisteredUserAction({
    title: "Reset user password?",
    message: `Enter your current admin password to generate a new temporary password for ${user.name}. The old password will stop working immediately.`,
    confirmLabel: "Reset password",
  });
  if (!confirmation) return;
  try {
    const result = await api(`/api/users/${id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify(confirmation),
    });
    openRegisteredUserResetCredentials(user, result);
    showAlert(`Password reset for ${user.name}. Copy the new login details before closing the box.`);
  } catch (error) {
    showAlert(error.message);
  }
}

async function deleteRegisteredUser(id) {
  const user = registeredUsers.find(item => item.id === id);
  if (!user || user.id === currentAdminUser.id) return;
  const confirmation = await confirmRegisteredUserAction({
    title: "Delete registered user?",
    message: `Enter your current admin password and a reason to move ${user.name} to the Recycle Bin.`,
    confirmLabel: "Delete user",
    requireReason: true,
    destructive: true,
  });
  if (!confirmation) return;
  try {
    await api(`/api/users/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
    await loadRegisteredUsers();
    showAlert("User moved to the Recycle Bin.");
  } catch (error) {
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
      ? `${displayRoleName(result.assignedRole)} — ${result.assignedCustomerName}`
      : displayRoleName(result.assignedRole);
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
      `<option value="${escapeHtml(role.id)}" ${role.name === application.requestedRole ? "selected" : ""}>${escapeHtml(displayRoleName(role.name))}</option>`
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

document.getElementById("refreshButton").addEventListener("click", async () => {
  await Promise.all([loadApplications(), loadRegisteredUsers()]);
});
document.getElementById("logoutButton").addEventListener("click", () => {
  localStorage.removeItem("belm_admin_token");
  localStorage.removeItem("belm_admin_user");
  location.href = "/login";
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
    `Assigned role: ${displayRoleName(lastApproval.assignedRole)}${lastApproval.assignedCustomerName ? ` — ${lastApproval.assignedCustomerName}` : ""}`,
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

document.getElementById("registeredUsersSearch").addEventListener("input", renderRegisteredUsers);
document.getElementById("refreshUsersButton").addEventListener("click", loadRegisteredUsers);
document.getElementById("registeredUsersList").addEventListener("click", event => {
  const button = event.target.closest("button[data-edit-registered-user],button[data-reset-registered-user],button[data-delete-registered-user]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.editRegisteredUser) {
    openRegisteredUserEditor(registeredUsers.find(user => user.id === button.dataset.editRegisteredUser));
    return;
  }
  if (button.dataset.resetRegisteredUser) {
    resetRegisteredUserPassword(button.dataset.resetRegisteredUser);
    return;
  }
  if (button.dataset.deleteRegisteredUser) deleteRegisteredUser(button.dataset.deleteRegisteredUser);
});
document.getElementById("editRegisteredUserRoles").addEventListener("change", updateRegisteredUserCustomerField);
document.getElementById("editRegisteredUserForm").addEventListener("submit", saveRegisteredUser);
document.getElementById("closeEditRegisteredUser").addEventListener("click", () => document.getElementById("editRegisteredUserDialog").close());
document.getElementById("closeResetRegisteredUserCredentials").addEventListener("click", () => document.getElementById("resetRegisteredUserCredentialsDialog").close());
document.getElementById("copyResetRegisteredUserDetails").addEventListener("click", async () => {
  if (!lastRegisteredUserReset) return;
  const message = [
    `BELM Portal Login: ${lastRegisteredUserReset.loginUrl}`,
    `Email: ${lastRegisteredUserReset.email}`,
    `Temporary password: ${lastRegisteredUserReset.password}`,
    `Recovery code: ${lastRegisteredUserReset.recoveryCode}`,
  ].join("\n");
  await copyText(message);
  document.getElementById("copyResetRegisteredUserDetails").textContent = "Login details copied";
});
document.getElementById("copyResetRegisteredUserPassword").addEventListener("click", async () => {
  if (!lastRegisteredUserReset) return;
  await copyText(lastRegisteredUserReset.password);
  document.getElementById("copyResetRegisteredUserPassword").textContent = "Password copied";
});
document.getElementById("copyResetRegisteredUserLink").addEventListener("click", async () => {
  if (!lastRegisteredUserReset) return;
  await copyText(lastRegisteredUserReset.loginUrl);
  document.getElementById("copyResetRegisteredUserLink").textContent = "Login link copied";
});

document.getElementById("registeredUserActionForm").addEventListener("submit", event => {
  event.preventDefault();
  const password = document.getElementById("registeredUserAdminPassword").value;
  const reason = document.getElementById("registeredUserDeleteReason").value.trim();
  const errorBox = document.getElementById("registeredUserActionError");
  if (!password) {
    errorBox.textContent = "Enter your current admin password.";
    errorBox.classList.remove("hidden");
    return;
  }
  if (registeredUserActionNeedsReason && !reason) {
    errorBox.textContent = "Enter a reason for deleting this user.";
    errorBox.classList.remove("hidden");
    return;
  }
  finishRegisteredUserAction({ adminPassword: password, ...(registeredUserActionNeedsReason ? { reason } : {}) });
});
document.getElementById("cancelRegisteredUserAction").addEventListener("click", () => finishRegisteredUserAction(null));
document.getElementById("closeRegisteredUserAction").addEventListener("click", () => finishRegisteredUserAction(null));
document.getElementById("registeredUserActionDialog").addEventListener("cancel", event => {
  event.preventDefault();
  finishRegisteredUserAction(null);
});

loadApplications();
loadRegisteredUsers();

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
let machineTypesForRegisterCache = null;

async function ensureMachineTypesLoaded() {
  if (machineTypesForRegisterCache) return machineTypesForRegisterCache;
  try {
    const templates = await api("/api/checklist-templates");
    const seen = new Set();
    machineTypesForRegisterCache = templates
      .map(t => t.machineType)
      .filter(type => {
        const key = String(type || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  } catch (_) {
    machineTypesForRegisterCache = [];
  }
  return machineTypesForRegisterCache;
}

async function populateMachineTypeSelect(selectId) {
  const select = document.getElementById(selectId);
  const types = await ensureMachineTypesLoaded();
  select.innerHTML = '<option value="">Select machine type…</option>' +
    types.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("") +
    '<option value="__other__">+ New machine type…</option>';
}

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

document.getElementById("registerCustomerButton").addEventListener("click", async () => {
  document.getElementById("registerCustomerForm").reset();
  document.getElementById("regMachineFields").classList.add("hidden");
  document.getElementById("regMachineTypeOtherWrap").classList.add("hidden");
  document.getElementById("registerCustomerError").classList.add("hidden");
  await populateMachineTypeSelect("regMachineType");
  registerCustomerDialog.showModal();
});
document.getElementById("closeRegisterCustomer").addEventListener("click", () => registerCustomerDialog.close());

document.getElementById("regAddMachineToggle").addEventListener("change", event => {
  document.getElementById("regMachineFields").classList.toggle("hidden", !event.target.checked);
});
document.getElementById("regMachineType").addEventListener("change", event => {
  document.getElementById("regMachineTypeOtherWrap").classList.toggle("hidden", event.target.value !== "__other__");
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
      const typeSelectValue = document.getElementById("regMachineType").value;
      const machineType = typeSelectValue === "__other__"
        ? document.getElementById("regMachineTypeOther").value.trim()
        : typeSelectValue;
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
      `<option value="${escapeHtml(role.id)}" ${role.name === "Technician" ? "selected" : ""}>${escapeHtml(displayRoleName(role.name))}</option>`
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
    await loadRegisteredUsers();
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
  document.getElementById("addMachineTypeOtherWrap").classList.add("hidden");
  document.getElementById("addMachineError").classList.add("hidden");
  try {
    const [, customerList] = await ensureRolesAndCustomersLoaded();
    document.getElementById("addMachineCustomer").innerHTML =
      '<option value="">Select customer…</option>' + customerList.map(customer =>
        `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`
      ).join("");
    await populateMachineTypeSelect("addMachineType");
    addMachineDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});
document.getElementById("closeAddMachine").addEventListener("click", () => addMachineDialog.close());
document.getElementById("addMachineType").addEventListener("change", event => {
  document.getElementById("addMachineTypeOtherWrap").classList.toggle("hidden", event.target.value !== "__other__");
});

document.getElementById("addMachineForm").addEventListener("submit", async event => {
  event.preventDefault();
  document.getElementById("addMachineError").classList.add("hidden");
  const button = document.getElementById("saveAddMachineButton");
  const customerId = document.getElementById("addMachineCustomer").value;
  if (!customerId) {
    showRegisterError("addMachineError", "Select a customer.");
    return;
  }
  const typeSelectValue = document.getElementById("addMachineType").value;
  const machineType = typeSelectValue === "__other__"
    ? document.getElementById("addMachineTypeOther").value.trim()
    : typeSelectValue;
  if (!machineType) {
    showRegisterError("addMachineError", "Select or type a machine type.");
    return;
  }
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api(`/api/customers/${customerId}/machines`, {
      method: "POST",
      body: JSON.stringify({
        machineType,
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
