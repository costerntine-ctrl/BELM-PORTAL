(function () {
  if (document.getElementById("belmAdminSidebar")) return;

  const pathname = window.location.pathname;
  const standaloneAdminPaths = [
    "/admin-menu/",
    "/overview-manager/",
    "/customers-manager/",
    "/admin-applications/",
    "/checklist-manager/",
    "/service-request-manager/",
    "/spare-parts-manager/",
    "/billing-manager/",
    "/suppliers-manager/",
    "/reports-manager/",
    "/roles-manager/",
    "/settings-manager/",
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
    window.location.replace("/login/");
    return;
  }

  if (user.role === "Technician") {
    window.location.replace("/tech");
    return;
  }

  const pages = [
    { section: "Navigation", key: null, label: "Main Menu", short: "MM", href: "/admin-menu/", paths: ["/admin-menu/"] },
    { section: "Analysis", key: "overview", label: "All Overview", short: "AO", href: "/overview-manager/", paths: ["/overview-manager/", "/admin/overview"] },
    { section: "Operations", key: "customers", label: "Customers", short: "CU", href: "/customers-manager/", paths: ["/customers-manager/", "/admin/customers"] },
    { key: "customers", label: "Registration Requests", short: "AR", href: "/admin-applications/", paths: ["/admin-applications/"], applications: true },
    { key: "checklist-templates", label: "Checklist Templates", short: "CL", href: "/checklist-manager/", paths: ["/checklist-manager/", "/admin/checklist-templates"] },
    { key: "service-requests", label: "Service Requests", short: "SR", href: "/service-request-manager/", paths: ["/service-request-manager/", "/admin/service-requests"] },
    { key: "spare-parts", label: "Spare Parts", short: "SP", href: "/spare-parts-manager/", paths: ["/spare-parts-manager/", "/admin/spare-parts"] },
    { section: "Business", key: "billing", label: "Billing & Finance", short: "BF", href: "/billing-manager/", paths: ["/billing-manager/", "/admin/billing"] },
    { key: "suppliers", label: "Suppliers", short: "SU", href: "/suppliers-manager/", paths: ["/suppliers-manager/", "/admin/suppliers"] },
    { key: "reports", label: "Reports & Comparisons", short: "RE", href: "/reports-manager/", paths: ["/reports-manager/", "/admin/reports"] },
    { section: "Administration", key: "roles", label: "Roles & Users", short: "RU", href: "/roles-manager/", paths: ["/roles-manager/", "/admin/roles"] },
    { key: "settings", label: "System Settings", short: "SE", href: "/settings-manager/", paths: ["/settings-manager/", "/admin/settings"] },
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
  brand.href = "/admin-menu/";
  const mark = document.createElement("span");
  mark.className = "belm-sidebar-brand-mark";
  mark.textContent = "B";
  const brandText = document.createElement("span");
  const brandName = document.createElement("strong");
  brandName.textContent = "BELM General Tech";
  const brandSubtitle = document.createElement("small");
  brandSubtitle.textContent = "Management Portal";
  brandText.append(brandName, brandSubtitle);
  brand.append(mark, brandText);

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
    link.append(icon, label);
    if (page.applications) link.id = "belmSidebarApplications";
    nav.appendChild(link);
  });

  const footer = document.createElement("div");
  footer.className = "belm-sidebar-footer";
  const logout = document.createElement("button");
  logout.className = "belm-sidebar-logout";
  logout.type = "button";
  logout.textContent = "Log out securely";
  logout.addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login/";
  });
  footer.appendChild(logout);
  sidebar.append(brand, userCard, nav, footer);

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
