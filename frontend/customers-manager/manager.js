(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let pendingEditPin = null;
  let servicePartsState = null;
  let isSuperAdmin = false;
  try {
    const currentUser = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
    isSuperAdmin = currentUser?.role === "Super Admin";
  } catch (_) {}

  // V276 - "Back" must reliably close whatever dialog is open (Report,
  // Check Up, Expense Receipts, Service Parts, Edit, Delete confirm,
  // Message Customer, etc.) instead of navigating away from this page.
  // Native <dialog> elements don't touch browser history on their own,
  // so pressing Back while one is open would otherwise leave the whole
  // Customers Manager page. This wires EVERY dialog on this page at
  // once: opening any of them pushes one history entry; Back (or the
  // phone's system back gesture) pops it and closes the dialog instead
  // of leaving. Closing normally (Cancel/X/ESC/successful save) cleans
  // up that same history entry so Back afterwards behaves normally
  // again, with no extra empty step left behind either way.
  (function wireDialogBackButton() {
    let ignoreNextPopstate = false;
    let closingViaBack = false;
    const nativeShowModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (...args) {
      const result = nativeShowModal.apply(this, args);
      history.pushState({ belmDialogOpen: true, belmDialogId: this.id || null }, "", location.href);
      return result;
    };
    // The native 'close' event fires no matter how a <dialog> closes -
    // an explicit .close() call, the ESC key, or a `formmethod="dialog"`
    // submit button - so listening for it (with capture, since 'close'
    // doesn't bubble) is more reliable than only patching .close().
    document.addEventListener("close", (event) => {
      if (event.target.tagName !== "DIALOG") return;
      if (closingViaBack) return; // already unwound by popstate below
      if (history.state?.belmDialogOpen) {
        ignoreNextPopstate = true;
        history.back();
      }
    }, true);
    window.addEventListener("popstate", () => {
      if (ignoreNextPopstate) { ignoreNextPopstate = false; return; }
      const openDialog = document.querySelector("dialog[open]");
      if (openDialog) {
        closingViaBack = true;
        openDialog.close();
        closingViaBack = false;
      }
    });
  })();

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

  async function showCustomerDataDiagnostic() {
    const grid = document.getElementById("customerGrid");
    try {
      const info = await api("/customers/diagnostics");
      if (Number(info.visibleCustomers || 0) > 0) {
        grid.innerHTML = `<div class="empty"><strong>${Number(info.visibleCustomers).toLocaleString()} customer record(s) exist in the connected database.</strong><br>The current screen did not render them. Click <b>Refresh customers</b>; if needed use <b>Clear filters</b>.</div>`;
        return;
      }
      if (Number(info.deletedCustomers || 0) > 0) {
        grid.innerHTML = `<div class="empty"><strong>No active customer records are visible.</strong><br>${Number(info.deletedCustomers).toLocaleString()} customer record(s) are in the Recycle Bin. <a href="/recycle-bin/">Open Recycle Bin</a>.</div>`;
        return;
      }
      grid.innerHTML = `<div class="empty"><strong>The connected database currently contains 0 customer records.</strong><br>If customers existed before the latest deployment, do not register replacements yet. Check Render <b>DATABASE_URL</b> and confirm this service is connected to the original BELM PostgreSQL database.</div>`;
    } catch (error) {
      grid.innerHTML = `<div class="empty"><strong>Customer data check failed.</strong><br>${escapeHtml(error.message || "Could not read customer diagnostics.")}</div>`;
    }
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

  function machineCard(customerId, machine, belmServiceProviderActive) {
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
        <button data-view-reports="${escapeHtml(machine.id)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Report</button>
        <button data-checkup="${escapeHtml(machine.id)}" data-machine-type="${escapeHtml(machine.machineType)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Check Up</button>
        <button data-view-expense-receipts="${escapeHtml(machine.id)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Expense Receipts</button>
        <button data-service-parts="${escapeHtml(machine.id)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Service Parts</button>
        ${belmServiceProviderActive ? `<a class="belm-maintenance-process-link" href="/breakdown-workflow/?machine=${escapeHtml(machine.id)}&actor=admin">Maintenance Process</a>` : ""}
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
        const overdueBy = Math.max(0, Math.abs(Math.min(0, remaining)));
        const serviceType = status.serviceType || `${status.intervalHours}-Hour Service`;
        const state = remaining < 0
          ? `OVERDUE BY ${overdueBy} HRS`
          : remaining === 0 ? 'DUE NOW' : `NEXT ${status.dueHour} HRS · ${remaining} HRS LEFT`;
        badge.textContent = `${serviceType} · ${state}`;
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

  function populateUserLimitDropdown() {
    const select = document.getElementById("userLimitCustomerSelect");
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">Select customer…</option>'
      + customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join("");
    if (previousValue) select.value = previousValue;
  }

  function populateMachineryAdminDropdown() {
    const select = document.getElementById("machineryAdminCustomerSelect");
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">Select customer…</option>'
      + customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}${customer.belmServiceProviderActive || !customer.isMachineryAdmin ? " (BELM Provider ON)" : ""}</option>`).join("");
    if (previousValue) select.value = previousValue;
  }

  function populatePortalAccessDropdown() {
    const select = document.getElementById("portalAccessCustomerSelect");
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = '<option value="">Select customer…</option>'
      + customers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}${Number(customer.isActive) !== 1 ? " (Portal STOPPED)" : ""}</option>`).join("");
    if (previousValue) select.value = previousValue;
  }

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
      if (customers.length) {
        grid.innerHTML = `<div class="empty"><strong>${customers.length.toLocaleString()} registered customer(s) are loaded but hidden by the current search/filter.</strong><br><button type="button" class="secondary" data-clear-customer-filters>Clear filters and show all</button></div>`;
      } else {
        grid.innerHTML = '<div class="empty">No customer records returned. Checking the connected database…</div>';
      }
      return;
    }
    grid.innerHTML = filtered.map((customer) => {
      const portalUrl = customerPortalUrl(customer);
      const machines = customer.machines || [];
      // V282 - the card itself blinks to match the worst machine status
      // that customer has, so trouble is visible while scrolling the
      // list without opening View Machines for every card.
      const worstStatus = machines.reduce((worst, m) => {
        const rank = { RED: 3, CRITICAL: 3, YELLOW: 2, ATTENTION: 2, GREEN: 1 };
        const level = rank[String(m.status || "").toUpperCase()] || 0;
        return level > worst.level ? { level, status: String(m.status || "").toUpperCase() } : worst;
      }, { level: 0, status: "" }).status;
      const blinkClass = ["RED", "CRITICAL"].includes(worstStatus) ? "customer-card-blink-red"
        : ["YELLOW", "ATTENTION"].includes(worstStatus) ? "customer-card-blink-yellow" : "";
      const belmProviderActive = typeof customer.belmServiceProviderActive === "boolean"
        ? customer.belmServiceProviderActive
        : !Boolean(customer.isMachineryAdmin);
      return `<article class="customer-card ${Number(customer.isActive) === 1 ? "" : "inactive"} ${blinkClass}">
        <div class="customer-card-head">
          <div class="customer-card-title"><p class="eyebrow">Customer</p><h2>${escapeHtml(customer.name)}</h2><p>Registered ${customer.createdAt ? escapeHtml(new Date(customer.createdAt).toLocaleDateString()) : ""}</p></div>
          <div class="customer-card-head-controls">
            <span class="badge ${Number(customer.isActive) === 1 ? "" : "off"}">${Number(customer.isActive) === 1 ? "Active" : "Inactive"}</span>
            <div class="customer-provider-control ${belmProviderActive ? "belm-on" : "customer-on"}" title="Switch maintenance control between Customer and BELM">
              <span class="customer-provider-side">Customer</span>
              <label class="customer-provider-switch">
                <input type="checkbox" data-card-provider-toggle="${escapeHtml(customer.id)}" ${belmProviderActive ? "checked" : ""} aria-label="BELM service provider for ${escapeHtml(customer.name)}">
                <span class="customer-provider-slider" aria-hidden="true"></span>
              </label>
              <span class="customer-provider-side">BELM</span>
              <strong class="customer-provider-state">${belmProviderActive ? "ON" : "OFF"}</strong>
            </div>
          </div>
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
        <div class="customer-feed" id="feed-${escapeHtml(customer.id)}" data-customer-id="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">
          <div class="customer-feed-head">
            <strong>Communication history</strong>
            <button type="button" class="view-messages-button" data-view-messages="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">View all</button>
          </div>
          <div class="customer-feed-body">Loading recent updates…</div>
        </div>
        <div class="customer-card-actions">
          <button class="view-machines-inline" data-view-machines="${escapeHtml(customer.id)}">
            View Machines (${machines.length})${machines.some((m) => isAttention(m.status)) ? ' <span class="badge off">!</span>' : ""}
          </button>
          <button type="button" class="delete" data-quick-delete-machine="${escapeHtml(customer.id)}">🗑 Delete Machine</button>
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

  function communicationDirectionLabel(item) {
    return item.direction === "CUSTOMER_TO_BELM" ? "Customer → BELM" : "BELM → Customer";
  }

  function communicationStatusMarkup(item) {
    if (item.actionable) {
      return `<button type="button" class="badge badge-resolve" data-resolve-message>${escapeHtml(item.actionStatus || "OPEN")}</button>`;
    }
    return `<span class="badge">${escapeHtml(communicationDirectionLabel(item))}</span>`;
  }

  // V284 - cache the compact card feed and fetch every visible customer's
  // newest unread messages in ONE request. Re-rendering cards while the
  // admin types in Search no longer starts a request per customer/key press.
  const customerFeedCache = new Map();
  const customerFeedPending = new Set();
  const customerFeedGeneration = new Map();

  function renderCustomerFeed(customer, items) {
    const body = document.getElementById(`feed-${customer.id}`)?.querySelector(".customer-feed-body");
    if (!body) return;
    body.innerHTML = items.length
      ? items.slice(0, 3).map((item) => `
          <div class="customer-feed-row" data-communication-id="${escapeHtml(item.id)}" ${item.actionable ? `data-message-type="${escapeHtml(item.actionType)}" data-message-id="${escapeHtml(item.relatedId)}"` : ""}>
            <div class="customer-feed-row-head">
              <strong>${escapeHtml(item.subject || "Communication")}</strong>
              ${communicationStatusMarkup(item)}
            </div>
            <p>${escapeHtml(item.message || "—")}</p>
            <small>${escapeHtml(communicationDirectionLabel(item))}${item.machineLabel ? ` · ${escapeHtml(item.machineLabel)}` : ""} · ${formatDateTime(item.createdAt)}</small>
            <button type="button" class="view-messages-button" data-view-communication="${escapeHtml(item.id)}" data-customer-id="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}">View</button>
          </div>`).join("")
      : '<p class="customer-feed-empty">No new communication. Use <strong>View all</strong> for history.</p>';
  }

  async function loadCustomerFeeds(customerList, force = false) {
    const uniqueCustomers = Array.from(new Map(
      customerList.filter((customer) => customer?.id).map((customer) => [customer.id, customer])
    ).values());

    uniqueCustomers.forEach((customer) => {
      if (!force && customerFeedCache.has(customer.id)) {
        renderCustomerFeed(customer, customerFeedCache.get(customer.id));
      }
    });

    const needsFetch = force
      ? uniqueCustomers
      : uniqueCustomers.filter((customer) => !customerFeedCache.has(customer.id) && !customerFeedPending.has(customer.id));
    if (!needsFetch.length) return;

    const requestGenerations = new Map();
    needsFetch.forEach((customer) => {
      const generation = (customerFeedGeneration.get(customer.id) || 0) + 1;
      customerFeedGeneration.set(customer.id, generation);
      requestGenerations.set(customer.id, generation);
      customerFeedPending.add(customer.id);
    });
    const chunks = [];
    for (let index = 0; index < needsFetch.length; index += 75) {
      chunks.push(needsFetch.slice(index, index + 75));
    }
    try {
      const responses = await Promise.all(chunks.map((chunk) => {
        const ids = chunk.map((customer) => customer.id).join(",");
        return api(`/customers/communication-feed?ids=${encodeURIComponent(ids)}`);
      }));
      const grouped = Object.assign({}, ...responses);
      needsFetch.forEach((customer) => {
        if (customerFeedGeneration.get(customer.id) !== requestGenerations.get(customer.id)) return;
        const items = Array.isArray(grouped?.[customer.id]) ? grouped[customer.id] : [];
        const unreadItems = items.filter((item) => !item.isRead);
        customerFeedCache.set(customer.id, unreadItems);
        renderCustomerFeed(customer, unreadItems);
      });
    } catch (error) {
      needsFetch.forEach((customer) => {
        const body = document.getElementById(`feed-${customer.id}`)?.querySelector(".customer-feed-body");
        if (body) body.innerHTML = `<p class="customer-feed-empty">${escapeHtml(error.message || "Could not load communication history.")}</p>`;
      });
    } finally {
      needsFetch.forEach((customer) => {
        if (customerFeedGeneration.get(customer.id) === requestGenerations.get(customer.id)) {
          customerFeedPending.delete(customer.id);
        }
      });
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

  async function markCustomerCommunicationRead(customerId, communicationId) {
    if (!customerId || !communicationId) return;
    await api(`/customers/${encodeURIComponent(customerId)}/communications/${encodeURIComponent(communicationId)}/read`, { method: "PUT" });
  }

  async function markCustomerCommunicationsRead(customerId, items) {
    const unread = (Array.isArray(items) ? items : []).filter((item) => item?.id && !item.isRead);
    if (!unread.length) return;
    await Promise.allSettled(unread.map((item) => markCustomerCommunicationRead(customerId, item.id)));
  }

  async function openCustomerMessages(customerId, customerName) {
    document.getElementById("customerMessagesTitle").textContent = `${customerName} — Communication History`;
    const body = document.getElementById("customerMessagesBody");
    body.innerHTML = '<p class="muted">Loading communication history…</p>';
    document.getElementById("customerMessagesDialog").showModal();
    try {
      const items = await api(`/customers/${encodeURIComponent(customerId)}/communications`);
      body.innerHTML = items.length
        ? `<div class="customer-messages-list">${items.map((item) => `
            <article class="customer-message-row" ${item.actionable ? `data-message-type="${escapeHtml(item.actionType)}" data-message-id="${escapeHtml(item.relatedId)}"` : ""}>
              <div class="customer-message-head">
                <strong>${escapeHtml(item.subject || "Communication")}</strong>
                <span class="badge">${item.isRead ? "READ" : "NEW"}</span>
                ${communicationStatusMarkup(item)}
              </div>
              <p>${escapeHtml(item.message || "—")}</p>
              <small>${escapeHtml(communicationDirectionLabel(item))}${item.createdByName ? ` · ${escapeHtml(item.createdByName)}` : ""}${item.machineLabel ? ` · ${escapeHtml(item.machineLabel)}` : ""} · ${formatDateTime(item.createdAt)}</small>
            </article>`).join("")}</div>`
        : '<p class="muted">No communication history yet.</p>';
      await markCustomerCommunicationsRead(customerId, items);
      body.querySelectorAll(".customer-message-head .badge").forEach((badge) => {
        if (badge.textContent === "NEW") badge.textContent = "READ";
      });
      const customer = customers.find((entry) => entry.id === customerId);
      if (customer) loadCustomerFeeds([customer], true);
    } catch (error) {
      body.innerHTML = `<p class="muted">${escapeHtml(error.message || "Could not load communication history.")}</p>`;
    }
  }

  function openSendCustomerMessage(customer, preselectMachineId = "") {
    if (!customer) return;
    document.getElementById("sendCustomerMessageCustomerId").value = customer.id;
    document.getElementById("sendCustomerMessageTitle").textContent = `Message ${customer.name}`;
    document.getElementById("sendCustomerMessageSubject").value = "Message from BELM";
    document.getElementById("sendCustomerMessageBody").value = "";
    const machineSelect = document.getElementById("sendCustomerMessageMachine");
    machineSelect.innerHTML = '<option value="">General / customer account</option>' + (customer.machines || []).map((machine) => {
      const label = [machine.brand, machine.model, machine.machineType].filter(Boolean).join(" ") || "Machine";
      return `<option value="${escapeHtml(machine.id)}" data-machine-type="${escapeHtml(machine.machineType || "")}" data-machine-name="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
    }).join("");
    if (preselectMachineId) machineSelect.value = preselectMachineId;
    const checkupJumpButton = document.getElementById("sendCustomerMessageCheckup");
    const syncCheckupJumpButton = () => { checkupJumpButton.disabled = !machineSelect.value; };
    machineSelect.onchange = syncCheckupJumpButton;
    syncCheckupJumpButton();
    checkupJumpButton.onclick = () => {
      const option = machineSelect.selectedOptions[0];
      if (!option || !option.value) return;
      document.getElementById("sendCustomerMessageDialog").close();
      openMachineCheckup(option.value, option.dataset.machineType || "", option.dataset.machineName || "Machine");
    };
    document.getElementById("sendCustomerMessageDialog").showModal();
    setTimeout(() => document.getElementById("sendCustomerMessageBody").focus(), 0);
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
      ? `<div class="machine-list">${machines.map((machine) => machineCard(customer.id, machine, customer.belmServiceProviderActive)).join("")}</div>`
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
      populateUserLimitDropdown();
      populateMachineryAdminDropdown();
      populatePortalAccessDropdown();
      if (!customers.length) await showCustomerDataDiagnostic();
    } catch (error) {
      const message = String(error.message || "Could not load customers.");
      const permissionHint = /access|permission|403/i.test(message)
        ? '<br>This login may not have <b>Customers & Machines</b> permission.'
        : '';
      document.getElementById("customerGrid").innerHTML = `<div class="empty"><strong>Could not load registered customers.</strong><br>${escapeHtml(message)}${permissionHint}<br><button type="button" class="secondary" data-retry-customers>Retry</button></div>`;
      showAlert(message, true);
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

  // V267 - the same canonical machine-type list used on the public
  // registration form (/apply/), so a customer self-registering and
  // BELM Admin adding/editing a machine here always pick from the same
  // set of names. Picking a matching name here is what lets a Checklist
  // Template "sync" with the machine (Check Up looks up templates by
  // exact machineType match) - typing something slightly different by
  // hand was the easiest way to accidentally break that match.
  const BELM_MACHINE_TYPE_CATALOG = [
    "Reach Stacker", "Forklift", "Mobile Crane", "Crawler Crane", "Excavator",
    "Wheel Loader", "Bulldozer", "Motor Grader", "Road Roller", "Dump Truck",
    "Concrete Pump", "Truck", "Generator", "Compressor",
  ];

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

    // The "New machine type" dropdown: standard catalog types not
    // already covered by an existing Checklist Template, plus a
    // "Custom" option for anything genuinely outside the catalog.
    const otherSelect = document.getElementById("machineTypeOther");
    const catalogRemaining = BELM_MACHINE_TYPE_CATALOG.filter(
      (type) => !types.some((existing) => existing.toLowerCase() === type.toLowerCase())
    );
    otherSelect.innerHTML = '<option value="">Select machine type…</option>' +
      catalogRemaining.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("") +
      '<option value="__custom__">— Custom (not listed) —</option>';

    const matchesCatalog = BELM_MACHINE_TYPE_CATALOG.some((type) => type.toLowerCase() === String(selectedType || "").trim().toLowerCase());
    if (selectedType && !matchesExisting) {
      select.value = "__other__";
      document.getElementById("machineTypeOtherWrap").classList.remove("hidden");
      if (matchesCatalog) {
        otherSelect.value = catalogRemaining.some((type) => type.toLowerCase() === selectedType.toLowerCase()) ? selectedType : "";
        document.getElementById("machineTypeCustomWrap").classList.add("hidden");
        document.getElementById("machineTypeCustom").value = "";
      } else {
        otherSelect.value = "__custom__";
        document.getElementById("machineTypeCustomWrap").classList.remove("hidden");
        document.getElementById("machineTypeCustom").value = selectedType;
      }
    } else {
      select.value = selectedType || "";
      document.getElementById("machineTypeOtherWrap").classList.add("hidden");
      document.getElementById("machineTypeCustomWrap").classList.add("hidden");
      otherSelect.value = "";
      document.getElementById("machineTypeCustom").value = "";
    }
  }

  document.getElementById("machineType").addEventListener("change", (event) => {
    document.getElementById("machineTypeOtherWrap").classList.toggle("hidden", event.target.value !== "__other__");
    if (event.target.value !== "__other__") {
      document.getElementById("machineTypeCustomWrap").classList.add("hidden");
      document.getElementById("machineTypeOther").value = "";
      document.getElementById("machineTypeCustom").value = "";
    }
  });
  document.getElementById("machineTypeOther").addEventListener("change", (event) => {
    document.getElementById("machineTypeCustomWrap").classList.toggle("hidden", event.target.value !== "__custom__");
    if (event.target.value !== "__custom__") document.getElementById("machineTypeCustom").value = "";
  });


  function servicePartRow(part = {}) {
    const stock = part.stockQty ?? part.stock_qty;
    const matched = Boolean(part.sparePartId || part.spare_part_id || part.inventoryName || part.inventory_name);
    const badge = matched
      ? `<span class="badge on">Inventory: ${escapeHtml(stock ?? 0)} available</span>`
      : '<span class="badge off">Not matched in BELM Inventory</span>';
    return `<div class="report-row service-part-edit-row" data-service-part-row>
      <div class="form-grid" style="width:100%;">
        <label>Spare name<input data-service-field="spareName" value="${escapeHtml(part.spareName || part.spare_name || "")}" placeholder="Engine oil filter"></label>
        <label>Part number / reference<input data-service-field="partNumber" value="${escapeHtml(part.partNumber || part.part_number || "")}" placeholder="P/N"></label>
        <label>Required qty<input data-service-field="quantity" type="number" min="0.01" step="0.01" value="${escapeHtml(part.quantity || 1)}"></label>
        <label>Unit<input data-service-field="unit" maxlength="20" value="${escapeHtml(part.unit || "PC")}" placeholder="PC / L / SET"></label>
        <div class="full" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          ${badge}
          <button class="delete" type="button" data-remove-service-part>Remove</button>
        </div>
      </div>
    </div>`;
  }

  function servicePartsForInterval(interval, useTemplateFallback = true) {
    if (!servicePartsState) return [];
    const own = (servicePartsState.parts || []).filter((part) => Number(part.serviceIntervalHours || part.service_interval_hours) === Number(interval));
    if (own.length || !useTemplateFallback) return own;
    const template = servicePartsState.templateParts?.[String(interval)] || [];
    return template.map((part) => ({ ...part, _templateSuggestion: true }));
  }

  function renderServicePartsEditor(forceTemplate = false) {
    const interval = Number(document.getElementById("servicePartsInterval").value || 250);
    let parts = servicePartsForInterval(interval, !forceTemplate);
    if (forceTemplate) {
      parts = (servicePartsState?.templateParts?.[String(interval)] || []).map((part) => ({ ...part, _templateSuggestion: true }));
    }
    const rows = document.getElementById("servicePartsRows");
    rows.innerHTML = parts.length ? parts.map(servicePartRow).join("") : '<div class="empty">No service parts configured for this interval. Add parts or load them from the matching Checklist Template.</div>';
    const ownCount = servicePartsForInterval(interval, false).length;
    const alert = document.getElementById("servicePartsAlert");
    if (!ownCount && parts.length) {
      alert.textContent = "Template parts are shown as a starting point. Click Save Service Parts to make them specific to this machine.";
      alert.className = "alert";
    } else {
      alert.className = "alert hidden";
    }
  }

  async function openServiceParts(machineId, machineName) {
    try {
      servicePartsState = await api(`/customers/machines/${encodeURIComponent(machineId)}/service-parts`);
      document.getElementById("servicePartsMachineId").value = machineId;
      document.getElementById("servicePartsTitle").textContent = `${machineName || "Machine"} — Service Parts`;
      document.getElementById("servicePartsInterval").value = "250";
      renderServicePartsEditor();
      document.getElementById("servicePartsDialog").showModal();
    } catch (error) {
      showAlert(error.message || "Could not load machine service parts.", true);
    }
  }

  async function saveServiceParts() {
    const machineId = document.getElementById("servicePartsMachineId").value;
    const intervalHours = Number(document.getElementById("servicePartsInterval").value || 250);
    const rows = [...document.querySelectorAll("#servicePartsRows [data-service-part-row]")];
    const parts = rows.map((row) => ({
      spareName: row.querySelector('[data-service-field="spareName"]').value.trim(),
      partNumber: row.querySelector('[data-service-field="partNumber"]').value.trim(),
      quantity: Number(row.querySelector('[data-service-field="quantity"]').value || 0),
      unit: row.querySelector('[data-service-field="unit"]').value.trim() || "PC",
    })).filter((part) => part.spareName || part.partNumber);
    const button = document.getElementById("servicePartsSaveButton");
    button.disabled = true;
    try {
      await api(`/customers/machines/${encodeURIComponent(machineId)}/service-parts`, {
        method: "PUT",
        body: JSON.stringify({ intervalHours, parts }),
      });
      servicePartsState = await api(`/customers/machines/${encodeURIComponent(machineId)}/service-parts`);
      renderServicePartsEditor();
      showAlert(`${intervalHours}-hour service parts saved. They will be used for the automatic service alert, inventory check and Draft PI.`);
    } catch (error) {
      const alert = document.getElementById("servicePartsAlert");
      alert.textContent = error.message || "Could not save service parts.";
      alert.className = "alert error";
    } finally {
      button.disabled = false;
    }
  }

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
    // V277 - lets you message the customer about THIS specific machine
    // right from Edit Machine, without leaving to find the customer
    // card first. Reuses the exact same Message Customer dialog (no
    // separate messaging implementation) - just pre-selects this
    // machine and jumps straight to it.
    document.getElementById("machineSendMessageButton").onclick = () => {
      document.getElementById("machineDialog").close();
      openSendCustomerMessage(customer, machine?.id || "");
    };
    document.getElementById("machineDialog").showModal();
  }

  async function saveMachine(event) {
    event.preventDefault();
    const button = document.getElementById("saveMachineButton");
    if (button.disabled) return;
    const customerId = document.getElementById("machineCustomerId").value;
    const id = document.getElementById("machineId").value;
    const typeSelectValue = document.getElementById("machineType").value;
    let machineTypeValue = typeSelectValue;
    if (typeSelectValue === "__other__") {
      const otherValue = document.getElementById("machineTypeOther").value;
      machineTypeValue = otherValue === "__custom__"
        ? document.getElementById("machineTypeCustom").value.trim()
        : otherValue;
    }
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

  let currentExpenseReceipts = [];

  async function openExpenseReceipts(machineId, machineName) {
    document.getElementById("expenseReceiptsTitle").textContent = `Expense receipts — ${machineName || "Machine"}`;
    const body = document.getElementById("expenseReceiptsBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    currentExpenseReceipts = [];
    document.getElementById("expenseReceiptsDialog").showModal();
    try {
      const receipts = await api(`/customers/machines/${encodeURIComponent(machineId)}/expense-receipts`);
      currentExpenseReceipts = receipts;
      body.innerHTML = receipts.length ? `<table><thead><tr><th>Date</th><th>Item</th><th>Qty</th><th>Cost</th><th>Recorded by</th><th style="text-align:right">Receipt</th></tr></thead>
        <tbody>${receipts.map((r) => `<tr>
          <td>${formatDate(r.date)}</td>
          <td>${escapeHtml(r.description || r.partNumber || "—")}</td>
          <td>${escapeHtml(r.quantity)} ${escapeHtml(r.unit || "")}</td>
          <td>${escapeHtml(Number(r.cost || 0).toLocaleString("en-TZ"))}</td>
          <td>${escapeHtml(r.recordedBy || "—")}</td>
          <td style="text-align:right">
            <button type="button" data-view-single-receipt="${escapeHtml(r.id)}">View</button>
            <button type="button" data-download-single-receipt="${escapeHtml(r.id)}">Download</button>
          </td>
        </tr>`).join("")}</tbody></table>`
        : '<p class="muted">No receipts uploaded for this machine yet.</p>';
    } catch (error) {
      body.innerHTML = `<p class="alert error">${escapeHtml(error.message)}</p>`;
    }
  }

  document.getElementById("downloadAllExpenseReceiptsButton").addEventListener("click", async () => {
    const button = document.getElementById("downloadAllExpenseReceiptsButton");
    if (!currentExpenseReceipts.length) {
      showAlert("No receipts to download for this machine.", true);
      return;
    }
    button.disabled = true;
    const total = currentExpenseReceipts.length;
    button.textContent = `Downloading 0/${total}…`;
    try {
      for (let i = 0; i < total; i++) {
        const item = currentExpenseReceipts[i];
        const response = await fetch(`/api/customers/expense-receipt/${encodeURIComponent(item.id)}?download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) continue;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = item.receiptName || `receipt-${item.id}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        button.textContent = `Downloading ${i + 1}/${total}…`;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      showAlert(`Downloaded ${total} receipt(s).`, false);
    } catch (error) {
      showAlert(error.message || "Could not download receipts.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Download All";
    }
  });

  document.getElementById("expenseReceiptsBody").addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view-single-receipt]");
    const downloadButton = event.target.closest("[data-download-single-receipt]");
    const expenseId = viewButton?.dataset.viewSingleReceipt || downloadButton?.dataset.downloadSingleReceipt;
    if (!expenseId) return;
    try {
      const url = `/api/customers/expense-receipt/${encodeURIComponent(expenseId)}${downloadButton ? "?download=1" : ""}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not load receipt.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (downloadButton) {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = "receipt";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(objectUrl, "_blank");
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  async function openMachineReports(machineId, machineName) {
    document.getElementById("machineListDialog").close();
    document.getElementById("reportsDialogTitle").textContent =
      `${currentMachineListCustomerName ? currentMachineListCustomerName.toUpperCase() + " — " : ""}${machineName} Checklist Reports`;
    const list = document.getElementById("reportsList");
    const jobCardsList = document.getElementById("machineJobCardsList");
    list.innerHTML = '<p class="muted">Loading reports…</p>';
    jobCardsList.innerHTML = '<p class="muted">Loading Job Card / Daily Report history…</p>';
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
    try {
      const jobCards = await api(`/breakdown-workflow?action=machine-job-cards&machineId=${encodeURIComponent(machineId)}`);
      jobCardsList.innerHTML = Array.isArray(jobCards) && jobCards.length ? jobCards.map((jc) => `
        <article class="report-item">
          <div>
            <strong>${escapeHtml(jc.jobCardNo || "Job Card")} — ${escapeHtml(jc.title || "")}</strong>
            <span>${formatDateTime(jc.createdAt)} · ${escapeHtml(jc.technicianName || "Unassigned")}</span>
          </div>
          <span class="machine-status ${escapeHtml(String(jc.status || "").toUpperCase())}">${escapeHtml(jc.status || "")}</span>
          <a class="report-download-link" href="/api/breakdown-workflow?action=job-card-pdf&id=${encodeURIComponent(jc.id)}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">Download</a>
        </article>`).join("") : '<p class="muted">No Job Card / Daily Report history recorded for this machine yet.</p>';
    } catch (error) {
      jobCardsList.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
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
    document.getElementById("checkupDialogTitle").textContent = `${machineName} — Check Up`;
    document.getElementById("checkupMachineId").value = machineId;
    document.getElementById("checkupForm").reset();
    document.getElementById("checkupFilledBy").value = "";
    document.getElementById("checkupFormAlert").classList.add("hidden");
    document.getElementById("checkupServiceFields").classList.add("hidden");
    document.getElementById("checkupDisplayPhotoValue").value = "";
    document.getElementById("checkupDisplayPhotoPreview").src = "";
    document.getElementById("checkupDisplayPhotoPreview").classList.add("hidden");
    document.getElementById("checkupItems").innerHTML = '<p class="muted">Loading checklist template…</p>';
    document.getElementById("checkupLastHourMeter").textContent = "(loading last recorded hours…)";
    const todayIso = new Date().toISOString().slice(0, 10);
    const serviceDateInput = document.getElementById("checkupServiceDate");
    serviceDateInput.max = todayIso;
    serviceDateInput.value = todayIso;
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
          filledBy: document.getElementById("checkupFilledBy").value.trim() || undefined,
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
  document.getElementById("clearCustomerFiltersButton")?.addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("statusFilter").value = "";
    renderCustomers();
  });
  document.getElementById("refreshCustomersButton")?.addEventListener("click", async () => {
    const button = document.getElementById("refreshCustomersButton");
    button.disabled = true;
    try {
      await load();
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("userLimitCustomerSelect")?.addEventListener("change", (event) => {
    const customer = customers.find((item) => item.id === event.target.value);
    const info = document.getElementById("userLimitCurrentInfo");
    const input = document.getElementById("userLimitInput");
    if (!customer) {
      info.textContent = "";
      input.value = "";
      return;
    }
    input.value = customer.userLimit ?? "";
    info.textContent = customer.userLimit != null
      ? `Current limit: ${customer.userLimit} · Currently has ${(customer.users || []).length} user(s).`
      : `Using the system default (3) · Currently has ${(customer.users || []).length} user(s).`;
  });

  document.getElementById("userLimitSaveButton")?.addEventListener("click", async () => {
    const customerId = document.getElementById("userLimitCustomerSelect").value;
    if (!customerId) {
      showAlert("Select a customer first.", true);
      return;
    }
    const rawValue = document.getElementById("userLimitInput").value.trim();
    const confirmation = await window.belmConfirmEdit({
      title: "Save user limit?",
      message: "Confirm this new portal-user limit for the selected customer.",
    });
    if (!confirmation) return;
    try {
      await api(`/customers/${customerId}/user-limit`, {
        method: "PUT",
        body: JSON.stringify({ userLimit: rawValue === "" ? null : Number(rawValue), ...confirmation }),
      });
      showAlert("User limit saved successfully.", false);
      await load();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  document.getElementById("machineryAdminCustomerSelect")?.addEventListener("change", (event) => {
    const customer = customers.find((item) => item.id === event.target.value);
    const info = document.getElementById("machineryAdminCurrentInfo");
    const toggle = document.getElementById("machineryAdminToggle");
    if (!customer) {
      info.textContent = "";
      toggle.checked = false;
      return;
    }
    const providerActive = typeof customer.belmServiceProviderActive === "boolean"
      ? customer.belmServiceProviderActive
      : !Boolean(customer.isMachineryAdmin);
    toggle.checked = providerActive;
    info.textContent = providerActive
      ? "BELM SERVICE PROVIDER ON — machine problems and maintenance route to BELM. Customer Technician access is paused automatically; Fuel, Operators, Workshop, Store, Procurement, Accounts and other customer functions remain active."
      : "BELM SERVICE PROVIDER OFF — customer runs maintenance with its own Technicians. BELM remains available only when support/spares are explicitly requested.";
  });

  document.getElementById("machineryAdminSaveButton")?.addEventListener("click", async () => {
    const customerId = document.getElementById("machineryAdminCustomerSelect").value;
    if (!customerId) {
      showAlert("Select a customer first.", true);
      return;
    }
    const serviceProviderEnabled = document.getElementById("machineryAdminToggle").checked;
    const confirmation = await window.belmConfirmEdit({
      title: serviceProviderEnabled ? "Turn ON BELM Service Provider?" : "Turn OFF BELM Service Provider?",
      message: serviceProviderEnabled
        ? "BELM will take over machine-problem and maintenance workflows. Only the customer's Technician role will be paused automatically. Fuel, Operators, Workshop, Store, Procurement, Accounts and other portal roles remain active."
        : "The customer will resume maintenance with its own Technicians. BELM support and spare requests remain available when explicitly requested.",
    });
    if (!confirmation) return;
    try {
      await api(`/customers/${customerId}/machinery-admin`, {
        method: "PUT",
        body: JSON.stringify({ serviceProviderEnabled, ...confirmation }),
      });
      showAlert(serviceProviderEnabled ? "BELM Service Provider mode is ON." : "BELM Service Provider mode is OFF; customer Technician access is restored.", false);
      await load();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  document.getElementById("portalAccessCustomerSelect")?.addEventListener("change", (event) => {
    const customer = customers.find((item) => item.id === event.target.value);
    const info = document.getElementById("portalAccessCurrentInfo");
    const toggle = document.getElementById("portalAccessToggle");
    if (!customer) {
      info.textContent = "";
      toggle.checked = true;
      return;
    }
    const isActive = Number(customer.isActive) === 1;
    toggle.checked = isActive;
    info.textContent = isActive
      ? "Currently ON — this customer can log in normally."
      : "Currently STOPPED — this customer (and their assistants/operators) cannot log in.";
  });

  document.getElementById("portalAccessSaveButton")?.addEventListener("click", async () => {
    const customerId = document.getElementById("portalAccessCustomerSelect").value;
    if (!customerId) {
      showAlert("Select a customer first.", true);
      return;
    }
    const enabled = document.getElementById("portalAccessToggle").checked;
    const confirmation = await window.belmConfirmEdit({
      title: enabled ? "Restore portal service?" : "Stop portal service?",
      message: enabled
        ? "This customer will be able to log in again."
        : "This customer (and their assistants/operators) will be blocked from logging in until you turn this back ON.",
    });
    if (!confirmation) return;
    try {
      await api(`/customers/${customerId}/portal-access`, {
        method: "PUT",
        body: JSON.stringify({ enabled, ...confirmation }),
      });
      showAlert(enabled ? "Portal service restored." : "Portal service stopped for this customer.", false);
      await load();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  document.getElementById("sendCustomerMessageForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerId = document.getElementById("sendCustomerMessageCustomerId").value;
    const button = document.getElementById("sendCustomerMessageButton");
    button.disabled = true;
    try {
      const result = await api(`/customers/${encodeURIComponent(customerId)}/message`, {
        method: "POST",
        body: JSON.stringify({
          machineId: document.getElementById("sendCustomerMessageMachine").value,
          subject: document.getElementById("sendCustomerMessageSubject").value.trim(),
          message: document.getElementById("sendCustomerMessageBody").value.trim(),
        }),
      });
      document.getElementById("sendCustomerMessageDialog").close();
      showAlert(result.message || "Message sent to customer.", !result.emailDelivered);
      await loadCustomerFeeds(customers.filter((item) => item.id === customerId), true);
    } catch (error) {
      showAlert(error.message || "Could not send customer message.", true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("servicePartsInterval").addEventListener("change", () => renderServicePartsEditor());
  document.getElementById("servicePartsUseTemplateButton").addEventListener("click", () => renderServicePartsEditor(true));
  document.getElementById("servicePartsAddButton").addEventListener("click", () => {
    const rows = document.getElementById("servicePartsRows");
    if (rows.querySelector(".empty")) rows.innerHTML = "";
    rows.insertAdjacentHTML("beforeend", servicePartRow({ quantity: 1, unit: "PC" }));
  });
  document.getElementById("servicePartsRows").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-service-part]");
    if (remove) remove.closest("[data-service-part-row]")?.remove();
  });
  document.getElementById("servicePartsSaveButton").addEventListener("click", saveServiceParts);

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
  // V283 - compact per-customer BELM <-> Customer maintenance switch.
  // Checked means BELM Service Provider is ON; unchecked hands maintenance
  // back to the customer's own Technician team. The existing API and edit
  // confirmation are reused so permissions/audit behavior remain unchanged.
  document.getElementById("customerGrid").addEventListener("change", async (event) => {
    const toggle = event.target.closest("[data-card-provider-toggle]");
    if (!toggle) return;

    const customerId = toggle.dataset.cardProviderToggle;
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) {
      toggle.checked = !toggle.checked;
      showAlert("Customer record was not found. Refresh customers and try again.", true);
      return;
    }

    const serviceProviderEnabled = toggle.checked;
    toggle.disabled = true;
    try {
      const confirmation = await window.belmConfirmEdit({
        title: serviceProviderEnabled ? "Turn ON BELM Service Provider?" : "Turn OFF BELM Service Provider?",
        message: serviceProviderEnabled
          ? "BELM will take over machine-problem and maintenance workflows. Only the customer's Technician role will be paused automatically; the customer's other portal roles remain active."
          : "Maintenance control will return to the customer's own Technicians. BELM support and spare requests remain available when explicitly requested.",
      });
      if (!confirmation) {
        toggle.checked = !serviceProviderEnabled;
        return;
      }

      const result = await api(`/customers/${customerId}/machinery-admin`, {
        method: "PUT",
        body: JSON.stringify({ serviceProviderEnabled, ...confirmation }),
      });
      customer.belmServiceProviderActive = Boolean(result?.belmServiceProviderActive ?? serviceProviderEnabled);
      customer.isMachineryAdmin = Boolean(result?.isMachineryAdmin ?? !serviceProviderEnabled);
      showAlert(
        serviceProviderEnabled
          ? `${customer.name}: BELM Service Provider is ON.`
          : `${customer.name}: BELM Service Provider is OFF; Customer maintenance team is active.`,
        false,
      );
      await load();
    } catch (error) {
      toggle.checked = !serviceProviderEnabled;
      showAlert(error.message || "Could not change maintenance control.", true);
    } finally {
      toggle.disabled = false;
    }
  });

  document.getElementById("customerGrid").addEventListener("click", async (event) => {
    if (event.target.closest("[data-clear-customer-filters]")) {
      document.getElementById("searchInput").value = "";
      document.getElementById("statusFilter").value = "";
      renderCustomers();
      return;
    }
    if (event.target.closest("[data-retry-customers]")) {
      await load();
      return;
    }
    const viewCommunication = event.target.closest("[data-view-communication]");
    if (viewCommunication) {
      const customerId = viewCommunication.dataset.customerId;
      const communicationId = viewCommunication.dataset.viewCommunication;
      const customerName = viewCommunication.dataset.customerName || "Customer";
      viewCommunication.disabled = true;
      try {
        await markCustomerCommunicationRead(customerId, communicationId);
        const row = viewCommunication.closest(".customer-feed-row");
        if (row) {
          row.style.transition = "opacity .2s, transform .2s";
          row.style.opacity = "0";
          row.style.transform = "translateY(-4px)";
          setTimeout(() => row.remove(), 220);
        }
        await openCustomerMessages(customerId, customerName);
      } catch (error) {
        viewCommunication.disabled = false;
        showAlert(error.message || "Could not mark this communication as viewed.", true);
      }
      return;
    }
    const resolveMessage = event.target.closest("[data-resolve-message]");
    if (resolveMessage) {
      const row = resolveMessage.closest("[data-message-id]");
      resolveMessage.disabled = true;
      try {
        await resolveCustomerMessage(row.dataset.messageType, row.dataset.messageId);
        if (row.dataset.communicationId) {
          const feed = row.closest("[data-customer-id]");
          if (feed?.dataset.customerId) await markCustomerCommunicationRead(feed.dataset.customerId, row.dataset.communicationId);
        }
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
    const quickDeleteMachine = event.target.closest("[data-quick-delete-machine]");
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
    // V281 - "Edit Machine" shortcut removed entirely (V270/277/278) -
    // editing a machine is already one click away inside View Machines,
    // so keeping a second copy of that button here just made the card
    // taller for no benefit. "Delete Machine" stays as a shortcut since
    // it wasn't asked to be removed.
    if (quickDeleteMachine) {
      const customer = customers.find((item) => item.id === quickDeleteMachine.dataset.quickDeleteMachine);
      const machines = customer?.machines || [];
      if (!machines.length) {
        showAlert("This customer has no machines yet.", true);
      } else if (machines.length === 1) {
        removeMachine(machines[0].id);
      } else {
        openMachineList(customer);
      }
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
    const viewExpenseReceipts = event.target.closest("[data-view-expense-receipts]");
    const serviceParts = event.target.closest("[data-service-parts]");
    if (viewReports) openMachineReports(viewReports.dataset.viewReports, viewReports.dataset.machineName);
    if (doCheckup) openMachineCheckup(doCheckup.dataset.checkup, doCheckup.dataset.machineType, doCheckup.dataset.machineName);
    if (viewExpenseReceipts) openExpenseReceipts(viewExpenseReceipts.dataset.viewExpenseReceipts, viewExpenseReceipts.dataset.machineName);
    if (serviceParts) openServiceParts(serviceParts.dataset.serviceParts, serviceParts.dataset.machineName);
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

  // V269 - Machine Type <-> Checklist Template sync check.
  async function loadMachineTypeSync() {
    const body = document.getElementById("machineTypeSyncBody");
    const refreshBtn = document.getElementById("machineTypeSyncRefresh");
    const statusLabelEl = document.getElementById("machineTypeSyncToggleStatus");
    if (!body) return;
    refreshBtn.disabled = true;
    body.innerHTML = '<p class="empty">Checking…</p>';
    if (statusLabelEl) statusLabelEl.textContent = "Checking…";
    try {
      const data = await api("/customers?action=machine-type-sync");
      const mismatches = data.mismatches || [];
      if (!mismatches.length) {
        body.innerHTML = `<p class="empty">✓ All ${data.matchedMachineCount} machine(s) match an active Checklist Template exactly. Nothing to sync.</p>`;
        if (statusLabelEl) statusLabelEl.textContent = "✓ All synced";
        return;
      }
      const mismatchedMachineCount = mismatches.reduce((sum, row) => sum + row.machineCount, 0);
      if (statusLabelEl) statusLabelEl.textContent = `⚠ ${mismatchedMachineCount} machine(s) need attention`;
      body.innerHTML = mismatches.map((row) => `
        <div class="machine-type-sync-row">
          <div>
            <strong>${escapeHtml(row.machineType)}</strong>
            <span>${row.machineCount} machine${row.machineCount === 1 ? "" : "s"} — no exact Checklist Template match</span>
          </div>
          ${row.suggestedTemplate
            ? `<button type="button" class="primary" data-sync-from="${escapeHtml(row.machineType)}" data-sync-to="${escapeHtml(row.suggestedTemplate)}">
                 Fix → "${escapeHtml(row.suggestedTemplate)}" (${row.similarity}% match)
               </button>`
            : row.hasAnyTemplate
              ? `<span class="machine-type-sync-none">No close template match found — add a Checklist Template for this type, or fix the spelling by hand in each machine.</span>`
              : `<span class="machine-type-sync-none">No Checklist Templates exist yet.</span>`}
        </div>`).join("");
    } catch (error) {
      body.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
      if (statusLabelEl) statusLabelEl.textContent = "Check failed";
    } finally {
      refreshBtn.disabled = false;
    }
  }
  document.getElementById("machineTypeSyncRefresh")?.addEventListener("click", loadMachineTypeSync);
  document.getElementById("machineTypeSyncBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-sync-from]");
    if (!button) return;
    const from = button.dataset.syncFrom;
    const to = button.dataset.syncTo;
    if (!confirm(`Update every machine currently typed "${from}" to "${to}"? This cannot be undone automatically.`)) return;
    button.disabled = true;
    button.textContent = "Applying…";
    try {
      const result = await api("/customers?action=machine-type-sync", { method: "POST", body: JSON.stringify({ from, to }) });
      showAlert(result.message);
      machineTypesCache = null;
      await loadMachineTypeSync();
      await load();
    } catch (error) {
      showAlert(error.message, true);
      button.disabled = false;
      button.textContent = "Retry";
    }
  });
  // V275 - the panel starts collapsed (just a one-line toggle showing a
  // quick status), since this is an occasional maintenance check, not
  // something that needs a large block of screen space on every visit.
  // A background check still runs once so the toggle line shows a real
  // status ("✓ All synced" / "⚠ N machine(s) need attention") without
  // anyone having to open it first.
  document.getElementById("machineTypeSyncToggle")?.addEventListener("click", () => {
    document.getElementById("machineTypeSyncPanel")?.classList.toggle("collapsed");
  });
  loadMachineTypeSync();

  load();
})();
