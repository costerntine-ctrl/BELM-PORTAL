const token = localStorage.getItem("belm_admin_token");
const list = document.getElementById("applicationList");
const alertBox = document.getElementById("alertBox");
const tabs = [...document.querySelectorAll(".tabs button")];
const dialog = document.getElementById("approvalDialog");
let activeStatus = "PENDING";
let lastApproval = null;

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.classList.remove("hidden");
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
  title.append(
    element("h2", "", application.companyName),
    element("div", "reference", `${application.referenceNo} · Submitted ${formatDate(application.submittedAt)}`)
  );
  head.append(title, element("span", `status ${application.status}`, application.status));

  const details = element("div", "details");
  [
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
  ].forEach(([label, value]) => details.appendChild(detail(label, value)));
  card.append(head, details);

  if (application.status === "PENDING") {
    const actions = element("div", "actions");
    const cancel = element("button", "action cancel", "Cancel request");
    const approve = element("button", "action approve", "Approve customer");
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
  if (!confirm(`Approve ${application.companyName} and create its portal account?`)) return;
  try {
    const result = await api(`/api/applications/${application.id}/approve`, { method: "PUT" });
    lastApproval = result;
    document.getElementById("approvedCustomer").textContent = result.customerName;
    document.getElementById("approvedEmail").textContent = result.loginEmail;
    const link = document.getElementById("approvedLink");
    link.href = result.loginUrl;
    link.textContent = result.loginUrl;
    dialog.showModal();
    await loadApplications();
  } catch (error) {
    showAlert(error.message);
  }
}

async function cancelApplication(application) {
  if (!confirm(`Cancel the application from ${application.companyName}?`)) return;
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
document.getElementById("copyMessageButton").addEventListener("click", async () => {
  if (!lastApproval) return;
  const message = [
    `Hello ${lastApproval.customerName},`,
    "Your BELM Portal application has been approved.",
    `Login: ${lastApproval.loginUrl}`,
    `Email: ${lastApproval.loginEmail}`,
    "Password: use the password you created during application.",
    "BELM General Tech Service Limited"
  ].join("\n");
  await navigator.clipboard.writeText(message);
  document.getElementById("copyMessageButton").textContent = "Approval message copied";
});

loadApplications();
