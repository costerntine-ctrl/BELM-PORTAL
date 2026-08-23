(function () {
  const token = localStorage.getItem("belm_admin_token");
  const pageOptions = [
    ["customers", "Customers"],
    ["overview", "All Overview"],
    ["roles", "Roles & system users"],
    ["job-cards", "Job Cards"],
    ["spare-parts", "Spare parts"],
    ["billing", "Billing"],
    ["bank-manager", "Bank Manager"],
    ["reports", "Reports & comparisons"],
    ["settings", "System settings"],
    ["checklist-templates", "Checklist templates"],
    ["suppliers", "Suppliers"],
    ["activity-log", "Activity log"],
  ];
  let rolesCache = [];

  function currentAdminUser() {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "null"); } catch (_) { return null; }
  }
  function hasPageAccess(key) {
    const user = currentAdminUser();
    if (!user) return false;
    if (user.role === "Super Admin" || user.allowedPages === null) return true;
    return Array.isArray(user.allowedPages) && user.allowedPages.includes(key);
  }

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

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
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
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.machineType || "Machine")} · Due ${escapeHtml(item.dueHour || "—")} hrs · ${escapeHtml(item.serviceIntervalHours || item.intervalHours)}-Hour Service${item.draftProformaNo ? ` · ${escapeHtml(item.draftProformaNo)}` : ""}</span>
              <span class="eng-row-sub">Owner alert: Email ${escapeHtml(item.ownerEmailStatus || "NOT SENT")} · WhatsApp ${escapeHtml(item.ownerWhatsAppStatus || "NOT SENT")}</span>
            </div>
            <span class="eng-badge status-${escapeHtml(item.level.toLowerCase())}">${item.hoursRemaining <= 0 ? "Overdue" : `${item.hoursRemaining} hrs left`}</span>
          </div>`).join("")
      : '<p class="muted">Nothing due soon.</p>';
  }


  function renderServicePreparations(items) {
    document.getElementById("servicePrepCount").textContent = items.length;
    document.getElementById("servicePrepList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.draftProformaNo || "Service kit review")}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.machine)} · ${escapeHtml(item.machineType || "Machine")} · ${escapeHtml(item.serviceIntervalHours)}-Hour Service @ ${escapeHtml(item.dueHour)} hrs</span>
              <span class="eng-row-sub">Inventory: ${escapeHtml(item.inventoryStatus || "NOT CHECKED")} · Current hours: ${escapeHtml(item.currentHours)}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${item.draftProformaId ? '<a class="eng-badge" href="/billing-manager/">Review PI</a>' : '<span class="eng-badge status-yellow">Add service parts</span>'}
            </div>
          </div>`).join("")
      : '<p class="muted">No automatic service preparations waiting for review.</p>';
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

  // V319: Technician Dispatch has one UI owner: Breakdown Workflow.
  // The old Engineering landing-page copy was removed to prevent stale sync logic.

  async function load() {
    try {
      const data = await api("/engineering?action=dashboard");
      renderActivity(data.activity || []);
      renderOperatorMessages(data.operatorMessages || []);
      renderStatusSummary(data.machineStatus || {});
      renderReminders(data.serviceReminders || []);
      renderServicePreparations(data.servicePreparations || []);
      renderSpareRequests(data.spareRequests || []);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showAlert(error.message);
        return;
      }
      showAlert("Could not load the Technical Department dashboard.");
    }
  }

  async function loadTechnicalRoleSummary() {
    try {
      rolesCache = await api("/users/roles");
      const workshopManager = rolesCache.find((role) => role.name === "Workshop Manager" || role.name === "Engineer");
      const technician = rolesCache.find((role) => role.name === "Technician");
      document.getElementById("workshopManagerRoleAccess").textContent =
        workshopManager?.allowedPages?.length ? workshopManager.allowedPages.map((page) => page === "service-requests" ? "job-cards" : page).filter((value,index,list)=>list.indexOf(value)===index).join(", ") : "No pages assigned yet.";
      if (technician) {
        document.getElementById("technicianRoleAccess").textContent =
          technician.allowedPages === null
            ? "Technician app only / no admin dashboard pages"
            : (technician.allowedPages?.length ? technician.allowedPages.map((page) => page === "service-requests" ? "job-cards" : page).filter((value,index,list)=>list.indexOf(value)===index).join(", ") : "No pages assigned yet.");
      }
    } catch (_) {
      document.getElementById("workshopManagerRoleAccess").textContent = "—";
    }
  }

  function renderAllowedPages(selected = []) {
    document.getElementById("allowedPages").innerHTML = pageOptions.map(([key, label]) =>
      `<label class="check-option"><input type="checkbox" value="${escapeHtml(key)}" ${(selected.includes(key) || (key === "job-cards" && selected.includes("service-requests"))) ? "checked" : ""}> ${escapeHtml(label)}</label>`
    ).join("");
  }

  function openRoleDialog(roleName) {
    const role = rolesCache.find((item) => item.name === roleName || (roleName === "Engineer" && item.name === "Workshop Manager"));
    if (!role) return;
    document.getElementById("roleForm").reset();
    document.getElementById("roleId").value = role.id;
    document.getElementById("roleDialogTitle").textContent = `Edit role — ${role.name === "Engineer" ? "Workshop Manager" : role.name}`;
    document.getElementById("roleFormAlert").className = "alert error hidden";
    renderAllowedPages(role.allowedPages || []);
    document.getElementById("roleDialog").showModal();
  }

  async function saveRole(event) {
    event.preventDefault();
    const id = document.getElementById("roleId").value;
    const role = rolesCache.find((item) => item.id === id);
    const payload = {
      name: role?.name,
      allowedPages: [...document.querySelectorAll("#allowedPages input:checked")].map((input) => input.value),
      permissions: {},
    };
    const confirmation = await window.belmConfirmEdit({
      title: "Save role changes?",
      message: `Confirm changes to the "${payload.name === "Engineer" ? "Workshop Manager" : payload.name}" role's access.`,
    });
    if (!confirmation) return;
    Object.assign(payload, confirmation);

    const button = document.getElementById("saveRoleButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(`/users/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      document.getElementById("roleDialog").close();
      await loadTechnicalRoleSummary();
      showAlert("Role access updated successfully.", false);
    } catch (error) {
      const box = document.getElementById("roleFormAlert");
      box.textContent = error.message;
      box.className = "alert error";
    } finally {
      button.disabled = false;
      button.textContent = "Save role";
    }
  }

  document.querySelectorAll("[data-edit-role]").forEach((button) => {
    button.addEventListener("click", () => openRoleDialog(button.dataset.editRole));
  });
  document.getElementById("roleForm").addEventListener("submit", saveRole);
  document.getElementById("closeRoleDialog").addEventListener("click", () => document.getElementById("roleDialog").close());
  document.getElementById("cancelRoleDialog").addEventListener("click", () => document.getElementById("roleDialog").close());

  document.getElementById("refreshButton").addEventListener("click", async () => {
    await Promise.all([load(), loadTechnicalRoleSummary()]);
  });

  function initEngineeringWorkspace() {
    const jobFrame = document.getElementById("engineeringJobCardsFrame");
    const jobPanel = document.getElementById("engineeringJobCardsPanel");
    const jobLocked = document.getElementById("engineeringJobCardsLocked");
    const analysisFrame = document.getElementById("engineeringWorkshopAnalysisFrame");
    const analysisPanel = document.getElementById("engineeringWorkshopAnalysisPanel");
    const analysisLocked = document.getElementById("engineeringWorkshopAnalysisLocked");
    if (!jobFrame && !analysisFrame) return;

    // Job Cards and Workshop Analysis share the same technical-work permission.
    // Legacy service-requests permission is accepted only for deployed role compatibility.
    const allowed = hasPageAccess("job-cards") || hasPageAccess("service-requests");
    if (!allowed) {
      [jobFrame, analysisFrame].forEach((frame) => frame?.removeAttribute("src"));
      jobPanel?.classList.add("hidden");
      analysisPanel?.classList.add("hidden");
      jobLocked?.classList.remove("hidden");
      analysisLocked?.classList.remove("hidden");
      return;
    }

    const routeParams = new URLSearchParams(window.location.search);
    const machineFocus = String(routeParams.get("machine") || "").trim();
    if (jobFrame) {
      const url = new URL(jobFrame.dataset.src || "/breakdown-workflow/?embed=1&source=admin", window.location.origin);
      if (machineFocus) url.searchParams.set("machine", machineFocus);
      jobFrame.src = `${url.pathname}${url.search}`;
    }
    if (analysisFrame) {
      const url = new URL(analysisFrame.dataset.src || "/breakdown-workflow/?embed=1&source=admin&view=analysis", window.location.origin);
      analysisFrame.src = `${url.pathname}${url.search}`;
    }

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== "belm-breakdown-workflow-height") return;
      const frame = [jobFrame, analysisFrame].find((candidate) => candidate && event.source === candidate.contentWindow);
      if (!frame) return;
      const minHeight = frame === analysisFrame ? 880 : 760;
      const maxHeight = frame === analysisFrame ? 2200 : 1800;
      const height = Math.max(minHeight, Math.min(maxHeight, Number(event.data.height) || 0));
      frame.style.height = `${height}px`;
    });
  }

  // V444 - BELM-WORKSHOP Communication History: batches the same
  // /customers/communication-feed endpoint Customers & Machines already
  // uses per-customer, but across every customer at once, merged and
  // sorted newest-first — same combined-fleet idea as "View Your Machine".
  async function loadBelmWorkshopFeed() {
    const container = document.getElementById("belmWorkshopFeedBody");
    if (!container) return;
    try {
      const customersList = await api("/customers");
      const byId = new Map(customersList.map((customer) => [customer.id, customer.name]));
      const ids = customersList.map((customer) => customer.id).filter(Boolean);
      if (!ids.length) {
        container.innerHTML = '<p class="belm-workshop-feed-empty">No customers registered yet.</p>';
        return;
      }
      const chunks = [];
      for (let index = 0; index < ids.length; index += 75) chunks.push(ids.slice(index, index + 75));
      const responses = await Promise.all(
        chunks.map((chunk) => api(`/customers/communication-feed?ids=${encodeURIComponent(chunk.join(","))}`))
      );
      const grouped = Object.assign({}, ...responses);
      const merged = [];
      Object.keys(grouped).forEach((customerId) => {
        (Array.isArray(grouped[customerId]) ? grouped[customerId] : []).forEach((item) => {
          merged.push({ ...item, customerId, customerName: byId.get(customerId) || "Customer" });
        });
      });
      merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const top = merged.slice(0, 8);
      container.innerHTML = top.length
        ? top.map((item) => `
            <div class="belm-workshop-feed-row">
              <div class="belm-workshop-feed-row-head">
                <strong>${escapeHtml(item.subject || "Communication")}</strong>
                <span class="direction">BELM ↔ ${escapeHtml(item.customerName)}</span>
              </div>
              <p>${escapeHtml(item.message || "—")}</p>
              <small>${escapeHtml(item.machineLabel || item.customerName)} · ${formatDateTime(item.createdAt)}</small>
            </div>`).join("")
        : '<p class="belm-workshop-feed-empty">No communication history yet.</p>';
    } catch (error) {
      container.innerHTML = `<p class="belm-workshop-feed-empty">${escapeHtml(error.message || "Could not load communication history.")}</p>`;
    }
  }

  initEngineeringWorkspace();

  document.querySelectorAll("[data-tool-page]").forEach((link) => {
    const key = link.dataset.toolPage;
    if (key && !hasPageAccess(key)) link.classList.add("hidden");
  });

  if (!token) {
    showAlert("Administrator login required.");
  } else {
    loadBelmWorkshopFeed();
    const rolesAccess = hasPageAccess("roles");
    if (!rolesAccess) {
      document.getElementById("engineeringRolesStrip")?.classList.add("hidden");
      document.getElementById("engineeringOverviewGrid")?.classList.add("hidden");
      document.getElementById("refreshButton")?.classList.add("hidden");
    } else {
      // V317: Technician Dispatch is intentionally not mounted on the Engineering landing page.
      load();
      loadTechnicalRoleSummary();
    }
  }
})();
