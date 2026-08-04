(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let pendingEditPin = null;

  async function confirmThenOpen(title, message, openFn) {
    const confirmation = await window.belmConfirmEdit({ title, message });
    if (!confirmation) return;
    pendingEditPin = confirmation.editPin;
    openFn();
  }

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

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
  })[status] || status || "Not checked";
  const isAttention = (status) => ["YELLOW", "ATTENTION", "RED", "CRITICAL"].includes(status);

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
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

  function machineCard(customerId, machine) {
    const status = String(machine.status || "NOT_CHECKED").toUpperCase();
    const reasons = Array.isArray(machine.alertReasons) ? machine.alertReasons : [];
    return `<article class="machine-card ${escapeHtml(status)}" ${reasons.length > 1 ? `data-reasons='${escapeHtml(JSON.stringify(reasons))}'` : ""}>
      <div>
        <h4>${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}</h4>
        <p>${escapeHtml(machine.machineType)} · Reg: ${escapeHtml(machine.regNumber || "—")} · Serial: ${escapeHtml(machine.serialNumber || "—")}</p>
        <span class="machine-status">${escapeHtml(statusLabel(status))}</span>
        ${reasons.length ? `<span class="machine-alert-reason">${escapeHtml(reasons[0])}</span>` : '<span class="machine-alert-reason"></span>'}
      </div>
      <div class="machine-actions">
        <button data-view-reports="${escapeHtml(machine.id)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Reports</button>
        <button data-checkup="${escapeHtml(machine.id)}" data-machine-type="${escapeHtml(machine.machineType)}" data-machine-name="${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}">Check-up</button>
        <button data-edit-machine="${escapeHtml(machine.id)}" data-customer="${escapeHtml(customerId)}">Edit</button>
        <button class="delete" data-delete-machine="${escapeHtml(machine.id)}">Delete</button>
      </div>
    </article>`;
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
        <div class="machine-section">
          <button class="view-machines-button" data-view-machines="${escapeHtml(customer.id)}" type="button">
            View Machines (${machines.length})${machines.some((m) => isAttention(m.status)) ? ' <span class="badge off">Needs attention</span>' : ""}
          </button>
        </div>
        <div class="machine-section">
          <button class="view-messages-button" data-view-messages="${escapeHtml(customer.id)}" data-customer-name="${escapeHtml(customer.name)}" type="button">
            Customer Messages <span id="msgCount-${escapeHtml(customer.id)}"></span>
          </button>
        </div>
        <div class="customer-card-actions">
          <button data-edit-customer="${escapeHtml(customer.id)}">Edit customer</button>
          <button data-reset-customer="${escapeHtml(customer.id)}">Reset login</button>
          <button class="delete" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>
        </div>
      </article>`;
    }).join("");
  }

  let currentMachineListCustomerName = "";

  async function openCustomerMessages(customerId, customerName) {
    document.getElementById("customerMessagesTitle").textContent = `${customerName} — Customer Messages`;
    const body = document.getElementById("customerMessagesBody");
    body.innerHTML = '<p class="muted">Loading messages…</p>';
    document.getElementById("customerMessagesDialog").showModal();
    try {
      const items = await api(`/service-requests?action=customer-inbox&customerId=${encodeURIComponent(customerId)}`);
      body.innerHTML = items.length
        ? `<div class="customer-messages-list">${items.map((item) => `
            <article class="customer-message-row">
              <div class="customer-message-head">
                <strong>${escapeHtml(item.title)}</strong>
                <span class="badge">${escapeHtml(item.status)}</span>
              </div>
              <p>${escapeHtml(item.detail || "—")}</p>
              <small>${formatDateTime(item.createdAt)}</small>
            </article>`).join("")}</div>`
        : '<p class="muted">No open messages from this customer.</p>';
    } catch (error) {
      body.innerHTML = `<p class="muted">${escapeHtml(error.message || "Could not load customer messages.")}</p>`;
    }
  }

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
      try {
        const settings = await api("/settings");
        if (["light", "dark"].includes(settings.displayTheme)) applyTheme(settings.displayTheme);
      } catch (_) {}
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
    const button = document.getElementById("saveCustomerButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api(id ? `/customers/${id}` : "/customers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
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

  function openMachine(customer, machine = null) {
    document.getElementById("machineForm").reset();
    document.getElementById("machineCustomerId").value = customer.id;
    document.getElementById("machineId").value = machine?.id || "";
    document.getElementById("machineDialogTitle").textContent = machine ? `Edit ${machine.model}` : `Add machine — ${customer.name}`;
    document.getElementById("machineType").value = machine?.machineType || "";
    document.getElementById("machineBrand").value = machine?.brand || "";
    document.getElementById("machineModel").value = machine?.model || "";
    document.getElementById("machineRegNumber").value = machine?.regNumber || "";
    document.getElementById("machineSerialNumber").value = machine?.serialNumber || "";
    document.getElementById("machineServiceKit").value = machine?.serviceKit || "OK";
    document.getElementById("machineFormAlert").className = "alert error hidden";
    document.getElementById("machineDialog").showModal();
  }

  async function saveMachine(event) {
    event.preventDefault();
    const customerId = document.getElementById("machineCustomerId").value;
    const id = document.getElementById("machineId").value;
    const payload = {
      machineType: document.getElementById("machineType").value.trim(),
      brand: document.getElementById("machineBrand").value.trim(),
      model: document.getElementById("machineModel").value.trim(),
      regNumber: document.getElementById("machineRegNumber").value.trim(),
      serialNumber: document.getElementById("machineSerialNumber").value.trim(),
      serviceKit: document.getElementById("machineServiceKit").value,
    };
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
    }
    const button = document.getElementById("saveMachineButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/customers/machines/${id}` : `/customers/${customerId}/machines`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("machineDialog").close();
      pendingEditPin = null;
      await load();
      if (document.getElementById("machineListDialog").open) {
        openMachineList(customers.find((customer) => customer.id === customerId));
      }
      showAlert(id ? "Machine updated successfully." : "Machine added to customer card.");
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

  async function resetCustomerLogin(id) {
    const customer = customers.find((item) => item.id === id);
    if (!customer || !confirm(`Generate a new password and recovery code for ${customer.name}? The old password and recovery code will stop working.`)) return;
    try {
      const result = await api(`/customers/${id}/reset-password`, { method: "PUT" });
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
    body.innerHTML = `
      <p class="muted">${formatDateTime(report.createdAt)} · Filled by ${escapeHtml(report.filledBy || "—")} · Hour meter: ${escapeHtml(report.hourMeterReading ?? "—")}</p>
      <table><thead><tr><th>Item</th><th>Result</th><th>Status</th><th style="text-align:right">Evidence</th></tr></thead>
      <tbody>${answers.length ? answers.map((answer) => {
        const photoUrl = String(answer.photoUrl || "").trim();
        return `<tr>
          <td>${escapeHtml(answer.label)}</td>
          <td>${escapeHtml(answer.value || "—")}</td>
          <td><span class="machine-status ${escapeHtml(String(answer.safetyLevel || "GREEN").toUpperCase())}">${escapeHtml(statusLabel(answer.safetyLevel))}</span></td>
          <td style="text-align:right">${photoUrl ? `<a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(photoUrl)}" alt="Evidence" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>` : "—"}</td>
        </tr>`;
      }).join("") : '<tr><td colspan="4" class="muted">No answers recorded.</td></tr>'}</tbody></table>`;
  }

  function checkupItemControl(item) {
    const inputType = String(item.inputType || "TEXT").toUpperCase();
    const options = Array.isArray(item.options) ? item.options : [];
    const required = item.isRequired ? "required" : "";
    const common = `data-checkup-item="${escapeHtml(item.id)}" ${required}`;
    if (inputType === "DROPDOWN" || inputType === "YES_NO") {
      const selectOptions = options.length ? options : (inputType === "YES_NO" ? ["Yes", "No"] : []);
      return `<select ${common}><option value="">Select result</option>${selectOptions.map((option) =>
        `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
    }
    if (inputType === "NUMBER") return `<input ${common} type="number" step="any">`;
    if (inputType === "DATE") return `<input ${common} type="date">`;
    return `<input ${common} type="text">`;
  }

  async function openMachineCheckup(machineId, machineType, machineName) {
    document.getElementById("machineListDialog").close();
    document.getElementById("checkupDialogTitle").textContent = `${machineName} — Check-up`;
    document.getElementById("checkupMachineId").value = machineId;
    document.getElementById("checkupForm").reset();
    document.getElementById("checkupFormAlert").classList.add("hidden");
    document.getElementById("checkupServiceFields").classList.add("hidden");
    document.getElementById("checkupItems").innerHTML = '<p class="muted">Loading checklist template…</p>';
    document.getElementById("checkupDialog").showModal();
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

  document.getElementById("checkupForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveCheckupButton");
    const alertBox = document.getElementById("checkupFormAlert");
    const templateId = document.getElementById("checkupTemplate").value;
    if (!templateId) {
      alertBox.textContent = "Select a checklist template.";
      alertBox.classList.remove("hidden");
      return;
    }
    const answers = Array.from(document.querySelectorAll("[data-checkup-item]")).map((field) => ({
      templateItemId: field.dataset.checkupItem,
      value: field.value,
    }));
    const isServiceDay = document.getElementById("checkupIsServiceDay").checked;
    button.disabled = true;
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
        }),
      });
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

  document.getElementById("addCustomerButton").addEventListener("click", () => openCustomer());
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
  document.getElementById("customerGrid").addEventListener("click", (event) => {
    const viewMachines = event.target.closest("[data-view-machines]");
    const viewMessages = event.target.closest("[data-view-messages]");
    const editCustomer = event.target.closest("[data-edit-customer]");
    const resetCustomer = event.target.closest("[data-reset-customer]");
    const deleteCustomer = event.target.closest("[data-delete-customer]");
    const copyLink = event.target.closest("[data-copy-link]");
    if (viewMachines) openMachineList(customers.find((customer) => customer.id === viewMachines.dataset.viewMachines));
    if (viewMessages) openCustomerMessages(viewMessages.dataset.viewMessages, viewMessages.dataset.customerName);
    if (editCustomer) {
      const customer = customers.find((item) => item.id === editCustomer.dataset.editCustomer);
      confirmThenOpen("Edit customer?", `Confirm you want to edit ${customer?.name || "this customer"}.`, () => openCustomer(customer));
    }
    if (resetCustomer) resetCustomerLogin(resetCustomer.dataset.resetCustomer);
    if (deleteCustomer) removeCustomer(deleteCustomer.dataset.deleteCustomer);
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

  document.getElementById("mergeCustomersButton").addEventListener("click", () => {
    const sourceSelect = document.getElementById("mergeSourceCustomer");
    const targetSelect = document.getElementById("mergeTargetCustomer");
    const options = customers.map((customer) =>
      `<option value="${customer.id}">${customer.name} (${customer.email || "no email"})</option>`).join("");
    sourceSelect.innerHTML = '<option value="">Select the duplicate…</option>' + options;
    targetSelect.innerHTML = '<option value="">Select who keeps the data…</option>' + options;
    document.getElementById("mergeCustomersError").classList.add("hidden");
    document.getElementById("mergeCustomersDialog").showModal();
  });

  document.getElementById("mergeCustomersForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = document.getElementById("mergeCustomersError");
    const sourceId = document.getElementById("mergeSourceCustomer").value;
    const targetId = document.getElementById("mergeTargetCustomer").value;
    if (!sourceId || !targetId) {
      errorBox.textContent = "Select both customers.";
      errorBox.classList.remove("hidden");
      return;
    }
    if (sourceId === targetId) {
      errorBox.textContent = "Select two different customers.";
      errorBox.classList.remove("hidden");
      return;
    }
    const sourceName = customers.find((c) => c.id === sourceId)?.name || "the duplicate";
    const targetName = customers.find((c) => c.id === targetId)?.name || "the customer you keep";
    document.getElementById("mergeCustomersDialog").close();

    const confirmation = await window.belmConfirmDelete({
      title: "Merge customers?",
      message: `Merge "${sourceName}" into "${targetName}"? Everything from "${sourceName}" (machines, invoices, reports) moves onto "${targetName}", and "${sourceName}" is permanently removed.`,
    });
    if (!confirmation) return;

    try {
      const result = await api("/customers/merge", {
        method: "POST",
        body: JSON.stringify({ sourceCustomerId: sourceId, targetCustomerId: targetId, ...confirmation }),
      });
      showAlert(result.message || "Customers merged successfully.");
      await load();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  load();
})();
