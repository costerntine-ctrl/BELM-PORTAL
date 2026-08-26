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

  function logout() {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  const CWM_PREVIEW_LIMIT = 1;

  function customerCard(customer) {
    const name = customer.name || "Customer";
    return `
      <article class="cwm-welcome-card" data-customer-card="${escapeHtml(customer.id)}">
        <div class="cwm-welcome-head">
          <div class="cwm-welcome-copy">
            <p class="cwm-welcome-kicker">WELCOME TO</p>
            <h2>${escapeHtml(name.toUpperCase())} WORKSHOP PORTAL</h2>
          </div>
          <button class="cwm-welcome-logout" type="button" data-cwm-logout>Log out</button>
        </div>

        <div class="cwm-welcome-details" aria-label="Customer company details">
          <div><span>ADDRESS:</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
          <div><span>EMAIL:</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
          <div><span>PHONE:</span><b>${escapeHtml(customer.phone || "Not recorded")}</b></div>
        </div>

        <a class="cwm-open-workshop" href="/customer-workshop/?actor=belm&customerId=${encodeURIComponent(customer.id)}">
          OPEN WORKSHOP
        </a>
      </article>`;
  }

  function renderCards(filterText = "") {
    const grid = document.getElementById("cwmCardGrid");
    const needle = filterText.trim().toLowerCase();
    const rows = customers
      .filter((customer) => !needle || String(customer.name || "").toLowerCase().includes(needle))
      .slice(0, CWM_PREVIEW_LIMIT);
    grid.innerHTML = rows.length
      ? rows.map(customerCard).join("")
      : '<p class="muted">No customers match.</p>';
  }

  async function load() {
    try {
      customers = await api("/customers?action=cwm-overview");
      renderCards(document.getElementById("cwmSearch")?.value || "");
    } catch (error) {
      document.getElementById("cwmCardGrid").innerHTML =
        `<p class="muted">${escapeHtml(error.message || "Could not load PORTAL-CWM.")}</p>`;
    }
  }

  document.getElementById("cwmSearch")?.addEventListener("input", (event) => renderCards(event.target.value));
  document.getElementById("refreshButton")?.addEventListener("click", load);
  document.getElementById("cwmCardGrid")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-cwm-logout]")) logout();
  });
  document.getElementById("logoutButton")?.addEventListener("click", logout);

  if (!token) showAlert("Administrator login required.");
  else load();
})();
