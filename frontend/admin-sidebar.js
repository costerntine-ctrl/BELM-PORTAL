(function () {
  if (new URLSearchParams(window.location.search).get("embed") === "1") return;
  if (document.getElementById("belmAdminSidebar")) return;

  // SVG icons halisi zilizotolewa kwenye dashibodi (mockups) za BELM — navy/gold
  // design language. Zinatumika badala ya herufi-mbili (short codes) pekee kama
  // ramani ipo; vinginevyo herufi-mbili za zamani zinabaki (hazi-vunji chochote).
  const SIDEBAR_ICON_PATHS = {
    overview: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    customer: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M17 8h4M19 6v4"/>',
    reports: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    "checklist-templates": '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v2h6V3M9 10l1.7 1.7L14 8.3M9 16h6"/>',
    "job-cards": '<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>',
    "spare-parts": '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    suppliers: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.6"/><path d="M2.5 20c0-3.3 2.5-5.6 5.5-5.6s5.5 2.3 5.5 5.6M14.5 20c0-2.4-1-4.3-2.6-5.3.7-.5 1.6-.7 2.6-.7 2.7 0 5 2.1 5 4.9"/>',
    "bank-manager": '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/>',
    billing: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    roles: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/><path d="M20 4l1.2 1.2M20 8l1.6-.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'
  };
  const SIDEBAR_ICON_LABEL_OVERRIDES = {
    "Controller Pin Out": '<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>',
    "Recycle Bin": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M10 11v6M14 11v6"/>',
    "Equivalent Spares": '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'
  };
  function sidebarIconSvg(key, label) {
    const inner = SIDEBAR_ICON_LABEL_OVERRIDES[label] || SIDEBAR_ICON_PATHS[key];
    if (!inner) return null;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

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
    "/belm-workshop/",
    "/belm-procurement/",
    "/contracts-workshops/",
    "/workshop-analysis/",
    "/coordinator/",
  ];
  const conditionalWorkshopAnalysis = pathname.startsWith("/workshop-analysis/")
    && (requestedActor === "admin" || activeAccountType === "admin");
  const isAdminArea = pathname.startsWith("/admin/")
    || standaloneAdminPaths.some((path) => {
      if (path === "/workshop-analysis/") return conditionalWorkshopAnalysis;
      return pathname === path || pathname.startsWith(path);
    })
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


  // V710: supplied dashboards are the canonical parent/module dashboards. Every row owns a contextual
  // module sidebar; the full main menu must never repeat inside a module.
  // Where the user supplied a dashboard, that dashboard remains the canonical
  // landing page and its visual files are not modified.
  const requestedModule = String(query.get("module") || "").toLowerCase().trim();
  const validModules = new Set(["registration","customer-overview","roles-users","workshop","inventory","procurement","finance","bank","reports","settings"]);
  const moduleOverride = validModules.has(requestedModule) ? requestedModule : "";
  const pathIs = (...prefixes) => prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  function resolveModule() {
    if (moduleOverride) return moduleOverride;
    if (pathIs("/admin-applications/", "/contracts-workshops/")) return "registration";
    if (pathIs("/customers-manager/")) return "customer-overview";
    if (pathIs("/roles-manager/")) return "roles-users";
    if (pathIs("/belm-workshop/", "/checklist-manager/", "/workshop-analysis/") || sharedBreakdownAdmin) return "workshop";
    if (pathIs("/spare-parts-manager/", "/controller-pinouts-manager/")) return "inventory";
    if (pathIs("/belm-procurement/")) return "procurement";
    if (pathIs("/suppliers-manager/")) return "procurement";
    if (pathIs("/billing-manager/")) return "finance";
    if (pathIs("/bank-controller/")) return "bank";
    if (pathIs("/reports-manager/")) return "reports";
    if (pathIs("/settings-manager/", "/coordinator/", "/recycle-bin/")) return "settings";
    return "";
  }
  const moduleKey = resolveModule();

  const M = {
    registration: {
      title: "Customer Registration", caption: "REGISTRATION MENU", icon: "customer",
      items: [
        { label:"Registration Dashboard", short:"DB", href:"/concept-dashboards/04-customer-registration/" },
        { label:"Register Customer", short:"RC", href:"/concept-dashboards/04-customer-registration/" },
        { label:"All Customers", short:"AC", href:"/customers-manager/?module=registration", paths:["/customers-manager/"], noView:true },
        { label:"Pending Approvals", short:"PA", href:"/admin-applications/?module=registration", paths:["/admin-applications/"] },
        { label:"Portal Access", short:"PO", href:"/customers-manager/?module=registration", paths:["/customers-manager/"] },
        { label:"Customer Users", short:"CU", href:"/roles-manager/?module=registration", paths:["/roles-manager/"] },
        { label:"Contracts & Service", short:"CS", href:"/contracts-workshops/?module=registration", paths:["/contracts-workshops/"] },
        { label:"Customer Machines", short:"CM", href:"/customers-manager/?view=machines&module=registration", paths:["/customers-manager/"], view:"machines" },
        { label:"Communication", short:"CO", href:"/customers-manager/?module=registration#communication", paths:["/customers-manager/"], hash:"#communication" },
        { label:"Customer Reports", short:"RP", href:"/reports-manager/?module=registration", paths:["/reports-manager/"] },
        { label:"Activity Log", short:"AL", href:"/reports-manager/?view=activity&module=registration", paths:["/reports-manager/"], view:"activity" },
        { label:"My Profile", short:"ME", href:"/settings-manager/?module=settings#profile" },
      ]
    },
    "customer-overview": {
      title:"Customer Overview", caption:"CUSTOMER OVERVIEW MENU", icon:"overview",
      items:[
        {label:"Customers & Machines",short:"CM",href:"/customers-manager/?module=customer-overview",paths:["/customers-manager/"]},
        {label:"Service / Job Cards",short:"JC",href:"/breakdown-workflow/?actor=admin&module=customer-overview",paths:["/breakdown-workflow/"]},
        {label:"Customer Reports",short:"RP",href:"/reports-manager/?module=customer-overview",paths:["/reports-manager/"]},
        {label:"Registration",short:"RG",href:"/admin-applications/?module=customer-overview",paths:["/admin-applications/"]},
        {label:"Refresh Customers",short:"RF",targetId:"refreshCustomersButton",href:"/customers-manager/?module=customer-overview",refresh:true},
      ]
    },
    "roles-users": {
      title:"Roles & Users", caption:"ROLES & USERS MENU", icon:"roles",
      items:[
        {label:"Users & Roles",short:"UR",href:"/roles-manager/?module=roles-users",paths:["/roles-manager/"], noOpen:true},
        {label:"Add System User",short:"AU",href:"/roles-manager/?open=addUser&module=roles-users",paths:["/roles-manager/"],open:"addUser"},
        {label:"Add Role",short:"AR",href:"/roles-manager/?open=addRole&module=roles-users",paths:["/roles-manager/"],open:"addRole"},
        {label:"Technicians",short:"TC",href:"/roles-manager/?role=Technician&module=roles-users",paths:["/roles-manager/"],role:"Technician"},
        {label:"Workshop Managers",short:"WM",href:"/roles-manager/?role=Engineer&module=roles-users",paths:["/roles-manager/"],role:"Engineer"},
        {label:"Refresh",short:"RF",targetId:"refreshButton",href:"/roles-manager/?module=roles-users",refresh:true},
      ]
    },
    workshop: {
      title:"Workshop & Job Cards", caption:"WORKSHOP MENU", icon:"job-cards",
      items:[
        {label:"Inspection & Repair Dashboard",short:"DB",href:"/concept-dashboards/05-inspection-repair/"},
        {label:"Job Cards",short:"JC",href:"/breakdown-workflow/?actor=admin&view=job-cards&module=workshop",paths:["/breakdown-workflow/"],view:"job-cards"},
        {label:"Inspection Checklists",short:"CK",href:"/checklist-manager/?module=workshop",paths:["/checklist-manager/"]},
        {label:"Diagnosis",short:"DG",href:"/breakdown-workflow/?actor=admin&module=workshop",paths:["/breakdown-workflow/"],noView:true},
        {label:"Waiting for Spares",short:"WS",href:"/spare-parts-manager/?view=requests&module=workshop",paths:["/spare-parts-manager/"],view:"requests"},
        {label:"Testing & Completion",short:"TC",href:"/breakdown-workflow/?actor=admin&view=testing&module=workshop",paths:["/breakdown-workflow/"],view:"testing"},
        {label:"Workshop Reports",short:"RP",href:"/workshop-analysis/?actor=admin&module=workshop",paths:["/workshop-analysis/"]},
        {label:"Machine History",short:"MH",href:"/reports-manager/?module=workshop",paths:["/reports-manager/"]},
        {label:"Communication",short:"CM",href:"/customers-manager/?module=workshop",paths:["/customers-manager/"]},
      ]
    },
    inventory: {
      title:"Spare Parts Inventory", caption:"STORE / INVENTORY MENU", icon:"spare-parts",
      items:[
        {label:"Store Keeper Dashboard",short:"DB",href:"/concept-dashboards/06-storekeeper/"},
        {label:"Spare Parts Inventory",short:"SP",href:"/spare-parts-manager/?module=inventory",paths:["/spare-parts-manager/"],noView:true},
        {label:"Stock In",short:"IN",href:"/spare-parts-manager/?view=stock-in&module=inventory",paths:["/spare-parts-manager/"],view:"stock-in"},
        {label:"Stock Out / Issues",short:"OUT",href:"/spare-parts-manager/?view=stock-out&module=inventory",paths:["/spare-parts-manager/"],view:"stock-out"},
        {label:"Spare Requests",short:"SR",href:"/spare-parts-manager/?view=requests&module=inventory",paths:["/spare-parts-manager/"],view:"requests"},
        {label:"Low Stock / Shortages",short:"LS",href:"/spare-parts-manager/?view=low-stock&module=inventory",paths:["/spare-parts-manager/"],view:"low-stock"},
        {label:"Tools Register",short:"TL",href:"/spare-parts-manager/?view=tools&module=inventory",paths:["/spare-parts-manager/"],view:"tools"},
        {label:"Stock Audit",short:"AU",href:"/spare-parts-manager/?view=audit&module=inventory",paths:["/spare-parts-manager/"],view:"audit"},
        {label:"Suppliers",short:"SU",href:"/suppliers-manager/?module=inventory",paths:["/suppliers-manager/"]},
        {label:"Inventory Reports",short:"RP",href:"/reports-manager/?view=inventory&module=inventory",paths:["/reports-manager/"]},
      ]
    },
    procurement: {
      title:"Procurement", caption:"PROCUREMENT MENU", icon:"spare-parts",
      items:[
        {label:"Procurement Dashboard",short:"DB",href:"/concept-dashboards/03-procurement/"},
        {label:"Spare Purchase Requests",short:"PR",href:"/belm-procurement/?module=procurement",paths:["/belm-procurement/"],noView:true},
        {label:"Purchase Records",short:"RC",href:"/belm-procurement/?view=records&module=procurement",paths:["/belm-procurement/"],view:"records"},
        {label:"Pending Proforma",short:"PI",href:"/belm-procurement/?view=proforma&module=procurement",paths:["/belm-procurement/"],view:"proforma"},
        {label:"Purchase Orders",short:"PO",href:"/belm-procurement/?view=orders&module=procurement",paths:["/belm-procurement/"],view:"orders"},
        {label:"Suppliers",short:"SU",href:"/suppliers-manager/?module=procurement",paths:["/suppliers-manager/"]},
        {label:"Delivery Tracking",short:"DT",href:"/belm-procurement/?view=delivery&module=procurement",paths:["/belm-procurement/"],view:"delivery"},
        {label:"Purchase Reports",short:"RP",href:"/belm-procurement/?view=reports&module=procurement",paths:["/belm-procurement/"],view:"reports"},
        {label:"Department Analysis",short:"AN",href:"/belm-procurement/?view=analysis&module=procurement",paths:["/belm-procurement/"],view:"analysis"},
        {label:"Refresh",short:"RF",targetId:"refreshButton",href:"/belm-procurement/?module=procurement",refresh:true},
      ]
    },
    finance: {
      title:"Finance & Accounts", caption:"FINANCE & ACCOUNTS MENU", icon:"billing",
      items:[
        {label:"Finance Overview",short:"OV",href:"/billing-manager/?module=finance",paths:["/billing-manager/"],noTab:true},
        {label:"Invoices",short:"IN",href:"/billing-manager/?tab=invoices&module=finance",paths:["/billing-manager/"],tab:"invoices"},
        {label:"Payments",short:"PY",href:"/billing-manager/?tab=payments&module=finance",paths:["/billing-manager/"],tab:"payments"},
        {label:"Expenses",short:"EX",href:"/billing-manager/?tab=expenses&module=finance",paths:["/billing-manager/"],tab:"expenses"},
        {label:"Proforma",short:"PI",href:"/billing-manager/?tab=proformas&module=finance",paths:["/billing-manager/"],tab:"proformas"},
        {label:"Receipts",short:"RC",href:"/billing-manager/?tab=receipts&module=finance",paths:["/billing-manager/"],tab:"receipts"},
        {label:"New Proforma",short:"NP",targetId:"newProformaButton",href:"/billing-manager/?module=finance"},
        {label:"Record Expense",short:"RE",targetId:"newExpenseButton",href:"/billing-manager/?module=finance"},
        {label:"Refresh",short:"RF",targetId:"refreshButton",href:"/billing-manager/?module=finance",refresh:true},
      ]
    },
    bank: {
      title:"Bank Control", caption:"BANK CONTROL MENU", icon:"bank-manager",
      items:[
        {label:"Bank Accounts",short:"BK",href:"/bank-controller/?module=bank",paths:["/bank-controller/"]},
        {label:"Add Bank Account",short:"AA",targetId:"addAccountButton",href:"/bank-controller/?module=bank"},
        {label:"Edit Selected Account",short:"EA",targetId:"editAccountButton",href:"/bank-controller/?module=bank"},
        {label:"Record Withdrawal",short:"WD",targetId:"addWithdrawalButton",href:"/bank-controller/?module=bank"},
        {label:"Bank Edit Audit",short:"AU",scrollId:"bankEditAuditPanel",href:"/bank-controller/?module=bank"},
        {label:"Recent Withdrawals",short:"RW",scrollId:"withdrawalRows",href:"/bank-controller/?module=bank"},
        {label:"Refresh",short:"RF",targetId:"refreshButton",href:"/bank-controller/?module=bank",refresh:true},
      ]
    },
    reports: {
      title:"Reports & Analysis", caption:"REPORTS & ANALYSIS MENU", icon:"reports",
      items:[
        {label:"Reports Overview",short:"RP",href:"/reports-manager/?module=reports",paths:["/reports-manager/"]},
        {label:"Employee / Role Activity",short:"RA",href:"/reports-manager/?module=reports#employee-activity",paths:["/reports-manager/"],hash:"#employee-activity"},
        {label:"Workshop Analysis",short:"WA",href:"/workshop-analysis/?actor=admin&module=reports",paths:["/workshop-analysis/"]},
        {label:"Export CSV",short:"CSV",targetId:"csvButton",href:"/reports-manager/?module=reports"},
        {label:"Print / Save PDF",short:"PDF",targetId:"printButton",href:"/reports-manager/?module=reports"},
      ]
    },
    settings: {
      title:"System Settings", caption:"SYSTEM SETTINGS MENU", icon:"settings",
      items:[
        {label:"System Settings",short:"SE",href:"/settings-manager/?module=settings",paths:["/settings-manager/"]},
        {label:"Departments & Categories",short:"DP",href:"/coordinator/departments/?module=settings",paths:["/coordinator/departments/"]},
        {label:"Notification Configuration",short:"NT",href:"/coordinator/notifications/?module=settings",paths:["/coordinator/notifications/"]},
        {label:"Email Settings",short:"EM",href:"/coordinator/email/?module=settings",paths:["/coordinator/email/"]},
        {label:"WhatsApp Settings",short:"WA",href:"/coordinator/whatsapp/?module=settings",paths:["/coordinator/whatsapp/"]},
        {label:"SMS Settings",short:"SM",href:"/coordinator/sms/?module=settings",paths:["/coordinator/sms/"]},
        {label:"Management Mail",short:"MM",href:"/coordinator/management-mail/?module=settings",paths:["/coordinator/management-mail/"]},
        {label:"Recycle Bin",short:"RB",href:"/recycle-bin/?module=settings",paths:["/recycle-bin/"]},
      ]
    }
  };

  const fallback = {
    title:"BELM Workshop Manager", caption:"MODULE MENU", icon:"overview",
    items:[{label:"Return to WM Role Menu",short:"WM",href:"/concept-dashboards/01-admin-home/"}]
  };
  const moduleConfig = M[moduleKey] || fallback;
  const visiblePages = moduleConfig.items;
  const sidebar = document.createElement("aside");
  sidebar.id = "belmAdminSidebar";
  sidebar.className = "belm-admin-sidebar";
  sidebar.setAttribute("aria-label", "BELM Workshop Manager Portal sidebar");

  const brand = document.createElement("a");
  brand.className = "belm-sidebar-brand";
  brand.href = "/concept-dashboards/01-admin-home/";
  brand.setAttribute("aria-label", "Back to WM Role Menu");
  brand.innerHTML = `
    <span class="belm-sidebar-brand-mark" aria-hidden="true"><span>B</span></span>
    <span class="belm-sidebar-brand-copy">
      <strong>BELM GENERAL TECH</strong>
      <small>BELM Workshop Manager Portal</small>
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
  userRole.textContent = user.role === "Engineer" ? "Workshop Manager"
    : /system coordinator/i.test(String(user.role || "")) ? "System Settings"
    : (user.role || "Assigned role");
  userCopy.append(userName, userRole);
  userCard.append(userAvatar, userCopy);

  const moduleHeader = document.createElement("div");
  moduleHeader.className = "belm-sidebar-module-head";
  moduleHeader.innerHTML = `<a href="/concept-dashboards/01-admin-home/" class="belm-sidebar-back-main">← WM ROLE MENU</a><small>${moduleConfig.caption}</small><strong>${moduleConfig.title}</strong>`;
  document.body.classList.add(`belm-module-${moduleKey || "fallback"}`);

  const nav = document.createElement("nav");
  nav.className = "belm-sidebar-nav belm-sidebar-nav-flat";
  const currentPath = pathname;
  const currentHash = window.location.hash || "";

  // V706: no extra Back/Home row here; the BELM Workshop Manager Portal
  // entry itself is the single home destination, avoiding duplicate navigation.


  // V709: keep the order defined by the supplied dashboard/module; no A-Z
  // re-sorting because workflow order is part of the operational design.
  const currentView = String(query.get("view") || "");
  const currentOpen = String(query.get("open") || "");
  const currentRole = String(query.get("role") || "");
  const currentTab = String(query.get("tab") || "");

  function isPageActive(page) {
    const paths = Array.isArray(page.paths) ? page.paths : [];
    if (!paths.length) return false;
    const pathMatches = paths.some((path) => currentPath === path || currentPath.startsWith(path));
    if (!pathMatches) return false;
    if (page.view) return currentView === page.view;
    if (page.noView) return currentView === "";
    if (page.open) return currentOpen === page.open;
    if (page.noOpen) return currentOpen === "" && currentRole === "";
    if (page.role) return currentRole === page.role;
    if (page.tab) return currentTab === page.tab;
    if (page.noTab) return currentTab === "";
    if (page.hash) return currentHash === page.hash;
    return true;
  }

  function clickPageTarget(page) {
    const target = page.targetId ? document.getElementById(page.targetId) : null;
    if (target) { target.click(); return true; }
    if (page.scrollId) {
      const el = document.getElementById(page.scrollId);
      if (el) { el.scrollIntoView({behavior:"smooth", block:"start"}); return true; }
    }
    return false;
  }

  visiblePages.forEach((page) => {
    const samePath = page.href && (() => { try { return new URL(page.href, location.origin).pathname === pathname; } catch (_) { return false; } })();
    const shouldButton = Boolean(page.targetId || page.scrollId);
    const control = document.createElement(shouldButton ? "button" : "a");
    control.className = "belm-sidebar-link" + (shouldButton ? " belm-sidebar-action" : "");
    control.dataset.section = moduleConfig.caption || "";
    if (page.refresh) control.classList.add("workflow");
    if (shouldButton) {
      control.type = "button";
      control.addEventListener("click", () => {
        if (!clickPageTarget(page) && page.href) window.location.href = page.href;
        document.body.classList.remove("belm-sidebar-open");
      });
    } else {
      control.href = page.href;
    }
    if (isPageActive(page)) {
      control.classList.add("active");
      control.setAttribute("aria-current", "page");
    }
    const icon = document.createElement("span");
    icon.className = "belm-sidebar-icon";
    const svgMarkup = sidebarIconSvg(page.key || moduleConfig.icon, page.label);
    if (svgMarkup) icon.innerHTML = svgMarkup; else icon.textContent = page.short || "•";
    const label = document.createElement("span");
    label.textContent = page.label;
    label.title = page.label;
    control.append(icon, label);
    nav.appendChild(control);
  });

  // Deep-link helpers: the supplied dashboard bridge pages use ?view= to land
  // on a real section/action without creating duplicate pages.
  function applyContextView() {
    if (pathname.startsWith("/billing-manager/") && currentTab) {
      document.querySelector(`[data-tab="${CSS.escape(currentTab)}"]`)?.click();
    }
    if (pathname.startsWith("/spare-parts-manager/")) {
      if (currentView === "requests") document.getElementById("requestsPanel")?.scrollIntoView({block:"start"});
      if (currentView === "low-stock") { document.getElementById("selectLowStockButton")?.click(); document.getElementById("partsPanel")?.scrollIntoView({block:"start"}); }
      if (currentView === "audit") document.getElementById("storeAuditButton")?.click();
      if (currentView === "tools") document.getElementById("workshopToolIssueButton")?.click();
      if (currentView === "stock-in" || currentView === "stock-out") document.getElementById("partsPanel")?.scrollIntoView({block:"start"});
    }
    if (pathname.startsWith("/belm-procurement/")) {
      if (["records","proforma","orders","delivery"].includes(currentView)) document.getElementById("purchaseListPanel")?.scrollIntoView({block:"start"});
      if (currentView === "reports") document.querySelector(".proc-tools-card")?.scrollIntoView({block:"start"});
      if (currentView === "analysis") document.querySelector(".metric-grid")?.scrollIntoView({block:"start"});
    }
    if (pathname.startsWith("/reports-manager/") && currentHash === "#employee-activity") {
      document.getElementById("employee-activity")?.scrollIntoView({block:"start"});
    }
  }
  window.setTimeout(applyContextView, 0);
  window.setTimeout(applyContextView, 450);

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

  sidebar.append(brand, userCard, moduleHeader, nav);
  sidebar.appendChild(footer);

  const toggle = document.createElement("button");
  toggle.className = "belm-sidebar-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open BELM Workshop Manager menu");
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

  // V709: pending counts remain inside Registration content; no duplicate main-menu badge here.

})();
