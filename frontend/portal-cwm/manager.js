(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];

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
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
    box.classList.toggle("error", isError);
    box.classList.toggle("success", !isError);
    window.clearTimeout(showAlert._t);
    showAlert._t = window.setTimeout(() => box.classList.add("hidden"), 5000);
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  // V448: the 8 grid buttons below are placeholders only, on purpose - the
  // customer said he will assign what each one does later. They are
  // numbered 1-8 and carry NO click handler / endpoint / navigation. Only
  // the two switches above them (Non-Payment / Workshop Module) are wired,
  // since those already exist and are the actual point of PORTAL-CWM
  // (independent customers).
  const PLACEHOLDER_BUTTON_COLORS = [
    "cwm-btn-1", "cwm-btn-2", "cwm-btn-3", "cwm-btn-4",
    "cwm-btn-5", "cwm-btn-6", "cwm-btn-7", "cwm-btn-8",
  ];

  function customerCard(customer) {
    return `
    <article class="cwm-card" data-customer-card="${escapeHtml(customer.id)}">
      <div class="cwm-card-head">
        <div>
          <p class="cwm-eyebrow">CUSTOMER</p>
          <h2>${escapeHtml(customer.name)}</h2>
        </div>
        <span class="cwm-active-pill ${customer.isActive ? "on" : "off"}">${customer.isActive ? "Active" : "Inactive"}</span>
      </div>
      <div class="cwm-info-grid">
        <div><span>Phone</span><b>${escapeHtml(customer.phone || "—")}</b></div>
        <div><span>Email</span><b>${escapeHtml(customer.email || "—")}</b></div>
        <div><span>Address</span><b>${escapeHtml(customer.address || "—")}</b></div>
      </div>

      <div class="cwm-switch-row">
        <label class="cwm-switch-item">
          <span>Non-Payment</span>
          <span class="cwm-toggle">
            <input type="checkbox" data-toggle="portal-access" data-customer="${escapeHtml(customer.id)}" ${customer.isActive ? "checked" : ""}>
            <span class="cwm-toggle-slider"></span>
          </span>
          <b>${customer.isActive ? "PORTAL ON" : "STOPPED"}</b>
        </label>
        <label class="cwm-switch-item">
          <span>Workshop Module</span>
          <span class="cwm-toggle cwm-toggle-workshop">
            <input type="checkbox" data-toggle="workshop-module" data-customer="${escapeHtml(customer.id)}" ${customer.workshopModuleActive ? "checked" : ""}>
            <span class="cwm-toggle-slider"></span>
          </span>
          <b>${customer.workshopModuleActive ? "ON" : "OFF"}</b>
        </label>
      </div>

      <div class="cwm-comm-history">
        <div class="cwm-comm-head"><strong>Communication history</strong><a href="/customers-manager/?customer=${encodeURIComponent(customer.id)}" class="cwm-comm-viewall">View all</a></div>
        <p class="muted">Use View all for history.</p>
      </div>

      <!-- V448: structure only - numbered placeholders, no function yet. -->
      <div class="cwm-button-grid">
        ${PLACEHOLDER_BUTTON_COLORS.map((cls, index) => `<button type="button" class="cwm-placeholder-button ${cls}" disabled>${index + 1}</button>`).join("")}
      </div>
    </article>`;
  }

  function renderCards(filterText = "") {
    const grid = document.getElementById("cwmCardGrid");
    const needle = filterText.trim().toLowerCase();
    const rows = customers.filter((c) => !needle || c.name.toLowerCase().includes(needle));
    grid.innerHTML = rows.length
      ? rows.map(customerCard).join("")
      : '<p class="muted">No customers match.</p>';
  }

  async function load() {
    try {
      customers = await api("/customers?action=cwm-overview");
      renderCards(document.getElementById("cwmSearch").value);
    } catch (error) {
      document.getElementById("cwmCardGrid").innerHTML =
        `<p class="muted">${escapeHtml(error.message || "Could not load PORTAL-CWM.")}</p>`;
    }
  }

  document.getElementById("cwmSearch").addEventListener("input", (event) => renderCards(event.target.value));
  document.getElementById("refreshButton").addEventListener("click", load);

  document.getElementById("cwmCardGrid").addEventListener("change", async (event) => {
    const toggle = event.target.closest("[data-toggle]");
    if (!toggle) return;
    const customerId = toggle.dataset.customer;
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    const kind = toggle.dataset.toggle;
    const enabled = toggle.checked;
    toggle.disabled = true;
    try {
      let confirmation;
      let endpoint;
      let body;
      if (kind === "portal-access") {
        confirmation = await window.belmConfirmEdit({
          title: enabled ? "Turn Portal ON?" : "Stop Portal Service (Non-Payment)?",
          message: enabled
            ? `Restore full portal access for ${customer.name}.`
            : `Stop portal service for ${customer.name} (e.g. for non-payment)? This blocks their whole account, including Operators.`,
        });
        endpoint = `/customers/${customerId}/portal-access`;
        body = { enabled };
      } else {
        confirmation = await window.belmConfirmEdit({
          title: enabled ? "Activate Workshop Module?" : "Deactivate Workshop Module?",
          message: enabled
            ? `Activate the paid Workshop Module for ${customer.name}? Their Workshop Manager, Store Keeper and Technician roles will be able to use Store Ledger and Tool Issue/Return Documents.`
            : `Deactivate the Workshop Module for ${customer.name}? Store Ledger and Tool Issue/Return Documents will be blocked for their whole team until switched back ON.`,
        });
        endpoint = `/customers/${customerId}/workshop-module`;
        body = { enabled };
      }
      if (!confirmation) { toggle.checked = !enabled; return; }
      await api(endpoint, { method: "PUT", body: JSON.stringify({ ...body, ...confirmation }) });
      if (kind === "portal-access") customer.isActive = enabled;
      else customer.workshopModuleActive = enabled;
      renderCards(document.getElementById("cwmSearch").value);
      showAlert(`${customer.name}: updated.`, false);
    } catch (error) {
      toggle.checked = !enabled;
      showAlert(error.message || "Could not update this customer.", true);
    } finally {
      toggle.disabled = false;
    }
  });

  document.getElementById("logoutButton")?.addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });

  if (!token) {
    showAlert("Administrator login required.");
  } else {
    load();
  }
})();
