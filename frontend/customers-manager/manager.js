(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let pendingEditPin = null;
  let isSuperAdmin = false;
  try {
    const currentUser = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
    isSuperAdmin = currentUser?.role === "Super Admin";
  } catch (_) {}

  async function confirmThenOpen(title, message, openFn) {
    const confirmation = await window.belmConfirmEdit({ title, message });
    if (!confirmation) return;
    pendingEditPin = confirmation.editPin;
    openFn();
  }

  // Dark/light mode is handled centrally by admin-sidebar.js (per-admin
  // localStorage preference) — this page no longer sets its own theme or
  // reads/writes a shared company-wide setting.

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
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
  const statusLabel = (status) => ({
    GREEN: "Green — Normal", OK: "Green — Normal",
    YELLOW: "Yellow — Attention", ATTENTION: "Yellow — Attention",
    RED: "Red — Don't operate", CRITICAL: "Red — Don't operate",
    NOT_CHECKED: "Not checked", UNKNOWN: "Unknown",
    NONE: "—",
  })[status] || status || "Not checked";
  const isAttention = (status) => ["YELLOW", "ATTENTION", "RED", "CRITICAL"].includes(status);

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function showAlert(message, error = false) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = `alert${error ? " error" : ""}`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function formError(id, message) {
    const box = document.getElementById(id);
    box.textContent = message;
    box.className = "alert error";
  }

  function showButtonSuccess(button, text = "✓ Saved") {
    button.classList.add("success");
    const original = button.dataset.originalText || button.textContent;
    button.textContent = text;
    return new Promise((resolve) => setTimeout(() => {
      button.classList.remove("success");
      button.textContent = original;
      resolve();
    }, 900));
  }

  function customerPortalUrl(customer) {
    return new URL(`/portal/login?customer=${encodeURIComponent(customer.portalLink || "")}`, window.location.origin).href;
  }

  async function copyText(text, successMessage = "Copied.") {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showAlert(successMessage);
  }

  function updateMetrics() {
    const machines = customers.flatMap((customer) => customer.machines || []);
    document.getElementById("customerCount").textContent = customers.length.toLocaleString();
    document.getElementById("machineCount").textContent = machines.length.toLocaleString();
    document.getElementById("greenCount").textContent = machines.filter((machine) => ["GREEN", "OK"].includes(machine.status)).length.toLocaleString();
    document.getElementById("attentionCount").textContent = machines.filter((machine) => isAttention(machine.status)).length.toLocaleString();
  }

  const OPERATIONAL_STATUS_LABELS = {
    NORMAL: "Normal",
    SERVICE_IN_PROGRESS: "Service in progress",
    CHECKUP_IN_PROGRESS: "Check-up in progress",
    MAINTENANCE_IN_PROGRESS: "Maintenance in progress",
    GROUNDED: "Grounded (not operational)",
  };

  function machineCard(customerId, machine) {
    const status = String(machine.status || "NOT_CHECKED").toUpperCase();
    const reasons = Array.isArray(machine.alertReasons) ? machine.alertReasons : [];
    const opStatus = String(machine.operationalStatus || "NORMAL").toUpperCase();
    return `<article class="machine-card ${escapeHtml(status)}" ${reasons.length > 1 ? `data-reasons='${escapeHtml(JSON.stringify(reasons))}'` : ""}>
      <div>
        <h4>${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}</h4>
        <p>${escapeHtml(machine.machineType)} · Reg: ${escapeHtml(machine.regNumber || "—")} · Serial: ${escapeHtml(machine.serialNumber || "—")}</p>
        <span class="machine-status">${escapeHtml(statusLabel(status))}</span>
        ${reasons.length ? `<span class="machine-alert-reason">${escapeHtml(reasons[0])}</span>` : '<span class="machine-alert-reason"></span>'}
        <span class="service-due-badge" data-service-due-badge="${escapeHtml(machine.id)}">Service due: checking…</span>
        <label class="operational-status-picker op-${escapeHtml(opStatus)}">Activity status
          <select data-operational-status="${escapeHtml(machine.id)}">
            ${Object.entries(OPERATIONAL_STATUS_LABELS).map(([value, label]) =>
              `<option value="${value}" ${value === opStatus ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="machine-actions">
        <button data-view-reports="${escapeHtml(machine.id)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Reports</button>
        <button data-checkup="${escapeHtml(machine.id)}" data-machine-type="${escapeHtml(machine.machineType)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Check-up</button>
        <button data-edit-machine="${escapeHtml(machine.id)}" data-customer="${escapeHtml(customerId)}">Edit</button>
        <button class="delete" data-delete-machine="${escapeHtml(machine.id)}">Delete</button>
      </div>
    </article>`;
  }

  // Uses the SAME endpoint and SAME GREEN/YELLOW/RED thresholds (60hrs
  // reminder window) as the Customer Portal's "Next Service" panel, so
  // admin sees exactly what the customer sees — no separate, conflicting
  // source of truth for service-due status.
  async function loadServiceDueBadges() {
    document.querySelectorAll("[data-service-due-badge]").forEach(async (badge) => {
      const machineId = badge.dataset.serviceDueBadge;
      try {
        const status = await api(`/checklist-reports/service-status/${machineId}`);
        const remaining = Math.round(status.hoursRemaining);
        const level = String(status.level || "GREEN").toUpperCase();
        const label = level === "RED" ? "Service due now" : level === "YELLOW" ? "Service due soon" : "On schedule";
        badge.textContent = `${status.intervalHours}-Hr Service — ${remaining <= 0 ? "Overdue" : `${remaining} hrs left`} (${label})`;
        badge.className = `service-due-badge ${level}`;
      } catch (_) {
        badge.textContent = "Service due: not available";
      }
    });
  }

  function rotateMachineAlertReasons() {
    document.querySelectorAll(".machine-card[data-reasons]").forEach((card) => {
      let reasons;
      try {
        reasons = JSON.parse(card.dataset.reasons || "[]");
      } catch (_) {
        return;
      }
      if (!Array.isArray(reasons) || reasons.length < 2) return;
      const index = (Number(card.dataset.reasonIndex || 0) + 1) % reasons.length;
      card.dataset.reasonIndex = String(index);
      const label = card.querySelector(".machine-alert-reason");
      if (label) label.textContent = reasons[index];
    });
  }
  setInterval(rotateMachineAlertReasons, 3000);

  function renderCustomers() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filter = document.getElementById("statusFilter").value;
    const filtered = customers.filter((customer) => {
      const machines = customer.machines || [];
      const searchable = [
        customer.name, customer.email, customer.phone, customer.address,
        customer.tinNumber, customer.vrn,
        ...machines.flatMap((machine) => [machine.machineType, machine.brand, machine.model, machine.regNumber, machine.serialNumber]),
      ];
      const matchesQuery = searchable.some((value) => String(value || "").toLowerCase().includes(query));
      const matchesFilter = !filter
        || (filter === "ACTIVE" && Number(customer.isActive) === 1)
        || (filter === "INACTIVE" && Number(customer.isActive) !== 1)
        || (filter === "ATTENTION" && machines.some((machine) => isAttention(machine.status)));
      return matchesQuery && matchesFilter;
    });

    const grid = document.getElementById("customerGrid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty">No customer cards match this search. Register a customer to begin.</div>';
      return;
    }
    grid.innerHTML = filtered.map((customer) => {
      const portalUrl = customerPortalUrl(customer);
      const machines = customer.machines || [];
      return `<article class="customer-card ${Number(customer.isActive) === 1 ? "" : "inactive"}">
        <div class="customer-card-head">
          <div><p class="eyebrow">Customer</p><h2>${escapeHtml(customer.name)}</h2><p>Registered ${customer.createdAt ? escapeHtml(new Date(customer.createdAt).toLocaleDateString()) : ""}</p></div>
          <span class="badge ${Number(customer.isActive) === 1 ? "" : "off"}">${Number(customer.isActive) === 1 ? "Active" : "Inactive"}</span>
        </div>
        <div class="customer-feed" id="feed-${escapeHtml(customer.id)}" data-customer-id="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">
          <div class="customer-feed-head">
            <strong>Customer updates</strong>
            <button type="button" class="view-messages-button" data-view-messages="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">View all</button>
          </div>
          <div class="customer-feed-body">Loading recent updates…</div>
        </div>
        <div class="customer-info-grid">
          <div><span>Email</span><strong>${escapeHtml(customer.email)}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(customer.phone)}</strong></div>
          <div><span>Address</span><strong>${escapeHtml(customer.address || "—")}</strong></div>
          <div><span>TIN / VRN</span><strong>${escapeHtml(customer.tinNumber || "—")} / ${escapeHtml(customer.vrn || "—")}</strong></div>
        </div>
        <div class="portal-link-box">
          <span>Working customer portal link</span>
          <code>${escapeHtml(portalUrl)}</code>
          <div class="portal-actions">
            <button data-copy-link="${escapeHtml(customer.id)}">Copy link</button>
            <a href="${escapeHtml(portalUrl)}" target="_blank" rel="noopener">Open customer login</a>
          </div>
        </div>
        <div class="customer-card-actions">
          <button class="view-machines-inline" data-view-machines="${escapeHtml(customer.id)}">
            View Machines (${machines.length})${machines.some((m) => isAttention(m.status)) ? ' <span class="badge off">!</span>' : ""}
          </button>
          <button data-edit-customer="${escapeHtml(customer.id)}">Edit customer</button>
          <button data-reset-customer="${escapeHtml(customer.id)}">Reset login</button>
          <button class="delete" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>
          ${isSuperAdmin ? `<button class="delete" data-forget-customer="${escapeHtml(customer.id)}" title="Permanently erase — skips the Recycle Bin, cannot be undone or restored">Forget permanently</button>` : ""}
        </div>
      </article>`;
    }).join("");
    loadCustomerFeeds(filtered);
  }

  let currentMachineListCustomerName = "";

  async function loadCustomerFeeds(customerList) {
    for (const customer of customerList) {
      const body = document.querySelector(`#feed-${customer.id} .customer-feed-body`);
      if (!body) continue;
      try {
        const items = await api(`/service-requests?action=customer-inbox&customerId=${encodeURIComponent(customer.id)}`);
        body.innerHTML = items.length
          ? items.slice(0, 3).map((item) => `
              <div class="customer-feed-row" data-message-type="${escapeHtml(item.type)}" data-message-id="${escapeHtml(item.id)}">
                <div class="customer-feed-row-head">
                  <strong>${escapeHtml(item.title)}</strong>
                  <button type="button" class="badge badge-resolve" data-resolve-message>${escapeHtml(item.status)}</button>
                </div>
                <p>${escapeHtml(item.detail || "—")}</p>
                <small>${formatDateTime(item.createdAt)}</small>
              </div>`).join("")
          : '<p class="customer-feed-empty">No recent updates from this customer.</p>';
      } catch (_) {
        body.innerHTML = '<p class="customer-feed-empty">Could not load updates.</p>';
      }
    }
  }

  async function resolveCustomerMessage(type, id) {
    if (type === "operator-report") {
      await api(`/service-requests?action=operator-reports&id=${encodeURIComponent(id)}`, { method: "PUT" });
    } else {
      await api(`/service-requests/${encodeURIComponent(id)}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "COMPLETED" }),
      });
    }
  }

  async function openCustomerMessages(customerId, customerName) {
    document.getElementById("customerMessagesTitle").textContent = `${customerName} — Customer Messages`;
    const body = document.getElementById("customerMessagesBody");
    body.innerHTML = '<p class="muted">Loading messages…</p>';
    document.getElementById("customerMessagesDialog").showModal();
    try {
      const items = await api(`/service-requests?action=customer-inbox&customerId=${encodeURIComponent(customerId)}`);
      body.innerHTML = items.length
        ? `<div class="customer-messages-list">${items.map((item) => `
            <article class="customer-message-row" data-message-type="${escapeHtml(item.type)}" data-message-id="${escapeHtml(item.id)}">
              <div class="customer-message-head">
                <strong>${escapeHtml(item.title)}</strong>
                <button type="button" class="badge badge-resolve" data-resolve-message>${escapeHtml(item.status)}</button>
              </div>
              <p>${escapeHtml(item.detail || "—")}</p>
              <small>${formatDateTime(item.createdAt)}</small>
            </article>`).join("")}</div>`
        : '<p class="muted">No open messages from this customer.</p>';
    } catch (error) {
      body.innerHTML = `<p class="muted">${escapeHtml(error.message || "Could not load customer messages.")}</p>`;
    }
  }

  document.getElementById("customerMessagesBody").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-resolve-message]");
    if (!button) return;
    const row = button.closest("[data-message-id]");
    button.disabled = true;
    try {
      await resolveCustomerMessage(row.dataset.messageType, row.dataset.messageId);
      row.style.transition = "opacity .2s";
      row.style.opacity = "0";
      setTimeout(() => row.remove(), 200);
    } catch (error) {
      button.disabled = false;
      showAlert(error.message || "Could not resolve this message.", true);
    }
  });

  function openMachineList(customer) {
    if (!customer) return;
    const machines = customer.machines || [];
    currentMachineListCustomerName = customer.name || "";
    document.getElementById("machineListTitle").textContent = `${customer.name} — Machines (${machines.length})`;
    document.getElementById("machineListAddButton").dataset.addMachine = customer.id;
    document.getElementById("machineListBody").innerHTML = machines.length
      ? `<div class="machine-list">${machines.map((machine) => machineCard(customer.id, machine)).join("")}</div>`
      : '<div class="empty">No machines registered for this customer yet.</div>';
    document.getElementById("machineListDialog").showModal();
    if (machines.length) loadServiceDueBadges();
  }

  async function load() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      customers = await api("/customers");
      updateMetrics();
      renderCustomers();
    } catch (error) {
      document.getElementById("customerGrid").innerHTML = `<div class="empty">${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a></div>`;
      showAlert(error.message, true);
    }
  }

  function openCustomer(customer = null) {
    document.getElementById("customerForm").reset();
    document.getElementById("customerId").value = customer?.id || "";
    document.getElementById("customerDialogTitle").textContent = customer ? `Edit ${customer.name}` : "Register customer";
    document.getElementById("customerName").value = customer?.name || "";
    document.getElementById("customerEmail").value = customer?.email || "";
    document.getElementById("customerPhone").value = customer?.phone || "";
    document.getElementById("customerAddress").value = customer?.address || "";
    document.getElementById("customerTin").value = customer?.tinNumber || "";
    document.getElementById("customerVrn").value = customer?.vrn || "";
    document.getElementById("customerActive").checked = customer ? Number(customer.isActive) === 1 : true;
    document.getElementById("customerActiveField").classList.toggle("hidden", !customer);
    document.getElementById("customerFormAlert").className = "alert error hidden";
    document.getElementById("customerDialog").showModal();
  }

  function showCredentials(customer, loginInfo) {
    const link = loginInfo?.portalUrl || loginInfo?.portalLink || customerPortalUrl(customer);
    const absoluteLink = new URL(link, window.location.origin).href;
    document.getElementById("credentialEmail").value = customer.email;
    document.getElementById("credentialPassword").value = loginInfo?.temporaryPassword || "";
    document.getElementById("credentialRecovery").value = loginInfo?.recoveryCode || "";
    document.getElementById("credentialLink").value = absoluteLink;
    document.getElementById("openCredentialLink").href = absoluteLink;
    document.getElementById("credentialsDialog").showModal();
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const button = document.getElementById("saveCustomerButton");
    if (button.disabled) return;
    const id = document.getElementById("customerId").value;
    const payload = {
      name: document.getElementById("customerName").value.trim(),
      email: document.getElementById("customerEmail").value.trim(),
      phone: document.getElementById("customerPhone").value.trim(),
      address: document.getElementById("customerAddress").value.trim(),
      tinNumber: document.getElementById("customerTin").value.trim(),
      vrn: document.getElementById("customerVrn").value.trim(),
      isActive: document.getElementById("customerActive").checked,
    };
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
    }
    button.disabled = true;
    button.dataset.originalText = "Save customer";
    button.textContent = "Saving…";
    try {
      const result = await api(id ? `/customers/${id}` : "/customers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await showButtonSuccess(button);
      document.getElementById("customerDialog").close();
      pendingEditPin = null;
      await load();
      const savedCustomer = customers.find((customer) => customer.id === (id || result.id));
      if (!id && savedCustomer) showCredentials(savedCustomer, result.portalLoginInfo);
      showAlert(id ? "Customer information and portal link updated." : "Customer registered successfully.");
    } catch (error) {
      formError("customerFormAlert", error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save customer";
    }
  }

  let machineTypesCache = null;

  async function ensureMachineTypesLoaded(force) {
    if (force) machineTypesCache = null;
    if (machineTypesCache) return machineTypesCache;
    try {
      const templates = await api("/checklist-templates");
      const seen = new Set();
      machineTypesCache = templates
        .map((t) => t.machineType)
        .filter((type) => {
          const key = String(type || "").trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.localeCompare(b));
    } catch (_) {
      machineTypesCache = [];
    }
    return machineTypesCache;
  }

  async function populateMachineTypeSelect(selectedType) {
    const select = document.getElementById("machineType");
    const types = await ensureMachineTypesLoaded(false);
    const matchesExisting = types.some((type) => type.toLowerCase() === String(selectedType || "").trim().toLowerCase());
    select.innerHTML = '<option value="">Select machine type…</option>' +
      types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("") +
      '<option value="__other__">+ New machine type…</option>';
    if (selectedType && !matchesExisting) {
      select.value = "__other__";
      document.getElementById("machineTypeOtherWrap").classList.remove("hidden");
      document.getElementById("machineTypeOther").value = selectedType;
    } else {
      select.value = selectedType || "";
      document.getElementById("machineTypeOtherWrap").classList.add("hidden");
      document.getElementById("machineTypeOther").value = "";
    }
  }

  document.getElementById("machineType").addEventListener("change", (event) => {
    document.getElementById("machineTypeOtherWrap").classList.toggle("hidden", event.target.value !== "__other__");
  });

  function openMachine(customer, machine = null) {
    document.getElementById("machineForm").reset();
    document.getElementById("machineCustomerId").value = customer.id;
    document.getElementById("machineId").value = machine?.id || "";
    document.getElementById("machineDialogTitle").textContent = machine ? `Edit ${machine.model}` : `Add machine — ${customer.name}`;
    populateMachineTypeSelect(machine?.machineType || "");
    document.getElementById("machineBrand").value = machine?.brand || "";
    document.getElementById("machineModel").value = machine?.model || "";
    document.getElementById("machineRegNumber").value = machine?.regNumber || "";
    document.getElementById("machineFleetNumber").value = machine?.fleetNumber || "";
    document.getElementById("machineSerialNumber").value = machine?.serialNumber || "";
    document.getElementById("machineServiceKit").value = machine?.serviceKit || "OK";
    document.getElementById("machineFormAlert").className = "alert error hidden";
    const moveWrap = document.getElementById("machineMoveCustomerWrap");
    if (machine) {
      moveWrap.classList.remove("hidden");
      const moveSelect = document.getElementById("machineMoveCustomer");
      moveSelect.innerHTML = customers.map((c) =>
        `<option value="${escapeHtml(c.id)}" ${c.id === customer.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
    } else {
      moveWrap.classList.add("hidden");
    }
    document.getElementById("machineDialog").showModal();
  }

  async function saveMachine(event) {
    event.preventDefault();
    const button = document.getElementById("saveMachineButton");
    if (button.disabled) return;
    const customerId = document.getElementById("machineCustomerId").value;
    const id = document.getElementById("machineId").value;
    const typeSelectValue = document.getElementById("machineType").value;
    const machineTypeValue = typeSelectValue === "__other__"
      ? document.getElementById("machineTypeOther").value.trim()
      : typeSelectValue;
    const payload = {
      machineType: machineTypeValue,
      brand: document.getElementById("machineBrand").value.trim(),
      model: document.getElementById("machineModel").value.trim(),
      regNumber: document.getElementById("machineRegNumber").value.trim(),
      fleetNumber: document.getElementById("machineFleetNumber").value.trim(),
      serialNumber: document.getElementById("machineSerialNumber").value.trim(),
      serviceKit: document.getElementById("machineServiceKit").value,
    };
    if (!payload.machineType) {
      formError("machineFormAlert", "Select or type a machine type.");
      return;
    }
    let targetCustomerId = customerId;
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
      const moveSelect = document.getElementById("machineMoveCustomer");
      if (moveSelect.value && moveSelect.value !== customerId) {
        payload.customerId = moveSelect.value;
        targetCustomerId = moveSelect.value;
      }
    }
    button.disabled = true;
    button.dataset.originalText = "Save machine";
    button.textContent = "Saving…";
    try {
      await api(id ? `/customers/machines/${id}` : `/customers/${customerId}/machines`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await showButtonSuccess(button);
      document.getElementById("machineDialog").close();
      pendingEditPin = null;
      await load();
      if (document.getElementById("machineListDialog").open) {
        openMachineList(customers.find((customer) => customer.id === targetCustomerId));
      }
      showAlert(id && targetCustomerId !== customerId
        ? "Machine moved to the selected customer."
        : id ? "Machine updated successfully." : "Machine added to customer card.");
    } catch (error) {
      formError("machineFormAlert", error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save machine";
    }
  }

  async function removeCustomer(id) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete customer?",
      message: `Delete customer ${customer.name}? The record will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/customers/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await load();
      showAlert("Customer moved to the Recycle Bin.");
    } catch (error) { showAlert(error.message, true); }
  }

  async function forgetCustomer(id) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Forget customer permanently?",
      message: `This permanently erases "${customer.name}" and all their machines, invoices, checklist reports and service requests. It skips the Recycle Bin entirely — there is no undo and no restore. Use "Delete" instead if you might need this back later.`,
    });
    if (!confirmation) return;
    try {
      await api(`/customers/${id}?permanent=1`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await load();
      showAlert(`"${customer.name}" has been permanently forgotten.`);
    } catch (error) { showAlert(error.message, true); }
  }

  async function resetCustomerLogin(id) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    const confirmation = await window.belmConfirmEdit({
      title: "Reset customer login?",
      message: `Generate a new password and recovery code for ${customer.name}? The old password and recovery code will stop working.`,
    });
    if (!confirmation) return;
    try {
      const result = await api(`/customers/${id}/reset-password`, { method: "PUT", body: JSON.stringify(confirmation) });
      showCredentials(customer, result);
      showAlert("New customer credentials generated. Copy them before closing the window.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function removeMachine(id) {
    const machine = customers.flatMap((customer) => customer.machines || []).find((item) => item.id === id);
    if (!machine) return;
    const customerId = customers.find((customer) => (customer.machines || []).some((m) => m.id === id))?.id;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete machine?",
      message: `Delete machine ${machine.model}? The record will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/customers/machines/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await load();
      if (document.getElementById("machineListDialog").open && customerId) {
        openMachineList(customers.find((customer) => customer.id === customerId));
      }
      showAlert("Machine moved to the Recycle Bin.");
    } catch (error) { showAlert(error.message, true); }
  }

  let cachedMachineReports = [];

  async function openMachineReports(machineId, machineName) {
    document.getElementById("machineListDialog").close();
    document.getElementById("reportsDialogTitle").textContent =
      `${currentMachineListCustomerName ? currentMachineListCustomerName.toUpperCase() + " — " : ""}${machineName} Checklist Reports`;
    const list = document.getElementById("reportsList");
    list.innerHTML = '<p class="muted">Loading reports…</p>';
    document.getElementById("reportsDialog").showModal();
    try {
      cachedMachineReports = await api(`/checklist-reports/machine/${encodeURIComponent(machineId)}`);
      list.innerHTML = cachedMachineReports.length ? cachedMachineReports.map((report) => `
        <article class="report-item">
          <div>
            <strong>${escapeHtml(report.templateName || "Checklist report")}</strong>
            <span>${formatDateTime(report.createdAt)} · Hour meter: ${escapeHtml(report.hourMeterReading ?? "—")}</span>
          </div>
          <span class="machine-status ${escapeHtml(String(report.overallStatus || "GREEN").toUpperCase())}">${escapeHtml(statusLabel(report.overallStatus))}</span>
          <button type="button" data-view-report="${escapeHtml(report.id)}">View</button>
          <a class="report-download-link" href="/api/checklist-reports/${escapeHtml(report.id)}/pdf?token=${encodeURIComponent(token)}" target="_blank" rel="noopener">Download</a>
        </article>`).join("") : '<p class="muted">No checklist reports recorded for this machine yet.</p>';
    } catch (error) {
      list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  function viewReport(reportId) {
    const report = cachedMachineReports.find((item) => String(item.id) === String(reportId));
    const body = document.getElementById("reportViewBody");
    document.getElementById("reportViewDialog").showModal();
    if (!report) {
      body.innerHTML = '<p class="muted">Report not found.</p>';
      return;
    }
    document.getElementById("reportViewTitle").textContent =
      `${currentMachineListCustomerName ? currentMachineListCustomerName.toUpperCase() + " — " : ""}${report.templateName || "Report detail"}`;
    document.getElementById("reportViewDownloadLink").href =
      `/api/checklist-reports/${encodeURIComponent(report.id)}/pdf?token=${encodeURIComponent(token)}`;
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const displayPhotoUrl = String(report.displayPhotoUrl || "").trim();
    body.innerHTML = `
      <div class="report-top-summary">
        <div class="report-top-fact"><span>Hour Meter</span><strong>${escapeHtml(report.hourMeterReading ?? "—")}</strong></div>
        <div class="report-top-fact"><span>Filled By</span><strong>${escapeHtml(report.filledBy || "—")}</strong></div>
        <div class="report-top-fact"><span>Date</span><strong>${formatDateTime(report.createdAt)}</strong></div>
        ${displayPhotoUrl ? `<div class="report-top-fact report-top-photo"><span>Display Photo</span><img src="${escapeHtml(displayPhotoUrl)}" alt="Display photo" class="report-display-photo" data-view-evidence-photo="${escapeHtml(displayPhotoUrl)}"></div>` : ""}
      </div>
      <table><thead><tr><th>Item</th><th>Result</th><th>Status</th><th style="text-align:right">Evidence</th></tr></thead>
      <tbody>${answers.length ? answers.map((answer, answerIndex) => {
        const photoUrl = String(answer.photoUrl || "").trim();
        const rawValue = String(answer.value ?? "");
        const valueAsPhoto = /^data:image\//i.test(rawValue) ? rawValue : "";
        const resultCell = valueAsPhoto
          ? `<img src="${escapeHtml(valueAsPhoto)}" alt="Photo for ${escapeHtml(answer.label)}" class="evidence-thumb" data-view-evidence-photo="${escapeHtml(valueAsPhoto)}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer">`
          : escapeHtml(rawValue || "—");
        const level = String(answer.safetyLevel || "GREEN").toUpperCase();
        const statusCell = level === "NONE" ? "—" : `<span class="machine-status ${escapeHtml(level)}">${escapeHtml(statusLabel(level))}</span>`;
        const note = String(answer.note || "").trim();
        return `<tr>
          <td>${answerIndex + 1}. ${escapeHtml(answer.label)}</td>
          <td>${resultCell}${note ? `<div class="checkup-issue-note-display">Issue: ${escapeHtml(note)}</div>` : ""}</td>
          <td>${statusCell}</td>
          <td style="text-align:right">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Evidence" class="evidence-thumb" data-view-evidence-photo="${escapeHtml(photoUrl)}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--line);cursor:pointer">` : "—"}</td>
        </tr>`;
      }).join("") : '<tr><td colspan="4" class="muted">No answers recorded.</td></tr>'}</tbody></table>`;
  }

  document.getElementById("reportViewBody")?.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-view-evidence-photo]");
    if (!thumb) return;
    openEvidencePhotoLightbox(thumb.dataset.viewEvidencePhoto);
  });

  function openEvidencePhotoLightbox(photoUrl) {
    let overlay = document.getElementById("evidencePhotoLightbox");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "evidencePhotoLightbox";
      overlay.className = "evidence-photo-lightbox";
      overlay.innerHTML = `
        <button type="button" class="evidence-photo-lightbox-close" aria-label="Close">×</button>
        <img alt="Evidence photo — full size">`;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest(".evidence-photo-lightbox-close")) {
          overlay.classList.remove("open");
        }
      });
    }
    overlay.querySelector("img").src = photoUrl;
    overlay.classList.add("open");
  }

  function checkupItemControl(item) {
    const inputType = String(item.inputType || "TEXT").toUpperCase();
    const options = Array.isArray(item.options) ? item.options : [];
    const required = item.isRequired ? "required" : "";
    const common = `data-checkup-item="${escapeHtml(item.id)}" ${required}`;
    if (inputType === "DROPDOWN" || inputType === "YES_NO") {
      const selectOptions = options.length ? options : (inputType === "YES_NO" ? ["Yes", "No"] : []);
      const optionSafety = item.optionSafety || {};
      const selectHtml = `<select ${common} ${inputType === "YES_NO" ? 'data-yes-no-select="1"' : ""}><option value="">Select result</option>${selectOptions.map((option) =>
        `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
      if (inputType !== "YES_NO") return selectHtml;
      return `${selectHtml}
        <div class="checkup-issue-note hidden" data-issue-note-for="${escapeHtml(item.id)}" data-option-safety='${escapeHtml(JSON.stringify(optionSafety))}'>
          <label>Describe the issue<textarea data-checkup-issue-note="${escapeHtml(item.id)}" rows="2" placeholder="What did you observe?"></textarea></label>
        </div>`;
    }
    if (inputType === "NUMBER") return `<input ${common} type="number" step="any">`;
    if (inputType === "DATE") return `<input ${common} type="date">`;
    if (inputType === "PHOTO") {
      return `<input type="hidden" ${common} data-checkup-item-type="PHOTO" value="">
        <div class="checkup-photo-uploader" data-photo-uploader-for="${escapeHtml(item.id)}">
          <label class="checkup-photo-picker">
            <span>Take photo / choose from gallery</span>
            <small>JPG, PNG or WEBP — compressed automatically</small>
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment">
          </label>
          <div class="checkup-photo-preview" hidden><img alt="Photo preview"><span></span></div>
          <p class="checkup-photo-error" hidden></p>
        </div>`;
    }
    return `<input ${common} type="text">`;
  }

  // ------------------------------------------------------------------
  // PHOTO capture for checklist items — take a picture with the device
  // camera or pick one from the gallery, compress it client-side, and
  // store it as a small data: URL on the hidden field the submit
  // handler reads. Mirrors the same compression approach the
  // Technician app uses, so both sides behave the same way.
  // ------------------------------------------------------------------
  const CHECKUP_PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  const CHECKUP_PHOTO_TARGET_BYTES = 450 * 1024;

  function checkupPhotoDataUrlBytes(dataUrl) {
    const encoded = String(dataUrl || "").split(",")[1] || "";
    return Math.ceil((encoded.length * 3) / 4);
  }

  function loadCheckupPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The selected photo could not be read."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Select a valid JPG, PNG or WEBP photo."));
        image.onload = () => resolve(image);
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  async function compressCheckupPhoto(file) {
    if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Select an image file.");
    if (file.size > CHECKUP_PHOTO_MAX_SOURCE_BYTES) throw new Error("Photo is above 12 MB. Select a smaller photo.");

    const image = await loadCheckupPhoto(file);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot compress the selected photo.");

    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const longestSide = Math.max(imageWidth, imageHeight);
    let scale = Math.min(1, 1280 / Math.max(1, longestSide));
    let quality = 0.68;
    let compressed = "";

    for (let attempt = 0; attempt < 9; attempt += 1) {
      canvas.width = Math.max(1, Math.round(imageWidth * scale));
      canvas.height = Math.max(1, Math.round(imageHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      compressed = canvas.toDataURL("image/jpeg", quality);
      if (checkupPhotoDataUrlBytes(compressed) <= CHECKUP_PHOTO_TARGET_BYTES) break;
      if (quality > 0.42) quality -= 0.08;
      else { scale *= 0.78; quality = 0.56; }
    }

    const compressedBytes = checkupPhotoDataUrlBytes(compressed);
    if (!compressed || compressedBytes > 500 * 1024) {
      throw new Error("Photo could not be reduced enough. Crop it or select a smaller photo.");
    }
    return { dataUrl: compressed, originalBytes: file.size, compressedBytes };
  }

  document.getElementById("checkupItems")?.addEventListener("change", async (event) => {
    const yesNoSelect = event.target.closest("[data-yes-no-select]");
    if (yesNoSelect) {
      const itemId = yesNoSelect.dataset.checkupItem;
      const noteBlock = document.querySelector(`[data-issue-note-for="${itemId}"]`);
      if (noteBlock) {
        let optionSafety = {};
        try { optionSafety = JSON.parse(noteBlock.dataset.optionSafety || "{}"); } catch (_) {}
        const selected = yesNoSelect.value.trim().toUpperCase();
        const level = String(
          optionSafety[selected] || optionSafety[yesNoSelect.value.trim()] || "GREEN"
        ).toUpperCase();
        noteBlock.classList.toggle("hidden", !["YELLOW", "RED"].includes(level));
      }
      return;
    }
    const fileInput = event.target.closest('.checkup-photo-uploader input[type="file"]');
    if (!fileInput) return;
    const uploader = fileInput.closest(".checkup-photo-uploader");
    const itemId = uploader.dataset.photoUploaderFor;
    const hiddenField = document.querySelector(`input[type="hidden"][data-checkup-item="${itemId}"]`);
    const preview = uploader.querySelector(".checkup-photo-preview");
    const previewImage = preview.querySelector("img");
    const previewText = preview.querySelector("span");
    const errorBox = uploader.querySelector(".checkup-photo-error");
    const file = fileInput.files?.[0];
    if (!file || !hiddenField) return;

    fileInput.disabled = true;
    errorBox.hidden = true;
    preview.hidden = false;
    previewImage.removeAttribute("src");
    previewText.textContent = "Compressing photo…";
    try {
      const result = await compressCheckupPhoto(file);
      hiddenField.value = result.dataUrl;
      previewImage.src = result.dataUrl;
      previewText.textContent = `Ready · ${(result.originalBytes / 1024 / 1024).toFixed(2)} MB reduced to ${Math.ceil(result.compressedBytes / 1024)} KB`;
    } catch (error) {
      hiddenField.value = "";
      fileInput.value = "";
      preview.hidden = true;
      errorBox.textContent = error.message || "Photo could not be prepared.";
      errorBox.hidden = false;
    } finally {
      fileInput.disabled = false;
    }
  });

  async function openMachineCheckup(machineId, machineType, machineName) {
    document.getElementById("machineListDialog").close();
    document.getElementById("checkupDialogTitle").textContent = `${machineName} — Check-up`;
    document.getElementById("checkupMachineId").value = machineId;
    document.getElementById("checkupForm").reset();
    document.getElementById("checkupFormAlert").classList.add("hidden");
    document.getElementById("checkupServiceFields").classList.add("hidden");
    document.getElementById("checkupDisplayPhotoValue").value = "";
    document.getElementById("checkupDisplayPhotoPreview").src = "";
    document.getElementById("checkupDisplayPhotoPreview").classList.add("hidden");
    document.getElementById("checkupItems").innerHTML = '<p class="muted">Loading checklist template…</p>';
    document.getElementById("checkupLastHourMeter").textContent = "(loading last recorded hours…)";
    document.getElementById("checkupDialog").showModal();
    api(`/checklist-reports?action=service-status&machineId=${encodeURIComponent(machineId)}`)
      .then((status) => {
        const lastHours = Number(status?.totalHours || 0);
        document.getElementById("checkupLastHourMeter").textContent =
          `(last recorded: ${lastHours.toLocaleString("en-TZ")} hrs — today's reading must be the same or higher)`;
      })
      .catch(() => {
        document.getElementById("checkupLastHourMeter").textContent = "(last recorded hours unavailable)";
      });
    try {
      const templates = await api(`/checklist-templates?machineType=${encodeURIComponent(machineType)}`);
      const active = templates.filter((template) => template.isActive);
      const select = document.getElementById("checkupTemplate");
      select.innerHTML = active.length
        ? active.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join("")
        : '<option value="">No checklist template for this machine type</option>';
      select.dataset.templates = JSON.stringify(active);
      renderCheckupItems();
      select.onchange = renderCheckupItems;
    } catch (error) {
      document.getElementById("checkupItems").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderCheckupItems() {
    const select = document.getElementById("checkupTemplate");
    let templates = [];
    try { templates = JSON.parse(select.dataset.templates || "[]"); } catch (_) {}
    const template = templates.find((item) => item.id === select.value);
    const container = document.getElementById("checkupItems");
    if (!template) {
      container.innerHTML = '<p class="muted">Select a checklist template.</p>';
      return;
    }
    const items = Array.isArray(template.items) ? template.items : [];
    container.innerHTML = items.length
      ? items.map((item) => `<label class="wide">${escapeHtml(item.label)}${item.isRequired ? " *" : ""}${checkupItemControl(item)}</label>`).join("")
      : '<p class="muted">This template has no checklist items.</p>';
  }

  document.getElementById("checkupIsServiceDay")?.addEventListener("change", (event) => {
    document.getElementById("checkupServiceFields").classList.toggle("hidden", !event.target.checked);
  });

  document.getElementById("checkupDisplayPhotoFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressCheckupPhoto(file);
      document.getElementById("checkupDisplayPhotoValue").value = compressed.dataUrl;
      const preview = document.getElementById("checkupDisplayPhotoPreview");
      preview.src = compressed.dataUrl;
      preview.classList.remove("hidden");
    } catch (error) {
      showAlert(error.message, true);
      event.target.value = "";
    }
  });

  document.getElementById("checkupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveCheckupButton");
    if (button.disabled) return;
    const alertBox = document.getElementById("checkupFormAlert");
    const templateId = document.getElementById("checkupTemplate").value;
    if (!templateId) {
      alertBox.textContent = "Select a checklist template.";
      alertBox.classList.remove("hidden");
      return;
    }
    if (!document.getElementById("checkupDisplayPhotoValue").value) {
      alertBox.textContent = "Take a photo of the machine display (fuel level, codes) before submitting.";
      alertBox.classList.remove("hidden");
      return;
    }
    const answers = Array.from(document.querySelectorAll("[data-checkup-item]")).map((field) => {
      const isPhoto = field.dataset.checkupItemType === "PHOTO";
      const issueNote = document.querySelector(`[data-checkup-issue-note="${field.dataset.checkupItem}"]`);
      const issueNoteVisible = issueNote && !issueNote.closest(".checkup-issue-note")?.classList.contains("hidden");
      return {
        templateItemId: field.dataset.checkupItem,
        value: isPhoto ? "" : field.value,
        photoUrl: isPhoto ? field.value : undefined,
        note: issueNoteVisible ? issueNote.value.trim() || undefined : undefined,
      };
    });
    const isServiceDay = document.getElementById("checkupIsServiceDay").checked;
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      await api("/checklist-reports?action=submit", {
        method: "POST",
        body: JSON.stringify({
          machineId: document.getElementById("checkupMachineId").value,
          templateId,
          hourMeterReading: Number(document.getElementById("checkupHourMeter").value),
          answers,
          isServiceDay,
          serviceDate: isServiceDay ? document.getElementById("checkupServiceDate").value : undefined,
          serviceType: isServiceDay ? document.getElementById("checkupServiceType").value : undefined,
          displayPhotoUrl: document.getElementById("checkupDisplayPhotoValue").value || undefined,
        }),
      });
      await showButtonSuccess(button);
      document.getElementById("checkupDialog").close();
      showAlert("Check-up saved successfully.");
      await load();
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("reportsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-report]");
    if (button) viewReport(button.dataset.viewReport);
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
  document.getElementById("searchInput").addEventListener("input", renderCustomers);
  document.getElementById("statusFilter").addEventListener("change", renderCustomers);
  document.getElementById("customerForm").addEventListener("submit", saveCustomer);
  document.getElementById("machineForm").addEventListener("submit", saveMachine);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
  document.getElementById("reportViewPrintButton").addEventListener("click", () => window.print());
  document.getElementById("copyCredentialsButton").addEventListener("click", () => {
    const text = `Email: ${document.getElementById("credentialEmail").value}\nTemporary password: ${document.getElementById("credentialPassword").value}\nRecovery code: ${document.getElementById("credentialRecovery").value}\nPortal link: ${document.getElementById("credentialLink").value}`;
    copyText(text, "Customer login information copied.");
  });
  document.getElementById("copyCredentialLinkButton").addEventListener("click", () => {
    copyText(document.getElementById("credentialLink").value, "Customer portal link copied.");
  });
  document.getElementById("copyCredentialPasswordButton").addEventListener("click", () => {
    copyText(document.getElementById("credentialPassword").value, "Temporary password copied.");
  });
  document.getElementById("customerGrid").addEventListener("click", async (event) => {
    const resolveMessage = event.target.closest("[data-resolve-message]");
    if (resolveMessage) {
      const row = resolveMessage.closest("[data-message-id]");
      resolveMessage.disabled = true;
      try {
        await resolveCustomerMessage(row.dataset.messageType, row.dataset.messageId);
        row.style.transition = "opacity .2s";
        row.style.opacity = "0";
        setTimeout(() => row.remove(), 200);
      } catch (error) {
        resolveMessage.disabled = false;
        showAlert(error.message || "Could not resolve this message.", true);
      }
      return;
    }
    const viewMachines = event.target.closest("[data-view-machines]");
    const viewMessages = event.target.closest("[data-view-messages]");
    const editCustomer = event.target.closest("[data-edit-customer]");
    const resetCustomer = event.target.closest("[data-reset-customer]");
    const deleteCustomer = event.target.closest("[data-delete-customer]");
    const forgetCustomerButton = event.target.closest("[data-forget-customer]");
    const copyLink = event.target.closest("[data-copy-link]");
    if (viewMachines) openMachineList(customers.find((customer) => customer.id === viewMachines.dataset.viewMachines));
    if (viewMessages) openCustomerMessages(viewMessages.dataset.viewMessages, viewMessages.dataset.customerName);
    if (editCustomer) {
      const customer = customers.find((item) => item.id === editCustomer.dataset.editCustomer);
      confirmThenOpen("Edit customer?", `Confirm you want to edit ${customer?.name || "this customer"}.`, () => openCustomer(customer));
    }
    if (resetCustomer) resetCustomerLogin(resetCustomer.dataset.resetCustomer);
    if (deleteCustomer) removeCustomer(deleteCustomer.dataset.deleteCustomer);
    if (forgetCustomerButton) forgetCustomer(forgetCustomerButton.dataset.forgetCustomer);
    if (copyLink) {
      const customer = customers.find((item) => item.id === copyLink.dataset.copyLink);
      if (customer) copyText(customerPortalUrl(customer), "Customer portal link copied.");
    }
  });

  document.getElementById("machineListAddButton").addEventListener("click", (event) => {
    openMachine(customers.find((customer) => customer.id === event.currentTarget.dataset.addMachine));
  });

  document.getElementById("machineListBody").addEventListener("click", (event) => {
    const addMachine = event.target.closest("[data-add-machine]");
    const editMachine = event.target.closest("[data-edit-machine]");
    const deleteMachine = event.target.closest("[data-delete-machine]");
    const viewReports = event.target.closest("[data-view-reports]");
    const doCheckup = event.target.closest("[data-checkup]");
    if (viewReports) openMachineReports(viewReports.dataset.viewReports, viewReports.dataset.machineName);
    if (doCheckup) openMachineCheckup(doCheckup.dataset.checkup, doCheckup.dataset.machineType, doCheckup.dataset.machineName);
    if (addMachine) openMachine(customers.find((customer) => customer.id === addMachine.dataset.addMachine));
    if (editMachine) {
      const customer = customers.find((item) => item.id === editMachine.dataset.customer);
      const machine = customer?.machines?.find((item) => item.id === editMachine.dataset.editMachine);
      confirmThenOpen("Edit machine?", `Confirm you want to edit ${machine?.model || "this machine"}.`, () => openMachine(customer, machine));
    }
    if (deleteMachine) removeMachine(deleteMachine.dataset.deleteMachine);
  });
  document.getElementById("machineListBody").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-operational-status]");
    if (!select) return;
    const machineId = select.dataset.operationalStatus;
    const label = select.closest(".operational-status-picker");
    const previousClass = label.className;
    select.disabled = true;
    try {
      await api(`/customers/machines/${machineId}/status`, {
        method: "PUT",
        body: JSON.stringify({ operationalStatus: select.value }),
      });
      label.className = `operational-status-picker op-${select.value}`;
      showAlert("Machine activity status updated — customer will see this on their portal.");
    } catch (error) {
      label.className = previousClass;
      showAlert(error.message, true);
    } finally {
      select.disabled = false;
    }
  });

  load();
})();
