(function () {
  const adminToken = localStorage.getItem("belm_admin_token") || "";
  const customerToken = localStorage.getItem("belm_customer_token") || "";
  const isCustomerHome = !!customerToken;
  let customers = [];

  async function adminApi(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${adminToken}`,
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  async function customerApi(path) {
    const response = await fetch(`/api/customer-portal${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function showAlert(message, isError = true) {
    const box = document.getElementById("pageAlert");
    if (!box) return;
    box.textContent = message;
    box.classList.remove("hidden");
    box.classList.toggle("error", isError);
    box.classList.toggle("success", !isError);
  }

  function logout() {
    if (isCustomerHome) {
      localStorage.removeItem("belm_customer_token");
      localStorage.removeItem("belm_session_refreshed_belm_customer_token");
      window.location.replace("/login");
      return;
    }
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.replace("/admin/login");
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function customerCard(customer) {
    const name = customer.name || "Customer";
    const openHref = isCustomerHome
      ? "/customer-workshop/?actor=customer"
      : `/customer-workshop/?actor=belm&customerId=${encodeURIComponent(customer.id || "")}`;
    return `
      <article class="cwm-welcome-card" data-customer-card="${escapeHtml(customer.id || "self")}">
        <div class="cwm-welcome-copy">
          <p class="cwm-welcome-kicker">WELCOME TO</p>
          <h2>${escapeHtml(name.toUpperCase())} WORKSHOP PORTAL</h2>
        </div>

        <div class="cwm-welcome-details" aria-label="Customer company details">
          <div><span>ADDRESS:</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
          <div><span>EMAIL:</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
          <div class="cwm-phone-logout-row">
            <span>PHONE:</span>
            <b>${escapeHtml(customer.phone || "Not recorded")}</b>
            <button class="cwm-welcome-logout" type="button" data-cwm-logout>Log out</button>
          </div>
        </div>

        <a class="cwm-open-workshop" href="${openHref}">OPEN WORKSHOP</a>
      </article>`;
  }

  function setCustomerHomeChrome() {
    if (!isCustomerHome) return;
    document.querySelector(".belm-portal-switcher")?.remove();
    document.querySelector(".hero")?.remove();
    document.querySelector(".panel")?.remove();
    const top = document.querySelector(".top-actions");
    if (top) top.innerHTML = "";
    document.querySelector(".brand")?.setAttribute("href", "/portal-cwm/");
  }

  function renderCards(filterText = "") {
    const grid = document.getElementById("cwmCardGrid");
    if (!grid) return;
    const needle = filterText.trim().toLowerCase();
    const rows = customers.filter((customer) => !needle || String(customer.name || "").toLowerCase().includes(needle)).slice(0, 1);
    grid.innerHTML = rows.length ? rows.map(customerCard).join("") : '<p class="muted">No customer record found.</p>';
  }

  async function load() {
    try {
      if (isCustomerHome) {
        const dashboard = await customerApi("/dashboard");
        const customer = dashboard?.customer || {};
        customers = [{
          id: customer.id || "self",
          name: customer.name || "Customer",
          address: customer.address || "",
          email: customer.email || "",
          phone: customer.phone || "",
        }];
        setCustomerHomeChrome();
        renderCards();
        return;
      }

      if (!adminToken) {
        window.location.replace("/login");
        return;
      }
      customers = await adminApi("/customers?action=cwm-overview");
      renderCards(document.getElementById("cwmSearch")?.value || "");
    } catch (error) {
      const grid = document.getElementById("cwmCardGrid");
      if (grid) grid.innerHTML = `<p class="muted">${escapeHtml(error.message || "Could not load PORTAL-CWM.")}</p>`;
      showAlert(error.message || "Could not load PORTAL-CWM.", true);
    }
  }

  document.getElementById("cwmSearch")?.addEventListener("input", (event) => renderCards(event.target.value));
  document.getElementById("refreshButton")?.addEventListener("click", load);
  document.getElementById("cwmCardGrid")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-cwm-logout]")) logout();
  });
  document.getElementById("logoutButton")?.addEventListener("click", logout);

  load();
})();
