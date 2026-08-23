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
    "job-cards": "/customers-manager/#job-cards",
    "service-requests": "/customers-manager/#job-cards",
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

  // V445: /customers-manager/ now also hosts TECHNICAL DEP (Job Cards,
  // Workshop Analysis, Technicians) merged in from the deleted
  // /engineering-manager/ page. Anyone with "customers" OR any of the old
  // Technical Dep keys ("roles", "job-cards", "service-requests") can reach
  // it - mirrors the anyKeys on this same merged entry in admin-sidebar.js.
  function customersManagerAllowed(path) {
    return /^\/customers-manager(?:\/|$)/.test(path)
      && (allowedPages.includes("customers") || allowedPages.includes("roles")
          || allowedPages.includes("job-cards") || allowedPages.includes("service-requests"));
  }

  document.querySelectorAll("a[href]").forEach(link => {
    const href = new URL(link.getAttribute("href"), window.location.origin).pathname;
    const key = keyForPath(href);
    const technicalAllowed = customersManagerAllowed(href);
    if (key && !technicalAllowed && !allowedPages.includes(key)) link.hidden = true;
  });

  const currentKey = keyForPath(window.location.pathname);
  const technicalAccess = customersManagerAllowed(window.location.pathname);
  if (technicalAccess || !currentKey || allowedPages.includes(currentKey)) return;

  const firstAllowed = allowedPages.find(key => routes[key]);
  if (firstAllowed) {
    window.location.replace(routes[firstAllowed]);
  } else if (user.role === "Technician") {
    window.location.replace("/tech");
  } else {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.replace("/admin/login?access=not-assigned");
  }
})();
