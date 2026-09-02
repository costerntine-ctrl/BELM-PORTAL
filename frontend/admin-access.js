(function () {
  const token = localStorage.getItem("belm_admin_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
  } catch (_) {}

  if (!token || !user) {
    window.location.replace("/login");
    return;
  }

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
