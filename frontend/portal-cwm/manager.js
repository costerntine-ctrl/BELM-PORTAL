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

  // V512: PORTAL-CWM preview uses only live actions. No placeholder buttons.
  const CWM_PREVIEW_LIMIT = 1;

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

      <div class="cwm-sync-strip">
        <span class="cwm-owner ${customer.selfServiceEnabled ? "customer" : "belm"}">${customer.selfServiceEnabled ? "CUSTOMER WORKSHOP" : "BELM SERVICE"}</span>
        <span>WM <b>${Number(customer.workshopManagerCount || 0)}</b></span>
        <span>STORE <b>${Number(customer.storeKeeperCount || 0)}</b></span>
        <span>TECH <b>${Number(customer.technicianCount || 0)}</b></span>
        <span>OP <b>${Number(customer.operatorCount || 0)}</b></span>
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
          <span>PORTAL-CWM</span>
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

      <div class="cwm-button-grid" aria-label="PORTAL-CWM live actions">
        <a class="cwm-live-action cwm-machine-action" href="/customers-manager/?customer=${encodeURIComponent(customer.id)}&view=machines">View Customer Machines</a>
        <a class="cwm-live-action cwm-open-action" href="/customer-workshop/?actor=belm&customerId=${encodeURIComponent(customer.id)}">Open PORTAL-CWM</a>
      </div>
    </article>`;
  }

  function renderCards(filterText = "") {
    const grid = document.getElementById("cwmCardGrid");
    const needle = filterText.trim().toLowerCase();
    const rows = customers.filter((c) => !needle || c.name.toLowerCase().includes(needle)).slice(0, CWM_PREVIEW_LIMIT);
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
          title: enabled ? "Activate PORTAL-CWM?" : "Deactivate PORTAL-CWM?",
          message: enabled
            ? `Activate PORTAL-CWM for ${customer.name}? Their Workshop Manager, Store Keeper and Technician roles will be able to use Store Ledger and Tool Issue/Return Documents.`
            : `Deactivate PORTAL-CWM for ${customer.name}? Store Ledger and Tool Issue/Return Documents will be blocked for their whole team until switched back ON.`,
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
