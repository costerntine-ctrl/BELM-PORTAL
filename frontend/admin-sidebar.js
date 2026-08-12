(function () {
  if (document.getElementById("belmAdminSidebar")) return;

  const pathname = window.location.pathname;
  const standaloneAdminPaths = [
    "/overview-manager/",
    "/customers-manager/",
    "/contracts-workshops/",
    "/admin-applications/",
    "/checklist-manager/",
    "/service-request-manager/",
    "/spare-parts-manager/",
    "/billing-manager/",
    "/suppliers-manager/",
    "/reports-manager/",
    "/roles-manager/",
    "/settings-manager/",
    "/bank-controller/",
    "/recycle-bin/",
  ];
  const isAdminArea = pathname.startsWith("/admin/")
    || standaloneAdminPaths.some((path) => pathname === path || pathname.startsWith(path));
  if (!isAdminArea || pathname === "/admin/login") return;

  const token = localStorage.getItem("belm_admin_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
  } catch (_) {}

  if (!token || !user) {
    window.location.replace("/admin/login");
    return;
  }

  if (user.role === "Technician") {
    window.location.replace("/tech");
    return;
  }

  // Dark/light mode is a personal, per-admin preference kept purely in this
  // browser's storage — keyed by this admin's own account id so it never
  // leaks between different staff accounts sharing a computer, and never
  // affects the separate Customer Portal / Technician app themes (which
  // use their own keys entirely).
  const themeStorageKey = `belm_theme_admin_${user.id || "default"}`;
  function applyAdminTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem(themeStorageKey, safeTheme);
  }
  applyAdminTheme(localStorage.getItem(themeStorageKey) || "light");

  const pages = [
    { section: "Command Center", key: "overview", label: "Operations Overview", short: "OC", href: "/overview-manager/", paths: ["/overview-manager/", "/admin/overview"], priority: true },
    { section: "Operations", key: "service-requests", label: "Service Jobs", short: "SJ", href: "/service-request-manager/", paths: ["/service-request-manager/", "/admin/service-requests"], priority: true },
    { section: "Operations", key: "customers", label: "Registration & Approvals", short: "AP", href: "/admin-applications/", paths: ["/admin-applications/"], applications: true, priority: true },
    { section: "Customers & Assets", key: "customers", label: "Customers & Machines", short: "CM", href: "/customers-manager/", paths: ["/customers-manager/", "/admin/customers"] },
    { section: "Customers & Assets", key: "customers", label: "Contracts & Workshops", short: "CW", href: "/contracts-workshops/", paths: ["/contracts-workshops/"] },
    { section: "Customers & Assets", key: "checklist-templates", label: "Inspection Checklists", short: "IC", href: "/checklist-manager/", paths: ["/checklist-manager/", "/admin/checklist-templates"] },
    { section: "People", key: "roles", label: "BELM Team & Roles", short: "TM", href: "/roles-manager/", paths: ["/roles-manager/", "/admin/roles"] },
    { section: "People", key: "roles", label: "Technicians & Engineering", short: "TE", href: "/roles-manager/?role=Technician", paths: [] },
    { section: "Parts & Supply", key: "spare-parts", label: "Parts & Stock", short: "PS", href: "/spare-parts-manager/", paths: ["/spare-parts-manager/", "/admin/spare-parts"] },
    { section: "Parts & Supply", key: "suppliers", label: "Suppliers", short: "SU", href: "/suppliers-manager/", paths: ["/suppliers-manager/", "/admin/suppliers"] },
    { section: "Finance", key: "billing", label: "Billing & Customer Finance", short: "BF", href: "/billing-manager/", paths: ["/billing-manager/", "/admin/billing"] },
    { section: "Finance", key: "bank-manager", label: "Bank & Cash Control", short: "BC", href: "/bank-controller/", paths: ["/bank-controller/"] },
    { section: "Intelligence", key: "reports", label: "Reports & Analysis", short: "RA", href: "/reports-manager/", paths: ["/reports-manager/", "/admin/reports"] },
    { section: "System", key: "settings", label: "System Settings", short: "ST", href: "/settings-manager/", paths: ["/settings-manager/", "/admin/settings"] },
    { section: "System", key: "roles", label: "Recycle Bin", short: "RB", href: "/recycle-bin/", paths: ["/recycle-bin/"] },
  ];

  const isSuperAdmin = user.role === "Super Admin" || user.allowedPages === null;
  const allowedPages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
  const visiblePages = pages.filter((page) =>
    page.key === null || isSuperAdmin || allowedPages.includes(page.key)
  );

  const sidebar = document.createElement("aside");
  sidebar.id = "belmAdminSidebar";
  sidebar.className = "belm-admin-sidebar";
  sidebar.setAttribute("aria-label", "BELM administration sidebar");

  const userCard = document.createElement("div");
  userCard.className = "belm-sidebar-user";
  const userName = document.createElement("strong");
  userName.textContent = user.name || "System user";
  const userRole = document.createElement("span");
  userRole.textContent = user.role || "Assigned role";
  userCard.append(userName, userRole);

  const nav = document.createElement("nav");
  nav.className = "belm-sidebar-nav";
  let lastSection = null;
  const currentPath = pathname;
  visiblePages.forEach((page) => {
    if (page.section && page.section !== lastSection) {
      const heading = document.createElement("div");
      heading.className = "belm-sidebar-section";
      heading.textContent = page.section;
      nav.appendChild(heading);
      lastSection = page.section;
    }

    const link = document.createElement("a");
    link.className = "belm-sidebar-link";
    if (page.priority) link.classList.add("workflow");
    link.href = page.href;
    if (page.paths.some((path) => currentPath === path || currentPath.startsWith(path))) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    const icon = document.createElement("span");
    icon.className = "belm-sidebar-icon";
    icon.textContent = page.short;
    const label = document.createElement("span");
    label.textContent = page.label;
    label.title = page.label;
    link.append(icon, label);
    if (page.applications) link.id = "belmSidebarApplications";
    nav.appendChild(link);
  });

  const footer = document.createElement("div");
  footer.className = "belm-sidebar-footer";
  const themeToggle = document.createElement("button");
  themeToggle.className = "belm-sidebar-theme-toggle";
  themeToggle.type = "button";
  const updateThemeToggleLabel = () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    themeToggle.textContent = isDark ? "☀ Light mode" : "☾ Dark mode";
  };
  updateThemeToggleLabel();
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyAdminTheme(next);
    updateThemeToggleLabel();
  });
  const logout = document.createElement("button");
  logout.className = "belm-sidebar-logout";
  logout.type = "button";
  logout.textContent = "Log out securely";
  logout.addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
  footer.append(themeToggle, logout);

  sidebar.append(userCard, nav);
  sidebar.appendChild(footer);

  const toggle = document.createElement("button");
  toggle.className = "belm-sidebar-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open administration menu");
  toggle.textContent = "☰";
  const scrim = document.createElement("button");
  scrim.className = "belm-sidebar-scrim";
  scrim.type = "button";
  scrim.setAttribute("aria-label", "Close administration menu");
  const close = () => document.body.classList.remove("belm-sidebar-open");
  toggle.addEventListener("click", () => document.body.classList.toggle("belm-sidebar-open"));
  scrim.addEventListener("click", close);
  nav.addEventListener("click", close);

  document.body.prepend(scrim);
  document.body.prepend(sidebar);
  document.body.prepend(toggle);
  document.body.classList.add("belm-sidebar-ready");

  const applications = document.getElementById("belmSidebarApplications");
  if (applications) {
    fetch("/api/applications?status=PENDING", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        const count = Array.isArray(data?.applications) ? data.applications.length : 0;
        if (count < 1) return;
        const badge = document.createElement("span");
        badge.className = "belm-sidebar-badge";
        badge.textContent = String(count);
        applications.appendChild(badge);
      })
      .catch(() => {});
  }
})();
