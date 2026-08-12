(function () {
  const token = localStorage.getItem("belm_admin_token");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));

  const formatDateTime = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}, ${hours}:${minutes}`;
  };

  async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showAlert(message, isError = true) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = isError ? "alert error" : "alert";
    box.classList.remove("hidden");
  }

  const STATUS_LABELS = { GREEN: "Normal", YELLOW: "Attention", RED: "Don't operate", NOT_CHECKED: "Not checked" };

  function renderActivity(items) {
    document.getElementById("activityCount").textContent = items.length;
    document.getElementById("activityList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · Filled by ${escapeHtml(item.filledBy || "—")}</span>
            </div>
            <span class="eng-badge status-${escapeHtml(String(item.status || "GREEN").toLowerCase())}">${escapeHtml(item.status || "—")}</span>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No recent checklist activity.</p>';
  }

  function renderOperatorMessages(items) {
    document.getElementById("operatorCount").textContent = items.length;
    document.getElementById("operatorList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.operatorName || "Operator")}</span>
              <p class="eng-row-message">${escapeHtml(item.message)}</p>
            </div>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No open operator messages.</p>';
  }

  function renderStatusSummary(summary) {
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0) || 1;
    document.getElementById("statusSummary").innerHTML = Object.entries(summary).map(([key, count]) => `
      <div class="eng-status-bar-row">
        <span>${escapeHtml(STATUS_LABELS[key] || key)}</span>
        <div class="eng-status-bar-track"><div class="eng-status-bar-fill status-${escapeHtml(key.toLowerCase())}" style="width:${Math.round((count / total) * 100)}%"></div></div>
        <b>${count}</b>
      </div>`).join("");
  }

  function renderReminders(items) {
    document.getElementById("reminderCount").textContent = items.length;
    document.getElementById("reminderList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.intervalHours)}-Hour Service</span>
            </div>
            <span class="eng-badge status-${escapeHtml(item.level.toLowerCase())}">${item.hoursRemaining <= 0 ? "Overdue" : `${item.hoursRemaining} hrs left`}</span>
          </div>`).join("")
      : '<p class="muted">Nothing due soon.</p>';
  }

  function renderSpareRequests(items) {
    document.getElementById("spareCount").textContent = items.length;
    document.getElementById("spareList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.name)} <span class="eng-row-sub">× ${escapeHtml(item.quantity)}</span></b>
              <span class="eng-row-sub">${escapeHtml(item.machine || item.customer || "—")} · Requested by ${escapeHtml(item.requestedBy || "—")}</span>
            </div>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No pending spare-part requests.</p>';
  }

  async function load() {
    try {
      const data = await api("/engineering?action=dashboard");
      renderActivity(data.activity || []);
      renderOperatorMessages(data.operatorMessages || []);
      renderStatusSummary(data.machineStatus || {});
      renderReminders(data.serviceReminders || []);
      renderSpareRequests(data.spareRequests || []);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showAlert(error.message);
        return;
      }
      showAlert("Could not load the Engineering dashboard.");
    }
  }

  async function loadEngineerRoleSummary() {
    try {
      const roles = await api("/users/roles");
      const engineer = (roles || []).find((role) => role.name === "Engineer");
      document.getElementById("engineerRoleAccess").textContent =
        engineer?.allowedPages?.length ? engineer.allowedPages.join(", ") : "No pages assigned yet.";
    } catch (_) {
      document.getElementById("engineerRoleAccess").textContent = "—";
    }
  }

  document.getElementById("refreshButton").addEventListener("click", load);

  if (!token) {
    showAlert("Administrator login required.");
  } else {
    load();
    loadEngineerRoleSummary();
  }
})();
