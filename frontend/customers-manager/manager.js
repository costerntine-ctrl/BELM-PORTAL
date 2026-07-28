(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
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
    return `<article class="machine-card ${escapeHtml(status)}">
      <span class="status-bar"></span>
      <div>
        <h4>${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}</h4>
        <p>${escapeHtml(machine.machineType)} · Reg: ${escapeHtml(machine.regNumber || "—")} · Serial: ${escapeHtml(machine.serialNumber || "—")}</p>
        <span class="machine-status">${escapeHtml(statusLabel(status))}</span>
      </div>
      <div class="machine-actions">
        <button data-edit-machine="${escapeHtml(machine.id)}" data-customer="${escapeHtml(customerId)}">Edit</button>
        <button class="delete" data-delete-machine="${escapeHtml(machine.id)}">Delete</button>
      </div>
    </article>`;
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
          <div class="machine-section-head"><h3>Machines (${machines.length})</h3><button data-add-machine="${escapeHtml(customer.id)}">+ Add machine</button></div>
          <div class="machine-list">${machines.length ? machines.map((machine) => machineCard(customer.id, machine)).join("") : '<div class="muted" style="font-size:11px">No machines registered.</div>'}</div>
        </div>
        <div class="customer-card-actions">
          <button data-edit-customer="${escapeHtml(customer.id)}">Edit customer</button>
          <button data-reset-customer="${escapeHtml(customer.id)}">Reset login</button>
          <button class="delete" data-delete-customer="${escapeHtml(customer.id)}">Delete</button>
        </div>
      </article>`;
    }).join("");
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
    const button = document.getElementById("saveCustomerButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api(id ? `/customers/${id}` : "/customers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("customerDialog").close();
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
    const button = document.getElementById("saveMachineButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/customers/machines/${id}` : `/customers/${customerId}/machines`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("machineDialog").close();
      await load();
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
    if (!customer || !confirm(`Delete customer ${customer.name}? The record will move to the Recycle Bin.`)) return;
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
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
    if (!machine || !confirm(`Delete machine ${machine.model}?`)) return;
    try {
      await api(`/customers/machines/${id}`, { method: "DELETE" });
      await load();
      showAlert("Machine moved to the Recycle Bin.");
    } catch (error) { showAlert(error.message, true); }
  }

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
  document.getElementById("customerGrid").addEventListener("click", (event) => {
    const addMachine = event.target.closest("[data-add-machine]");
    const editMachine = event.target.closest("[data-edit-machine]");
    const deleteMachine = event.target.closest("[data-delete-machine]");
    const editCustomer = event.target.closest("[data-edit-customer]");
    const resetCustomer = event.target.closest("[data-reset-customer]");
    const deleteCustomer = event.target.closest("[data-delete-customer]");
    const copyLink = event.target.closest("[data-copy-link]");
    if (addMachine) openMachine(customers.find((customer) => customer.id === addMachine.dataset.addMachine));
    if (editMachine) {
      const customer = customers.find((item) => item.id === editMachine.dataset.customer);
      openMachine(customer, customer?.machines?.find((machine) => machine.id === editMachine.dataset.editMachine));
    }
    if (deleteMachine) removeMachine(deleteMachine.dataset.deleteMachine);
    if (editCustomer) openCustomer(customers.find((customer) => customer.id === editCustomer.dataset.editCustomer));
    if (resetCustomer) resetCustomerLogin(resetCustomer.dataset.resetCustomer);
    if (deleteCustomer) removeCustomer(deleteCustomer.dataset.deleteCustomer);
    if (copyLink) {
      const customer = customers.find((item) => item.id === copyLink.dataset.copyLink);
      if (customer) copyText(customerPortalUrl(customer), "Customer portal link copied.");
    }
  });

  load();
})();
