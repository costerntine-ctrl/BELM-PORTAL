(function () {
  "use strict";

  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const preview = params.get("preview") === "1" || /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const match = path.match(/\/concept-dashboards\/(\d{2}-[^/]+)\//);
  const dashboard = match ? match[1] : "";

  const tokenKeys = ["belm_admin_token", "belm_tech_token", "belm_operator_token", "belm_customer_token"];
  const activeToken = tokenKeys.map(key => localStorage.getItem(key)).find(Boolean) || "";

  function parseJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function currentUser() {
    return parseJSON("belm_admin_user") || parseJSON("belm_tech_user") || parseJSON("belm_operator_user") || parseJSON("belm_customer_user") || null;
  }
  function hasSession() { return Boolean(activeToken); }
  function normalizeText(el) { return String(el && el.textContent || "").replace(/\s+/g, " ").trim().toUpperCase(); }
  function go(target) { if (target) location.href = target; }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  if (!preview && !hasSession()) {
    location.replace("/login");
    return;
  }

  const user = currentUser();
  if (user) {
    const name = String(user.name || user.fullName || "").trim();
    const role = String(user.role || user.roleName || user.customerRole || "").trim();
    if (name) document.querySelectorAll(".belm-user__name").forEach(el => { el.textContent = name; });
    if (role) document.querySelectorAll(".belm-user__role").forEach(el => {
      if (/super\s*admin/i.test(role) && dashboard === "01-admin-home") el.textContent = "MAIN DASHBOARD";
      else if (/system\s*coordinator/i.test(role)) el.textContent = "SYSTEM SETTINGS";
      else el.textContent = role.replace(/Engineer/ig, "Workshop Manager");
    });
  }

  async function api(pathname, token) {
    const t = token || activeToken;
    const response = await fetch(pathname.startsWith("/api/") ? pathname : "/api" + pathname, {
      cache: "no-store",
      headers: { Authorization: "Bearer " + t }
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data && data.error || "Request failed (" + response.status + ")");
    return data;
  }

  function roleDashboardFor(account) {
    const role = String(
      account && (account.role || account.roleName || account.customerRole) ||
      localStorage.getItem("belm_active_account_type") || ""
    ).trim().toLowerCase().replace(/[_-]+/g, " ");
    if (role.includes("workshop manager") || role === "engineer" || role.includes("technical dep")) return "/concept-dashboards/11-workshop-manager/";
    if (role.includes("technician")) return "/concept-dashboards/02-technician/";
    if (role.includes("procurement")) return "/concept-dashboards/03-procurement/";
    if (role.includes("registration") || role.includes("sales")) return "/concept-dashboards/04-customer-registration/";
    if (role.includes("store keeper") || role.includes("storekeeper")) return "/concept-dashboards/06-storekeeper/";
    if (role.includes("operator")) return "/concept-dashboards/07-operator/";
    if (role.includes("finance") || role.includes("accounts") || role.includes("accountant")) return "/concept-dashboards/09-finance-accounts/";
    if (role.includes("system coordinator") || role === "coordinator") return "/concept-dashboards/10-system-settings/";
    if (role.includes("bank controller")) return "/bank-controller/";
    if (role.includes("super admin") || role === "admin" || role.includes("belm admin")) return "/concept-dashboards/01-admin-home/";
    if (localStorage.getItem("belm_customer_token")) return "/portal-v2/#role";
    return "/concept-dashboards/01-admin-home/";
  }

  function makeCardNavigable(card, target) {
    if (!card || !target || card.dataset.belmRouteBound === "1") return;
    card.dataset.belmRouteBound = "1";
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.style.cursor = "pointer";
    card.addEventListener("click", event => {
      if (event.target.closest("a,button,input,select,textarea")) return;
      go(target);
    });
    card.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      go(target);
    });
  }

  const fileRouteMaps = {
    "02-technician": {
      "my-job-cards.php":"/technician-job-cards/",
      "customer-machines.php":"/technician-tasks/",
      "diagnosis-repair.php":"/technician-job-cards/",
      "spare-requests.php":"/spare-parts-manager/?view=requests&source=technician",
      "testing-completion.php":"/technician-job-cards/?view=testing",
      "daily-checklists.php":"/tech-report/",
      "communication.php":"/technician-tasks/",
      "my-reports.php":"/tech-checked-report/",
      "my-profile.php":"/settings-manager/?module=profile"
    },
    "03-procurement": {
      "spare-purchase-requests.php":"/belm-procurement/?view=requests&module=procurement",
      "purchase-records.php":"/belm-procurement/?view=records&module=procurement",
      "pending-proforma.php":"/belm-procurement/?view=proforma&module=procurement",
      "purchase-orders.php":"/belm-procurement/?view=orders&module=procurement",
      "suppliers.php":"/suppliers-manager/",
      "delivery-tracking.php":"/belm-procurement/?view=delivery&module=procurement",
      "purchase-reports.php":"/belm-procurement/?view=reports&module=procurement",
      "department-analysis.php":"/belm-procurement/?view=analysis&module=procurement",
      "my-profile.php":"/settings-manager/?module=profile"
    },
    "05-inspection-repair": {
      "dashboard.php":"/concept-dashboards/11-workshop-manager/",
      "inspection-checklists.php":"/reports-manager/?view=checklists&module=workshop",
      "diagnosis.php":"/belm-workshop/#job-cards",
      "repair-jobs.php":"/belm-workshop/#job-cards",
      "waiting-for-spares.php":"/spare-parts-manager/?view=requests&module=workshop",
      "testing-completion.php":"/belm-workshop/#job-cards",
      "service-reports.php":"/workshop-analysis/?actor=admin&module=workshop",
      "machine-history.php":"/customers-manager/?view=all-machines&module=customer-overview",
      "communication.php":"/customers-manager/?module=customer-overview",
      "department-analysis.php":"/workshop-analysis/?actor=admin&module=workshop",
      "my-profile.php":"/settings-manager/?module=profile"
    },
    "06-storekeeper": {
      "spare-parts-inventory.php":"/spare-parts-manager/?module=inventory",
      "stock-in.php":"/spare-parts-manager/?view=stock-in&module=inventory",
      "stock-out-issues.php":"/spare-parts-manager/?view=stock-out&module=inventory",
      "spare-requests.php":"/spare-parts-manager/?view=requests&module=inventory",
      "low-stock-shortages.php":"/spare-parts-manager/?view=low-stock&module=inventory",
      "tools-register.php":"/belm-workshop/#tool-issue-documents",
      "stock-audit.php":"/spare-parts-manager/?view=audit&module=inventory",
      "inventory-reports.php":"/reports-manager/?view=inventory&module=inventory",
      "department-analysis.php":"/reports-manager/?view=inventory&module=inventory",
      "my-profile.php":"/settings-manager/?module=profile"
    },
    "07-operator": {
      "my-machine.php":"/operator/",
      "daily-checklist.php":"/operator/#check-up",
      "operation-log.php":"/operator/#operation-log",
      "fuel-consumption.php":"/customer-fuel-usage/",
      "machine-alerts.php":"/operator/#alerts",
      "service-status.php":"/operator/#service",
      "report-issue.php":"/operator/#report",
      "operator-reports.php":"/operator/#reports",
      "my-profile.php":"/operator/#profile"
    }
  };

  const routeMap = fileRouteMaps[dashboard] || {};
  document.querySelectorAll("a[href]").forEach(a => {
    const raw = a.getAttribute("href") || "";
    const base = raw.split("?")[0].split("#")[0];
    if (routeMap[base]) a.href = routeMap[base];
  });

  const actionRoutes = {
    "01-admin-home": {
      "VIEW ALL|WORKSHOP ACTIVITY": "/workshop-analysis/?actor=admin&module=workshop",
      "VIEW ALL|MACHINE & STOCK ALERTS": "/reports-manager/?module=reports",
      "VIEW ALL|ALERTS & ACTIONS": "/reports-manager/?module=reports",
      "VIEW ALL|RECENT ACTIVITY": "/reports-manager/?view=activity&module=reports"
    },
    "02-technician": {
      "OPEN JOB": "/technician-job-cards/",
      "UPDATE DIAGNOSIS": "/technician-job-cards/",
      "REQUEST SPARE": "/spare-parts-manager/?view=requests&source=technician",
      "START TESTING": "/technician-job-cards/?view=testing"
    },
    "03-procurement": {
      "REQUEST QUOTATION": "/belm-procurement/?view=requests&module=procurement",
      "COMPARE PROFORMA": "/belm-procurement/?view=proforma&module=procurement",
      "CREATE PO": "/belm-procurement/?view=orders&module=procurement",
      "REVIEW": "/belm-procurement/?view=proforma&module=procurement",
      "SUBMIT FOR APPROVAL": "/belm-procurement/?view=proforma&module=procurement",
      "VIEW DETAILS": "/belm-procurement/?view=delivery&module=procurement"
    },
    "05-inspection-repair": {
      "NEW INSPECTION": "/belm-workshop/#job-cards",
      "REVIEW DIAGNOSIS": "/belm-workshop/#job-cards",
      "CHECK SPARE": "/spare-parts-manager/?view=requests&module=workshop",
      "START TESTING": "/belm-workshop/#job-cards",
      "VIEW ALL": "/belm-workshop/#job-cards",
      "OPEN CHECKLIST": "/reports-manager/?view=checklists&module=workshop",
      "ADD FINDINGS": "/belm-workshop/#job-cards",
      "ASSIGN TECHNICIAN": "/belm-workshop/#manage-technicians",
      "GENERATE REPORT": "/workshop-analysis/?actor=admin&module=workshop"
    },
    "06-storekeeper": {
      "VIEW": "/spare-parts-manager/?module=inventory",
      "REQUEST PROCUREMENT": "/concept-dashboards/03-procurement/",
      "ADJUST": "/spare-parts-manager/?view=audit&module=inventory",
      "REVIEW": "/spare-parts-manager/?view=requests&module=inventory",
      "ISSUE PART": "/spare-parts-manager/?view=stock-out&module=inventory",
      "SCAN ITEM": "/spare-parts-manager/?module=inventory",
      "PRINT ISSUE NOTE": "#belm-print",
      "START AUDIT": "/spare-parts-manager/?view=audit&module=inventory",
      "EXPORT CSV": "#belm-table-csv"
    },
    "07-operator": { "ADD COMMENT": "/operator/#report" },
    "08-daily-checklist": { "DOWNLOAD PDF": "#belm-print", "EXPORT CSV": "#belm-checklist-csv" }
  };

  function contextTitle(el) {
    const panel = el.closest(".belm-panel, .panel, section");
    if (!panel) return "";
    const title = panel.querySelector(".belm-panel__title, .panel-title, h2, h3");
    return title ? normalizeText(title) : "";
  }

  function exportFirstTableCsv(prefix) {
    const table = document.querySelector("table");
    if (!table) { alert("No table data is available to export."); return; }
    const rows = Array.from(table.querySelectorAll("tr")).map(tr =>
      Array.from(tr.querySelectorAll("th,td")).map(td =>
        '"' + String(td.innerText || td.textContent || "").replace(/\s+/g, " ").trim().replace(/"/g, '""') + '"'
      ).join(",")
    );
    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = (prefix || "BELM-export") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener("click", event => {
    const a = event.target.closest('a[href="#"]');
    if (!a) return;
    const label = normalizeText(a);
    const map = actionRoutes[dashboard] || {};
    let target = map[label];
    if (!target && label === "VIEW ALL") target = map[label + "|" + contextTitle(a)];
    if (!target) return;
    event.preventDefault();
    if (target === "#belm-print") { window.print(); return; }
    if (target === "#belm-table-csv") { exportFirstTableCsv("BELM-inventory"); return; }
    if (target === "#belm-checklist-csv") {
      if (typeof window.BELMExportChecklistCSV === "function") window.BELMExportChecklistCSV();
      return;
    }
    go(target);
  });

  async function loadMainDashboard() {
    if (dashboard !== "01-admin-home" || preview) return;
    const adminToken = localStorage.getItem("belm_admin_token") || activeToken;
    const results = await Promise.allSettled([
      api("/reports/all-overview?period=month", adminToken),
      api("/belm-workshop-home", adminToken),
      api("/engineering?action=job-process", adminToken)
    ]);
    const overview = results[0].status === "fulfilled" ? results[0].value : null;
    const workshop = results[1].status === "fulfilled" ? results[1].value : null;
    const processRows = results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value : [];
    if (!overview && !workshop && !processRows.length) return;

    const totals = overview && overview.totals || {};
    const machines = workshop && Array.isArray(workshop.machines) ? workshop.machines : [];
    const totalOpenJobs = machines.length ? machines.reduce((s, m) => s + Number(m.openJobCards || 0), 0) : Number(totals.openRequests || 0);
    const cardValues = {
      "ACTIVE CUSTOMERS": Number(totals.customers || 0),
      "REGISTERED MACHINES": Number(totals.machines || machines.length || 0),
      "OPEN JOB CARDS": totalOpenJobs,
      "PENDING APPROVALS": Number(totals.pendingApplications || 0)
    };
    document.querySelectorAll(".belm-stat-card").forEach(card => {
      const label = normalizeText(card.querySelector(".belm-stat-card__label") || card);
      const value = card.querySelector(".belm-stat-card__value");
      if (value && Object.prototype.hasOwnProperty.call(cardValues, label)) value.textContent = cardValues[label].toLocaleString("en-TZ");
      const delta = card.querySelector(".belm-stat-card__delta");
      if (delta) delta.innerHTML = '<span>Live database</span>';
    });

    const processCounts = { COMPLETED:0, PROGRESS:0, PENDING:0 };
    processRows.forEach(row => {
      const code = String(row.processCode || "").toUpperCase();
      if (code === "COMPLETED") processCounts.COMPLETED += 1;
      else if (["OPENED","DIAGNOSIS_REPORT","TESTING"].includes(code)) processCounts.PROGRESS += 1;
      else processCounts.PENDING += 1;
    });
    const legend = document.querySelectorAll(".belm-chart__legend .belm-legend-item");
    const legendValues = [processCounts.COMPLETED, processCounts.PROGRESS, processCounts.PENDING];
    legend.forEach((item, index) => { const strong = item.querySelector("strong"); if (strong) strong.textContent = String(legendValues[index] || 0); });

    const serviceDue = machines.filter(m => /DUE|OVERDUE|REQUIRED/i.test(String(m.serviceKit || ""))).length;
    const alertValues = {
      "MACHINES DUE FOR SERVICE": serviceDue,
      "LOW STOCK ITEMS": Number(totals.lowStockParts || 0),
      "FUEL REFILL DUE": "—",
      "EXPIRED DOCUMENTS": "—"
    };
    document.querySelectorAll(".belm-alert-row").forEach(row => {
      const label = normalizeText(row.querySelector(".belm-alert-row__label") || row);
      const count = row.querySelector(".belm-alert-row__count");
      if (count && Object.prototype.hasOwnProperty.call(alertValues, label)) count.textContent = String(alertValues[label]);
    });

    const body = document.querySelector(".belm-grid-bottom .belm-table tbody");
    const recent = overview && Array.isArray(overview.recentActivities) ? overview.recentActivities.slice(0, 5) : [];
    if (body) {
      body.innerHTML = recent.length ? recent.map(row => {
        const action = String(row.action || "Activity").replace(/[_-]+/g, " ");
        const reference = row.entity || "System";
        const who = row.userName || "BELM User";
        return '<tr><td>' + esc(fmtDate(row.createdAt)) + '</td><td>' + esc(action) + '</td><td>' + esc(reference) + '</td><td>' + esc(who) + '</td><td><span class="belm-pill belm-pill--completed">Recorded</span></td></tr>';
      }).join("") : '<tr><td colspan="5">No recent activity recorded.</td></tr>';
    }
  }

  if (dashboard === "01-admin-home") {
    const mainCardRoutes = {
      "ACTIVE CUSTOMERS": "/customers-manager/?module=customer-overview",
      "REGISTERED MACHINES": "/customers-manager/?view=all-machines&module=customer-overview",
      "OPEN JOB CARDS": "/belm-workshop/#job-cards",
      "PENDING APPROVALS": "/concept-dashboards/04-customer-registration/?view=pending"
    };
    document.querySelectorAll(".belm-stat-card").forEach(card => {
      const label = normalizeText(card.querySelector(".belm-stat-card__label") || card);
      makeCardNavigable(card, mainCardRoutes[label]);
    });
    document.querySelectorAll(".belm-alert-row").forEach(a => {
      const t = normalizeText(a);
      if (t.includes("MACHINES DUE FOR SERVICE") || t.includes("SERVICE")) a.href = "/reports-manager/?view=service&module=reports";
      else if (t.includes("LOW STOCK") || t.includes("SPARE")) a.href = "/concept-dashboards/06-storekeeper/";
      else if (t.includes("FUEL REFILL")) a.href = "/reports-manager/?view=fuel&module=reports";
      else if (t.includes("EXPIRED DOCUMENT")) a.href = "/reports-manager/?view=documents&module=reports";
      else if (t.includes("APPROVAL")) a.href = "/concept-dashboards/04-customer-registration/?view=pending";
      else if (t.includes("INVOICE") || t.includes("PAYMENT")) a.href = "/concept-dashboards/09-finance-accounts/";
    });
    document.querySelectorAll("a,button").forEach(el => {
      if (normalizeText(el) !== "VIEW MY ROLE") return;
      el.addEventListener("click", event => { event.preventDefault(); go(roleDashboardFor(user)); });
    });
    loadMainDashboard().catch(error => console.warn("BELM main dashboard live sync:", error));
    setInterval(() => loadMainDashboard().catch(() => {}), 60000);
  }

  if (dashboard === "04-customer-registration") {
    document.addEventListener("click", event => {
      const a = event.target.closest('.belm-action-group a[href="#"]');
      if (!a) return;
      event.preventDefault();
      const row = a.closest("tr");
      const customerId = row && row.dataset ? row.dataset.customerId : "";
      const action = normalizeText(a);
      let target = "/customers-manager/?module=registration";
      if (customerId) target += "&customerId=" + encodeURIComponent(customerId);
      if (action.includes("RESET")) target += "&action=reset-access";
      else if (action.includes("EDIT")) target += "&action=edit";
      else if (action.includes("MANAGE")) target += "&action=manage";
      go(target);
    });
  }
})();