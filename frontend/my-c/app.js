(function () {
  const token = localStorage.getItem("belm_admin_token");
  const searchInput = document.getElementById("customerSearch");
  const customerSelect = document.getElementById("customerSelect");
  const details = document.getElementById("customerDetails");
  const refreshButton = document.getElementById("refreshCustomersButton");
  let customers = [];
  let filteredCustomers = [];
  let selectedCustomerId = "";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

  function showAlert(message, error) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = `alert${error ? " error" : ""}`;
    window.setTimeout(() => {
      if (box.textContent === message) box.className = "alert hidden";
    }, 2600);
  }

  async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function formatRegisteredDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
  }

  function customerSearchText(customer) {
    return [
      customer.name,
      customer.email,
      customer.phone,
      customer.address,
      customer.tinNumber,
      customer.vrn,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
  }

  function rebuildSelect() {
    const previous = selectedCustomerId || customerSelect.value;
    customerSelect.innerHTML = '<option value="">Select customer...</option>' + filteredCustomers.map((customer) => (
      `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name || "Unnamed customer")}</option>`
    )).join("");

    if (previous && filteredCustomers.some((customer) => customer.id === previous)) {
      customerSelect.value = previous;
      selectedCustomerId = previous;
    } else if (filteredCustomers.length) {
      selectedCustomerId = filteredCustomers[0].id;
      customerSelect.value = selectedCustomerId;
    } else {
      selectedCustomerId = "";
    }
  }

  function renderSelectedCustomer() {
    const customer = customers.find((item) => item.id === selectedCustomerId);
    if (!customer) {
      const message = customers.length
        ? "No customer matches the current search."
        : "No active customer records are available.";
      details.innerHTML = `<article class="panel myc-empty-state"><strong>${escapeHtml(message)}</strong></article>`;
      return;
    }

    const tinVrn = [customer.tinNumber || "-", customer.vrn || "-"].join(" / ");
    details.innerHTML = `
      <article class="panel myc-customer-card">
        <div class="myc-card-accent" aria-hidden="true"></div>
        <div class="myc-card-body">
          <div class="myc-card-head">
            <div>
              <p class="eyebrow">Customer</p>
              <h2>${escapeHtml(customer.name || "Unnamed customer")}</h2>
            </div>
            <span class="myc-status ${Number(customer.isActive) === 1 ? "" : "off"}">${Number(customer.isActive) === 1 ? "Active" : "Inactive"}</span>
          </div>

          <p class="myc-registered">Registered ${escapeHtml(formatRegisteredDate(customer.createdAt))}</p>

          <div class="myc-info-grid">
            <div class="myc-info-item"><span>Email</span><strong>${escapeHtml(customer.email || "-")}</strong></div>
            <div class="myc-info-item"><span>Phone</span><strong>${escapeHtml(customer.phone || "-")}</strong></div>
            <div class="myc-info-item"><span>Address</span><strong>${escapeHtml(customer.address || "-")}</strong></div>
            <div class="myc-info-item"><span>TIN / VRN</span><strong>${escapeHtml(tinVrn)}</strong></div>
          </div>

          <nav class="myc-quick-actions" aria-label="Customer quick actions">
            <a class="myc-quick-action action-black" href="/customers-manager/?customer=${encodeURIComponent(customer.id)}&view=machines">View Your Machine</a>
            <a class="myc-quick-action action-blue" href="/engineering-manager/">Workshop</a>
            <a class="myc-quick-action action-green" href="/spare-parts-manager/">Procurement</a>
            <a class="myc-quick-action action-yellow" href="/reports-manager/">General Report</a>
          </nav>
        </div>
      </article>`;
  }

  function applySearch() {
    const term = searchInput.value.trim().toLowerCase();
    filteredCustomers = term
      ? customers.filter((customer) => customerSearchText(customer).includes(term))
      : [...customers];
    rebuildSelect();
    renderSelectedCustomer();
  }

  async function loadCustomers() {
    if (!token) {
      window.location.href = "/login";
      return;
    }
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    try {
      const result = await api("/customers");
      customers = Array.isArray(result) ? result : [];
      filteredCustomers = [...customers];
      rebuildSelect();
      renderSelectedCustomer();
    } catch (error) {
      details.innerHTML = `<article class="panel myc-empty-state"><strong>Could not load customer details.</strong><br>${escapeHtml(error.message || "Unknown error")}</article>`;
      showAlert(error.message || "Could not load customer details.", true);
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh";
    }
  }

  searchInput.addEventListener("input", applySearch);
  customerSelect.addEventListener("change", () => {
    selectedCustomerId = customerSelect.value;
    renderSelectedCustomer();
  });
  refreshButton.addEventListener("click", loadCustomers);
  loadCustomers();
})();
