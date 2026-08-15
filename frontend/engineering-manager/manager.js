(function () {
  const token = localStorage.getItem("belm_admin_token");
  const pageOptions = [
    ["customers", "Customers"],
    ["overview", "All Overview"],
    ["roles", "Roles & system users"],
    ["service-requests", "Service requests"],
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
  let dispatchTechnicians = [];
  let dispatchCustomers = [];

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

  function updateDispatchNote() {
    const techId = document.getElementById("dispatchTechnician")?.value || "";
    const customerId = document.getElementById("dispatchCustomer")?.value || "";
    const tech = dispatchTechnicians.find((item) => String(item.id) === String(techId));
    const customer = dispatchCustomers.find((item) => String(item.id) === String(customerId));
    const note = document.getElementById("dispatchNote");
    if (!note) return;
    if (tech && customer && tech.assignedCustomerId && String(tech.assignedCustomerId) !== String(customer.id)) {
      note.innerHTML = `<b>TEMPORARY OVERRIDE:</b> ${escapeHtml(tech.name)} stays permanently attached to ${escapeHtml(tech.assignedCustomerName || "their home customer")}. Only this job is for ${escapeHtml(customer.name)}.`;
      note.classList.add("override");
    } else if (tech && customer) {
      note.textContent = `${tech.name} is already attached to ${customer.name}; this is a normal assignment.`;
      note.classList.remove("override");
    } else {
      note.textContent = "Select a Technician and customer. If they differ from the Technician's home customer, the task is marked Temporary Override.";
      note.classList.remove("override");
    }
  }

  async function loadDispatchOptions() {
    const panel = document.getElementById("dispatchPanel");
    try {
      const data = await api("/engineering?action=dispatch-options");
      dispatchTechnicians = data.technicians || [];
      dispatchCustomers = data.customers || [];
      document.getElementById("dispatchTechnician").innerHTML = '<option value="">Select Technician...</option>' + dispatchTechnicians.map((tech) => {
        const home = tech.assignedCustomerName ? ` · Home: ${tech.assignedCustomerName}` : " · No home customer";
        return `<option value="${escapeHtml(tech.id)}">${escapeHtml(tech.name + home)}</option>`;
      }).join("");
      document.getElementById("dispatchCustomer").innerHTML = '<option value="">Select Customer...</option>' + dispatchCustomers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join("");
      panel?.classList.remove("hidden");
      updateDispatchNote();
    } catch (error) {
      if (error.status !== 403) showAlert(error.message || "Could not load Technician Dispatch.");
      panel?.classList.add("hidden");
    }
  }

  async function dispatchTechnician(event) {
    event.preventDefault();
    const technicianId = document.getElementById("dispatchTechnician").value;
    const customerId = document.getElementById("dispatchCustomer").value;
    const tech = dispatchTechnicians.find((item) => String(item.id) === String(technicianId));
    const customer = dispatchCustomers.find((item) => String(item.id) === String(customerId));
    const temporary = Boolean(tech?.assignedCustomerId && customerId && String(tech.assignedCustomerId) !== String(customerId));
    if (temporary && !confirm(`${tech.name} is attached to ${tech.assignedCustomerName || "another customer"}. Assign this temporary job to ${customer?.name || "the selected customer"} without changing the permanent assignment?`)) return;
    try {
      const result = await api("/engineering?action=dispatch", {
        method: "POST",
        body: JSON.stringify({
          technicianId, customerId,
          title: document.getElementById("dispatchTitle").value.trim(),
          description: document.getElementById("dispatchDescription").value.trim(),
          priority: document.getElementById("dispatchPriority").value,
          dueDate: document.getElementById("dispatchDueDate").value || null,
        }),
      });
      showAlert(result.temporaryOverride ? "Temporary Technician Override assigned. Permanent customer was not changed." : "Technician job assigned.", false);
      document.getElementById("dispatchTitle").value = "";
      document.getElementById("dispatchDescription").value = "";
      document.getElementById("dispatchDueDate").value = "";
    } catch (error) { showAlert(error.message || "Could not assign the Technician."); }
  }

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
      showAlert("Could not load the Engineering dashboard.");
    }
  }

  async function loadEngineerRoleSummary() {
    try {
      rolesCache = await api("/users/roles");
      const engineer = rolesCache.find((role) => role.name === "Engineer");
      const technician = rolesCache.find((role) => role.name === "Technician");
      document.getElementById("engineerRoleAccess").textContent =
        engineer?.allowedPages?.length ? engineer.allowedPages.join(", ") : "No pages assigned yet.";
      if (technician) {
        document.getElementById("technicianRoleAccess").textContent =
          technician.allowedPages === null
            ? "Technician app only / no admin dashboard pages"
            : (technician.allowedPages?.length ? technician.allowedPages.join(", ") : "No pages assigned yet.");
      }
    } catch (_) {
      document.getElementById("engineerRoleAccess").textContent = "—";
    }
  }

  function renderAllowedPages(selected = []) {
    document.getElementById("allowedPages").innerHTML = pageOptions.map(([key, label]) =>
      `<label class="check-option"><input type="checkbox" value="${escapeHtml(key)}" ${selected.includes(key) ? "checked" : ""}> ${escapeHtml(label)}</label>`
    ).join("");
  }

  function openRoleDialog(roleName) {
    const role = rolesCache.find((item) => item.name === roleName);
    if (!role) return;
    document.getElementById("roleForm").reset();
    document.getElementById("roleId").value = role.id;
    document.getElementById("roleDialogTitle").textContent = `Edit role — ${role.name}`;
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
      message: `Confirm changes to the "${payload.name}" role's access.`,
    });
    if (!confirmation) return;
    Object.assign(payload, confirmation);

    const button = document.getElementById("saveRoleButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(`/users/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      document.getElementById("roleDialog").close();
      await loadEngineerRoleSummary();
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

  document.getElementById("refreshButton").addEventListener("click", load);

  if (!token) {
    showAlert("Administrator login required.");
  } else {
    document.getElementById("dispatchTechnician")?.addEventListener("change", updateDispatchNote);
  document.getElementById("dispatchCustomer")?.addEventListener("change", updateDispatchNote);
  document.getElementById("dispatchForm")?.addEventListener("submit", dispatchTechnician);
  loadDispatchOptions();
  load();
    loadEngineerRoleSummary();
  }
})();
