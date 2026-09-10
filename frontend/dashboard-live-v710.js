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
    return Boolean(localStorage.getItem("belm_admin_token") || localStorage.getItem("belm_tech_token") || localStorage.getItem("belm_operator_token") || localStorage.getItem("belm_customer_token"));
  }
  if (!preview && !hasSession()) {
    location.replace("/login");
    return;
  }

  // Keep the dashboard's exact layout; only replace identity text with the logged-in user when available.
  const user = currentUser();
  if (user) {
    const name = String(user.name || user.fullName || "").trim();
    const role = String(user.role || user.roleName || "").trim();
    if (name) document.querySelectorAll(".belm-user__name").forEach(el => el.textContent = name);
    if (role) document.querySelectorAll(".belm-user__role").forEach(el => {
      if (/super\s*admin/i.test(role) && dashboard === "01-admin-home") el.textContent = "MAIN DASHBOARD";
      else if (/system\s*coordinator/i.test(role)) el.textContent = "SYSTEM SETTINGS";
      else el.textContent = role.replace(/Engineer/ig, "Workshop Manager");
    });
  }

  function appendQuery(url, key, value) {
    const u = new URL(url, location.origin);
    if (!u.searchParams.has(key)) u.searchParams.set(key, value);
    return u.pathname + u.search + u.hash;
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

  // Placeholder action buttons in the supplied static mockups are connected to the existing live modules.
  const actionRoutes = {
    "01-admin-home": {
      "VIEW ALL|WORKSHOP ACTIVITY": "/workshop-analysis/?actor=admin&module=workshop",
      "VIEW ALL|ALERTS & ACTIONS": "/reports-manager/?module=reports"
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
    }
  };

  function normalizeText(el) {
    return String(el.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();
  }
  function contextTitle(el) {
    const panel = el.closest(".belm-panel") || el.closest("section");
    if (!panel) return "";
    const title = panel.querySelector(".belm-panel__title, h2, h3");
    return title ? normalizeText(title) : "";
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
    location.href = target;
  });

  // Admin alerts in the supplied home dashboard become real destinations instead of dead '#'.
  if (dashboard === "01-admin-home") {
    document.querySelectorAll('.belm-alert-row[href="#"]').forEach(function (a) {
      const t = normalizeText(a);
      if (t.includes("MACHINES DUE FOR SERVICE") || t.includes("SERVICE")) a.href = "/reports-manager/?view=service&module=reports";
      else if (t.includes("LOW STOCK") || t.includes("SPARE")) a.href = "/concept-dashboards/06-storekeeper/";
      else if (t.includes("FUEL REFILL")) a.href = "/reports-manager/?view=fuel&module=reports";
      else if (t.includes("EXPIRED DOCUMENT")) a.href = "/reports-manager/?view=documents&module=reports";
      else if (t.includes("APPROVAL")) a.href = "/concept-dashboards/04-customer-registration/";
      else if (t.includes("INVOICE") || t.includes("PAYMENT")) a.href = "/billing-manager/?module=finance";
      else a.href = "/reports-manager/?module=reports";
    });
  }

  // Registration row actions use the live customer manager; no dead buttons remain.
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
      location.href = target;
    });
  }
})();
