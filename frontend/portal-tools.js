(function () {
  const buttonId = "belm-applications-shortcut";
  const pathname = window.location.pathname;
  let customerExpenseMachines = null;
  let customerExpenseMachinesPromise = null;
  let technicianReportMachines = null;
  let technicianReportMachinesPromise = null;
  let technicianCustomerProfile = null;
  let technicianCustomerProfilePromise = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);

  document.body.dataset.belmArea = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/tech")
      ? "tech"
      : pathname.startsWith("/portal")
        ? "portal"
        : "public";

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", safeTheme === "dark");
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }

  async function syncSavedTheme() {
    const token = localStorage.getItem("belm_admin_token");
    if (!token || !window.location.pathname.startsWith("/admin")) return;
    try {
      const response = await fetch("/api/settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const settings = await response.json();
      if (settings.displayTheme === "light" || settings.displayTheme === "dark") {
        applyTheme(settings.displayTheme);
      }
    } catch (_) {}
  }

  function installThemeSaving() {
    if (document.documentElement.dataset.belmThemeSaving === "ready") return;
    document.documentElement.dataset.belmThemeSaving = "ready";
    applyTheme(localStorage.getItem("belm_theme") || "light");

    document.addEventListener("click", async (event) => {
      if (window.location.pathname !== "/admin/settings") return;
      const button = event.target.closest("button");
      if (!button) return;
      const label = (button.textContent || "").trim().toLowerCase();
      const theme = label.includes("light") ? "light" : label.includes("dark") ? "dark" : null;
      if (!theme) return;

      applyTheme(theme);
      const token = localStorage.getItem("belm_admin_token");
      if (!token) return;
      try {
        const response = await fetch("/api/settings/displayTheme", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ value: theme }),
        });
        if (!response.ok) throw new Error("Theme could not be saved.");
        button.title = "Theme saved";
      } catch (error) {
        alert(error.message || "Theme could not be saved.");
      }
    }, true);
  }

  function customerThemeKey() {
    const payload = tokenPayload("belm_customer_token");
    const userId = payload?.id || payload?.userId || "default";
    return `belm_customer_theme_${userId}`;
  }

  function applyCustomerTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", safeTheme === "dark");
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem(customerThemeKey(), safeTheme);
    const button = document.getElementById("belm-customer-theme-toggle");
    if (button) {
      button.textContent = safeTheme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
    }
  }

  function installCustomerThemeToggle() {
    if (!window.location.pathname.startsWith("/portal")) return;
    if (document.getElementById("belm-customer-theme-toggle")) return;
    const header = Array.from(document.querySelectorAll("div, header"))
      .find(element => Array.from(element.children).some(
        child => (child.textContent || "").trim() === "BELM Customer Portal"
      ));
    const logOut = Array.from(document.querySelectorAll("button, a"))
      .find(element => (element.textContent || "").trim().toLowerCase().includes("log out"));
    const anchor = logOut?.parentElement || header;
    if (!anchor) return;

    const saved = localStorage.getItem(customerThemeKey()) || "light";
    const button = document.createElement("button");
    button.id = "belm-customer-theme-toggle";
    button.type = "button";
    button.textContent = saved === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
    button.style.cssText =
      "margin-right:10px;padding:8px 14px;border:1px solid #d5dae2;border-radius:8px;" +
      "background:#fff;color:#101b31;font:700 12px Inter,system-ui,sans-serif;cursor:pointer;";
    button.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      applyCustomerTheme(current === "dark" ? "light" : "dark");
    });
    anchor.insertBefore(button, anchor.firstChild);
    applyCustomerTheme(saved);
  }

  function tokenPayload(storageKey) {
    const token = localStorage.getItem(storageKey);
    if (!token) return null;
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(Array.from(atob(encoded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch {
      return null;
    }
  }

  function redirectIfAlreadyLoggedIn() {
    const pathname = window.location.pathname;

    function isValid(storageKey) {
      const payload = tokenPayload(storageKey);
      if (!payload) return false;
      if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now()) return false;
      return true;
    }

    if (pathname === "/admin/login" && isValid("belm_admin_token")) {
      window.location.replace("/overview-manager/");
      return true;
    }
    if (pathname === "/portal/login" && isValid("belm_customer_token")) {
      window.location.replace("/portal/dashboard");
      return true;
    }
    return false;
  }

  // The React dashboard sometimes shows an internal view (like "Checklist
  // Reports" for one machine) without changing the URL away from
  // /portal/dashboard. If the user then navigates elsewhere and presses the
  // browser's Back button, the app can restore that same stuck internal
  // view instead of the normal dashboard — even though the address bar
  // correctly shows /portal/dashboard. Forcing a full reload whenever
  // back/forward navigation lands on this URL guarantees a fresh, correct
  // dashboard every time.
  window.addEventListener("popstate", () => {
    if (window.location.pathname === "/portal/dashboard") {
      window.location.reload();
    }
  });

  function handoffTechnicianSession() {
    if (!window.location.pathname.startsWith("/tech")) return false;
    if (localStorage.getItem("belm_tech_token") && localStorage.getItem("belm_tech_user")) {
      return false;
    }
    const adminToken = localStorage.getItem("belm_admin_token");
    if (!adminToken) return false;
    const payload = tokenPayload("belm_admin_token");
    let adminUser = {};
    try {
      adminUser = JSON.parse(localStorage.getItem("belm_admin_user") || "{}");
    } catch (_) {}
    const role = payload?.roleName || adminUser.role;
    if (String(role || "").toLowerCase() !== "technician") return false;

    localStorage.setItem("belm_tech_token", adminToken);
    localStorage.setItem("belm_tech_user", JSON.stringify({
      id: payload?.id || adminUser.id || "",
      name: payload?.name || adminUser.name || "Technician",
      assignedCustomerId: payload?.assignedCustomerId || adminUser.assignedCustomerId || "",
      assignedCustomerName: adminUser.assignedCustomerName || "",
    }));
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.reload();
    return true;
  }

  async function pendingCount(token) {
    try {
      const response = await fetch("/api/applications?status=PENDING", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data.applications) ? data.applications.length : null;
    } catch {
      return null;
    }
  }

  async function refreshShortcut() {
    const old = document.getElementById(buttonId);
    const token = localStorage.getItem("belm_admin_token");
    const onAdminPage = window.location.pathname.startsWith("/admin");
    if (!token || !onAdminPage) {
      if (old) old.remove();
      return;
    }
    if (old) return;

    const link = document.createElement("a");
    link.id = buttonId;
    link.href = "/admin-applications/";
    link.textContent = "Access Applications";
    Object.assign(link.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "9999",
      background: "#00a651",
      color: "#fff",
      padding: "12px 16px",
      border: "2px solid #ffd400",
      borderRadius: "999px",
      boxShadow: "0 10px 28px rgba(21, 29, 49, .25)",
      font: "700 13px Inter, system-ui, sans-serif",
      textDecoration: "none",
    });
    document.body.appendChild(link);

    const count = await pendingCount(token);
    if (count !== null) {
      link.textContent = count > 0
        ? `Access Applications (${count})`
        : "Access Applications";
      if (count > 0) {
        link.style.background = "#ffd400";
        link.style.color = "#151d31";
        link.style.borderColor = "#00a651";
      }
    }
  }

  async function syncTechnicianCustomerName() {
    if (!window.location.pathname.startsWith("/tech")) return;
    const techToken = localStorage.getItem("belm_tech_token");
    const rawUser = localStorage.getItem("belm_tech_user");
    if (!techToken || !rawUser) return;

    let techUser;
    try {
      techUser = JSON.parse(rawUser);
    } catch {
      return;
    }
    if (!techUser.assignedCustomerId || techUser.assignedCustomerName) return;
    const syncKey = `belm-tech-customer-${techUser.assignedCustomerId}`;
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, "running");

    try {
      const response = await fetch(`/api/customers/${techUser.assignedCustomerId}`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      if (!response.ok) {
        sessionStorage.removeItem(syncKey);
        return;
      }
      const customer = await response.json();
      techUser.assignedCustomerName = customer.name;
      localStorage.setItem("belm_tech_user", JSON.stringify(techUser));
      sessionStorage.setItem(syncKey, "done");
      window.location.reload();
    } catch {
      sessionStorage.removeItem(syncKey);
    }
  }

  function clarifyTechnicianAssignment() {
    if (!window.location.pathname.startsWith("/admin")) return;
    for (const item of document.querySelectorAll("option")) {
      if (item.textContent.trim() === "None — see all customers") {
        item.textContent = "Select customer — required for Technician";
      }
    }
  }

  function clarifyTechnicianChecklistSave() {
    if (!window.location.pathname.startsWith("/tech")) return;
    document.querySelectorAll("button").forEach((button) => {
      if ((button.textContent || "").trim() === "Submit report") {
        button.textContent = "Save Checklist";
      }
    });
  }

  function enhanceCustomerLogin() {
    if (window.location.pathname !== "/portal/login") return;
    for (const label of document.querySelectorAll("label")) {
      if (label.textContent.trim() === "Portal link / ID") {
        const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.nodeValue = "Email address / Portal ID";
      }
    }
    const loginInput = document.querySelector('form input:not([type="password"])');
    if (loginInput) loginInput.placeholder = "customer@email.com or customer-name";
    const customerSlug = new URLSearchParams(window.location.search).get("customer");
    const form = document.querySelector("form");
    if (customerSlug && loginInput && !loginInput.value) {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      if (nativeValueSetter) {
        nativeValueSetter.call(loginInput, customerSlug);
      } else {
        loginInput.value = customerSlug;
      }
      loginInput.dispatchEvent(new Event("input", { bubbles: true }));
      loginInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (customerSlug && form && !document.getElementById("belm-customer-link-note")) {
      const note = document.createElement("div");
      note.id = "belm-customer-link-note";
      note.textContent = `Customer portal: ${customerSlug.replace(/-/g, " ")}`;
      Object.assign(note.style, {
        marginBottom: "14px",
        padding: "9px 11px",
        border: "1px solid #efd65d",
        borderRadius: "8px",
        background: "#fff9cf",
        color: "#151d31",
        font: "700 12px Inter, system-ui, sans-serif",
        textTransform: "capitalize",
      });
      const labels = form.querySelectorAll("label");
      if (labels.length > 0) form.insertBefore(note, labels[0]);
    }
  }

  function addForgotPasswordLink() {
    const isLoginPage = window.location.pathname === "/portal/login"
      || window.location.pathname === "/admin/login"
      || window.location.pathname === "/tech";
    if (!isLoginPage || document.getElementById("belm-forgot-password")) return;
    const form = document.querySelector("form");
    if (!form || !form.querySelector('input[type="password"]')) return;
    const link = document.createElement("a");
    link.id = "belm-forgot-password";
    link.href = "/forgot-password/";
    link.textContent = "Forgot password? Reset it yourself";
    Object.assign(link.style, {
      display: "block",
      margin: "10px 0 4px",
      color: "#008640",
      font: "700 12px Inter, system-ui, sans-serif",
      textAlign: "right",
      textDecoration: "none"
    });
    form.appendChild(link);
  }

  function addPortalHomeLink() {
    const isLoginPage = window.location.pathname === "/portal/login"
      || window.location.pathname === "/admin/login"
      || window.location.pathname === "/tech";
    if (!isLoginPage || document.getElementById("belm-portal-home-link")) return;
    const form = document.querySelector("form");
    if (!form) return;

    const link = document.createElement("a");
    link.id = "belm-portal-home-link";
    link.href = "/";
    link.textContent = "← Back to Portal Home";
    Object.assign(link.style, {
      display: "block",
      marginTop: "14px",
      color: "#008640",
      font: "700 12px Inter, system-ui, sans-serif",
      textAlign: "center",
      textDecoration: "none"
    });
    form.appendChild(link);
  }

  function enforceAdminPageAccess() {
    if (!window.location.pathname.startsWith("/admin/") || window.location.pathname === "/admin/login") return;
    let user;
    try {
      user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
    } catch (_) {
      return;
    }
    if (!user || user.role === "Super Admin" || user.allowedPages === null) return;
    const allowed = Array.isArray(user.allowedPages) ? user.allowedPages : [];
    const key = window.location.pathname.split("/")[2] || "";
    if (!key || allowed.includes(key)) return;
    if (user.role === "Technician") {
      window.location.replace("/tech");
      return;
    }
    const first = allowed[0];
    if (first) window.location.replace(`/admin/${first}`);
  }

  function enhanceCustomerAssistants() {
    if (!window.location.pathname.startsWith("/portal/dashboard")) return;
    const payload = tokenPayload("belm_customer_token");
    for (const button of document.querySelectorAll("button")) {
      if (!["+ Add user", "+ Manage assistants"].includes(button.textContent.trim())) continue;
      if (payload?.actorType === "assistant") {
        button.style.display = "none";
        continue;
      }
      button.textContent = "+ Manage assistants";
      if (button.dataset.belmAssistantsReady === "1") continue;
      button.dataset.belmAssistantsReady = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = "/customer-users/";
      });
    }
  }

  async function loadCustomerExpenseMachines() {
    if (customerExpenseMachines) return customerExpenseMachines;
    if (customerExpenseMachinesPromise) return customerExpenseMachinesPromise;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    customerExpenseMachinesPromise = fetch("/api/customer-portal/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load machines.");
        const dashboard = await response.json();
        customerExpenseMachines = Array.isArray(dashboard.machines) ? dashboard.machines : [];
        return customerExpenseMachines;
      })
      .catch(() => {
        customerExpenseMachinesPromise = null;
        return [];
      });
    return customerExpenseMachinesPromise;
  }

  function customerMachineInfoCard(card, machine) {
    if (card.dataset.belmCustomerInfoReady === "1") return;
    card.dataset.belmCustomerInfoReady = "1";
    const condition = technicianCondition(machine.status);
    const opStatus = String(machine.operationalStatus || machine.operational_status || "NORMAL").toUpperCase();
    const opLabels = {
      NORMAL: "Normal — no active work", SERVICE_IN_PROGRESS: "Service in progress",
      CHECKUP_IN_PROGRESS: "Check-up in progress", MAINTENANCE_IN_PROGRESS: "Maintenance in progress",
      GROUNDED: "Grounded (not operational)",
    };
    const details = document.createElement("div");
    details.className = "belm-technician-machine-info";
    details.innerHTML = `
      <div class="belm-technician-machine-data">
        <div><span>Brand</span><b>${escapeHtml(machine.brand || "Not recorded")}</b></div>
        <div><span>Machine Type</span><b>${escapeHtml(machine.machineType || machine.machine_type || "Not recorded")}</b></div>
        <div><span>Serial No.</span><b>${escapeHtml(machine.serialNumber || machine.serial_number || "Not recorded")}</b></div>
        <div><span>Registration</span><b>${escapeHtml(machine.regNumber || machine.reg_number || "Not recorded")}</b></div>
        <div><span>Service Kit</span><b>${escapeHtml(machine.serviceKit || machine.service_kit || "Not recorded")}</b></div>
        <div><span>Last Checked</span><b>${escapeHtml(machine.lastCheckedAt || machine.last_checked_at
          ? new Date(machine.lastCheckedAt || machine.last_checked_at).toLocaleDateString()
          : "Never checked")}</b></div>
      </div>
      <div class="belm-technician-machine-health status-${escapeHtml(condition.status.toLowerCase())}">
        <div><span>Machine Status</span><strong>${escapeHtml(condition.status)}</strong></div>
        <div><span>Condition</span><strong>${escapeHtml(condition.label)}</strong><small>${escapeHtml(condition.note)}</small></div>
      </div>
      <div class="belm-customer-op-status op-${escapeHtml(opStatus)}">
        <span>What's happening now</span>
        <strong>${escapeHtml(opLabels[opStatus] || "Normal")}</strong>
      </div>`;
    card.appendChild(details);
  }

  let customerServiceStatusCache = {};

  async function loadServiceStatus(machineId) {
    if (customerServiceStatusCache[machineId]) return customerServiceStatusCache[machineId];
    const token = localStorage.getItem("belm_customer_token") || localStorage.getItem("belm_tech_token");
    if (!token) return null;
    try {
      const response = await fetch(`/api/customer-portal/machines/${encodeURIComponent(machineId)}/service-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      customerServiceStatusCache[machineId] = data;
      return data;
    } catch (_) {
      return null;
    }
  }

  function whatsappShareUrl(text) {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  async function customerServiceDuePanel(card, machine) {
    if (card.dataset.belmServiceDueReady === "1") return;
    card.dataset.belmServiceDueReady = "1";
    const status = await loadServiceStatus(machine.id);
    if (!status) return;

    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
    const serial = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded";
    const remaining = Math.round(status.hoursRemaining);
    const levelLabel = status.level === "RED" ? "Service due now" : status.level === "YELLOW" ? "Service due soon" : "On schedule";

    const panel = document.createElement("div");
    panel.className = `belm-service-due-panel status-${String(status.level || "GREEN").toLowerCase()}`;
    panel.innerHTML = `
      <div class="belm-service-due-head">
        <span>NEXT SERVICE</span>
        <strong>${escapeHtml(levelLabel)}</strong>
      </div>
      <div class="belm-service-due-grid">
        <div><span>Fleet Number</span><b class="belm-fleet-number-value">${escapeHtml(machine.fleetNumber || machine.fleet_number || serial)}</b></div>
        <div><span>Type of service</span><b>${escapeHtml(status.intervalHours)}-Hour Service</b></div>
        <div><span>Current Hrs</span><b class="belm-current-hrs-value">${escapeHtml(Math.round(status.totalHours))}</b></div>
        <div><span>Remaining Hrs</span><b>${remaining <= 0 ? "Overdue" : escapeHtml(remaining)}</b></div>
      </div>
      <div class="belm-machine-quick-actions">
        <a href="/customer-machine-expenses/?machine=${encodeURIComponent(machine.id)}" data-belm-feature="machine-expenses">Machine Expenses</a>
        <button type="button" class="belm-open-analysis" data-open-analysis data-belm-feature="analysis">Analysis</button>
        <a href="/customer-service-request/?machine=${encodeURIComponent(machine.id)}" data-belm-feature="service-request">Request Service</a>
        <button type="button" class="belm-report-problem-button" data-belm-feature="report-problem" data-report-problem="${escapeHtml(machine.id)}">Report a Problem</button>
        <button type="button" class="belm-report-problem-button" data-view-operator-reports="${escapeHtml(machine.id)}">Operator Reports</button>
        <a href="/customer-users/" class="belm-assign-users-button" data-belm-owner-admin-only>Assign Users</a>
        <button type="button" class="belm-assign-users-button" data-open-change-password>Change Password</button>
        <button type="button" class="belm-email-report-button" data-belm-feature="email" data-email-report
          data-report-subject="BELM Portal — ${escapeHtml(machineName)} service status"
          data-report-message="BELM Portal report for ${escapeHtml(machineName)} (${escapeHtml(serial)}): ${escapeHtml(levelLabel)}. Current hour meter: ${Math.round(status.totalHours)} hrs. Remaining to next service: ${remaining <= 0 ? "Overdue" : `${remaining} hrs`}.">
          Management Email
        </button>
        <a class="belm-service-whatsapp" data-belm-feature="whatsapp" target="_blank" rel="noopener"
           href="${whatsappShareUrl(`BELM Portal alert: ${machineName} (${serial}) — ${levelLabel}. Current hour meter: ${Math.round(status.totalHours)} hrs, remaining to next service: ${remaining <= 0 ? "overdue" : `${remaining} hrs`}.`)}">
          Send via WhatsApp
        </a>
      </div>`;
    card.appendChild(panel);
    enforceCustomerFeaturePermissions(panel);
  }

  // A leaner version of customerServiceDuePanel for the Technician view —
  // same NEXT SERVICE info grid (Fleet Number, Type of Service, Current
  // Hrs, Remaining Hrs), but without the customer-facing action buttons
  // row (Assign Users, Request Service, etc.) since the Technician already
  // has their own Checked Reports / Check-up buttons on this same card.
  async function technicianServiceDuePanel(card, machine) {
    if (card.dataset.belmServiceDueReady === "1") return;
    card.dataset.belmServiceDueReady = "1";
    const status = await loadServiceStatus(machine.id);
    if (!status) return;

    const serial = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded";
    const remaining = Math.round(status.hoursRemaining);
    const levelLabel = status.level === "RED" ? "Service due now" : status.level === "YELLOW" ? "Service due soon" : "On schedule";

    const panel = document.createElement("div");
    panel.className = `belm-service-due-panel status-${String(status.level || "GREEN").toLowerCase()}`;
    panel.innerHTML = `
      <div class="belm-service-due-head">
        <span>NEXT SERVICE</span>
        <strong>${escapeHtml(levelLabel)}</strong>
      </div>
      <div class="belm-service-due-grid">
        <div><span>Fleet Number</span><b class="belm-fleet-number-value">${escapeHtml(machine.fleetNumber || machine.fleet_number || serial)}</b></div>
        <div><span>Type of service</span><b>${escapeHtml(status.intervalHours)}-Hour Service</b></div>
        <div><span>Current Hrs</span><b class="belm-current-hrs-value">${escapeHtml(Math.round(status.totalHours))}</b></div>
        <div><span>Remaining Hrs</span><b>${remaining <= 0 ? "Overdue" : escapeHtml(remaining)}</b></div>
      </div>
      <button type="button" class="belm-technician-operator-reports-button" data-view-operator-reports="${escapeHtml(machine.id)}" data-technician-context="1">Operator Reports</button>`;
    // Insert before the Checked Reports/Check-up buttons row (which is
    // created synchronously right after this call) rather than just
    // appending, so the NEXT SERVICE panel reliably lands between Activity
    // Status and the buttons regardless of how long this fetch takes.
    const actionsRowRef = card.querySelector(".belm-technician-card-actions");
    card.insertBefore(panel, actionsRowRef);
  }

  let techLoadingWatchdogScheduled = false;
  // Detects the specific "your assigned customer has changed" 401 the
  // backend now sends when a Technician's session token is stale (their
  // assigned customer was deleted/merged/reassigned after they logged
  // in). Without this, the app just silently retries the same broken
  // request forever and the person is stuck on "Loading…" no matter how
  // many times they hit Refresh — only a fresh login fixes it, so do
  // that automatically instead of making them find "Log in again".
  function installStaleTechSessionDetector() {
    if (window.location.pathname !== "/tech") return;
    if (window.__belmStaleTechDetectorInstalled) return;
    window.__belmStaleTechDetectorInstalled = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        if (response.status === 401) {
          const clone = response.clone();
          const text = await clone.text();
          if (text.includes("assigned customer has changed")) {
            localStorage.removeItem("belm_tech_token");
            localStorage.removeItem("belm_tech_user");
            const banner = document.createElement("div");
            banner.style.cssText =
              "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
              "background:rgba(4,10,20,.9);color:#fff;font:600 14px Inter,system-ui,sans-serif;text-align:center;padding:24px;";
            banner.innerHTML =
              '<div><p style="margin:0 0 14px;font-size:16px;font-weight:800;">Your session needs refreshing</p>' +
              '<p style="margin:0 0 18px;color:#cbd5e1;">Your assigned customer changed since you last logged in. Redirecting to login…</p></div>';
            document.body.appendChild(banner);
            setTimeout(() => window.location.href = "/auth/login", 1800);
          }
        }
      } catch (_) {}
      return response;
    };
  }

  function watchForStuckTechLoading() {
    if (window.location.pathname !== "/tech") return;
    if (techLoadingWatchdogScheduled) return;
    techLoadingWatchdogScheduled = true;
    const isStuck = () => {
      const loadingNode = Array.from(document.querySelectorAll("div"))
        .find(el => el.children.length === 0 && (el.textContent || "").trim() === "Loading…");
      return !!loadingNode && !document.getElementById("belm-stuck-loading-banner");
    };
    setTimeout(() => {
      techLoadingWatchdogScheduled = false;
      if (!isStuck()) return;
      const banner = document.createElement("div");
      banner.id = "belm-stuck-loading-banner";
      banner.style.cssText =
        "position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:14px 16px;" +
        "border-radius:12px;background:#fff3f1;border:1px solid #f1c8c4;color:#b3261e;" +
        "font:600 13px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:10px;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.15);";
      banner.innerHTML =
        '<span>This is taking longer than expected. Your session may have expired.</span>' +
        '<span style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button type="button" id="belm-stuck-retry" style="padding:8px 14px;border:0;border-radius:8px;background:#101b31;color:#fff;font-weight:800;cursor:pointer;">Refresh</button>' +
        '<button type="button" id="belm-stuck-relogin" style="padding:8px 14px;border:1px solid #b3261e;border-radius:8px;background:#fff;color:#b3261e;font-weight:800;cursor:pointer;">Log in again</button>' +
        '</span>';
      document.body.appendChild(banner);
      document.getElementById("belm-stuck-retry").addEventListener("click", () => window.location.reload());
      document.getElementById("belm-stuck-relogin").addEventListener("click", () => {
        localStorage.removeItem("belm_tech_token");
        localStorage.removeItem("belm_tech_user");
        window.location.reload();
      });
    }, 8000);
  }

  function checkedTodayKey() {
    const today = new Date().toISOString().slice(0, 10);
    return `belm_tech_checked_today_${today}`;
  }

  function getCheckedTodayList() {
    try {
      return JSON.parse(sessionStorage.getItem(checkedTodayKey()) || "[]");
    } catch {
      return [];
    }
  }

  function installTechChecklistSubmitInterceptor() {
    if (window.__belmFetchPatched) return;
    window.__belmFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        const method = (args[1]?.method || "GET").toUpperCase();
        if (response.ok && method === "POST" && url.includes("/api/checklist-reports") && !url.includes("action=")) {
          response.clone().json().then((data) => {
            const serial = data?.machine?.serialNumber;
            if (!serial) return;
            const list = getCheckedTodayList();
            if (!list.includes(serial)) {
              list.push(serial);
              sessionStorage.setItem(checkedTodayKey(), JSON.stringify(list));
            }
          }).catch(() => {});
        }
      } catch (_) {}
      return response;
    };
  }

  function hideCheckedMachinesFromTechList() {
    if (window.location.pathname !== "/tech") return;
    const checked = getCheckedTodayList();
    if (!checked.length) return;
    document.querySelectorAll(".grid button").forEach((card) => {
      const text = card.textContent || "";
      if (checked.some((serial) => text.includes(serial)) && card.style.display !== "none") {
        card.style.display = "none";
        const note = document.createElement("p");
        note.textContent = "✅ Already checked today — hidden from this list.";
        note.style.cssText = "grid-column:1/-1;margin:4px 0;padding:8px;background:#eaf8f0;color:#075f36;border-radius:8px;font-size:12px;font-weight:700;text-align:center;";
        note.dataset.belmCheckedNote = "1";
        if (!card.previousElementSibling?.dataset?.belmCheckedNote) {
          card.insertAdjacentElement("beforebegin", note);
        }
      }
    });
  }

  function addCustomerNameToMachinesHeading() {
    if (window.location.pathname !== "/portal/dashboard") return;
    const heading = Array.from(document.querySelectorAll("h1, h2"))
      .find(element => (element.textContent || "").trim() === "Your machines");
    if (!heading || heading.dataset.belmNamed === "1") return;
    const payload = tokenPayload("belm_customer_token");
    const name = payload?.name;
    if (!name) return;
    heading.dataset.belmNamed = "1";
    heading.textContent = `${String(name).toUpperCase()} MACHINES`;
  }

  async function enhanceServiceRequestHistory() {
    if (window.location.pathname !== "/portal/dashboard") return;
    const heading = Array.from(document.querySelectorAll("h2"))
      .find((h) => (h.textContent || "").trim() === "Your service requests");
    if (!heading) return;
    const table = heading.parentElement?.querySelector("table");
    if (!table || table.dataset.belmHandledBy === "1") return;

    const token = localStorage.getItem("belm_customer_token");
    let requests;
    try {
      const response = await fetch("/api/customer-portal/service-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      requests = await response.json();
    } catch (_) {
      return;
    }

    const headRow = table.querySelector("thead tr");
    const bodyRows = table.querySelectorAll("tbody tr");
    if (!headRow || bodyRows.length === 0 || bodyRows.length !== requests.length) return;

    table.dataset.belmHandledBy = "1";
    const th = document.createElement("th");
    th.className = "text-left px-5 py-3";
    th.textContent = "Handled by";
    headRow.insertBefore(th, headRow.lastElementChild);

    bodyRows.forEach((row, index) => {
      const request = requests[index];
      let text = "—";
      if (request.status === "COMPLETED" && request.completedBy) {
        text = `Completed by ${request.completedBy.name}`;
      } else if (request.status === "CANCELLED" && request.cancelledBy) {
        text = `Cancelled by ${request.cancelledBy.name}`;
      } else if (request.assignedTo) {
        text = `Assigned to ${request.assignedTo.name}`;
      }
      const td = document.createElement("td");
      td.className = "px-5 py-3 text-slate-500";
      td.textContent = text;
      row.insertBefore(td, row.lastElementChild);
    });
  }

  function enforceCustomerFeaturePermissions(scope) {
    const payload = tokenPayload("belm_customer_token");
    const permissions = payload?.permissions;
    if (Array.isArray(permissions)) {
      scope.querySelectorAll("[data-belm-feature]").forEach((element) => {
        if (!permissions.includes(element.dataset.belmFeature)) {
          element.style.display = "none";
        }
      });
    }
    const role = payload?.customerRole;
    const hasAssignUsersPermission = Array.isArray(permissions) && permissions.includes("assign-users");
    if (role !== "owner" && role !== "admin" && !hasAssignUsersPermission) {
      scope.querySelectorAll("[data-belm-owner-admin-only]").forEach((element) => {
        element.style.display = "none";
      });
    }
  }

  function dismissedAnnouncementIds() {
    try {
      return JSON.parse(localStorage.getItem("belm_dismissed_announcements") || "[]");
    } catch (_) {
      return [];
    }
  }

  function dismissAnnouncement(id) {
    const dismissed = dismissedAnnouncementIds();
    if (!dismissed.includes(id)) dismissed.push(id);
    localStorage.setItem("belm_dismissed_announcements", JSON.stringify(dismissed));
  }

  async function enhanceCustomerAnnouncementsPanel() {
    if (window.location.pathname !== "/portal/dashboard") return;
    if (document.getElementById("belmAnnouncementsPanel")) return;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    try {
      const response = await fetch("/api/announcements", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const data = await response.json();
      const dismissed = dismissedAnnouncementIds();
      const messages = (Array.isArray(data.messages) ? data.messages : [])
        .filter(item => !dismissed.includes(item.id));
      if (!messages.length) return;

      const heading = Array.from(document.querySelectorAll("h1, h2"))
        .find(element => (element.textContent || "").trim() === "Your machines");
      const anchor = heading?.closest("section") || heading?.parentElement;
      if (!anchor) return;

      const panel = document.createElement("section");
      panel.id = "belmAnnouncementsPanel";
      panel.className = "belm-announcements-panel";
      panel.innerHTML = `
        <div class="belm-announcements-head"><span>MESSAGES FROM BELM ADMIN</span></div>
        <div class="belm-announcements-list">${messages.map(item => `
          <article class="belm-announcement-item" data-announcement-id="${escapeHtml(item.id)}">
            <p>${escapeHtml(item.message)}</p>
            <div class="belm-announcement-footer">
              <small>${new Date(item.created_at).toLocaleDateString()}</small>
              <div class="belm-announcement-actions">
                <a target="_blank" rel="noopener" href="${whatsappShareUrl(`BELM Portal message: ${item.message}`)}">Send via WhatsApp</a>
                <button type="button" class="belm-announcement-ok" data-dismiss-announcement="${escapeHtml(item.id)}">OK</button>
              </div>
            </div>
          </article>`).join("")}</div>`;
      anchor.before(panel);

      panel.querySelectorAll("[data-dismiss-announcement]").forEach(button => {
        button.addEventListener("click", () => {
          const id = button.dataset.dismissAnnouncement;
          dismissAnnouncement(id);
          const item = panel.querySelector(`[data-announcement-id="${id}"]`);
          if (item) item.remove();
          if (!panel.querySelector(".belm-announcement-item")) panel.remove();
        });
      });
    } catch (_) {}
  }

  let belmSavedEmailsCache = null;

  function ensureEmailReportDialog() {
    let dialog = document.getElementById("belmEmailReportDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmEmailReportDialog";
    dialog.className = "belm-analysis-dialog belm-email-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-email-form">
        <div class="belm-analysis-head">
          <span>MANAGEMENT EMAIL</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-email-body">
          <p class="belm-email-intro">Share this with your boss or management team — for approval, review, or their records.</p>
          <div id="belmEmailError" class="belm-email-error" hidden></div>

          <label>Send to <small>(select one or more)</small></label>
          <div id="belmEmailRecipients" class="belm-email-recipients">
            <p class="belm-email-empty-list">No saved emails yet — add one below.</p>
          </div>

          <div class="belm-email-add-row">
            <input type="text" id="belmEmailNewLabel" maxlength="100" placeholder="Label, e.g. Boss">
            <input type="email" id="belmEmailNewAddress" placeholder="email@company.com">
            <button type="button" id="belmEmailAddButton">+ Add</button>
          </div>

          <label>CC <small>(optional — other people to copy in, comma-separated)</small>
            <input type="text" id="belmEmailCc" placeholder="accountant@company.com, office@company.com">
          </label>

          <label>Message
            <textarea id="belmEmailMessage" rows="5"></textarea>
          </label>

          <label>Attachments <small>(photo, PDF, Excel, Word — up to 5 files, 15 MB total)</small></label>
          <div class="belm-email-attach-row">
            <input type="file" id="belmEmailAttachInput" multiple accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,application/pdf">
          </div>
          <ul id="belmEmailAttachList" class="belm-email-attach-list"></ul>

          <button type="submit" class="belm-email-send" id="belmEmailSendButton">Send email</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());

    const attachState = [];
    dialog._attachState = attachState;
    const MAX_ATTACH_TOTAL_BYTES = 15 * 1024 * 1024;

    function renderAttachList() {
      const list = document.getElementById("belmEmailAttachList");
      list.innerHTML = attachState.map((item, index) => `
        <li>
          <span>${item.name} <small>(${(item.size / 1024).toFixed(0)} KB)</small></span>
          <button type="button" data-remove-attach="${index}" aria-label="Remove">×</button>
        </li>`).join("");
      list.querySelectorAll("[data-remove-attach]").forEach((button) => {
        button.addEventListener("click", () => {
          attachState.splice(Number(button.dataset.removeAttach), 1);
          renderAttachList();
        });
      });
    }
    dialog._renderAttachList = renderAttachList;

    dialog.querySelector("#belmEmailAttachInput").addEventListener("change", async (event) => {
      const errorBox = document.getElementById("belmEmailError");
      errorBox.hidden = true;
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (attachState.length + files.length > 5) {
        errorBox.textContent = "Attach at most 5 files per email.";
        errorBox.hidden = false;
        return;
      }
      for (const file of files) {
        const currentTotal = attachState.reduce((sum, item) => sum + item.size, 0);
        if (currentTotal + file.size > MAX_ATTACH_TOTAL_BYTES) {
          errorBox.textContent = "Attachments are too large — keep the total under 15 MB.";
          errorBox.hidden = false;
          break;
        }
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Could not read this file."));
          reader.readAsDataURL(file);
        }).catch(() => null);
        if (!dataUrl) continue;
        attachState.push({ name: file.name, size: file.size, dataUrl });
      }
      renderAttachList();
    });

    dialog.querySelector("#belmEmailAddButton").addEventListener("click", async () => {
      const errorBox = document.getElementById("belmEmailError");
      const label = document.getElementById("belmEmailNewLabel").value.trim();
      const email = document.getElementById("belmEmailNewAddress").value.trim();
      errorBox.hidden = true;
      if (!label || !email) {
        errorBox.textContent = "Enter both a label and an email address to add it.";
        errorBox.hidden = false;
        return;
      }
      const token = localStorage.getItem("belm_customer_token");
      try {
        const response = await fetch("/api/customer-portal/saved-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ label, email }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not add this email.");
        document.getElementById("belmEmailNewLabel").value = "";
        document.getElementById("belmEmailNewAddress").value = "";
        belmSavedEmailsCache = null;
        await renderEmailRecipients();
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
    });

    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmEmailError");
      const button = document.getElementById("belmEmailSendButton");
      const token = localStorage.getItem("belm_customer_token");
      const recipients = [...dialog.querySelectorAll("[data-recipient-checkbox]:checked")].map((box) => box.value);
      errorBox.hidden = true;
      if (recipients.length === 0) {
        errorBox.textContent = "Select at least one saved email to send to.";
        errorBox.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Sending…";
      const message = document.getElementById("belmEmailMessage").value;
      const subject = dialog.dataset.subject || "BELM Portal report";
      const ccList = document.getElementById("belmEmailCc").value
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email !== "");
      const invalidCc = ccList.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      if (invalidCc) {
        errorBox.textContent = `"${invalidCc}" is not a valid CC email address.`;
        errorBox.hidden = false;
        button.disabled = false;
        button.textContent = "Send email";
        return;
      }
      const attachmentsPayload = attachState.map((item) => ({ filename: item.name, data: item.dataUrl }));
      let failures = 0;
      for (const to of recipients) {
        try {
          const response = await fetch("/api/customer-portal/email-report", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to, cc: ccList, subject, message, attachments: attachmentsPayload }),
          });
          if (!response.ok) failures += 1;
        } catch (_) {
          failures += 1;
        }
      }
      button.disabled = false;
      button.textContent = "Send email";
      if (failures === 0) {
        dialog.close();
        attachState.length = 0;
        renderAttachList();
        alert(`Email sent successfully to ${recipients.length} recipient(s).`);
      } else {
        errorBox.textContent = `${recipients.length - failures} of ${recipients.length} email(s) sent. ${failures} failed — please try again.`;
        errorBox.hidden = false;
      }
    });
    return dialog;
  }

  async function renderEmailRecipients() {
    const container = document.getElementById("belmEmailRecipients");
    const saved = await loadSavedEmails();
    container.innerHTML = saved.length
      ? saved.map((entry) => `
          <div class="belm-email-recipient-row" data-recipient-row="${escapeHtml(entry.id)}">
            <label>
              <input type="checkbox" data-recipient-checkbox value="${escapeHtml(entry.email)}">
              <span>${escapeHtml(entry.label)} <small>(${escapeHtml(entry.email)})</small></span>
            </label>
            <button type="button" class="belm-email-edit-btn" data-edit-recipient="${escapeHtml(entry.id)}" aria-label="Edit">✎</button>
          </div>`).join("")
      : '<p class="belm-email-empty-list">No saved emails yet — add one below.</p>';

    container.querySelectorAll("[data-edit-recipient]").forEach((button) => {
      button.addEventListener("click", () => {
        const entryId = button.dataset.editRecipient;
        const entry = saved.find((item) => item.id === entryId);
        if (!entry) return;
        const row = container.querySelector(`[data-recipient-row="${entryId}"]`);
        row.innerHTML = `
          <input type="text" class="belm-email-edit-label" value="${escapeHtml(entry.label)}" maxlength="100">
          <input type="email" class="belm-email-edit-address" value="${escapeHtml(entry.email)}">
          <button type="button" class="belm-email-edit-save" data-save-recipient="${escapeHtml(entryId)}">Save</button>
          <button type="button" class="belm-email-edit-cancel" data-cancel-recipient="${escapeHtml(entryId)}">Cancel</button>
          <button type="button" class="belm-email-edit-delete" data-delete-recipient="${escapeHtml(entryId)}">Delete</button>`;

        row.querySelector("[data-cancel-recipient]").addEventListener("click", renderEmailRecipients);

        row.querySelector("[data-delete-recipient]").addEventListener("click", async () => {
          if (!confirm(`Remove "${entry.label}" (${entry.email}) from your saved emails?`)) return;
          try {
            const token = localStorage.getItem("belm_customer_token");
            await fetch(`/api/customer-portal/saved-emails/${entryId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            belmSavedEmailsCache = null;
            renderEmailRecipients();
          } catch (_) {
            alert("Could not remove that saved email. Try again.");
          }
        });

        row.querySelector("[data-save-recipient]").addEventListener("click", async () => {
          const label = row.querySelector(".belm-email-edit-label").value.trim();
          const email = row.querySelector(".belm-email-edit-address").value.trim();
          if (!label || !email) {
            alert("Enter both a label and an email address.");
            return;
          }
          try {
            const token = localStorage.getItem("belm_customer_token");
            const response = await fetch(`/api/customer-portal/saved-emails/${entryId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ label, email }),
            });
            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || "Could not save changes.");
            }
            belmSavedEmailsCache = null;
            renderEmailRecipients();
          } catch (error) {
            alert(error.message || "Could not save changes.");
          }
        });
      });
    });
  }

  async function loadSavedEmails() {
    if (belmSavedEmailsCache) return belmSavedEmailsCache;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    try {
      const response = await fetch("/api/customer-portal/saved-emails", { headers: { Authorization: `Bearer ${token}` } });
      belmSavedEmailsCache = response.ok ? await response.json() : [];
    } catch (_) {
      belmSavedEmailsCache = [];
    }
    return belmSavedEmailsCache;
  }

  async function openEmailReportDialog(subject, message) {
    const dialog = ensureEmailReportDialog();
    dialog.dataset.subject = subject;
    document.getElementById("belmEmailMessage").value = message;
    document.getElementById("belmEmailCc").value = "";
    document.getElementById("belmEmailError").hidden = true;
    if (dialog._attachState) dialog._attachState.length = 0;
    dialog._renderAttachList?.();
    await renderEmailRecipients();
    dialog.showModal();
  }

  function wireEmailReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-email-report]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () => {
        openEmailReportDialog(button.dataset.reportSubject || "BELM Portal report", button.dataset.reportMessage || "");
      });
    });
  }


  function ensureAnalysisDialog() {
    let dialog = document.getElementById("belmAnalysisDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmAnalysisDialog";
    dialog.className = "belm-analysis-dialog";
    dialog.innerHTML = `
      <div class="belm-analysis-dialog-card">
        <div class="belm-analysis-head">
          <span>YOUR ANALYSIS</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-analysis-body" id="belmAnalysisBody"><p class="belm-analysis-loading">Loading…</p></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    return dialog;
  }

  async function openCustomerAnalysisDialog() {
    const dialog = ensureAnalysisDialog();
    dialog.showModal();
    const body = document.getElementById("belmAnalysisBody");
    if (belmAnalysisDataCache) {
      renderAnalysisBody(belmAnalysisDataCache);
      return;
    }
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    try {
      const response = await fetch("/api/customer-portal/analysis", { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error();
      belmAnalysisDataCache = await response.json();
      renderAnalysisBody(belmAnalysisDataCache);
    } catch (_) {
      body.innerHTML = '<p class="belm-analysis-loading">Could not load your analysis right now.</p>';
    }
  }

  function renderAnalysisBody(data) {
    const money = (value) => "TZS " + Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 0 });
    document.getElementById("belmAnalysisBody").innerHTML = `
      <div class="belm-analysis-block">
        <span>Machines</span>
        <strong>${data.machines.total}</strong>
        <div class="belm-analysis-dots">
          <em class="green">${data.machines.green} OK</em>
          <em class="yellow">${data.machines.yellow} Attention</em>
          <em class="red">${data.machines.red} Critical</em>
        </div>
      </div>
      <div class="belm-analysis-block">
        <span>Service Requests</span>
        <strong>${data.serviceRequests.total}</strong>
        <small>${data.serviceRequests.open} currently open</small>
      </div>
      <div class="belm-analysis-block">
        <span>Checklist Reports</span>
        <strong>${data.checklistReportsCount}</strong>
        <small>Inspections completed</small>
      </div>
      <div class="belm-analysis-block">
        <span>Machine Expenses</span>
        <strong>${money(data.machineExpensesTotal)}</strong>
        <small>Spare parts logged</small>
      </div>
      <div class="belm-analysis-block">
        <span>Petty Cash</span>
        <strong>${money(data.pettyCashTotal)}</strong>
        <small>Total recorded</small>
      </div>
      <div class="belm-analysis-block">
        <span>Invoices</span>
        <strong>${money(data.invoices.total)}</strong>
        <small>${money(data.invoices.outstanding)} outstanding</small>
      </div>`;
  }

  function ensureProblemReportDialog() {
    let dialog = document.getElementById("belmProblemReportDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmProblemReportDialog";
    dialog.className = "belm-analysis-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-email-form">
        <div class="belm-analysis-head">
          <span>REPORT A PROBLEM</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-email-body">
          <p class="belm-email-intro">This goes straight to your Machine Admin and BELM's engineer/technician team.</p>
          <div id="belmProblemError" class="belm-email-error" hidden></div>
          <label>Who is reporting? <small>(optional — pick from your operators)</small>
            <select id="belmProblemOperator"><option value="">— Myself / Not listed —</option></select>
          </label>
          <label>What's the problem?
            <textarea id="belmProblemMessage" rows="5" placeholder="e.g. Hydraulic arm making a grinding noise since this morning" required></textarea>
          </label>
          <button type="submit" class="belm-email-send" id="belmProblemSendButton">Send report</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());

    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmProblemError");
      const button = document.getElementById("belmProblemSendButton");
      const token = localStorage.getItem("belm_customer_token");
      errorBox.hidden = true;
      const message = document.getElementById("belmProblemMessage").value.trim();
      if (!message) {
        errorBox.textContent = "Describe the problem before sending.";
        errorBox.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Sending…";
      try {
        const response = await fetch(`/api/customer-portal/operator-reports/${encodeURIComponent(dialog.dataset.machineId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message,
            operatorId: document.getElementById("belmProblemOperator").value,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not send this report.");
        dialog.close();
        alert(result.message || "Problem reported successfully.");
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "Send report";
      }
    });
    return dialog;
  }

  async function openProblemReportDialog(machineId) {
    const dialog = ensureProblemReportDialog();
    dialog.dataset.machineId = machineId;
    document.getElementById("belmProblemMessage").value = "";
    document.getElementById("belmProblemError").hidden = true;
    const select = document.getElementById("belmProblemOperator");
    select.innerHTML = '<option value="">— Myself / Not listed —</option>';
    const token = localStorage.getItem("belm_customer_token");
    try {
      const response = await fetch(`/api/customer-portal/machine-operators/${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const operators = await response.json();
        operators.forEach((operator) => {
          const option = document.createElement("option");
          option.value = operator.id;
          option.textContent = `${operator.name} (${operator.contact})`;
          select.appendChild(option);
        });
      }
    } catch (_) {}
    dialog.showModal();
  }

  function wireProblemReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-report-problem]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () => openProblemReportDialog(button.dataset.reportProblem));
    });
  }

  function ensureOperatorReportsDialog() {
    let dialog = document.getElementById("belmOperatorReportsDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmOperatorReportsDialog";
    dialog.className = "belm-analysis-dialog belm-operator-reports-dialog";
    dialog.innerHTML = `
      <div class="belm-analysis-dialog-card">
        <div class="belm-analysis-head">
          <span>OPERATOR REPORTS</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div id="belmOperatorReportsBody" class="belm-operator-reports-body"></div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    return dialog;
  }

  async function openOperatorReportsDialog(machineId, isTechnician) {
    const dialog = ensureOperatorReportsDialog();
    const body = document.getElementById("belmOperatorReportsBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    dialog.showModal();
    try {
      let reports;
      if (isTechnician) {
        const token = localStorage.getItem("belm_tech_token");
        const response = await fetch(`/api/checklist-reports?action=operator-reports&machineId=${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load operator reports.");
        reports = await response.json();
      } else {
        const token = localStorage.getItem("belm_customer_token");
        const response = await fetch(`/api/customer-portal/operator-reports/${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load operator reports.");
        reports = await response.json();
      }
      body.innerHTML = (reports || []).length
        ? reports.map((report) => `
            <div class="belm-operator-report-row">
              <div class="belm-operator-report-head">
                <b>${escapeHtml(report.operator_name || report.operatorName || "Operator")}</b>
                <span class="belm-operator-report-status status-${escapeHtml((report.status || "OPEN").toLowerCase())}">${escapeHtml(report.status || "OPEN")}</span>
              </div>
              <p>${escapeHtml(report.message)}</p>
              <small>${formatTanzaniaDateTime(report.created_at || report.createdAt)}${report.resolved_at || report.resolvedAt ? ` · Resolved ${formatTanzaniaDateTime(report.resolved_at || report.resolvedAt)}` : ""}</small>
            </div>`).join("")
        : '<p class="muted">No operator reports for this machine yet.</p>';
    } catch (error) {
      body.innerHTML = `<p class="belm-analysis-error">${escapeHtml(error.message)}</p>`;
    }
  }

  function wireOperatorReportsButtons() {
    document.querySelectorAll("[data-view-operator-reports]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () =>
        openOperatorReportsDialog(button.dataset.viewOperatorReports, button.dataset.technicianContext === "1"));
    });
  }

  function ensureChangePasswordDialog() {
    let dialog = document.getElementById("belmChangePasswordDialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "belmChangePasswordDialog";
    dialog.className = "belm-analysis-dialog";
    dialog.innerHTML = `
      <form class="belm-analysis-dialog-card belm-change-password-form">
        <div class="belm-analysis-head">
          <span>CHANGE PASSWORD</span>
          <button type="button" class="belm-analysis-close" aria-label="Close">×</button>
        </div>
        <div class="belm-change-password-body">
          <div id="belmChangePasswordError" class="belm-analysis-error" hidden></div>
          <label>Current password<input type="password" id="belmCurrentPassword" autocomplete="current-password" required></label>
          <label>New password <small>(at least 8 characters)</small><input type="password" id="belmNewPassword" autocomplete="new-password" minlength="8" required></label>
          <label>Confirm new password<input type="password" id="belmConfirmNewPassword" autocomplete="new-password" minlength="8" required></label>
          <button type="submit" class="belm-email-send" id="belmChangePasswordSubmit">Change password</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    dialog.querySelector(".belm-analysis-close").addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById("belmChangePasswordError");
      const button = document.getElementById("belmChangePasswordSubmit");
      errorBox.hidden = true;
      const currentPassword = document.getElementById("belmCurrentPassword").value;
      const newPassword = document.getElementById("belmNewPassword").value;
      const confirmPassword = document.getElementById("belmConfirmNewPassword").value;
      if (newPassword !== confirmPassword) {
        errorBox.textContent = "New password and confirmation do not match.";
        errorBox.hidden = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Changing…";
      try {
        const token = localStorage.getItem("belm_customer_token");
        const response = await fetch("/api/customer-portal/change-password", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not change password.");
        dialog.querySelector("form").reset();
        dialog.close();
        alert("Password changed successfully.");
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = "Change password";
      }
    });
    return dialog;
  }

  function wireChangePasswordButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-open-change-password]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", () => ensureChangePasswordDialog().showModal());
    });
  }

  function wireCustomerAnalysisButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll("[data-open-analysis]").forEach((button) => {
      if (button.dataset.belmWired === "1") return;
      button.dataset.belmWired = "1";
      button.addEventListener("click", openCustomerAnalysisDialog);
    });
  }


  async function loadCustomerSpareRecommendations() {
    if (customerSpareRecommendationsCache) return customerSpareRecommendationsCache;
    if (customerSpareRecommendationsPromise) return customerSpareRecommendationsPromise;
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return [];
    customerSpareRecommendationsPromise = fetch("/api/spare-recommendations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load recommendations.");
        customerSpareRecommendationsCache = await response.json();
        return customerSpareRecommendationsCache;
      })
      .catch(() => {
        customerSpareRecommendationsPromise = null;
        return [];
      });
    return customerSpareRecommendationsPromise;
  }

  async function confirmSpareRecommendation(id, button) {
    const token = localStorage.getItem("belm_customer_token");
    if (!token) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const response = await fetch(`/api/spare-recommendations/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send this service requirement.");
      const item = button.closest(".belm-spare-recommendation-item");
      if (item) {
        item.innerHTML = `<span>Sent to BELM for action.</span>`;
      }
      customerSpareRecommendationsCache = null;
    } catch (error) {
      alert(error.message || "Could not send this service requirement.");
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function customerSpareRecommendationsPanel(card, machine) {
    if (card.dataset.belmSpareRecommendReady === "1") return;
    const all = await loadCustomerSpareRecommendations();
    const items = Array.isArray(all) ? all.filter(item => String(item.machine_id) === String(machine.id)) : [];
    if (!items.length) return;
    card.dataset.belmSpareRecommendReady = "1";

    const panel = document.createElement("div");
    panel.className = "belm-spare-recommendation-panel";
    panel.innerHTML = `<div class="belm-spare-recommendation-head">SPARE RECOMMENDED BY TECHNICIAN</div>
      ${items.map(item => `
        <div class="belm-spare-recommendation-item" data-recommendation-id="${escapeHtml(item.id)}">
          <span><b>${escapeHtml(item.spare_name)}</b><br>Ref: <b>${escapeHtml(item.reference_number)}</b></span>
          <button type="button" data-confirm-recommendation="${escapeHtml(item.id)}">Service Requirements</button>
        </div>`).join("")}`;
    panel.addEventListener("click", event => {
      const button = event.target.closest("[data-confirm-recommendation]");
      if (!button) return;
      confirmSpareRecommendation(button.dataset.confirmRecommendation, button);
    });
    card.appendChild(panel);
  }

  async function enhanceCustomerMachineExpenseCards() {
    if (window.location.pathname !== "/portal/dashboard") return;
    const machines = await loadCustomerExpenseMachines();
    if (!machines.length) return;

    const buttons = Array.from(document.querySelectorAll("button"));
    buttons
      .filter(button => /^\s*\+\s*Request service\s*$/i.test(button.textContent || ""))
      .forEach(button => {
        button.hidden = true;
        button.dataset.belmReplacedByMachineService = "1";
      });
    machines.forEach(machine => {
      const model = String(machine.model || "").trim();
      const serial = String(machine.serialNumber || machine.serial_number || "").trim();
      if (!model) return;
      const card = buttons.find(button => {
        if (button.dataset.belmMachineExpenseReady === "1") return false;
        const text = button.textContent || "";
        if (!text.includes(model)) return false;
        if (serial && !text.includes(serial)) return false;
        return /last checked|never checked/i.test(text);
      });
      if (!card) return;

      card.dataset.belmMachineExpenseReady = "1";
      card.classList.add("belm-customer-machine-card");
      card.classList.add(`status-${technicianCondition(machine.status).status.toLowerCase()}`);
      customerMachineInfoCard(card, machine);
      customerServiceDuePanel(card, machine);
      customerSpareRecommendationsPanel(card, machine);
    });
  }

  async function loadTechnicianCustomerProfile() {
    if (technicianCustomerProfile) return technicianCustomerProfile;
    if (technicianCustomerProfilePromise) return technicianCustomerProfilePromise;
    const token = localStorage.getItem("belm_tech_token");
    if (!token) return null;
    let techUser = {};
    try {
      techUser = JSON.parse(localStorage.getItem("belm_tech_user") || "{}");
    } catch (_) {}
    const payload = tokenPayload("belm_tech_token") || {};
    const customerId = techUser.assignedCustomerId || payload.assignedCustomerId;
    if (!customerId) return null;

    technicianCustomerProfilePromise = fetch(`/api/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load assigned customer.");
        const customer = await response.json();
        technicianCustomerProfile = customer;
        technicianReportMachines = Array.isArray(customer.machines) ? customer.machines : [];
        return technicianCustomerProfile;
      })
      .catch(() => {
        technicianCustomerProfilePromise = null;
        return null;
      });
    return technicianCustomerProfilePromise;
  }

  async function loadTechnicianReportMachines() {
    if (technicianReportMachines) return technicianReportMachines;
    if (technicianReportMachinesPromise) return technicianReportMachinesPromise;
    technicianReportMachinesPromise = loadTechnicianCustomerProfile()
      .then(customer => Array.isArray(customer?.machines) ? customer.machines : [])
      .finally(() => {
        technicianReportMachinesPromise = null;
      });
    return technicianReportMachinesPromise;
  }

  function technicianCondition(status) {
    const normalized = String(status || "UNKNOWN").toUpperCase();
    const conditions = {
      GREEN: {
        label: "Good condition",
        note: "Machine is operational.",
      },
      YELLOW: {
        label: "Needs attention",
        note: "Inspection or maintenance action is required.",
      },
      RED: {
        label: "Critical condition",
        note: "Do not operate until the fault is corrected.",
      },
      UNKNOWN: {
        label: "Not inspected",
        note: "Complete a checklist to confirm the condition.",
      },
    };
    return {
      status: normalized,
      ...(conditions[normalized] || conditions.UNKNOWN),
    };
  }

  function technicianCustomerInfoCard(customer) {
    if (document.getElementById("belmTechnicianCustomerCard")) return;
    const title = Array.from(document.querySelectorAll("h2"))
      .find(heading => (heading.textContent || "").trim() === String(customer.name || "").trim());
    if (!title) return;
    const titleRow = title.parentElement;
    const page = titleRow?.parentElement;
    if (!page) return;

    page.classList.add("belm-technician-dashboard-shell");
    const machineGrid = Array.from(page.children)
      .find(element => element.classList.contains("grid") && element.querySelector("button"));
    if (!machineGrid) return;

    const customerCard = document.createElement("section");
    customerCard.id = "belmTechnicianCustomerCard";
    customerCard.className = "belm-technician-customer-card";
    customerCard.innerHTML = `
      <div class="belm-technician-customer-head">
        <div>
          <span>Assigned Customer</span>
          <h1>${escapeHtml(customer.name || "Customer")}</h1>
          <p>${escapeHtml(customer.address || "Location not recorded")}</p>
        </div>
        <strong>${Number(customer.isActive ?? 1) === 1 ? "ACTIVE" : "INACTIVE"}</strong>
      </div>
      <div class="belm-technician-customer-info">
        <div><span>Location</span><b>${escapeHtml(customer.address || "Not recorded")}</b></div>
        <div><span>Phone</span><b>${escapeHtml(customer.phone || "Not recorded")}</b></div>
        <div><span>Email</span><b>${escapeHtml(customer.email || "Not recorded")}</b></div>
        <div><span>TIN / VRN</span><b>${escapeHtml([customer.tinNumber, customer.vrn].filter(Boolean).join(" / ") || "Not recorded")}</b></div>
        <div><span>Registered Machines</span><b>${escapeHtml((customer.machines || []).length)}</b></div>
      </div>`;

    const listHeading = document.createElement("div");
    listHeading.id = "belmTechnicianMachineListHeading";
    listHeading.className = "belm-technician-machine-list-heading";
    listHeading.innerHTML = `<div><span>Customer Fleet</span><h2>${escapeHtml((customer.name || "Customer").toUpperCase())} MACHINES</h2></div>
      <strong>${escapeHtml((customer.machines || []).length)} MACHINE(S)</strong>`;
    machineGrid.classList.add("belm-technician-machine-grid");
    machineGrid.before(customerCard, listHeading);
  }

  function technicianMachineInfoCard(card, machine) {
    if (card.dataset.belmTechnicianInfoReady === "1") return;
    card.dataset.belmTechnicianInfoReady = "1";
    // Any click that results in this card's own native "open checklist"
    // action (a direct tap on the card OR our injected "Check-up" button
    // re-firing card.click()) reliably tells us which machine is about to
    // be checked — capture phase so it fires before any child's
    // stopPropagation. This is far more reliable than trying to guess the
    // machine later from page text once the checklist form has opened.
    card.addEventListener("click", () => {
      try {
        sessionStorage.setItem("belm_current_checkup_machine_id", machine.id);
      } catch (_) {}
    }, true);
    const condition = technicianCondition(machine.status);
    const opStatus = String(machine.operationalStatus || machine.operational_status || "NORMAL").toUpperCase();
    const opLabels = {
      NORMAL: "Normal", SERVICE_IN_PROGRESS: "Service in progress", CHECKUP_IN_PROGRESS: "Check-up in progress",
      MAINTENANCE_IN_PROGRESS: "Maintenance in progress", GROUNDED: "Grounded (not operational)",
    };
    const details = document.createElement("div");
    details.className = "belm-technician-machine-info";
    details.innerHTML = `
      <div class="belm-technician-machine-data">
        <div><span>Brand</span><b>${escapeHtml(machine.brand || "Not recorded")}</b></div>
        <div><span>Machine Type</span><b>${escapeHtml(machine.machineType || machine.machine_type || "Not recorded")}</b></div>
        <div><span>Serial No.</span><b>${escapeHtml(machine.serialNumber || machine.serial_number || "Not recorded")}</b></div>
        <div><span>Registration</span><b>${escapeHtml(machine.regNumber || machine.reg_number || "Not recorded")}</b></div>
        <div><span>Service Kit</span><b>${escapeHtml(machine.serviceKit || machine.service_kit || "Not recorded")}</b></div>
        <div><span>Last Checked</span><b>${escapeHtml(machine.lastCheckedAt || machine.last_checked_at
          ? new Date(machine.lastCheckedAt || machine.last_checked_at).toLocaleDateString()
          : "Never checked")}</b></div>
      </div>
      <div class="belm-technician-machine-health status-${escapeHtml(condition.status.toLowerCase())}">
        <div><span>Machine Status</span><strong>${escapeHtml(condition.status)}</strong></div>
        <div><span>Condition</span><strong>${escapeHtml(condition.label)}</strong><small>${escapeHtml(condition.note)}</small></div>
      </div>
      <div class="belm-technician-op-status">
        <span>Activity status <small>(customer sees this update live)</small></span>
        <select data-belm-op-status="${escapeHtml(machine.id)}">
          ${Object.entries(opLabels).map(([value, label]) =>
            `<option value="${value}" ${value === opStatus ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>`;
    card.appendChild(details);
    // The whole card is itself a native button that opens the checklist
    // form on click. Without this, tapping our injected content (the
    // Activity Status dropdown especially) bubbles up and opens the
    // checklist by accident instead of doing what was actually tapped.
    details.addEventListener("click", (event) => event.stopPropagation());
    details.addEventListener("pointerdown", (event) => event.stopPropagation());
    details.querySelector("[data-belm-op-status]").addEventListener("change", async (event) => {
      const select = event.target;
      const token = localStorage.getItem("belm_tech_token");
      select.disabled = true;
      try {
        const response = await fetch(`/api/customers/machines/${machine.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ operationalStatus: select.value }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not update status.");
      } catch (error) {
        alert(error.message || "Could not update machine activity status.");
      } finally {
        select.disabled = false;
      }
    });
  }

  function closeTechnicianReportHistory() {
    document.getElementById("belmTechnicianReportHistory")?.remove();
  }

  function renderTechnicianReportHistory(machine, reports) {
    closeTechnicianReportHistory();
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
    const history = document.createElement("div");
    history.id = "belmTechnicianReportHistory";
    history.className = "belm-checked-report-modal";
    history.setAttribute("role", "dialog");
    history.setAttribute("aria-modal", "true");
    history.setAttribute("aria-labelledby", "belmTechnicianReportTitle");
    history.innerHTML = `<section class="belm-checked-report-card belm-report-history-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · completed inspections</p>
          <h2 id="belmTechnicianReportTitle">${escapeHtml(machineName)} — Checklist Reports</h2>
          <span>${escapeHtml(machine.machineType || machine.machine_type || "")} · ${escapeHtml(machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial recorded")}</span>
        </div>
        <button type="button" data-close-report-history aria-label="Close checklist reports">×</button>
      </header>
      <div class="belm-report-history-list">${reports.length ? reports.map((report) => {
        const reportStatus = String(report.overallStatus || report.overall_status || "GREEN").toUpperCase();
        const createdAt = report.createdAt || report.created_at;
        const editStatus = report.isExpired
          ? "Expired / No Edit"
          : report.canEdit
            ? `Editable until ${formatTanzaniaDateTime(report.expiresAt)}`
            : "Read-only";
        return `<article class="belm-report-history-item">
          <div>
            <strong>${escapeHtml(report.templateName || "Checked machine report")}</strong>
            <span>${escapeHtml(createdAt ? new Date(createdAt).toLocaleString() : "Date not recorded")}</span>
            <small>Technician: ${escapeHtml(report.filledBy || report.filled_by || "Not recorded")} · Hour meter: ${escapeHtml(report.hourMeterReading ?? report.hour_meter_reading ?? "—")} · ${escapeHtml(editStatus)}</small>
          </div>
          <span class="belm-report-status status-${escapeHtml(reportStatus.toLowerCase())}">${escapeHtml(reportStatus)}</span>
          <button type="button" data-view-technician-report="${escapeHtml(report.id)}">View Checked Report</button>
        </article>`;
      }).join("") : '<div class="belm-report-empty">No completed checklist reports found for this machine.</div>'}</div>
      <footer class="belm-checked-report-actions">
        <button type="button" class="primary" data-close-report-history>Close</button>
      </footer>
    </section>`;

    history.addEventListener("click", (event) => {
      if (event.target === history || event.target.closest("[data-close-report-history]")) {
        closeTechnicianReportHistory();
        return;
      }
      const viewButton = event.target.closest("[data-view-technician-report]");
      if (!viewButton) return;
      const report = reports.find((item) => String(item.id) === viewButton.dataset.viewTechnicianReport);
      if (!report) return;
      closeTechnicianReportHistory();
      renderCheckedReport(report);
    });
    document.body.appendChild(history);
    history.querySelector("[data-close-report-history]")?.focus();
  }

  async function openTechnicianReportHistory(machine, trigger) {
    const token = localStorage.getItem("belm_tech_token");
    if (!token) {
      window.location.href = "/tech";
      return;
    }
    const originalText = trigger.textContent;
    trigger.textContent = "Loading…";
    trigger.setAttribute("aria-disabled", "true");
    try {
      const response = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machine.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reports = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(reports.error || "Could not load checklist reports.");
      }
      renderTechnicianReportHistory(machine, Array.isArray(reports) ? reports : []);
    } catch (error) {
      alert(error.message || "Could not load checklist reports.");
    } finally {
      trigger.textContent = originalText;
      trigger.removeAttribute("aria-disabled");
    }
  }

  async function enhanceTechnicianReportCards() {
    if (!window.location.pathname.startsWith("/tech")) return;
    const customer = await loadTechnicianCustomerProfile();
    if (!customer) return;
    technicianCustomerInfoCard(customer);
    const machines = Array.isArray(customer.machines) ? customer.machines : [];
    if (!machines.length) return;
    const buttons = Array.from(document.querySelectorAll("button"));
    machines.forEach(machine => {
      const model = String(machine.model || "").trim();
      const serial = String(machine.serialNumber || machine.serial_number || "").trim();
      if (!model) return;
      const card = buttons.find(button => {
        if (button.dataset.belmTechnicianReportsReady === "1") return false;
        const text = button.textContent || "";
        return text.includes(model) && (!serial || text.includes(serial));
      });
      if (!card) return;

      card.dataset.belmTechnicianReportsReady = "1";
      card.classList.add("belm-technician-machine-card");
      card.classList.add(`status-${technicianCondition(machine.status).status.toLowerCase()}`);
      technicianMachineInfoCard(card, machine);
      technicianServiceDuePanel(card, machine);

      const actionsRow = document.createElement("div");
      actionsRow.className = "belm-technician-card-actions";

      const reportLink = document.createElement("span");
      reportLink.className = "belm-technician-report-link";
      reportLink.setAttribute("role", "button");
      reportLink.setAttribute("tabindex", "0");
      reportLink.textContent = "Checked Reports";
      reportLink.title = `View completed checklist reports for ${model}`;
      const openReports = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        openTechnicianReportHistory(machine, reportLink);
      };
      reportLink.addEventListener("click", openReports);
      reportLink.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") openReports(event);
      });

      // Explicit "Check-up" button — re-fires the card's own native click
      // (which is what already opens the checklist form) through a clear,
      // dedicated blue button instead of relying on tapping bare card
      // space, which now risks landing on the Activity Status dropdown
      // or the Checked Reports link instead.
      const checkupButton = document.createElement("button");
      checkupButton.type = "button";
      checkupButton.className = "belm-technician-checkup-button";
      checkupButton.textContent = "Check-up";
      checkupButton.title = `Start a check-up for ${model}`;
      checkupButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        card.click();
      });

      actionsRow.appendChild(reportLink);
      actionsRow.appendChild(checkupButton);
      card.appendChild(actionsRow);
    });
  }

  function renderSavedReportLoadError() {
    alert("Checklist was saved, but its Checked Report could not open automatically. Select Checked Reports on the machine card to view it.");
  }

  async function openSavedTechnicianReport(reportId, machineId, attempt = 0) {
    const token = localStorage.getItem("belm_tech_token");
    if (!token || !reportId || !machineId) return;
    try {
      const response = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machineId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reports = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(reports)) throw new Error("Checked Report unavailable.");
      const savedReport = reports.find((report) => String(report.id) === String(reportId));
      if (!savedReport) throw new Error("Saved report has not appeared yet.");
      renderCheckedReport(savedReport);
    } catch (_) {
      const retryDelays = [150, 350, 700, 1200];
      if (attempt < retryDelays.length) {
        window.setTimeout(
          () => openSavedTechnicianReport(reportId, machineId, attempt + 1),
          retryDelays[attempt]
        );
      } else {
        renderSavedReportLoadError();
      }
    }
  }

  function installTechnicianSavedReportViewer() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.documentElement.dataset.belmChecklistSaveViewer === "ready") return;
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype?.open || !Xhr?.prototype?.send) return;
    document.documentElement.dataset.belmChecklistSaveViewer = "ready";

    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function (method, url, ...rest) {
      let requestUrl = String(url || "");
      try {
        requestUrl = new URL(requestUrl, window.location.origin).pathname;
      } catch (_) {
        requestUrl = requestUrl.split("?")[0];
      }
      requestUrl = requestUrl.replace(/\/+$/, "");
      this.belmChecklistSaveRequest =
        String(method || "").toUpperCase() === "POST"
        && (requestUrl === "/api/checklist-reports" || requestUrl === "/checklist-reports");
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function (body) {
      if (this.belmChecklistSaveRequest) {
        let request = {};
        try {
          request = typeof body === "string" ? JSON.parse(body) : {};
        } catch (_) {}
        const machineId = request.machineId;
        this.addEventListener("loadend", () => {
          if (this.status < 200 || this.status >= 300) return;
          let saved = this.response && typeof this.response === "object"
            ? this.response
            : null;
          if (!saved) {
            try {
              const responseText = typeof this.response === "string"
                ? this.response
                : this.responseText;
              saved = JSON.parse(responseText || "{}");
            } catch (_) {
              saved = {};
            }
          }
          if (!saved?.id || !machineId) return;
          window.setTimeout(() => {
            if (saved.machine && Array.isArray(saved.answers)) {
              renderCheckedReport(saved);
            } else {
              openSavedTechnicianReport(saved.id, machineId);
            }
          }, 40);
        }, { once: true });
      }
      return originalSend.call(this, body);
    };
  }

  function redirectChecklistManager() {
    if (window.location.pathname === "/admin/checklist-templates") {
      window.location.replace("/checklist-manager/");
    }
  }

  function redirectServiceRequestManager() {
    if (window.location.pathname === "/admin/service-requests") {
      window.location.replace("/service-request-manager/");
    }
  }

  function redirectBillingManager() {
    if (window.location.pathname === "/admin/billing") {
      window.location.replace("/billing-manager/");
    }
  }

  function redirectCustomersManager() {
    if (window.location.pathname === "/admin/customers") {
      window.location.replace("/customers-manager/");
    }
  }

  function redirectSparePartsManager() {
    if (window.location.pathname === "/admin/spare-parts") {
      window.location.replace("/spare-parts-manager/");
    }
  }

  function redirectRolesManager() {
    if (window.location.pathname === "/admin/roles") {
      window.location.replace("/roles-manager/");
    }
  }

  function redirectSuppliersManager() {
    if (window.location.pathname === "/admin/suppliers") {
      window.location.replace("/suppliers-manager/");
    }
  }

  function redirectOverviewManager() {
    if (window.location.pathname === "/admin/overview") {
      window.location.replace("/overview-manager/");
    }
  }

  function redirectReportsManager() {
    if (window.location.pathname === "/admin/reports") {
      window.location.replace("/reports-manager/");
    }
  }

  function redirectSettingsManager() {
    if (window.location.pathname === "/admin/settings") {
      window.location.replace("/settings-manager/");
    }
  }

  function removeLegacyOwnerRole() {
    document.querySelectorAll('select option[value="owner"]').forEach((option) => {
      option.remove();
    });
  }

  const CHECKLIST_PHOTO_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
  const CHECKLIST_PHOTO_TARGET_BYTES = 450 * 1024;

  function dataUrlByteSize(dataUrl) {
    const encoded = String(dataUrl || "").split(",")[1] || "";
    return Math.ceil(encoded.length * 3 / 4);
  }

  function loadChecklistPhoto(file) {
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

  async function compressChecklistPhoto(file) {
    if (!file || !String(file.type || "").startsWith("image/")) {
      throw new Error("Select an image file.");
    }
    if (file.size > CHECKLIST_PHOTO_MAX_SOURCE_BYTES) {
      throw new Error("Photo is above 12 MB. Select a smaller photo.");
    }

    const image = await loadChecklistPhoto(file);
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
      if (dataUrlByteSize(compressed) <= CHECKLIST_PHOTO_TARGET_BYTES) break;
      if (quality > 0.42) {
        quality -= 0.08;
      } else {
        scale *= 0.78;
        quality = 0.56;
      }
    }

    const compressedBytes = dataUrlByteSize(compressed);
    if (!compressed || compressedBytes > 500 * 1024) {
      throw new Error("Photo could not be reduced enough. Crop it or select a smaller photo.");
    }
    return {
      dataUrl: compressed,
      originalBytes: file.size,
      compressedBytes,
    };
  }

  function setChecklistPhotoValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function improvePhotoInputs() {
    document.querySelectorAll(
      'input[placeholder="Photo upload — wire up file input for production"], input[data-checklist-photo="1"]'
    ).forEach((input) => {
      if (
        input.dataset.belmPhotoUploader === "ready"
        && input.parentElement?.querySelector(".belm-checklist-photo-uploader")
      ) return;

      input.dataset.belmPhotoUploader = "ready";
      const wasRequired = input.required;
      const existingPhoto = String(input.value || "").trim();
      input.required = false;
      input.hidden = true;
      input.tabIndex = -1;

      const uploader = document.createElement("div");
      uploader.className = "belm-checklist-photo-uploader";
      uploader.innerHTML = `
        <label class="belm-checklist-photo-picker">
          <span>Upload low-MB photo</span>
          <small>JPG, PNG or WEBP · compressed automatically below about 0.5 MB</small>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />
        </label>
        <div class="belm-checklist-photo-preview"${existingPhoto ? "" : " hidden"}>
          <img alt="Checklist photo preview" />
          <span>${existingPhoto ? "Existing photo ready. Select another photo to replace it." : ""}</span>
        </div>
        <p class="belm-checklist-photo-error" role="alert" hidden></p>`;
      input.insertAdjacentElement("afterend", uploader);

      const fileInput = uploader.querySelector('input[type="file"]');
      const preview = uploader.querySelector(".belm-checklist-photo-preview");
      const previewImage = preview.querySelector("img");
      const previewText = preview.querySelector("span");
      const errorBox = uploader.querySelector(".belm-checklist-photo-error");
      fileInput.required = wasRequired && !existingPhoto;
      if (existingPhoto && safeReportPhotoUrl(existingPhoto)) previewImage.src = existingPhoto;

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileInput.disabled = true;
        errorBox.hidden = true;
        preview.hidden = false;
        previewImage.removeAttribute("src");
        previewText.textContent = "Compressing photo…";
        try {
          const result = await compressChecklistPhoto(file);
          setChecklistPhotoValue(input, result.dataUrl);
          fileInput.required = false;
          previewImage.src = result.dataUrl;
          previewText.textContent = `Ready · ${(result.originalBytes / 1024 / 1024).toFixed(2)} MB reduced to ${Math.ceil(result.compressedBytes / 1024)} KB`;
        } catch (error) {
          setChecklistPhotoValue(input, "");
          fileInput.value = "";
          fileInput.required = wasRequired;
          preview.hidden = true;
          errorBox.textContent = error.message || "Photo could not be prepared.";
          errorBox.hidden = false;
        } finally {
          fileInput.disabled = false;
        }
      });
    });
  }

  function enforceViewerInterface() {
    const payload = tokenPayload("belm_customer_token");
    if (!payload || String(payload.customerRole || "").toLowerCase() !== "viewer") return;

    document.querySelectorAll("button").forEach((button) => {
      const text = (button.textContent || "").trim().toLowerCase();
      if (text.includes("request service") || (text === "cancel" && button.classList.contains("text-red-600"))) {
        button.hidden = true;
        button.disabled = true;
      }
    });
  }

  function correctLegacyCopy() {
    if (window.location.pathname === "/admin/activity-log") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("needs a dedicated /api/activity-log")) {
          paragraph.textContent = "Shows the latest checklist submissions recorded by BELM Technicians.";
        }
      });
    }

    if (window.location.pathname === "/admin/suppliers") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("static-hosted frontend")) {
          paragraph.textContent = "Use these shortcuts to search public supplier, datasheet and parts-diagram sources, then save verified supplier details below.";
        }
      });
    }

    if (window.location.pathname === "/admin/roles/recycle-bin") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("purged automatically")) {
          paragraph.textContent = "Deleted items remain here until a Super Admin restores or permanently deletes them.";
        }
      });
      document.querySelectorAll("th").forEach((heading) => {
        if ((heading.textContent || "").trim() === "Days left") heading.textContent = "Retention";
      });
      document.querySelectorAll("tbody td").forEach((cell) => {
        if (/^\d+\s+day\(s\)$/.test((cell.textContent || "").trim())) cell.textContent = "Manual";
      });

      let adminRole = "";
      try {
        adminRole = JSON.parse(localStorage.getItem("belm_admin_user") || "{}").role || "";
      } catch (_) {}
      if (adminRole !== "Super Admin") {
        document.querySelectorAll("tbody button").forEach((button) => {
          button.hidden = true;
          button.disabled = true;
        });
      }
    }
  }

  function safeReportPhotoUrl(value) {
    const photoUrl = String(value || "").trim();
    if (!photoUrl) return "";
    if (
      photoUrl.length <= 700000
      && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(photoUrl)
    ) return photoUrl;
    if (photoUrl.startsWith("/")) return photoUrl;
    try {
      const parsed = new URL(photoUrl);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function closeCheckedReport() {
    document.getElementById("belmCheckedReportModal")?.remove();
  }

  function formatTanzaniaDateTime(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")}, ${get("hour")}:${get("minute")}`;
  }

  function formatTanzaniaDate(value) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Dar_es_Salaam",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")}`;
  }

  function checklistEditControl(answer, index) {
    const inputType = String(answer.inputType || answer.input_type || "TEXT").toUpperCase();
    const value = String(answer.value ?? "");
    const options = Array.isArray(answer.options) ? answer.options.map(String) : [];
    const required = answer.isRequired || answer.is_required ? " required" : "";
    const inputId = `belmChecklistAnswer${index}`;
    const common = `id="${inputId}" data-checklist-answer="${index}"${required}`;

    if (inputType === "DROPDOWN" || inputType === "YES_NO") {
      const selectOptions = options.length ? options : (inputType === "YES_NO" ? ["Yes", "No"] : []);
      if (value && !selectOptions.includes(value)) selectOptions.unshift(value);
      return `<select ${common}>
        <option value="">Select result</option>
        ${selectOptions.map((option) => `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>`;
    }
    if (inputType === "NUMBER") {
      return `<input ${common} type="number" step="any" value="${escapeHtml(value)}" />`;
    }
    if (inputType === "DATE") {
      return `<input ${common} type="date" value="${escapeHtml(value)}" />`;
    }
    if (inputType === "PHOTO") {
      const photoValue = answer.photoUrl || answer.photo_url || value;
      return `<input ${common} type="text" value="${escapeHtml(photoValue)}"
        data-checklist-photo="1" placeholder="Photo upload — wire up file input for production" />`;
    }
    return `<input ${common} type="text" value="${escapeHtml(value)}" />`;
  }

  function renderChecklistEdit(report) {
    if (!report.canEdit || report.isExpired) {
      renderCheckedReport({ ...report, canEdit: false, isExpired: true });
      return;
    }

    closeCheckedReport();
    const machine = report.machine || {};
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ")
      || report.machineModel
      || "Machine";
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const modal = document.createElement("div");
    modal.id = "belmCheckedReportModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmChecklistEditTitle");
    modal.innerHTML = `<section class="belm-checked-report-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · same-day correction</p>
          <h2 id="belmChecklistEditTitle">Edit ${escapeHtml(machineName)} Checklist</h2>
          <span>Editable until ${escapeHtml(formatTanzaniaDateTime(report.expiresAt))} Tanzania time</span>
        </div>
        <button type="button" data-cancel-checklist-edit aria-label="Cancel checklist editing">×</button>
      </header>
      <form class="belm-checklist-edit-form">
        <div class="belm-checklist-edit-deadline">
          <strong>Editing closes automatically at 00:00</strong>
          <span>After this deadline the checklist becomes Expired / No Edit.</span>
        </div>
        <label class="belm-checklist-edit-meter">
          <span>Hour meter reading</span>
          <input name="hourMeterReading" type="number" min="0" step="any"
            value="${escapeHtml(report.hourMeterReading ?? report.hour_meter_reading ?? "")}" required />
        </label>
        <div class="belm-checklist-edit-items">${answers.length ? answers.map((answer, index) => `
          <label class="belm-checklist-edit-item" for="belmChecklistAnswer${index}">
            <span>${escapeHtml(answer.label || "Checklist item")}${answer.isRequired || answer.is_required ? " *" : ""}</span>
            ${checklistEditControl(answer, index)}
          </label>`).join("") : '<div class="belm-report-empty">No checklist items are available to edit.</div>'}</div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-cancel-checklist-edit>Cancel</button>
          <button type="submit" class="primary">Save Changes</button>
        </footer>
      </form>
    </section>`;

    const cancel = () => renderCheckedReport(report);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-cancel-checklist-edit]")) cancel();
    });
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }

      const payloadAnswers = answers.map((answer, index) => {
        const input = form.querySelector(`[data-checklist-answer="${index}"]`);
        const inputType = String(answer.inputType || answer.input_type || "TEXT").toUpperCase();
        const inputValue = String(input?.value ?? "").trim();
        return {
          templateItemId: answer.templateItemId || answer.template_item_id,
          label: answer.label || "Checklist item",
          value: inputType === "PHOTO" ? "" : inputValue,
          photoUrl: inputType === "PHOTO"
            ? inputValue
            : (answer.photoUrl || answer.photo_url || null),
        };
      });

      submit.disabled = true;
      submit.textContent = "Saving…";
      errorBox.hidden = true;
      try {
        const response = await fetch(`/api/checklist-reports/${encodeURIComponent(report.id)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            hourMeterReading: form.elements.hourMeterReading.value,
            answers: payloadAnswers,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 409) {
            report.canEdit = false;
            report.isExpired = true;
          }
          throw new Error(result.error || "Checklist changes could not be saved.");
        }

        const machineId = report.machineId || report.machine_id || machine.id;
        const refreshed = await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reports = await refreshed.json().catch(() => []);
        if (!refreshed.ok) throw new Error(reports.error || "Saved checklist could not be reloaded.");
        const updated = Array.isArray(reports)
          ? reports.find((item) => String(item.id) === String(report.id))
          : null;
        renderCheckedReport(updated || { ...report, ...result });
      } catch (error) {
        errorBox.textContent = error.message || "Checklist changes could not be saved.";
        errorBox.hidden = false;
        if (report.isExpired) {
          form.querySelectorAll("input, select").forEach((input) => {
            input.disabled = true;
          });
          submit.disabled = true;
          submit.textContent = "Expired / No Edit";
        } else {
          submit.disabled = false;
          submit.textContent = "Save Changes";
        }
      }
    });
    document.body.appendChild(modal);
    improvePhotoInputs();
    modal.querySelector('[name="hourMeterReading"]')?.focus();
  }

  function renderCheckedReport(report) {
    closeCheckedReport();
    const machine = report.machine || {};
    const machineName = [machine.brand, machine.model].filter(Boolean).join(" ")
      || report.machineModel
      || "Machine";
    const serialReference = machine.serialNumber || machine.regNumber || "Not recorded";
    const status = String(report.overallStatus || report.overall_status || "GREEN").toUpperCase();
    const answers = Array.isArray(report.answers) ? report.answers : [];
    const createdAt = report.createdAt || report.created_at;
    const formattedDate = createdAt ? formatTanzaniaDateTime(createdAt) : "Not recorded";
    const filledBy = report.filledBy || report.filled_by || "Not recorded";
    const hourMeter = report.hourMeterReading ?? report.hour_meter_reading ?? "Not recorded";
    const editState = report.isExpired
      ? "Expired / No Edit"
      : report.canEdit
        ? `Editable until ${formatTanzaniaDateTime(report.expiresAt)}`
        : "Read-only";
    const editStateClass = report.isExpired ? "expired" : report.canEdit ? "editable" : "readonly";
    const displayPhotoUrl = String(report.displayPhotoUrl || report.display_photo_url || "").trim();

    const modal = document.createElement("div");
    modal.id = "belmCheckedReportModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmCheckedReportTitle");
    modal.innerHTML = `<section class="belm-checked-report-card">
      <header class="belm-checked-report-head">
        <div>
          <p>Completed machine inspection</p>
          <h2 id="belmCheckedReportTitle">${report.customerName ? `${escapeHtml(report.customerName.toUpperCase())} — ` : ""}${escapeHtml(machineName)} Checked Report</h2>
          <span>${escapeHtml(report.customerName || "")}${report.customerName ? " · " : ""}${escapeHtml(report.templateName || "Checklist report")}</span>
        </div>
        <button type="button" data-close-checked-report aria-label="Close checked report">×</button>
      </header>
      <div class="belm-checked-report-summary">
        <div><span>Overall status</span><strong class="status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</strong></div>
        <div><span>Checked by</span><strong>${escapeHtml(filledBy)}</strong></div>
        <div><span>Date checked</span><strong>${escapeHtml(formattedDate)}</strong></div>
        <div><span>Last updated</span><strong>${report.updatedAt ? escapeHtml(formatTanzaniaDateTime(report.updatedAt)) : "—"}</strong></div>
        <div><span>Hour meter</span><strong>${escapeHtml(hourMeter)}</strong></div>
        <div><span>Machine type</span><strong>${escapeHtml(machine.machineType || "Not recorded")}</strong></div>
        <div><span>Serial / registration</span><strong>${escapeHtml(serialReference)}</strong></div>
        <div><span>Edit status</span><strong class="belm-edit-state ${editStateClass}">${escapeHtml(editState)}</strong></div>
        ${displayPhotoUrl ? `<div class="belm-checked-report-display-photo-cell"><span>Display photo</span><img src="${escapeHtml(displayPhotoUrl)}" alt="Display photo" class="belm-checked-report-display-photo" data-view-report-photo="${escapeHtml(displayPhotoUrl)}"></div>` : ""}
      </div>
      <div class="belm-checked-report-table-wrap">
        <table class="belm-checked-report-table">
          <thead><tr><th>Checked item</th><th>Recorded result</th><th>Status</th><th>Evidence</th></tr></thead>
          <tbody>${answers.length ? answers.map((answer, answerIndex) => {
            const answerStatus = String(answer.safetyLevel || answer.safety_level || "GREEN").toUpperCase();
            const photoUrl = safeReportPhotoUrl(answer.photoUrl || answer.photo_url);
            const rawValue = String(answer.value ?? "");
            const valueAsPhoto = /^data:image\//i.test(rawValue) ? safeReportPhotoUrl(rawValue) : "";
            const resultCell = valueAsPhoto
              ? `<img src="${escapeHtml(valueAsPhoto)}" alt="Photo for ${escapeHtml(answer.label || "checklist item")}" loading="lazy" class="belm-report-photo-thumb" data-view-report-photo="${escapeHtml(valueAsPhoto)}">`
              : `<strong>${escapeHtml(rawValue || "—")}</strong>`;
            return `<tr>
              <td>${answerIndex + 1}. ${escapeHtml(answer.label || "Checklist item")}</td>
              <td>${resultCell}${String(answer.note || "").trim() ? `<div class="belm-report-issue-note">Issue: ${escapeHtml(String(answer.note).trim())}</div>` : ""}</td>
              <td>${answerStatus === "NONE" ? "—" : `<span class="belm-report-status status-${escapeHtml(answerStatus.toLowerCase())}">${escapeHtml(answerStatus)}</span>`}</td>
              <td class="belm-report-evidence">${photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="Evidence photo for ${escapeHtml(answer.label || "checklist item")}" loading="lazy" class="belm-report-photo-thumb" data-view-report-photo="${escapeHtml(photoUrl)}">` : "—"}</td>
            </tr>`;
          }).join("") : '<tr><td colspan="4" class="belm-report-empty">No checked answers were recorded.</td></tr>'}</tbody>
        </table>
      </div>
      <footer class="belm-checked-report-actions">
        <button type="button" data-print-checked-report>Print Report</button>
        <a href="/api/customer-portal/reports/${escapeHtml(report.id)}/download" data-checked-report-download>Download</a>
        ${report.canEdit && !report.isExpired ? '<button type="button" data-edit-checked-report>Edit Checklist</button>' : ""}
        <button type="button" class="primary" data-close-checked-report>Close</button>
      </footer>
    </section>`;

    modal.addEventListener("click", (event) => {
      const photoThumb = event.target.closest("[data-view-report-photo]");
      if (photoThumb) {
        openReportPhotoLightbox(photoThumb.dataset.viewReportPhoto);
        return;
      }
      if (event.target === modal || event.target.closest("[data-close-checked-report]")) {
        closeCheckedReport();
      }
      if (event.target.closest("[data-print-checked-report]")) window.print();
      if (event.target.closest("[data-edit-checked-report]")) renderChecklistEdit(report);
    });
    document.body.appendChild(modal);
    modal.querySelector("[data-close-checked-report]")?.focus();
  }

  // In-page lightbox for evidence/displayer photos. Chrome (and some
  // other browsers) blocks top-level navigation to large data: URLs
  // opened via target="_blank" and silently downloads the file instead
  // of showing it — this avoids that entirely by never navigating.
  function openReportPhotoLightbox(photoUrl) {
    let overlay = document.getElementById("belmReportPhotoLightbox");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "belmReportPhotoLightbox";
      overlay.className = "belm-report-photo-lightbox";
      overlay.innerHTML = `
        <button type="button" class="belm-report-photo-lightbox-close" aria-label="Close">×</button>
        <img alt="Photo — full size">`;
      document.body.appendChild(overlay);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest(".belm-report-photo-lightbox-close")) {
          overlay.classList.remove("open");
        }
      });
    }
    overlay.querySelector("img").src = photoUrl;
    overlay.classList.add("open");
  }

  function enhanceCheckedReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    // De-duplicate first: if the underlying app re-renders a download
    // link without fully removing our previously-inserted button, two
    // "View Checked Report" buttons can end up pointing at the same
    // report. Keep only one per unique report URL.
    const seenReportUrls = new Set();
    document.querySelectorAll(".belm-view-checked-report").forEach((button) => {
      const url = button.dataset.reportUrl;
      if (seenReportUrls.has(url)) {
        button.remove();
      } else {
        seenReportUrls.add(url);
      }
    });
    document.querySelectorAll('a[href^="/api/customer-portal/reports/"][href$="/download"]').forEach((downloadLink) => {
      const reportUrl = downloadLink.getAttribute("href").replace(/\/download$/, "/view");
      if (seenReportUrls.has(reportUrl)) return;
      if (downloadLink.parentElement?.querySelector(".belm-view-checked-report")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "belm-view-checked-report";
      button.dataset.reportUrl = reportUrl;
      button.textContent = "View Checked Report";
      downloadLink.parentElement?.insertBefore(button, downloadLink);
      seenReportUrls.add(reportUrl);
    });
  }

  function installCheckedReportViewer() {
    if (document.documentElement.dataset.belmCheckedReportViewer === "ready") return;
    document.documentElement.dataset.belmCheckedReportViewer = "ready";
    document.addEventListener("click", async (event) => {
      const button = event.target.closest(".belm-view-checked-report");
      if (!button) return;
      event.preventDefault();
      const token = localStorage.getItem("belm_customer_token");
      if (!token) {
        window.location.href = "/portal/login";
        return;
      }
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading report…";
      try {
        const response = await fetch(button.dataset.reportUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const report = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(report.error || "Could not load the checked report.");
        renderCheckedReport(report);
      } catch (error) {
        alert(error.message || "Could not load the checked report.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }, true);
  }

  function installAuthenticatedReportDownloads() {
    if (document.documentElement.dataset.belmReportDownload === "ready") return;
    document.documentElement.dataset.belmReportDownload = "ready";

    document.addEventListener("click", async (event) => {
      const link = event.target.closest('a[href^="/api/customer-portal/reports/"][href$="/download"]');
      if (!link) return;
      event.preventDefault();

      const token = localStorage.getItem("belm_customer_token");
      if (!token) {
        window.location.href = "/portal/login";
        return;
      }

      const originalText = link.textContent;
      link.textContent = "Downloading...";
      link.style.pointerEvents = "none";

      try {
        const response = await fetch(link.getAttribute("href"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          let message = "Could not download this report.";
          try {
            const error = await response.json();
            message = error.error || message;
          } catch (_) {}
          throw new Error(message);
        }

        const blob = await response.blob();
        const reportId = (link.getAttribute("href").match(/reports\/([^/]+)\/download/) || [])[1] || "report";
        const disposition = response.headers.get("Content-Disposition") || "";
        const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = filenameMatch ? filenameMatch[1] : `BELM-checklist-${reportId}.pdf`;
        document.body.appendChild(download);
        download.click();
        download.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        alert(error.message || "Could not download this report.");
      } finally {
        link.textContent = originalText;
        link.style.pointerEvents = "";
      }
    }, true);
  }

  async function addTechnicianTasksShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-tasks-shortcut")) return;

    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const link = document.createElement("a");
    link.id = "belm-tech-tasks-shortcut";
    link.href = "/technician-tasks/";
    link.textContent = "My Tasks";
    Object.assign(link.style, {
      position: "fixed",
      right: "20px",
      bottom: "82px",
      zIndex: "1000",
      padding: "12px 18px",
      borderRadius: "999px",
      background: "#00aa5b",
      color: "#fff",
      fontWeight: "800",
      textDecoration: "none",
      boxShadow: "0 12px 30px rgba(0, 170, 91, .30)",
      border: "2px solid #f4cf00",
    });
    document.body.appendChild(link);

    try {
      const response = await fetch(`/api/tasks/user/${encodeURIComponent(payload.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const tasks = await response.json();
      const pending = Array.isArray(tasks)
        ? tasks.filter((task) => task.status !== "DONE").length
        : 0;
      if (pending > 0) link.textContent = `My Tasks (${pending})`;
    } catch (_) {}
  }

  function closeTechnicianSpareRequest() {
    document.getElementById("belmTechnicianSpareModal")?.remove();
  }

  function renderTechnicianSpareRequest(machines) {
    closeTechnicianSpareRequest();
    const modal = document.createElement("div");
    modal.id = "belmTechnicianSpareModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmTechnicianSpareTitle");
    modal.innerHTML = `<section class="belm-checked-report-card belm-technician-spare-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · Inventory request</p>
          <h2 id="belmTechnicianSpareTitle">Add Spare</h2>
          <span>Send a zero-stock spare alert to Spare Parts Inventory.</span>
        </div>
        <button type="button" data-close-tech-spare aria-label="Close Add Spare">×</button>
      </header>
      <form class="belm-technician-spare-form">
        <div class="belm-technician-spare-grid">
          <label>
            <span>Machine</span>
            <select name="machineId" required>
              ${machines.map((machine) => {
                const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
                const reference = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial";
                return `<option value="${escapeHtml(machine.id)}">${escapeHtml(machineName)} · ${escapeHtml(reference)}</option>`;
              }).join("")}
            </select>
          </label>
          <label>
            <span>Machine type</span>
            <input name="machineType" type="text" readonly required />
          </label>
          <label>
            <span>Part number</span>
            <input name="partNumber" type="text" maxlength="100" placeholder="e.g. CAT-1R-1808" required />
          </label>
          <label class="full">
            <span>Description</span>
            <textarea name="description" rows="4" maxlength="500" placeholder="Describe the spare part and where it is required" required></textarea>
          </label>
        </div>
        <div class="belm-technician-spare-note">
          <strong>Inventory stock will start at 0.</strong>
          <span>Inventory staff will receive an alert to add the spare or mark it Purchase Required.</span>
        </div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <p class="belm-technician-spare-success" role="status" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-close-tech-spare>Cancel</button>
          <button type="button" data-new-tech-spare hidden>New Request</button>
          <button type="submit" class="primary">Send to Spare Parts Inventory</button>
        </footer>
      </form>
      <section class="belm-technician-request-history" aria-labelledby="belmTechnicianRequestHistoryTitle">
        <div class="belm-technician-request-history-head">
          <div>
            <span>Submitted by this Technician</span>
            <h3 id="belmTechnicianRequestHistoryTitle">My Inventory Requests</h3>
          </div>
          <button type="button" data-refresh-tech-spares>Refresh</button>
        </div>
        <div class="belm-technician-request-list" data-tech-spare-list>
          <div class="belm-report-empty">Loading Inventory Requests…</div>
        </div>
      </section>
    </section>`;

    const form = modal.querySelector("form");
    const machineSelect = form.elements.machineId;
    const machineTypeInput = form.elements.machineType;
    const title = modal.querySelector("#belmTechnicianSpareTitle");
    const headerDescription = title.nextElementSibling;
    const submit = form.querySelector('button[type="submit"]');
    const newRequestButton = form.querySelector("[data-new-tech-spare]");
    const requestList = modal.querySelector("[data-tech-spare-list]");
    let editingRequestId = "";
    let loadedRequests = [];
    const syncMachineType = () => {
      const selected = machines.find((machine) => String(machine.id) === machineSelect.value);
      machineTypeInput.value = selected?.machineType || selected?.machine_type || "";
    };
    const resetRequestForm = () => {
      editingRequestId = "";
      form.reset();
      if (machines[0]) machineSelect.value = String(machines[0].id);
      syncMachineType();
      title.textContent = "Add Spare";
      headerDescription.textContent = "Send a zero-stock spare alert to Spare Parts Inventory.";
      submit.textContent = "Send to Spare Parts Inventory";
      newRequestButton.hidden = true;
      form.querySelector(".belm-checklist-edit-error").hidden = true;
    };
    const editRequest = (request) => {
      editingRequestId = String(request.id);
      machineSelect.value = String(request.machineId || "");
      syncMachineType();
      form.elements.partNumber.value = request.partNumber || "";
      form.elements.description.value = request.description || request.partName || "";
      title.textContent = "Re-edit Inventory Request";
      headerDescription.textContent = "Correct this pending request and send the updated information to Inventory.";
      submit.textContent = "Update Inventory Request";
      newRequestButton.hidden = false;
      form.querySelector(".belm-technician-spare-success").hidden = true;
      form.elements.partNumber.focus();
    };
    const renderRequests = (requests) => {
      loadedRequests = Array.isArray(requests) ? requests : [];
      requestList.innerHTML = loadedRequests.length ? loadedRequests.map((request) => {
        const status = String(request.status || "PENDING").toUpperCase();
        const machineName = [request.machineBrand, request.machineModel].filter(Boolean).join(" ")
          || request.machineModel
          || "Machine";
        return `<article class="belm-technician-request-item">
          <div class="belm-technician-request-copy">
            <strong>${escapeHtml(request.partNumber || "No part number")}</strong>
            <span>${escapeHtml(request.description || request.partName || "No description")}</span>
            <small>${escapeHtml(machineName)} · ${escapeHtml(request.machineType || "Machine type not recorded")} · ${escapeHtml(request.customerName || "")}</small>
            <time>${escapeHtml(request.createdAt ? new Date(request.createdAt).toLocaleString() : "Date not recorded")}</time>
          </div>
          <span class="belm-technician-request-status status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status.replaceAll("_", " "))}</span>
          ${status === "PENDING"
            ? `<button type="button" data-reedit-tech-spare="${escapeHtml(request.id)}">Re-edit</button>`
            : '<span class="belm-technician-request-locked">Inventory action started · No edit</span>'}
        </article>`;
      }).join("") : '<div class="belm-report-empty">No Inventory Requests sent yet.</div>';
    };
    const loadRequests = async () => {
      const token = localStorage.getItem("belm_tech_token");
      if (!token) return;
      requestList.innerHTML = '<div class="belm-report-empty">Loading Inventory Requests…</div>';
      try {
        const response = await fetch("/api/spare-parts/requests", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const requests = await response.json().catch(() => []);
        if (!response.ok) throw new Error(requests.error || "Inventory Requests could not be loaded.");
        renderRequests(requests);
      } catch (error) {
        requestList.innerHTML = `<div class="belm-checklist-edit-error">${escapeHtml(error.message || "Inventory Requests could not be loaded.")}</div>`;
      }
    };
    syncMachineType();
    machineSelect.addEventListener("change", syncMachineType);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-tech-spare]")) {
        closeTechnicianSpareRequest();
        return;
      }
      if (event.target.closest("[data-new-tech-spare]")) resetRequestForm();
      if (event.target.closest("[data-refresh-tech-spares]")) loadRequests();
      const editButton = event.target.closest("[data-reedit-tech-spare]");
      if (!editButton) return;
      const request = loadedRequests.find(item =>
        String(item.id) === String(editButton.dataset.reeditTechSpare)
      );
      if (request) editRequest(request);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const successBox = form.querySelector(".belm-technician-spare-success");
      submit.disabled = true;
      submit.textContent = editingRequestId ? "Updating…" : "Sending…";
      errorBox.hidden = true;
      successBox.hidden = true;
      try {
        const response = await fetch(
          editingRequestId
            ? `/api/spare-parts/requests/${encodeURIComponent(editingRequestId)}`
            : "/api/spare-parts/requests",
          {
          method: editingRequestId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: editingRequestId ? "edit" : undefined,
            machineId: machineSelect.value,
            machineType: machineTypeInput.value,
            partNumber: form.elements.partNumber.value.trim(),
            description: form.elements.description.value.trim(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Spare request could not be sent.");
        successBox.textContent = result.message || "Spare request sent to Inventory.";
        successBox.hidden = false;
        resetRequestForm();
        successBox.hidden = false;
        successBox.textContent = result.message || "Inventory Request saved.";
        await loadRequests();
        form.elements.partNumber.focus();
      } catch (error) {
        errorBox.textContent = error.message || "Spare request could not be sent.";
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = editingRequestId
          ? "Update Inventory Request"
          : "Send to Spare Parts Inventory";
      }
    });
    document.body.appendChild(modal);
    loadRequests();
    form.elements.partNumber.focus();
  }

  const SPARE_RECOMMENDATION_SYSTEMS = [
    ["ENGINE", "Engine"],
    ["TRANSMISSION", "Transmission / Gearbox"],
    ["BRAKE_SYSTEM", "Brake System"],
    ["HYDRAULIC_SYSTEM", "Hydraulic System"],
    ["ELECTRICAL_SYSTEM", "Electrical System"],
    ["OTHER", "Other"],
  ];

  const SERVICE_DAY_TYPES = [
    ["250_HOUR", "250-Hour Service"],
    ["500_HOUR", "500-Hour Service"],
    ["1000_HOUR", "1000-Hour Service"],
    ["2000_HOUR", "2000-Hour Service"],
  ];

  function injectServiceDayFields() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.getElementById("belmServiceDayBlock")) return;

    const label = Array.from(document.querySelectorAll("label"))
      .find(element => (element.textContent || "").trim().toLowerCase().startsWith("hour meter reading"));
    if (!label) return;
    const anchor = label.closest("label") || label;
    const host = anchor.parentElement;
    if (!host) return;

    // The machine being checked is known for certain from the moment the
    // Technician tapped into it (see technicianMachineInfoCard's capture
    // listener). Fall back to matching the page's visible heading text
    // only if that wasn't captured for some reason.
    (async () => {
      try {
        let matchedMachineId = null;
        try { matchedMachineId = sessionStorage.getItem("belm_current_checkup_machine_id"); } catch (_) {}

        if (!matchedMachineId) {
          const machines = await loadTechnicianReportMachines();
          const pageText = document.body.innerText || "";
          const match = (machines || []).find(machine => {
            const name = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType;
            return name && pageText.includes(name);
          });
          matchedMachineId = match?.id || null;
        }
        if (!matchedMachineId) return;

        const token = localStorage.getItem("belm_tech_token");
        const response = await fetch(`/api/checklist-reports?action=service-status&machineId=${encodeURIComponent(matchedMachineId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const status = await response.json();
        const hint = document.getElementById("belmLastHourMeterHint");
        const remaining = Math.round(status?.hoursRemaining ?? 0);
        const dueText = status?.level === "RED" ? " — Service due now" : status?.level === "YELLOW" ? " — Service due soon" : "";
        if (hint) {
          hint.textContent = `Last recorded: ${Number(status?.totalHours || 0).toLocaleString("en-TZ")} hrs — today's reading must be the same or higher.${dueText}`;
        }
        // Pre-select the matching Service Type (e.g. "500-Hour Service")
        // from the same NEXT SERVICE panel shown on the machine card —
        // the Technician shouldn't have to work out which interval is due
        // by hand when the system already knows.
        const intervalHours = Number(status?.intervalHours || 0);
        if (intervalHours > 0) {
          const serviceTypeSelect = document.getElementById("belmServiceType");
          const matchingValue = `${intervalHours}_HOUR`;
          if (serviceTypeSelect && [...serviceTypeSelect.options].some(option => option.value === matchingValue)) {
            serviceTypeSelect.value = matchingValue;
          }
          // If service is due now or soon, default "Is this a service day?"
          // to checked — the Technician can still uncheck it if this visit
          // is just a routine check-up, not the actual service.
          if (["RED", "YELLOW"].includes(status?.level) && !document.getElementById("belmIsServiceDay").checked) {
            document.getElementById("belmIsServiceDay").checked = true;
            document.getElementById("belmServiceDayFields").classList.remove("hidden");
          }
        }
      } catch (_) { /* purely a helper hint — safe to skip on any failure */ }
    })();

    const block = document.createElement("div");
    block.id = "belmServiceDayBlock";
    block.className = "belm-service-day-block";
    block.innerHTML = `
      <p id="belmLastHourMeterHint" class="belm-last-hour-meter-hint">Loading last recorded hours…</p>
      <label class="belm-service-day-toggle">
        <input type="checkbox" id="belmIsServiceDay">
        Is this a service day?
      </label>
      <div id="belmServiceDayFields" class="belm-service-day-fields hidden">
        <label>Service date<input type="date" id="belmServiceDate"></label>
        <label>Service type
          <select id="belmServiceType">
            <option value="">Select service type</option>
            ${SERVICE_DAY_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="belm-display-photo-field">Display photo <span style="color:#ff8a80;font-weight:900">*</span> <small>(REQUIRED every check-up — photo of the machine's display screen showing fuel level, fault codes, etc.)</small>
        <input type="file" id="belmDisplayPhotoFile" accept="image/*" capture="environment">
        <img id="belmDisplayPhotoPreview" class="belm-display-photo-preview hidden" alt="Display photo preview">
      </label>`;
    anchor.insertAdjacentElement("afterend", block);

    document.getElementById("belmServiceDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("belmIsServiceDay").addEventListener("change", (event) => {
      document.getElementById("belmServiceDayFields").classList.toggle("hidden", !event.target.checked);
    });
    document.getElementById("belmDisplayPhotoFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressPhotoToDataUrl(file);
        block.dataset.displayPhoto = dataUrl;
        const preview = document.getElementById("belmDisplayPhotoPreview");
        preview.src = dataUrl;
        preview.classList.remove("hidden");
      } catch (error) {
        alert(error.message || "Could not prepare that photo.");
        event.target.value = "";
      }
    });
  }

  // Compresses an image file to a small JPEG data URL — shared logic so the
  // "Display photo" field stays lightweight like every other checklist
  // photo capture in this app, regardless of the source camera's resolution.
  function compressPhotoToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        reject(new Error("Select an image file."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that photo."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not read that photo."));
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
          const scale = Math.min(1, 1280 / Math.max(1, longestSide));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.68));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function installServiceDayInjector() {
    if (!window.location.pathname.startsWith("/tech")) return;
    if (document.documentElement.dataset.belmServiceDaySync === "ready") return;
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype?.send) return;
    document.documentElement.dataset.belmServiceDaySync = "ready";

    const previousSend = Xhr.prototype.send;
    Xhr.prototype.send = function (body) {
      if (this.belmChecklistSaveRequest) {
        const isServiceDay = document.getElementById("belmIsServiceDay")?.checked || false;
        const displayPhoto = document.getElementById("belmServiceDayBlock")?.dataset.displayPhoto || "";
        try {
          const request = typeof body === "string" ? JSON.parse(body) : {};
          request.isServiceDay = isServiceDay;
          if (isServiceDay) {
            request.serviceDate = document.getElementById("belmServiceDate")?.value || "";
            request.serviceType = document.getElementById("belmServiceType")?.value || "";
          }
          if (displayPhoto) request.displayPhotoUrl = displayPhoto;
          body = JSON.stringify(request);
        } catch (_) {}
      }
      return previousSend.call(this, body);
    };
  }

  function closeTechnicianSpareRecommendation() {
    document.getElementById("belmSpareRecommendationModal")?.remove();
  }

  function renderTechnicianSpareRecommendation(machines) {
    closeTechnicianSpareRecommendation();
    const modal = document.createElement("div");
    modal.id = "belmSpareRecommendationModal";
    modal.className = "belm-checked-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "belmSpareRecommendationTitle");
    modal.innerHTML = `<section class="belm-checked-report-card belm-technician-spare-card">
      <header class="belm-checked-report-head">
        <div>
          <p>BELM Technician · Customer spare recommendation</p>
          <h2 id="belmSpareRecommendationTitle">Recommend Spare to Customer</h2>
          <span>The customer will see only the reference number and can press Service Requirements to order it.</span>
        </div>
        <button type="button" data-close-spare-recommendation aria-label="Close">×</button>
      </header>
      <form class="belm-technician-spare-form">
        <div class="belm-technician-spare-grid">
          <label>
            <span>Machine</span>
            <select name="machineId" required>
              ${machines.map((machine) => {
                const machineName = [machine.brand, machine.model].filter(Boolean).join(" ") || machine.model || "Machine";
                const reference = machine.serialNumber || machine.serial_number || machine.regNumber || machine.reg_number || "No serial";
                return `<option value="${escapeHtml(machine.id)}">${escapeHtml(machineName)} · ${escapeHtml(reference)}</option>`;
              }).join("")}
            </select>
          </label>
          <label>
            <span>System</span>
            <select name="systemCategory" required>
              ${SPARE_RECOMMENDATION_SYSTEMS.map(([value, label]) =>
                `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Spare name</span>
            <input name="spareName" type="text" maxlength="255" placeholder="e.g. Hydraulic return filter" required />
          </label>
          <label>
            <span>Reference number</span>
            <input name="referenceNumber" type="text" maxlength="100" placeholder="e.g. BELM-HF-2201" required />
          </label>
          <label class="full">
            <span>Manufacturer part number</span>
            <input name="manufacturerPartNumber" type="text" maxlength="100" placeholder="e.g. 923855.0996" />
          </label>
        </div>
        <p class="belm-checklist-edit-error" role="alert" hidden></p>
        <p class="belm-technician-spare-success" role="status" hidden></p>
        <footer class="belm-checked-report-actions">
          <button type="button" data-close-spare-recommendation>Cancel</button>
          <button type="submit" class="primary">Send Recommendation to Customer</button>
        </footer>
      </form>
    </section>`;

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-spare-recommendation]")) {
        closeTechnicianSpareRecommendation();
      }
    });
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const successBox = form.querySelector(".belm-technician-spare-success");
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }
      submit.disabled = true;
      submit.textContent = "Sending…";
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/spare-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            machineId: form.elements.machineId.value,
            systemCategory: form.elements.systemCategory.value,
            spareName: form.elements.spareName.value.trim(),
            referenceNumber: form.elements.referenceNumber.value.trim(),
            manufacturerPartNumber: form.elements.manufacturerPartNumber.value.trim(),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Recommendation could not be sent.");
        successBox.textContent = result.message || "Recommendation sent to the customer.";
        successBox.hidden = false;
        form.reset();
      } catch (error) {
        errorBox.textContent = error.message || "Recommendation could not be sent.";
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "Send Recommendation to Customer";
      }
    });
    document.body.appendChild(modal);
    modal.querySelector('[name="spareName"]')?.focus();
  }

  async function addTechnicianSpareRecommendationShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-spare-recommend-shortcut")) return;
    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const button = document.createElement("button");
    button.id = "belm-tech-spare-recommend-shortcut";
    button.type = "button";
    button.className = "belm-tech-spare-recommend-shortcut";
    button.textContent = "+ Recommend Spare";
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading…";
      try {
        const machines = await loadTechnicianReportMachines();
        if (!machines.length) throw new Error("No assigned machine is available for this Technician.");
        renderTechnicianSpareRecommendation(machines);
      } catch (error) {
        alert(error.message || "Could not open Recommend Spare.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    document.body.appendChild(button);
  }

  async function addTechnicianSpareShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-spare-shortcut")) return;
    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const button = document.createElement("button");
    button.id = "belm-tech-spare-shortcut";
    button.type = "button";
    button.className = "belm-tech-spare-shortcut";
    button.textContent = "+ Add Spare";
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Loading…";
      try {
        const machines = await loadTechnicianReportMachines();
        if (!machines.length) throw new Error("No assigned machine is available for this Technician.");
        renderTechnicianSpareRequest(machines);
      } catch (error) {
        alert(error.message || "Could not open Add Spare.");
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
    document.body.appendChild(button);
  }

  if (redirectIfAlreadyLoggedIn()) return;
  if (handoffTechnicianSession()) return;

  installCheckedReportViewer();
  installAuthenticatedReportDownloads();
  installTechnicianSavedReportViewer();
  installServiceDayInjector();
  installThemeSaving();
  syncSavedTheme();
  refreshShortcut();
  addTechnicianTasksShortcut();
  addTechnicianSpareShortcut();
  addTechnicianSpareRecommendationShortcut();
  syncTechnicianCustomerName();
  clarifyTechnicianAssignment();
  clarifyTechnicianChecklistSave();
  enhanceCustomerLogin();
  addForgotPasswordLink();
  addPortalHomeLink();
  enforceAdminPageAccess();
  enhanceCustomerAssistants();
  enhanceCustomerMachineExpenseCards();
  enhanceCustomerAnnouncementsPanel();
  wireCustomerAnalysisButtons();
  wireEmailReportButtons();
  wireProblemReportButtons();
  wireOperatorReportsButtons();
  wireChangePasswordButtons();
  enhanceServiceRequestHistory();
  addCustomerNameToMachinesHeading();
  enhanceTechnicianReportCards();
  redirectChecklistManager();
  redirectServiceRequestManager();
  redirectBillingManager();
  redirectCustomersManager();
  redirectSparePartsManager();
  redirectRolesManager();
  redirectSuppliersManager();
  redirectOverviewManager();
  redirectReportsManager();
  redirectSettingsManager();
  removeLegacyOwnerRole();
  improvePhotoInputs();
  injectServiceDayFields();
  enforceViewerInterface();
  correctLegacyCopy();
  enhanceCheckedReportButtons();
  setInterval(() => {
    refreshShortcut();
    addTechnicianTasksShortcut();
    addTechnicianSpareShortcut();
    addTechnicianSpareRecommendationShortcut();
    syncTechnicianCustomerName();
    clarifyTechnicianAssignment();
    clarifyTechnicianChecklistSave();
    enhanceCustomerLogin();
    addForgotPasswordLink();
    addPortalHomeLink();
    enforceAdminPageAccess();
    enhanceCustomerAssistants();
    enhanceCustomerMachineExpenseCards();
    enhanceCustomerAnnouncementsPanel();
    wireCustomerAnalysisButtons();
  wireEmailReportButtons();
  wireProblemReportButtons();
  wireOperatorReportsButtons();
  wireChangePasswordButtons();
  enhanceServiceRequestHistory();
  addCustomerNameToMachinesHeading();
    enhanceTechnicianReportCards();
    redirectChecklistManager();
    redirectServiceRequestManager();
    redirectBillingManager();
    redirectCustomersManager();
    redirectSparePartsManager();
    redirectRolesManager();
    redirectSuppliersManager();
    redirectOverviewManager();
    redirectReportsManager();
    redirectSettingsManager();
    removeLegacyOwnerRole();
    improvePhotoInputs();
    injectServiceDayFields();
    enforceViewerInterface();
    correctLegacyCopy();
    enhanceCheckedReportButtons();
    installStaleTechSessionDetector();
    watchForStuckTechLoading();
    installCustomerThemeToggle();
    installTechChecklistSubmitInterceptor();
    hideCheckedMachinesFromTechList();
  }, 1500);
})();
