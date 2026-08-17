(function () {
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
    "/engineering-manager/",
  ];
  const isAdminArea = pathname.startsWith("/admin/")
    || standaloneAdminPaths.some((path) => pathname === path || pathname.startsWith(path))
    || sharedBreakdownAdmin;
  if (!isAdminArea || pathname === "/login") return;

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
    { section: "Operations", key: "service-requests", label: "Service Requests", short: "SR", href: "/service-request-manager/", paths: ["/service-request-manager/", "/admin/service-requests"], priority: true },
    { section: "Operations", key: "service-requests", label: "Maintenance Process", short: "BP", href: "/breakdown-workflow/?actor=admin", paths: ["/breakdown-workflow/"], priority: true },
    { section: "Maintenance", key: "checklist-templates", label: "Checklist Templates", short: "CL", href: "/checklist-manager/", paths: ["/checklist-manager/", "/admin/checklist-templates"] },
    { section: "Maintenance", key: "checklist-templates", label: "Controller Pin Out", short: "CP", href: "/controller-pinouts-manager/", paths: ["/controller-pinouts-manager/"] },
    { section: "Maintenance", key: "roles", label: "Engineering", short: "EG", href: "/engineering-manager/", paths: ["/engineering-manager/"] },
    { section: "Maintenance", key: "customers", label: "Customers & Machines", short: "CM", href: "/customers-manager/", paths: ["/customers-manager/", "/admin/customers"] },
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
  const visiblePages = pages.filter((page) =>
    page.key === null || isSuperAdmin || allowedPages.includes(page.key)
  );

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
  userRole.textContent = user.role || "Assigned role";
  userCopy.append(userName, userRole);
  userCard.append(userAvatar, userCopy);

  const nav = document.createElement("nav");
  nav.className = "belm-sidebar-nav";
  const currentPath = pathname;
  const currentHash = window.location.hash || "";
  const groupedPages = visiblePages.reduce((groups, page) => {
    const section = page.section || "General";
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(page);
    return groups;
  }, new Map());

  groupedPages.forEach((sectionPages, sectionName) => {
    const group = document.createElement("details");
    group.className = "belm-sidebar-group";
    const hasActivePage = sectionPages.some((page) => {
      const pathMatches = page.paths.some((path) => currentPath === path || currentPath.startsWith(path));
      const hashMatches = page.hash ? currentHash === page.hash : (page.hashNot ? currentHash !== page.hashNot : true);
      return pathMatches && hashMatches;
    });
    const stored = localStorage.getItem(`belm-sidebar-group:${sectionName}`);
    group.open = hasActivePage || stored !== "closed";

    const heading = document.createElement("summary");
    heading.className = "belm-sidebar-section";
    heading.innerHTML = `<span>${sectionName}</span><span class="belm-sidebar-section-chevron" aria-hidden="true">⌄</span>`;
    group.appendChild(heading);

    const groupLinks = document.createElement("div");
    groupLinks.className = "belm-sidebar-group-links";
    sectionPages.forEach((page) => {
      const link = document.createElement("a");
      link.className = "belm-sidebar-link";
      link.dataset.section = sectionName;
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
      groupLinks.appendChild(link);
    });
    group.appendChild(groupLinks);
    group.addEventListener("toggle", () => {
      localStorage.setItem(`belm-sidebar-group:${sectionName}`, group.open ? "open" : "closed");
    });
    nav.appendChild(group);
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

  sidebar.append(brand, userCard, searchWrap, nav);
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

  // V279 - wire the search box: filter links by label text, hide empty
  // sections, and remember which sections the user had open so turning
  // the search off restores exactly how the sidebar looked before.
  (function wireSidebarSearch() {
    const input = document.getElementById("belmSidebarSearch");
    const clearButton = searchWrap.querySelector(".belm-sidebar-search-clear");
    if (!input) return;
    let openStateBeforeSearch = null;
    function applyFilter(query) {
      const term = query.trim().toLowerCase();
      clearButton.classList.toggle("hidden", term === "");
      const groups = nav.querySelectorAll(".belm-sidebar-group");
      if (term === "") {
        groups.forEach((group) => {
          group.classList.remove("belm-sidebar-search-hidden");
          group.querySelectorAll(".belm-sidebar-link").forEach((link) => link.classList.remove("belm-sidebar-search-hidden"));
          if (openStateBeforeSearch?.has(group)) group.open = openStateBeforeSearch.get(group);
        });
        openStateBeforeSearch = null;
        return;
      }
      if (!openStateBeforeSearch) {
        openStateBeforeSearch = new Map();
        groups.forEach((group) => openStateBeforeSearch.set(group, group.open));
      }
      groups.forEach((group) => {
        let anyMatch = false;
        group.querySelectorAll(".belm-sidebar-link").forEach((link) => {
          const label = (link.textContent || "").toLowerCase();
          const matches = label.includes(term);
          link.classList.toggle("belm-sidebar-search-hidden", !matches);
          if (matches) anyMatch = true;
        });
        group.classList.toggle("belm-sidebar-search-hidden", !anyMatch);
        if (anyMatch) group.open = true;
      });
    }
    input.addEventListener("input", () => applyFilter(input.value));
    clearButton.addEventListener("click", () => {
      input.value = "";
      applyFilter("");
      input.focus();
    });
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
      })
      .catch(() => {});
  }
})();
