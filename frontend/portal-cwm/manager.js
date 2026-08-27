(function () {
  const adminToken = localStorage.getItem("belm_admin_token") || "";
  const customerToken = localStorage.getItem("belm_customer_token") || "";
  const isCustomerHome = !!customerToken;
  let customers = [];
  let messageTimer = null;
  let isRefreshing = false;

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
      if (localStorage.getItem("belm_active_account_type") === "customer") localStorage.removeItem("belm_active_account_type");
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

  const customerMessages = [
    { text: "Safety is everyone’s responsibility. Work safe, go home safe.", by: "BELM Team" },
    { text: "A good workshop starts with a complete daily Check Up.", by: "BELM Operations" },
    { text: "Record every machine problem early — prevention costs less than breakdown.", by: "BELM Technical" },
    { text: "Use the Job Card from diagnosis through testing and completion.", by: "Workshop Control" },
    { text: "Keep tools, spares and service records updated for reliable maintenance.", by: "BELM Operations" },
    { text: "Quality work. Safety first. On time.", by: "BELM General Tech" },
  ];

  function customerCard(customer) {
    const name = customer.name || "Customer";
    const openHref = isCustomerHome
      ? "/customer-workshop/?actor=customer"
      : `/customer-workshop/?actor=belm&customerId=${encodeURIComponent(customer.id || "")}`;

    if (!isCustomerHome) {
      return `
        <article class="cwm-welcome-card" data-customer-card="${escapeHtml(customer.id || "self")}">
          <div class="cwm-welcome-copy"><p class="cwm-welcome-kicker">WELCOME TO</p><h2>${escapeHtml(name.toUpperCase())} WORKSHOP PORTAL</h2></div>
          <div class="cwm-welcome-details" aria-label="Customer company details">
            <div><span>ADDRESS:</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
            <div><span>EMAIL:</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
            <div><span>PHONE:</span><b>${escapeHtml(customer.phone || "Not recorded")}</b></div>
          </div>
          <a class="cwm-open-workshop" href="${openHref}">OPEN WORKSHOP</a>
        </article>`;
    }

    const first = customerMessages[0];
    return `
      <article class="cwm-home-v556" data-customer-card="${escapeHtml(customer.id || "self")}">
        <section class="cwm-home-hero-v556">
          <p class="cwm-home-kicker-v556"><span></span>WELCOME TO<span></span></p>
          <h1>${escapeHtml(name.toUpperCase())} <em>WORKSHOP</em> PORTAL</h1>
          <div class="cwm-company-details-v556">
            <div><i>●</i><span>ADDRESS</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
            <div><i>✉</i><span>EMAIL</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
            <div><i>☎</i><span>PHONE</span><b>${escapeHtml(customer.phone || "Not recorded")}</b></div>
          </div>
        </section>

        <section class="cwm-message-display-v556" aria-live="polite">
          <button type="button" data-cwm-message-prev aria-label="Previous message">‹</button>
          <div class="cwm-message-content-v556">
            <div class="cwm-quote-mark-v556">“</div>
            <strong data-cwm-message-text>${escapeHtml(first.text)}</strong>
            <small data-cwm-message-by>— ${escapeHtml(first.by)}</small>
            <div class="cwm-message-dots-v556" data-cwm-message-dots></div>
          </div>
          <button type="button" data-cwm-message-next aria-label="Next message">›</button>
        </section>

        <a class="cwm-open-workshop-v556" href="${openHref}"><span class="cwm-open-icon-v556">⚙</span><b>OPEN WORKSHOP</b><span class="cwm-open-arrow-v556">→</span></a>

        <section class="cwm-quick-v556">
          <div class="cwm-quick-title-v556"><span>QUICK ACCESS</span></div>
          <nav class="cwm-quick-grid-v556" aria-label="Workshop quick access">
            <a href="/portal/dashboard?view=machines"><i>✓</i><b>CHECK UP</b><small>Daily checklist & reports</small><span>›</span></a>
            <a href="/customer-job-card/"><i>🔧</i><b>JOB CARDS</b><small>Create & manage job cards</small><span>›</span></a>
            <a href="/customer-procurement-home/"><i>▣</i><b>PROCUREMENT</b><small>Spare parts & requests</small><span>›</span></a>
            <a href="/customer-store/"><i>◆</i><b>STORE</b><small>Inventory & stock control</small><span>›</span></a>
            <a href="/general-report/"><i>▥</i><b>REPORTS</b><small>Reports & analysis</small><span>›</span></a>
            <a href="/customer-users/"><i>●●</i><b>USERS</b><small>Manage users & roles</small><span>›</span></a>
          </nav>
        </section>

        <footer class="cwm-home-footer-v556">
          <div><span class="cwm-footer-mark-v556">B</span><p><b>BELM</b><small>GENERAL TECH SERVICE</small></p></div>
          <p>Powering Performance.<br>Ensuring Reliability.</p>
          <div class="cwm-footer-values-v556"><span>◈ Safety First</span><span>✓ Quality Work</span><span>⚙ On Time</span></div>
        </footer>
      </article>`;
  }

  function setCustomerHomeChrome() {
    if (!isCustomerHome) return;
    document.body.classList.add("cwm-customer-home-v556");
    document.querySelector(".belm-portal-switcher")?.remove();
    document.querySelector(".hero")?.remove();
    document.querySelector(".panel")?.remove();
    const top = document.querySelector(".top-actions");
    if (top) top.innerHTML = '<button id="refreshButton" class="ghost cwm-refresh-clean" type="button" data-cwm-refresh aria-label="Refresh PORTAL-CWM"><span class="refresh-icon">↻</span><span class="refresh-text">Refresh</span></button><button class="ghost cwm-header-logout-v556" type="button" data-cwm-logout>Log out</button>';
    const brand = document.querySelector(".brand");
    brand?.setAttribute("href", "/portal-cwm/");
    if (brand) {
      const text = brand.querySelector("span:last-child");
      if (text) text.innerHTML = 'BELM General Tech <small>PORTAL-CWM</small>';
    }
  }

  function wireMessageDisplay() {
    if (!isCustomerHome) return;
    const root = document.querySelector(".cwm-message-display-v556");
    if (!root) return;
    let index = 0;
    const textEl = root.querySelector("[data-cwm-message-text]");
    const byEl = root.querySelector("[data-cwm-message-by]");
    const dots = root.querySelector("[data-cwm-message-dots]");
    const render = () => {
      const item = customerMessages[index];
      textEl.textContent = item.text;
      byEl.textContent = `— ${item.by}`;
      dots.innerHTML = customerMessages.map((_, i) => `<button type="button" aria-label="Message ${i + 1}" class="${i === index ? "active" : ""}" data-cwm-dot="${i}"></button>`).join("");
      dots.querySelectorAll("[data-cwm-dot]").forEach((button) => button.addEventListener("click", () => { index = Number(button.dataset.cwmDot); render(); restart(); }));
    };
    const next = () => { index = (index + 1) % customerMessages.length; render(); };
    const prev = () => { index = (index - 1 + customerMessages.length) % customerMessages.length; render(); };
    const restart = () => { if (messageTimer) clearInterval(messageTimer); messageTimer = setInterval(next, 6000); };
    root.querySelector("[data-cwm-message-next]")?.addEventListener("click", () => { next(); restart(); });
    root.querySelector("[data-cwm-message-prev]")?.addEventListener("click", () => { prev(); restart(); });
    render(); restart();
  }

  function renderCards(filterText = "") {
    const grid = document.getElementById("cwmCardGrid");
    if (!grid) return;
    const needle = filterText.trim().toLowerCase();
    const rows = customers.filter((customer) => !needle || String(customer.name || "").toLowerCase().includes(needle)).slice(0, 1);
    grid.innerHTML = rows.length ? rows.map(customerCard).join("") : '<p class="muted">No customer record found.</p>';
    if (isCustomerHome) wireMessageDisplay();
  }

  async function load({ fromRefresh = false } = {}) {
    if (isRefreshing) return;
    if (fromRefresh) isRefreshing = true;
    const refreshButtons = document.querySelectorAll('#refreshButton,[data-cwm-refresh]');
    if (fromRefresh) refreshButtons.forEach((button) => { button.disabled = true; button.classList.add('is-refreshing'); const label = button.querySelector('.refresh-text'); if (label) label.textContent = 'Refreshing…'; });
    try {
      if (messageTimer) { clearInterval(messageTimer); messageTimer = null; }
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
        if (fromRefresh) showAlert('PORTAL-CWM refreshed successfully.', false);
        return;
      }

      if (!adminToken) {
        window.location.replace("/login");
        return;
      }
      customers = await adminApi("/customers?action=cwm-overview");
      renderCards(document.getElementById("cwmSearch")?.value || "");
      if (fromRefresh) showAlert('PORTAL-CWM refreshed successfully.', false);
    } catch (error) {
      const grid = document.getElementById("cwmCardGrid");
      if (grid) grid.innerHTML = `<p class="muted">${escapeHtml(error.message || "Could not load PORTAL-CWM.")}</p>`;
      showAlert(error.message || "Could not load PORTAL-CWM.", true);
    } finally {
      isRefreshing = false;
      document.querySelectorAll('#refreshButton,[data-cwm-refresh]').forEach((button) => { button.disabled = false; button.classList.remove('is-refreshing'); const label = button.querySelector('.refresh-text'); if (label) label.textContent = 'Refresh'; });
    }
  }

  document.getElementById("cwmSearch")?.addEventListener("input", (event) => renderCards(event.target.value));
  document.body.addEventListener("click", (event) => {
    const refresh = event.target.closest('#refreshButton,[data-cwm-refresh]');
    if (refresh) { event.preventDefault(); load({ fromRefresh: true }); return; }
    if (event.target.closest("[data-cwm-logout]")) logout();
  });
  document.getElementById("logoutButton")?.addEventListener("click", logout);

  load();
})();