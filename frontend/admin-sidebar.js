(function () {
  if (new URLSearchParams(window.location.search).get("embed") === "1") return;
  if (document.getElementById("belmAdminSidebar")) return;

  const pathname = window.location.pathname;
  const query = new URLSearchParams(window.location.search);
  const requestedActor = String(query.get("actor") || query.get("source") || "").toLowerCase();
  const activeAccountType = String(localStorage.getItem("belm_active_account_type") || "").toLowerCase();
  const sharedBreakdownAdmin = pathname.startsWith("/breakdown-workflow/")
    && (requestedActor === "admin" || (!requestedActor && activeAccountType === "admin"));
  const standaloneAdminPaths = [
    "/overview-manager/",
    "/customers-manager/",
    "/admin-applications/",
    "/checklist-manager/",
    "/controller-pinouts-manager/",
    "/service-request-manager/",
    "/spare-parts-manager/",
    "/billing-manager/",
    "/suppliers-manager/",
    "/reports-manager/",
    "/roles-manager/",
    "/settings-manager/",
    "/bank-controller/",
    "/recycle-bin/",
    "/portal-cwm/",
    "/belm-workshop/",
  ];
  const isAdminArea = pathname.startsWith("/admin/")
    || standaloneAdminPaths.some((path) => pathname === path || pathname.startsWith(path))
    || sharedBreakdownAdmin;
  if (!isAdminArea || pathname === "/login") return;

  // V479: final duplicate TECHNICAL DEP cleanup.
  // The current BELM sidebar no longer owns a TECHNICAL DEP main-menu item,
  // but the legacy React shell can render its old /customers-manager/ shortcut
  // after this script has already started. Remove only that legacy navigation
  // row; the /customers-manager/ route and Customer Overview nested entry stay
  // fully functional.
  const removeLegacyTechnicalDepNavigation = () => {
    if (pathname.startsWith("/customers-manager/")) return;
    document.querySelectorAll('#root a[href^="/customers-manager/"], #root [role="link"][href^="/customers-manager/"]').forEach((link) => {
      const label = String(link.textContent || link.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      if (!label.includes("TECHNICAL DEP") && !label.includes("CUSTOMERS & MACHINES")) return;
      const row = link.closest('li, [role="listitem"], .nav-item, .menu-item, .sidebar-item') || link;
      row.remove();
    });
  };
  removeLegacyTechnicalDepNavigation();
  const legacyTechDepObserver = new MutationObserver(removeLegacyTechnicalDepNavigation);
  legacyTechDepObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => legacyTechDepObserver.disconnect(), { once: true });

  const token = localStorage.getItem("belm_admin_token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("belm_admin_user") || "null");
  } catch (_) {}

  if (!token || !user) {
    window.location.replace("/login");
    return;
  }

  if (user.role === "Technician") {
    window.location.replace("/tech");
    return;
  }

  // V198: theme is owned by the global personal-theme manager. The same
  // preference follows this exact login across every page and device.
  function applyAdminTheme(theme) {
    if (window.BELMTheme) return window.BELMTheme.set(theme);
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    document.documentElement.classList.toggle("dark", safeTheme === "dark");
    return Promise.resolve(safeTheme);
  }


  const pages = [
    { section: "Operations", key: "overview", label: "Overview", short: "OV", href: "/overview-manager/", paths: ["/overview-manager/", "/admin/overview"] },
    { section: "Operations", key: "customers", label: "Registrations", short: "RG", href: "/admin-applications/", paths: ["/admin-applications/"], applications: true, priority: true },
    { section: "Operations", key: "reports", label: "Reports & Analysis", short: "RA", href: "/reports-manager/", paths: ["/reports-manager/", "/admin/reports"], priority: true },
    // V414: Job Cards are owned by TECHNICAL DEP > Job Card only.
    // Do not expose a second standalone admin navigation entry.
    { section: "Maintenance", key: "checklist-templates", label: "Checklist Templates", short: "CL", href: "/checklist-manager/", paths: ["/checklist-manager/", "/admin/checklist-templates"] },
    { section: "Maintenance", key: "checklist-templates", label: "Controller Pin Out", short: "CP", href: "/controller-pinouts-manager/", paths: ["/controller-pinouts-manager/"] },
    // V471: direct commercial workshop portals for fast testing and operations.
    { section: "Maintenance", key: "job-cards", anyKeys: ["roles","job-cards","service-requests","spare-parts","suppliers"], namedRoles: ["Procurement","Workshop Manager","Engineer"], label: "PORTAL-BELM WM", short: "BW", href: "/belm-workshop/", paths: ["/belm-workshop/"] },
    { section: "Maintenance", key: "customers", label: "PORTAL-CWM", short: "CW", href: "/portal-cwm/", paths: ["/portal-cwm/"] },
    { section: "Parts & Procurement", key: "spare-parts", label: "Spare Parts Inventory", short: "SP", href: "/spare-parts-manager/", paths: ["/spare-parts-manager/", "/admin/spare-parts"], hashNot: "#equivalent-spares-panel" },
    { section: "Parts & Procurement", key: "spare-parts", label: "Equivalent Spares", short: "EQ", href: "/spare-parts-manager/#equivalent-spares-panel", paths: ["/spare-parts-manager/"], hash: "#equivalent-spares-panel" },
    { section: "Parts & Procurement", key: "suppliers", label: "Suppliers Directory", short: "SU", href: "/suppliers-manager/", paths: ["/suppliers-manager/", "/admin/suppliers"] },
    { section: "Finance", key: "bank-manager", label: "Bank Manager", short: "BM", href: "/bank-controller/", paths: ["/bank-controller/"] },
    { section: "Finance", key: "billing", label: "Billing & Finance", short: "BF", href: "/billing-manager/", paths: ["/billing-manager/", "/admin/billing"] },
    { section: "Administration", key: "roles", label: "Recycle Bin", short: "RB", href: "/recycle-bin/", paths: ["/recycle-bin/"] },
    { section: "Administration", key: "roles", label: "BELM Staff Access", short: "RU", href: "/roles-manager/", paths: ["/roles-manager/", "/admin/roles"] },
    { section: "Administration", key: "settings", label: "System Settings", short: "SE", href: "/settings-manager/", paths: ["/settings-manager/", "/admin/settings"] },
  ];

  const isSuperAdmin = user.role === "Super Admin" || user.allowedPages === null;
  const allowedPages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
  // V458: nested/sub-navigation. On TECHNICAL DEP and BELM WORKSHOP, the
  // full admin menu is replaced by a compact workshop sidebar (Customer
  // Overview / PORTAL-BELM WM / PORTAL-CWM) plus a "Back to Main Menu" link at the top -
  // every other admin page keeps the full menu unchanged.
  const NESTED_SIDEBAR_PATHS = ["/customers-manager/", "/belm-workshop/", "/portal-cwm/"];
  const isNestedSidebar = NESTED_SIDEBAR_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  const nestedPages = [
    { section: "Nested", key: "customers", label: "Customer Overview", short: "CO", href: "/customers-manager/", paths: ["/customers-manager/", "/admin/customers"] },
    { section: "Nested", key: "job-cards", anyKeys: ["roles","job-cards","service-requests","spare-parts","suppliers"], namedRoles: ["Procurement","Workshop Manager","Engineer"], label: "PORTAL-BELM WM", short: "BW", href: "/belm-workshop/", paths: ["/belm-workshop/"] },
    { section: "Nested", key: "customers", label: "PORTAL-CWM", short: "CW", href: "/portal-cwm/", paths: ["/portal-cwm/"] },
  ];
  const canSeePage = (page) => {
    if (page.key === null || isSuperAdmin) return true;
    if (Array.isArray(page.namedRoles) && page.namedRoles.some((role) => String(role).toLowerCase() === String(user.role || '').toLowerCase())) return true;
    if (Array.isArray(page.anyKeys)) return page.anyKeys.some((key) => allowedPages.includes(key));
    return allowedPages.includes(page.key);
  };
  const visiblePages = (isNestedSidebar ? nestedPages : pages).filter(canSeePage);

  const sidebar = document.createElement("aside");
  sidebar.id = "belmAdminSidebar";
  sidebar.className = "belm-admin-sidebar";
  sidebar.setAttribute("aria-label", "BELM administration sidebar");

  const brand = document.createElement("a");
  brand.className = "belm-sidebar-brand";
  brand.href = "/overview-manager/";
  brand.setAttribute("aria-label", "BELM General Tech home");
  brand.innerHTML = `
    <span class="belm-sidebar-brand-mark" aria-hidden="true"><span>B</span></span>
    <span class="belm-sidebar-brand-copy">
      <strong>BELM GENERAL TECH</strong>
      <small>Operations & Service Portal</small>
      <span class="belm-sidebar-brand-palette" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </span>`;

  const userCard = document.createElement("div");
  userCard.className = "belm-sidebar-user";
  const userAvatar = document.createElement("span");
  userAvatar.className = "belm-sidebar-user-avatar";
  userAvatar.textContent = String(user.name || "BU")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "BU";
  const userCopy = document.createElement("span");
  userCopy.className = "belm-sidebar-user-copy";
  const userName = document.createElement("strong");
  userName.textContent = user.name || "System user";
  const userRole = document.createElement("span");
  userRole.textContent = user.role === "Engineer" ? "Workshop Manager" : (user.role || "Assigned role");
  userCopy.append(userName, userRole);
  userCard.append(userAvatar, userCopy);

  const nav = document.createElement("nav");
  nav.className = "belm-sidebar-nav belm-sidebar-nav-flat";
  const currentPath = pathname;
  const currentHash = window.location.hash || "";

  if (isNestedSidebar) {
    const backLink = document.createElement("a");
    backLink.className = "belm-sidebar-link belm-sidebar-back-link";
    backLink.href = "/overview-manager/";
    backLink.innerHTML = `<span class="belm-sidebar-icon">←</span><span>Back to Main Menu</span>`;
    nav.appendChild(backLink);
  }

  // V357: one simple A-Z navigation list. Category headings intentionally
  // stay out of the UI so every destination is visible and predictable.
  const sortedPages = [...visiblePages].sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""), "en", { sensitivity: "base" })
  );

  sortedPages.forEach((page) => {
    const link = document.createElement("a");
    link.className = "belm-sidebar-link";
    link.dataset.section = page.section || "";
    if (page.priority) link.classList.add("workflow");
    link.href = page.href;
    const pathMatches = page.paths.some((path) => currentPath === path || currentPath.startsWith(path));
    const hashMatches = page.hash ? currentHash === page.hash : (page.hashNot ? currentHash !== page.hashNot : true);
    if (pathMatches && hashMatches) {
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
  themeToggle.dataset.belmThemeToggle = "1";
  const updateThemeToggleLabel = () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    themeToggle.textContent = isDark ? "☀ Light mode" : "☾ Dark mode";
  };
  updateThemeToggleLabel();
  themeToggle.addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    await applyAdminTheme(next);
    updateThemeToggleLabel();
  });
  window.addEventListener("belm-theme-change", updateThemeToggleLabel);
  const logout = document.createElement("button");
  logout.className = "belm-sidebar-logout";
  logout.type = "button";
  logout.textContent = "Log out securely";
  logout.addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login";
  });
  footer.append(themeToggle, logout);

  // V279 - the sidebar has grown to 17+ items across several sections;
  // a quick search makes it faster to jump straight to one instead of
  // scanning/expanding every group. Filters by label text as you type;
  // a section with zero matches hides entirely, one with any match
  // stays open so the result is actually visible.
  const searchWrap = document.createElement("div");
  searchWrap.className = "belm-sidebar-search";
  searchWrap.innerHTML = `
    <span class="belm-sidebar-search-icon" aria-hidden="true">⌕</span>
    <input type="search" id="belmSidebarSearch" placeholder="Search menu…" aria-label="Search sidebar menu">
    <button type="button" class="belm-sidebar-search-clear hidden" aria-label="Clear search">×</button>`;

  if (isNestedSidebar) {
    sidebar.append(brand, userCard, nav);
  } else {
    sidebar.append(brand, userCard, searchWrap, nav);
  }
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
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a.belm-sidebar-link")) close();
  });

  document.body.prepend(scrim);
  document.body.prepend(sidebar);
  document.body.prepend(toggle);
  document.body.classList.add("belm-sidebar-ready");

  // V488: size the desktop sidebar from the actual menu text instead of a
  // fixed width. This keeps short nested menus compact while longer labels
  // remain fully readable. Width is deliberately capped for display fit.
  function fitSidebarToText() {
    const desktop = window.matchMedia("(min-width: 981px)").matches;
    const labels = Array.from(sidebar.querySelectorAll(".belm-sidebar-link > span:nth-child(2)"));
    const labelWidth = labels.reduce((max, label) => Math.max(max, label.scrollWidth || 0), 0);
    const brandCopy = sidebar.querySelector(".belm-sidebar-brand-copy");
    const userCopy = sidebar.querySelector(".belm-sidebar-user-copy");
    const brandWidth = brandCopy ? (brandCopy.scrollWidth + 96) : 0;
    const userWidth = userCopy ? (userCopy.scrollWidth + 84) : 0;
    // icon 30 + gap 10 + horizontal link padding 20 + safe room for badge/border
    const menuWidth = labelWidth + 92;
    const desired = Math.ceil(Math.max(235, menuWidth, brandWidth, userWidth));
    const fitted = Math.min(360, Math.max(235, desired));
    document.documentElement.style.setProperty("--belm-sidebar-width", `${fitted}px`);
    sidebar.dataset.contentFit = desktop ? "desktop" : "mobile";
  }

  fitSidebarToText();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSidebarToText).catch(() => {});
  window.addEventListener("resize", fitSidebarToText, { passive: true });

  // V357: flat A-Z list search; there are no category/group containers.
  (function wireSidebarSearch() {
    const input = document.getElementById("belmSidebarSearch");
    const clearButton = searchWrap.querySelector(".belm-sidebar-search-clear");
    if (!input) return;
    function applyFilter(query) {
      const term = query.trim().toLowerCase();
      clearButton.classList.toggle("hidden", term === "");
      nav.querySelectorAll(".belm-sidebar-link").forEach((link) => {
        const label = (link.textContent || "").toLowerCase();
        link.classList.toggle("belm-sidebar-search-hidden", term !== "" && !label.includes(term));
      });
    }
    input.addEventListener("input", () => applyFilter(input.value));
    clearButton.addEventListener("click", () => {
      input.value = "";
      applyFilter("");
      input.focus();
    });
  })();

  // V357: every admin Refresh / Sync control gives immediate visible motion.
  // This is UI feedback only; it does not alter the page's existing refresh logic.
  (function wireRefreshMotionFeedback() {
    const timers = new WeakMap();
    document.addEventListener("click", (event) => {
      const control = event.target.closest("button, a");
      if (!control) return;
      const id = String(control.id || "").toLowerCase();
      const label = String(control.textContent || "").trim().toLowerCase();
      const isRefreshControl = id.includes("refresh") || /(^|\s)(refresh|sync)(\s|$|\/)/i.test(label);
      if (!isRefreshControl) return;

      const previous = timers.get(control);
      if (previous) window.clearTimeout(previous);
      control.classList.remove("belm-refresh-working");
      void control.offsetWidth;
      control.classList.add("belm-refresh-working");
      control.setAttribute("aria-busy", "true");
      const timer = window.setTimeout(() => {
        control.classList.remove("belm-refresh-working");
        control.removeAttribute("aria-busy");
        timers.delete(control);
      }, 1600);
      timers.set(control, timer);
    }, true);
  })();

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
        fitSidebarToText();
      })
      .catch(() => {});
  }
})();
