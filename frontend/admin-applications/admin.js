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

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
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
  await navigator.clipboard.writeText(message);
  document.getElementById("copyMessageButton").textContent = "Credentials copied";
});

loadApplications();
