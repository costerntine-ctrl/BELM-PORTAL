(function () {
  const token = localStorage.getItem("belm_admin_token") || localStorage.getItem("belm_tech_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || localStorage.getItem("belm_tech_user") || "null");
  } catch (_) {}

  if (!token || !user) {
    window.location.replace("/login");
    return;
  }

  // Finance module: the contextual sidebar lives outside Billing Manager's
  // native tab bar. Keep the user on the same page and switch the real panel
  // directly so Payments -> Proforma -> Receipts etc. always changes content.
  // This is registered before the Super Admin early return below, because the
  // Finance sidebar must work identically for Super Admin and restricted roles.
  if (/^\/billing-manager(?:\/|$)/.test(window.location.pathname)) {
    const billingQuery = new URLSearchParams(window.location.search);
    const billingFocus = billingQuery.get("focus") === "1";
    const billingFocusTab = String(billingQuery.get("tab") || "invoices").toLowerCase();

    if (billingFocus) {
      const focusCopy = {
        invoices: ["Invoice", "Invoice records and invoice creation only."],
        payments: ["Payment", "Customer payment records only."],
        expenses: ["Expense", "Company expense records only."],
        proformas: ["Proforma", "Proforma records and proforma creation only."],
        receipts: ["Receipt", "Official receipt records only."]
      };
      const applyBillingFocus = () => {
        document.body.classList.add("belm-billing-focus");
        document.body.classList.remove("belm-sidebar-ready", "belm-sidebar-open");
        document.querySelectorAll("#belmAdminSidebar,.belm-sidebar-toggle,.belm-sidebar-scrim").forEach((el) => el.remove());
        document.querySelector(".billing-section-sidebar")?.setAttribute("hidden", "hidden");
        document.querySelector(".metrics")?.setAttribute("hidden", "hidden");
        document.querySelector(".hero-actions")?.setAttribute("hidden", "hidden");
        const copy = focusCopy[billingFocusTab] || focusCopy.invoices;
        const heading = document.querySelector(".hero h1");
        const note = document.querySelector(".hero p:last-child");
        if (heading) heading.textContent = copy[0];
        if (note) note.textContent = copy[1];
        const back = document.getElementById("mainMenuButton");
        if (back) {
          back.href = "/concept-dashboards/09-finance-accounts/";
          back.textContent = "← Finance Dashboard";
        }
        if (!document.getElementById("belmBillingFocusStyle")) {
          const style = document.createElement("style");
          style.id = "belmBillingFocusStyle";
          style.textContent = "body.belm-billing-focus .billing-section-sidebar,body.belm-billing-focus .metrics,body.belm-billing-focus .hero-actions{display:none!important}body.belm-billing-focus .billing-workspace{display:block!important}body.belm-billing-focus main{width:min(1220px,calc(100% - 44px))!important;margin-left:auto!important;margin-right:auto!important}body.belm-billing-focus .hero{justify-content:flex-start!important}";
          document.head.appendChild(style);
        }
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyBillingFocus, { once: true });
      else applyBillingFocus();
      setTimeout(applyBillingFocus, 0);
      setTimeout(applyBillingFocus, 300);
    }

    document.addEventListener("click", (event) => {
      const link = event.target.closest?.("a.belm-sidebar-link[href]");
      if (!link) return;
      let targetUrl;
      try { targetUrl = new URL(link.href, window.location.origin); } catch (_) { return; }
      if (!/^\/billing-manager\/?$/.test(targetUrl.pathname)) return;
      const tab = String(targetUrl.searchParams.get("tab") || "").trim();
      if (!["invoices", "payments", "expenses", "proformas", "receipts"].includes(tab)) return;
      const nativeTab = document.querySelector(`[data-tab="${CSS.escape(tab)}"]`);
      if (!nativeTab) return;

      event.preventDefault();
      nativeTab.click();

      document.querySelectorAll("#belmAdminSidebar .belm-sidebar-link").forEach((item) => {
        item.classList.remove("active");
        item.removeAttribute("aria-current");
      });
      link.classList.add("active");
      link.setAttribute("aria-current", "page");

      const panel = document.querySelector(`[data-billing-panel="${CSS.escape(tab)}"]`);
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // V680: the exact BELM Workshop root is the common authenticated Home
  // Dashboard for every staff role. Nested Workshop modules remain guarded.
  if (/^\/belm-workshop\/?$/.test(window.location.pathname)) return;

  if (user.role === "Super Admin" || user.allowedPages === null) return;

  const allowedPages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
  const routes = {
    customers: "/customers-manager/",
    overview: "/overview-manager/",
    roles: "/roles-manager/",
    "job-cards": "/belm-workshop/#job-cards",
    "service-requests": "/belm-workshop/#job-cards",
    "spare-parts": "/spare-parts-manager/",
    billing: "/billing-manager/",
    reports: "/reports-manager/",
    settings: "/settings-manager/",
    "checklist-templates": "/checklist-manager/",
    suppliers: "/suppliers-manager/",
    "activity-log": "/admin/activity-log"
  };
  const pathRules = [
    [/^\/customers-manager(?:\/|$)/, "customers"],
    [/^\/portal-cwm(?:\/|$)/, "customers"],
    [/^\/admin-applications(?:\/|$)/, "customers"],
    [/^\/overview-manager(?:\/|$)/, "overview"],
    [/^\/checklist-manager(?:\/|$)/, "checklist-templates"],
    [/^\/controller-pinouts-manager(?:\/|$)/, "checklist-templates"],
    [/^\/service-request-manager(?:\/|$)/, "job-cards"],
    [/^\/belm-workshop(?:\/|$)/, "job-cards"],
    [/^\/belm-procurement(?:\/|$)/, "spare-parts"],
    [/^\/spare-parts-manager(?:\/|$)/, "spare-parts"],
    [/^\/billing-manager(?:\/|$)/, "billing"],
    [/^\/bank-controller(?:\/|$)/, "bank-manager"],
    [/^\/roles-manager(?:\/|$)/, "roles"],
    [/^\/suppliers-manager(?:\/|$)/, "suppliers"],
    [/^\/reports-manager(?:\/|$)/, "reports"],
    [/^\/settings-manager(?:\/|$)/, "settings"],
    [/^\/recycle-bin(?:\/|$)/, "roles"],
    [/^\/admin\/([^/]+)/, null]
  ];

  function keyForPath(path) {
    for (const [pattern, key] of pathRules) {
      const match = path.match(pattern);
      if (!match) continue;
      return key || match[1];
    }
    return null;
  }

  // V453: /belm-workshop/ (Job Cards, Workshop Analysis, Technicians) is
  // reachable by anyone with "roles" OR "job-cards" OR "service-requests" -
  // same three keys admin-sidebar.js uses for this entry's anyKeys.
  function belmWorkshopAllowed(path) {
    const role = String(user.role || "").toLowerCase();
    return /^\/belm-workshop(?:\/|$)/.test(path)
      && ["procurement", "workshop manager", "engineer", "store keeper"].includes(role);
  }

  document.querySelectorAll("a[href]").forEach(link => {
    const href = new URL(link.getAttribute("href"), window.location.origin).pathname;
    const key = keyForPath(href);
    const workshopRoute = /^\/belm-workshop(?:\/|$)/.test(href);
    const workshopAllowed = belmWorkshopAllowed(href);
    if (key === "bank-manager" || (workshopRoute && !workshopAllowed) || (key && !workshopRoute && !allowedPages.includes(key))) link.hidden = true;
  });

  const currentKey = keyForPath(window.location.pathname);
  const isWorkshopRoute = /^\/belm-workshop(?:\/|$)/.test(window.location.pathname);
  const workshopAccess = belmWorkshopAllowed(window.location.pathname);
  const workshopBlocked = isWorkshopRoute && !workshopAccess;
  const bankControllerBlocked = currentKey === "bank-manager";
  if (!bankControllerBlocked && !workshopBlocked && (workshopAccess || !currentKey || allowedPages.includes(currentKey))) return;

  const firstAllowed = allowedPages.find(key => key !== "bank-manager" && routes[key]);
  if (firstAllowed) {
    window.location.replace(routes[firstAllowed]);
  } else if (user.role === "Technician") {
    window.location.replace("/tech");
  } else {
    // Permission assignment is not authentication failure. Keep the login alive
    // so an administrator can correct access without forcing a false logout loop.
    const showDenied = () => {
      if (document.getElementById("belmNoAssignedAccess")) return;
      const box = document.createElement("div");
      box.id = "belmNoAssignedAccess";
      box.style.cssText = "position:fixed;inset:20px;z-index:99999;display:grid;place-items:center;background:rgba(15,23,42,.58);padding:20px";
      box.innerHTML = '<div style="max-width:520px;background:#fff;border-radius:16px;padding:24px;box-shadow:0 18px 50px rgba(0,0,0,.24);font:14px Inter,system-ui,sans-serif;color:#172033"><h2 style="margin:0 0 10px">Access not assigned</h2><p style="margin:0">Your login is still active, but this role has no dashboard page assigned. Ask Super Admin to update the role permissions.</p></div>';
      document.body.appendChild(box);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showDenied, { once: true });
    else showDenied();
  }
})();
