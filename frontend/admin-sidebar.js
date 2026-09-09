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
    // V701: PORTAL-BELM WM / PORTAL-CWM removed as standalone menu rows -
    // the sidebar felt cluttered with them alongside everything else, and
    // the BELM brand mark at the top of the sidebar already opens
    // /belm-workshop/. Both routes remain fully reachable, just not as a
    // dedicated numbered menu item.
    { section: "Parts & Procurement", key: "spare-parts", label: "Spare Parts Inventory", short: "SP", href: "/spare-parts-manager/", paths: ["/spare-parts-manager/", "/admin/spare-parts"], hashNot: "#equivalent-spares-panel" },
    { section: "Parts & Procurement", key: "spare-parts", label: "Equivalent Spares", short: "EQ", href: "/spare-parts-manager/#equivalent-spares-panel", paths: ["/spare-parts-manager/"], hash: "#equivalent-spares-panel" },
    { section: "Parts & Procurement", key: "suppliers", label: "Suppliers Directory", short: "SU", href: "/suppliers-manager/", paths: ["/suppliers-manager/", "/admin/suppliers"] },
    { section: "Finance", key: "bank-manager", superAdminOnly: true, label: "Bank Manager", short: "BM", href: "/bank-controller/", paths: ["/bank-controller/"] },
    // V702: Coordinator is now one menu item, reachable from every Admin
    // page - not buried inside the Portal switcher on a single page.
    { section: "Administration", key: null, superAdminOnly: true, label: "Coordinator", short: "CO", href: "/coordinator/", paths: ["/coordinator/"] },
    { section: "Finance", key: "billing", label: "Billing & Finance", short: "BF", href: "/billing-manager/", paths: ["/billing-manager/", "/admin/billing"] },
    { section: "Administration", key: "roles", label: "Recycle Bin", short: "RB", href: "/recycle-bin/", paths: ["/recycle-bin/"] },
    { section: "Administration", key: "roles", label: "BELM Staff Access", short: "RU", href: "/roles-manager/", paths: ["/roles-manager/", "/admin/roles"] },
    { section: "Administration", key: "settings", label: "System Settings", short: "SE", href: "/settings-manager/", paths: ["/settings-manager/", "/admin/settings"] },
  ];

  // V700: thin outline icons (Feather/Lucide-style, 20x20, currentColor)
  // matched by keyword against each menu item's label. Visual only - it
  // does not touch routing, permissions or the `short` codes used for the
  // badge counter.
  const SIDEBAR_ICON_SET = {
    grid: '<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6" height="6" rx="1.3"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.3"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.3"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.3"/></svg>',
    personPlus: '<svg viewBox="0 0 20 20"><circle cx="8" cy="6.5" r="3"/><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15.5 6.5h3M17 5v3"/></svg>',
    shield: '<svg viewBox="0 0 20 20"><path d="M10 2.5 16 5v5c0 4-3 6.5-6 7.5-3-1-6-3.5-6-7.5V5z"/><path d="M7.3 9.8l1.8 1.8 3.6-3.9"/></svg>',
    chart: '<svg viewBox="0 0 20 20"><path d="M3 17V9M9 17V3M15 17v-6"/></svg>',
    clipboard: '<svg viewBox="0 0 20 20"><rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7.5 2.5h5v2h-5z"/><path d="M6.5 9h7M6.5 12h7M6.5 15h4"/></svg>',
    cpu: '<svg viewBox="0 0 20 20"><rect x="5" y="5" width="10" height="10" rx="1.3"/><path d="M8 5V2M12 5V2M8 18v-3M12 18v-3M5 8H2M5 12H2M18 8h-3M18 12h-3"/></svg>',
    wrench: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5a4 4 0 0 0-5.4 4.6L3 13.2V17h3.8l5.1-5.1a4 4 0 0 0 4.6-5.4l-2.8 2.8-2-2z"/></svg>',
    store: '<svg viewBox="0 0 20 20"><path d="M3 8l1-4h12l1 4"/><path d="M3 8v8h14V8"/><path d="M8 16v-4h4v4"/></svg>',
    box: '<svg viewBox="0 0 20 20"><path d="M10 2.5 17 6v8l-7 3.5L3 14V6z"/><path d="M3 6l7 3.5M17 6l-7 3.5M10 9.5V17"/></svg>',
    truck: '<svg viewBox="0 0 20 20"><path d="M2 6h9v7H2z"/><path d="M11 9h4l3 3v1h-7z"/><circle cx="5.5" cy="15" r="1.5"/><circle cx="14.5" cy="15" r="1.5"/></svg>',
    bank: '<svg viewBox="0 0 20 20"><path d="M10 2 2 6.5h16z"/><path d="M3.5 8v7M7 8v7M13 8v7M16.5 8v7"/><path d="M2 17h16"/></svg>',
    receipt: '<svg viewBox="0 0 20 20"><path d="M5 2.5h10v15l-2-1.3-1.7 1.3-1.3-1.3-1.3 1.3-1.7-1.3-2 1.3z"/><path d="M7.5 7h5M7.5 10h5M10 6v2m0 3v1"/></svg>',
    trash: '<svg viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l.7 10.5a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10.5"/><path d="M8.3 8.5v5M11.7 8.5v5"/></svg>',
    gear: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2.2M10 15.2v2.2M17.4 10h-2.2M4.8 10H2.6M15.1 4.9l-1.6 1.6M6.5 13.5l-1.6 1.6M15.1 15.1l-1.6-1.6M6.5 6.5 4.9 4.9"/></svg>',
    users: '<svg viewBox="0 0 20 20"><circle cx="6.5" cy="6.5" r="2.7"/><circle cx="14" cy="7" r="2.3"/><path d="M2 17c0-2.8 2-4.7 4.5-4.7s4.5 1.9 4.5 4.7M11.5 17c0-2.3 1.7-4 4-4s4 1.7 4 4"/></svg>',
    clock: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.3"/><path d="M10 5.5V10l3.2 2"/></svg>',
    dot: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2"/></svg>',
    hub: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.4"/><circle cx="10" cy="3" r="1.4"/><circle cx="10" cy="17" r="1.4"/><circle cx="3" cy="10" r="1.4"/><circle cx="17" cy="10" r="1.4"/><path d="M10 5.4V7.6M10 12.4v2.2M5.4 10H7.6M12.4 10h2.2"/></svg>',
  };
  function sidebarIconFor(label) {
    const l = String(label || "").toLowerCase();
    if (l.includes("coordinator")) return SIDEBAR_ICON_SET.hub;
    if (l.includes("overview") || l.includes("dashboard")) return SIDEBAR_ICON_SET.grid;
    if (l.includes("registration")) return SIDEBAR_ICON_SET.personPlus;
    if (l.includes("staff") || l.includes("roles") || l.includes("users")) return SIDEBAR_ICON_SET.shield;
    if (l.includes("report") || l.includes("analysis") || l.includes("analytics")) return SIDEBAR_ICON_SET.chart;
    if (l.includes("checklist")) return SIDEBAR_ICON_SET.clipboard;
    if (l.includes("pin out") || l.includes("controller")) return SIDEBAR_ICON_SET.cpu;
    if (l.includes(" wm") || l.includes("job card") || l.includes("workshop")) return SIDEBAR_ICON_SET.wrench;
    if (l.includes("cwm") || l.includes("portal")) return SIDEBAR_ICON_SET.store;
    if (l.includes("spare") || l.includes("equivalent")) return SIDEBAR_ICON_SET.box;
    if (l.includes("supplier") || l.includes("procurement")) return SIDEBAR_ICON_SET.truck;
    if (l.includes("bank")) return SIDEBAR_ICON_SET.bank;
    if (l.includes("billing") || l.includes("finance") || l.includes("petty cash")) return SIDEBAR_ICON_SET.receipt;
    if (l.includes("recycle") || l.includes("bin")) return SIDEBAR_ICON_SET.trash;
    if (l.includes("setting")) return SIDEBAR_ICON_SET.gear;
    if (l.includes("technician")) return SIDEBAR_ICON_SET.users;
    if (l.includes("activity")) return SIDEBAR_ICON_SET.clock;
    return SIDEBAR_ICON_SET.dot;
  }

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
    { section: "Nested", key: "job-cards", namedRoles: ["Procurement","Workshop Manager","Engineer","Store Keeper"], label: "PORTAL-BELM WM", short: "BW", href: "/belm-workshop/", paths: ["/belm-workshop/"] },
    { section: "Nested", key: "customers", label: "PORTAL-CWM", short: "CW", href: "/portal-cwm/", paths: ["/portal-cwm/"] },
  ];
  const canSeePage = (page) => {
    if (page.superAdminOnly) return isSuperAdmin;
    if (page.key === null || isSuperAdmin) return true;
    if (Array.isArray(page.namedRoles)) {
      return page.namedRoles.some((role) => String(role).toLowerCase() === String(user.role || '').toLowerCase());
    }
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
  brand.href = "/belm-workshop/";
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
    backLink.href = "/belm-workshop/";
    backLink.innerHTML = `<span class="belm-sidebar-num"></span><span class="belm-sidebar-icon">←</span><span>Back to Main Home</span>`;
    backLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.assign("/belm-workshop/");
    });
    nav.appendChild(backLink);
  }

  // V357: one simple A-Z navigation list. Category headings intentionally
  // stay out of the UI so every destination is visible and predictable.
  const sortedPages = [...visiblePages].sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""), "en", { sensitivity: "base" })
  );

  sortedPages.forEach((page, index) => {
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
    const num = document.createElement("span");
    num.className = "belm-sidebar-num";
    num.setAttribute("aria-hidden", "true");
    num.textContent = String(index + 1);
    const icon = document.createElement("span");
    icon.className = "belm-sidebar-icon";
    icon.innerHTML = sidebarIconFor(page.label);
    const label = document.createElement("span");
    label.textContent = page.label;
    // V700: label.title removed - full text is always visible (V488 wraps
    // instead of truncating), so the native tooltip only duplicated the
    // same text in a floating box on hover/long-press (touch devices).
    link.append(num, icon, label);
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
    const labels = Array.from(sidebar.querySelectorAll(".belm-sidebar-link > span:nth-child(3)"));
    const labelWidth = labels.reduce((max, label) => Math.max(max, label.scrollWidth || 0), 0);
    const brandCopy = sidebar.querySelector(".belm-sidebar-brand-copy");
    const userCopy = sidebar.querySelector(".belm-sidebar-user-copy");
    const brandWidth = brandCopy ? (brandCopy.scrollWidth + 96) : 0;
    const userWidth = userCopy ? (userCopy.scrollWidth + 84) : 0;
    // num 16 + gap 10 + icon 30 + gap 10 + horizontal link padding 20 + safe room for badge/border
    const menuWidth = labelWidth + 118;
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
