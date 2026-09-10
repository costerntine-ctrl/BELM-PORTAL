(function () {
  "use strict";

  const path = location.pathname;
  const preview = new URLSearchParams(location.search).get("preview") === "1" || /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const dashboardMatch = path.match(/\/concept-dashboards\/(\d{2}-[^/]+)\//);
  const dashboard = dashboardMatch ? dashboardMatch[1] : "";

  function parseJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }

  function currentUser() {
    return parseJSON("belm_admin_user") || parseJSON("belm_tech_user") || parseJSON("belm_operator_user") || parseJSON("belm_customer_user") || null;
  }

  function hasSession() {
    return Boolean(
      localStorage.getItem("belm_admin_token") ||
      localStorage.getItem("belm_tech_token") ||
      localStorage.getItem("belm_operator_token") ||
      localStorage.getItem("belm_customer_token")
    );
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

  function normalizeText(el) {
    return String(el && el.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function go(target) {
    if (target) location.href = target;
  }

  function roleDashboardFor(account) {
    const role = String(
      account && (account.role || account.roleName || account.customerRole) ||
      localStorage.getItem("belm_active_account_type") || ""
    ).trim().toLowerCase().replace(/[_-]+/g, " ");

    if (role.includes("workshop manager") || role === "engineer") return "/concept-dashboards/11-workshop-manager/";
    if (role.includes("technician")) return "/concept-dashboards/02-technician/";
    if (role.includes("procurement")) return "/concept-dashboards/03-procurement/";
    if (role.includes("registration") || role.includes("sales")) return "/concept-dashboards/04-customer-registration/";
    if (role.includes("store keeper") || role.includes("storekeeper")) return "/concept-dashboards/06-storekeeper/";
    if (role.includes("operator")) return "/concept-dashboards/07-operator/";
    if (role.includes("finance") || role.includes("accounts")) return "/concept-dashboards/09-finance-accounts/";
    if (role.includes("system coordinator")) return "/concept-dashboards/10-system-settings/";
    if (role.includes("bank controller")) return "/bank-controller/";
    if (role.includes("super admin")) return "/concept-dashboards/01-admin-home/";

    if (localStorage.getItem("belm_customer_token")) return "/portal-cwm/";
    return "/concept-dashboards/01-admin-home/";
  }

  function makeCardNavigable(card, target) {
    if (!card || !target || card.dataset.belmRouteBound === "1") return;
    card.dataset.belmRouteBound = "1";
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    card.style.cursor = "pointer";
    card.addEventListener("click", function (event) {
      if (event.target.closest("a,button,input,select,textarea")) return;
      go(target);
    });
    card.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      go(target);
    });
  }

  const actionRoutes = {
    "01-admin-home": {
      "VIEW ALL|WORKSHOP ACTIVITY": "/workshop-analysis/?actor=admin&module=workshop",
      "VIEW ALL|MACHINE & STOCK ALERTS": "/reports-manager/?module=reports",
      "VIEW ALL|ALERTS & ACTIONS": "/reports-manager/?module=reports",
      "VIEW ALL|RECENT ACTIVITY": "/reports-manager/?view=activity&module=reports"
    },
    "02-technician": {
      "OPEN JOB": "/technician-job-cards/",
      "UPDATE DIAGNOSIS": "/breakdown-workflow/?actor=technician",
      "REQUEST SPARE": "/spare-parts-manager/?view=requests",
      "START TESTING": "/technician-job-cards/?view=testing"
    },
    "03-procurement": {
      "REQUEST QUOTATION": "/belm-procurement/?module=procurement",
      "COMPARE PROFORMA": "/belm-procurement/?view=proforma&module=procurement",
      "CREATE PO": "/belm-procurement/?view=orders&module=procurement",
      "REVIEW": "/belm-procurement/?view=proforma&module=procurement",
      "SUBMIT FOR APPROVAL": "/belm-procurement/?view=proforma&module=procurement",
      "VIEW DETAILS": "/belm-procurement/?view=delivery&module=procurement"
    },
    "05-inspection-repair": {
      "NEW INSPECTION": "/breakdown-workflow/?actor=admin&module=workshop",
      "REVIEW DIAGNOSIS": "/breakdown-workflow/?actor=admin&module=workshop",
      "CHECK SPARE": "/spare-parts-manager/?view=requests&module=workshop",
      "START TESTING": "/breakdown-workflow/?actor=admin&view=testing&module=workshop",
      "VIEW ALL": "/belm-workshop/?module=workshop",
      "OPEN CHECKLIST": "/reports-manager/?view=checklists&module=workshop",
      "ADD FINDINGS": "/breakdown-workflow/?actor=admin&module=workshop",
      "ASSIGN TECHNICIAN": "/roles-manager/?module=workshop",
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
    "07-operator": {
      "ADD COMMENT": "/operator/#report"
    },
    "08-daily-checklist": {
      "DOWNLOAD PDF": "#belm-print",
      "EXPORT CSV": "#belm-checklist-csv"
    },
    "11-workshop-manager": {
      "CREATE JOB CARD": "/belm-workshop/#job-cards",
      "ASSIGN TECHNICIAN": "/belm-workshop/#manage-technicians",
      "REQUEST SPARE": "/spare-parts-manager/?view=requests&module=workshop",
      "VIEW SCHEDULE": "/belm-workshop/#assigned-work",
      "INSPECTION REPORT": "/reports-manager/?view=checklists&module=workshop",
      "SERVICE REMINDERS": "/reports-manager/?view=service&module=workshop"
    }
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

  document.addEventListener("click", function (event) {
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

  if (dashboard === "01-admin-home") {
    const mainCardRoutes = {
      "ACTIVE CUSTOMERS": "/customers-manager/?module=customer-overview",
      "REGISTERED MACHINES": "/customers-manager/?view=all-machines&module=customer-overview",
      "OPEN JOB CARDS": "/belm-workshop/#job-cards",
      "PENDING APPROVALS": "/concept-dashboards/04-customer-registration/?view=pending"
    };

    document.querySelectorAll(".belm-stat-card").forEach(function (card) {
      const label = normalizeText(card.querySelector(".belm-stat-card__label") || card);
      makeCardNavigable(card, mainCardRoutes[label]);
    });

    document.querySelectorAll(".belm-alert-row").forEach(function (a) {
      const t = normalizeText(a);
      if (t.includes("MACHINES DUE FOR SERVICE") || t.includes("SERVICE")) a.href = "/reports-manager/?view=service&module=reports";
      else if (t.includes("LOW STOCK") || t.includes("SPARE")) a.href = "/concept-dashboards/06-storekeeper/";
      else if (t.includes("FUEL REFILL")) a.href = "/reports-manager/?view=fuel&module=reports";
      else if (t.includes("EXPIRED DOCUMENT")) a.href = "/reports-manager/?view=documents&module=reports";
      else if (t.includes("APPROVAL")) a.href = "/concept-dashboards/04-customer-registration/?view=pending";
      else if (t.includes("INVOICE") || t.includes("PAYMENT")) a.href = "/concept-dashboards/09-finance-accounts/";
    });

    document.querySelectorAll("a,button").forEach(function (el) {
      if (normalizeText(el) !== "VIEW MY ROLE") return;
      el.addEventListener("click", function (event) {
        event.preventDefault();
        go(roleDashboardFor(user));
      });
    });
  }

  if (dashboard === "11-workshop-manager") {
    const wmCardRoutes = {
      "OPEN JOB CARDS": "/belm-workshop/#job-cards",
      "IN PROGRESS": "/belm-workshop/#job-cards",
      "WAITING FOR SPARE": "/spare-parts-manager/?view=requests&module=workshop",
      "COMPLETED (THIS MONTH)": "/workshop-analysis/?actor=admin&module=workshop",
      "OVERDUE": "/belm-workshop/#job-cards"
    };
    document.querySelectorAll(".wm-stat-card").forEach(function (card) {
      const label = normalizeText(card.querySelector(".wm-stat-label") || card);
      const target = wmCardRoutes[label];
      if (target) card.href = target;
    });
  }

  if (dashboard === "04-customer-registration") {
    document.addEventListener("click", function (event) {
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