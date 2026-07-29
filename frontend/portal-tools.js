(function () {
  const buttonId = "belm-applications-shortcut";
  const pathname = window.location.pathname;
  let customerExpenseMachines = null;
  let customerExpenseMachinesPromise = null;
  let technicianReportMachines = null;
  let technicianReportMachinesPromise = null;

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
      const actionRow = document.createElement("span");
      actionRow.className = "belm-machine-action-row";
      const openPage = (event, page) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        const query = new URLSearchParams({ machine: machine.id });
        window.location.href = `${page}?${query.toString()}`;
      };

      const expenseLink = document.createElement("span");
      expenseLink.className = "belm-machine-expense-link";
      expenseLink.setAttribute("role", "button");
      expenseLink.setAttribute("tabindex", "0");
      expenseLink.textContent = "Machine Expenses";
      expenseLink.title = `Open spare-part expenses for ${model}`;
      expenseLink.addEventListener("click", event => openPage(event, "/customer-machine-expenses/"));
      expenseLink.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          openPage(event, "/customer-machine-expenses/");
        }
      });

      const serviceLink = document.createElement("span");
      serviceLink.className = "belm-machine-service-link";
      serviceLink.setAttribute("role", "button");
      serviceLink.setAttribute("tabindex", "0");
      serviceLink.textContent = "Request Service";
      serviceLink.title = `Request model-matched service for ${model}`;
      serviceLink.addEventListener("click", event => openPage(event, "/customer-service-request/"));
      serviceLink.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          openPage(event, "/customer-service-request/");
        }
      });

      actionRow.append(expenseLink, serviceLink);
      card.appendChild(actionRow);
    });
  }

  async function loadTechnicianReportMachines() {
    if (technicianReportMachines) return technicianReportMachines;
    if (technicianReportMachinesPromise) return technicianReportMachinesPromise;
    const token = localStorage.getItem("belm_tech_token");
    if (!token) return [];
    let techUser = {};
    try {
      techUser = JSON.parse(localStorage.getItem("belm_tech_user") || "{}");
    } catch (_) {}
    const payload = tokenPayload("belm_tech_token") || {};
    const customerId = techUser.assignedCustomerId || payload.assignedCustomerId;
    if (!customerId) return [];

    technicianReportMachinesPromise = fetch(`/api/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load assigned machines.");
        const customer = await response.json();
        technicianReportMachines = Array.isArray(customer.machines) ? customer.machines : [];
        return technicianReportMachines;
      })
      .catch(() => {
        technicianReportMachinesPromise = null;
        return [];
      });
    return technicianReportMachinesPromise;
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
    const machines = await loadTechnicianReportMachines();
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
      card.appendChild(reportLink);
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

  function improvePhotoInputs() {
    document.querySelectorAll('input[placeholder="Photo upload — wire up file input for production"]').forEach((input) => {
      input.placeholder = "Paste photo link or photo reference";
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
    return date.toLocaleString("en-TZ", {
      timeZone: "Africa/Dar_es_Salaam",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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
      return `<input ${common} type="url" value="${escapeHtml(photoValue)}" placeholder="Photo link" />`;
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
          <h2 id="belmCheckedReportTitle">${escapeHtml(machineName)} — Checked Report</h2>
          <span>${escapeHtml(report.customerName || "")}${report.customerName ? " · " : ""}${escapeHtml(report.templateName || "Checklist report")}</span>
        </div>
        <button type="button" data-close-checked-report aria-label="Close checked report">×</button>
      </header>
      <div class="belm-checked-report-summary">
        <div><span>Overall status</span><strong class="status-${escapeHtml(status.toLowerCase())}">${escapeHtml(status)}</strong></div>
        <div><span>Checked by</span><strong>${escapeHtml(filledBy)}</strong></div>
        <div><span>Date checked</span><strong>${escapeHtml(formattedDate)}</strong></div>
        <div><span>Hour meter</span><strong>${escapeHtml(hourMeter)}</strong></div>
        <div><span>Machine type</span><strong>${escapeHtml(machine.machineType || "Not recorded")}</strong></div>
        <div><span>Serial / registration</span><strong>${escapeHtml(serialReference)}</strong></div>
        <div><span>Edit status</span><strong class="belm-edit-state ${editStateClass}">${escapeHtml(editState)}</strong></div>
      </div>
      <div class="belm-checked-report-table-wrap">
        <table class="belm-checked-report-table">
          <thead><tr><th>Checked item</th><th>Recorded result</th><th>Status</th><th>Evidence</th></tr></thead>
          <tbody>${answers.length ? answers.map((answer) => {
            const answerStatus = String(answer.safetyLevel || answer.safety_level || "GREEN").toUpperCase();
            const photoUrl = safeReportPhotoUrl(answer.photoUrl || answer.photo_url);
            return `<tr>
              <td>${escapeHtml(answer.label || "Checklist item")}</td>
              <td><strong>${escapeHtml(answer.value || "—")}</strong></td>
              <td><span class="belm-report-status status-${escapeHtml(answerStatus.toLowerCase())}">${escapeHtml(answerStatus)}</span></td>
              <td>${photoUrl ? `<a href="${escapeHtml(photoUrl)}" target="_blank" rel="noopener">View photo</a>` : "—"}</td>
            </tr>`;
          }).join("") : '<tr><td colspan="4" class="belm-report-empty">No checked answers were recorded.</td></tr>'}</tbody>
        </table>
      </div>
      <footer class="belm-checked-report-actions">
        <button type="button" data-print-checked-report>Print Report</button>
        ${report.canEdit && !report.isExpired ? '<button type="button" data-edit-checked-report>Edit Checklist</button>' : ""}
        <button type="button" class="primary" data-close-checked-report>Close</button>
      </footer>
    </section>`;

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-checked-report]")) {
        closeCheckedReport();
      }
      if (event.target.closest("[data-print-checked-report]")) window.print();
      if (event.target.closest("[data-edit-checked-report]")) renderChecklistEdit(report);
    });
    document.body.appendChild(modal);
    modal.querySelector("[data-close-checked-report]")?.focus();
  }

  function enhanceCheckedReportButtons() {
    if (window.location.pathname !== "/portal/dashboard") return;
    document.querySelectorAll('a[href^="/api/customer-portal/reports/"][href$="/download"]').forEach((downloadLink) => {
      if (downloadLink.parentElement?.querySelector(".belm-view-checked-report")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "belm-view-checked-report";
      button.dataset.reportUrl = downloadLink.getAttribute("href");
      button.textContent = "View Checked Report";
      downloadLink.parentElement?.insertBefore(button, downloadLink);
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
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = `BELM-checklist-${reportId}.json`;
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
          <button type="submit" class="primary">Send to Spare Parts Inventory</button>
        </footer>
      </form>
    </section>`;

    const form = modal.querySelector("form");
    const machineSelect = form.elements.machineId;
    const machineTypeInput = form.elements.machineType;
    const syncMachineType = () => {
      const selected = machines.find((machine) => String(machine.id) === machineSelect.value);
      machineTypeInput.value = selected?.machineType || selected?.machine_type || "";
    };
    syncMachineType();
    machineSelect.addEventListener("change", syncMachineType);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-close-tech-spare]")) {
        closeTechnicianSpareRequest();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = localStorage.getItem("belm_tech_token");
      if (!token) {
        window.location.href = "/tech";
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      const errorBox = form.querySelector(".belm-checklist-edit-error");
      const successBox = form.querySelector(".belm-technician-spare-success");
      submit.disabled = true;
      submit.textContent = "Sending…";
      errorBox.hidden = true;
      successBox.hidden = true;
      try {
        const response = await fetch("/api/spare-parts/requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
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
        form.elements.partNumber.value = "";
        form.elements.description.value = "";
        form.elements.partNumber.focus();
      } catch (error) {
        errorBox.textContent = error.message || "Spare request could not be sent.";
        errorBox.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "Send to Spare Parts Inventory";
      }
    });
    document.body.appendChild(modal);
    form.elements.partNumber.focus();
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

  if (handoffTechnicianSession()) return;

  installCheckedReportViewer();
  installAuthenticatedReportDownloads();
  installTechnicianSavedReportViewer();
  installThemeSaving();
  syncSavedTheme();
  refreshShortcut();
  addTechnicianTasksShortcut();
  addTechnicianSpareShortcut();
  syncTechnicianCustomerName();
  clarifyTechnicianAssignment();
  clarifyTechnicianChecklistSave();
  enhanceCustomerLogin();
  addForgotPasswordLink();
  addPortalHomeLink();
  enforceAdminPageAccess();
  enhanceCustomerAssistants();
  enhanceCustomerMachineExpenseCards();
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
  enforceViewerInterface();
  correctLegacyCopy();
  enhanceCheckedReportButtons();
  setInterval(() => {
    refreshShortcut();
    addTechnicianTasksShortcut();
    addTechnicianSpareShortcut();
    syncTechnicianCustomerName();
    clarifyTechnicianAssignment();
    clarifyTechnicianChecklistSave();
    enhanceCustomerLogin();
    addForgotPasswordLink();
    addPortalHomeLink();
    enforceAdminPageAccess();
    enhanceCustomerAssistants();
    enhanceCustomerMachineExpenseCards();
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
    enforceViewerInterface();
    correctLegacyCopy();
    enhanceCheckedReportButtons();
  }, 1500);
})();
