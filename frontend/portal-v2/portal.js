(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  const number = new Intl.NumberFormat("en-TZ");
  const titleCase = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

  function decodeToken(token) {
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    } catch (_) { return null; }
  }

  function currentSession() {
    const localPreview = ["127.0.0.1", "localhost"].includes(location.hostname) && new URLSearchParams(location.search).get("preview") === "1";
    if (localPreview) return { type:"admin", key:"belm_preview_token", token:"preview", payload:{ id:"preview", name:"BELM Admin", roleName:"Super Admin" } };
    const active = String(localStorage.getItem("belm_active_account_type") || "").toLowerCase();
    const candidates = active === "customer"
      ? [["customer", "belm_customer_token"]]
      : active === "technician"
        ? [["technician", "belm_tech_token"]]
        : active === "admin"
          ? [["admin", "belm_admin_token"]]
          : [["admin", "belm_admin_token"], ["technician", "belm_tech_token"], ["customer", "belm_customer_token"]];
    for (const [type, key] of candidates) {
      const token = localStorage.getItem(key);
      const payload = token ? decodeToken(token) : null;
      if (payload && (!payload.exp || payload.exp * 1000 > Date.now())) return { type, key, token, payload };
    }
    return null;
  }

  const isLocalPreview = ["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).get("preview") === "1";
  const session = currentSession() || (isLocalPreview ? {
    type: "admin", key: "belm_preview_token", token: "preview",
    payload: { id: "preview-user", name: "BELM Admin", roleName: "Super Admin" }
  } : null);
  if (!session) { location.replace("/login"); return; }

  let storedUser = session.key === "belm_preview_token" ? { id:"preview", name:"BELM Admin", role:"Super Admin" } : null;
  if (session.type !== "customer") {
    try { storedUser = JSON.parse(localStorage.getItem(session.type === "technician" ? "belm_tech_user" : "belm_admin_user") || "null"); } catch (_) {}
  }

  const ROLE_ALIASES = {
    "super admin": "super-admin", admin: "super-admin", "belm admin": "super-admin",
    engineer: "workshop-manager", "workshop manager": "workshop-manager", "technical dep": "workshop-manager", "technical department": "workshop-manager",
    technician: "technician", procurement: "procurement", "store keeper": "store-keeper", storekeeper: "store-keeper",
    "registration & sales": "registration-sales", "registration and sales": "registration-sales", sales: "registration-sales",
    finance: "finance", accounts: "finance", "finance / accounts": "finance", "finance/accounts": "finance", accountant: "finance",
    "bank controller": "bank-controller", "system coordinator": "system-coordinator", coordinator: "system-coordinator",
    operator: "operator", "machine operator": "operator", owner: "customer-admin", administration: "customer-admin", "workshop admin": "customer-admin",
    "workshop supervisor": "workshop-manager", "customer admin": "customer-admin", "fuel consumption": "operator",
    "general analysis": "analysis", analyst: "analysis"
  };

  const rawRole = session.type === "customer"
    ? String(session.payload.customerRole || "owner")
    : String(storedUser?.role || session.payload.roleName || "Staff");
  const baseRoleKey = ROLE_ALIASES[rawRole.toLowerCase().trim()] || (session.type === "customer" ? "customer-admin" : "staff");
  const CUSTOMER_ROLE_KEYS = {
    procurement: "customer-procurement", "store-keeper": "customer-store", finance: "customer-finance",
    technician: "customer-technician", "workshop-manager": "customer-workshop", "registration-sales": "customer-admin"
  };
  const roleKey = session.type === "customer" ? (CUSTOMER_ROLE_KEYS[baseRoleKey] || baseRoleKey) : baseRoleKey;
  const displayName = session.type === "customer"
    ? String(session.payload.actorName || session.payload.name || "Customer User")
    : String(storedUser?.name || session.payload.name || "BELM User");
  const companyName = session.type === "customer"
    ? String(session.payload.name || "Customer Company")
    : String(storedUser?.assignedCustomerName || "BELM General Tech Service LTD");

  const I = {
    home: "⌂", customer: "CU", machine: "MC", user: "US", job: "JC", stock: "ST", buy: "PO", money: "TZ", bank: "BK", report: "AN", settings: "SE", inspect: "DI", test: "TS", message: "CM", fuel: "FL", tool: "TL", checklist: "CK", supplier: "SP", record: "RC", quote: "PF", log: "LG", profile: "ME", alert: "AL"
  };
  // SVG paths zilizotolewa moja kwa moja kwenye dashibodi (mockups) za BELM — navy/gold design language.
  const ICON_PATHS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    customer: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M17 8h4M19 6v4"/>',
    machine: '<path d="M3 17l3-7h5l2 4h6l2 3"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
    user: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/><path d="M20 4l1.2 1.2M20 8l1.6-.2"/>',
    job: '<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>',
    stock: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    buy: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.5a2 2 0 002 1.5h8.4a2 2 0 002-1.6L21 7H6"/>',
    money: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/>',
    report: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    inspect: '<path d="M2 12h4l2-7 4 14 2-7h8"/>',
    test: '<path d="M20 6L9 17l-5-5"/>',
    message: '<path d="M4 4h16v12H8l-4 4V4z"/>',
    fuel: '<path d="M4 21V6a2 2 0 012-2h6v17"/><path d="M12 10h5v9M17 10l2.5 2.5a1.5 1.5 0 01.5 1.1V19a1.5 1.5 0 01-3 0v-2"/>',
    tool: '<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>',
    checklist: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v2h6V3M9 10l1.7 1.7L14 8.3M9 16h6"/>',
    supplier: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.6"/><path d="M2.5 20c0-3.3 2.5-5.6 5.5-5.6s5.5 2.3 5.5 5.6M14.5 20c0-2.4-1-4.3-2.6-5.3.7-.5 1.6-.7 2.6-.7 2.7 0 5 2.1 5 4.9"/>',
    record: '<path d="M9 3h6a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V5a2 2 0 012-2z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    quote: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    log: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    profile: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
    alert: '<path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'
  };
  function iconSvg(key) {
    const inner = ICON_PATHS[key] || ICON_PATHS.report;
    return `<svg class="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }
  const item = (label, icon, href, note = "") => ({ label, icon, href, note });

  const ROLE_CONFIG = {
    "super-admin": {
      title: "BELM Super Admin Dashboard", initials: "BA", eyebrow: "BELM ADMINISTRATION", description: "Full company control, approvals, users, finance visibility and secure system settings.", primary: "/workshop-management-home/",
      menu: [item("Dashboard","home","#dashboard"),item("Customer Registration","customer","/admin-applications/"),item("Customers & Machines","machine","/customers-manager/"),item("Roles & Users","user","/roles-manager/"),item("Workshop & Job Cards","job","/breakdown-workflow/?actor=admin&view=job-cards"),item("Spare Parts Inventory","stock","/spare-parts-manager/"),item("Procurement","buy","/belm-procurement/"),item("Finance & Accounts","money","/billing-manager/"),item("Bank Control","bank","/bank-controller/"),item("Reports & Analysis","report","/reports-manager/"),item("System Settings","settings","/settings-manager/")],
      process: ["Register & approve","Assign role","Run operations","Review reports","Audit & control"]
    },
    "workshop-manager": {
      title: "Workshop Manager Dashboard", initials: "WM", eyebrow: "TECHNICAL DEPARTMENT", description: "Receive Job Cards, assign technicians and manage inspection, diagnosis, repair and completion.", primary: "/belm-workshop/",
      menu: [item("Dashboard","home","#dashboard"),item("Customer Machines","machine","/belm-workshop/#machines"),item("Open Job Cards","job","/belm-workshop/#job-cards"),item("Inspection & Diagnosis","inspect","/breakdown-workflow/?actor=admin"),item("Manage Technicians","user","/roles-manager/"),item("Waiting for Spares","stock","/belm-workshop/#job-cards"),item("Testing & Completion","test","/breakdown-workflow/?actor=admin"),item("Workshop Reports","report","/workshop-analysis/"),item("Communication","message","/customers-manager/")],
      process: ["Job opened","Inspection","Diagnosis","Repair","Testing & close"]
    },
    technician: {
      title: "Technician Dashboard", initials: "TC", eyebrow: "INSPECTION · DIAGNOSIS · REPAIR", description: "Assigned Job Cards, machine inspection, diagnosis, repairs, testing and technical records.", primary: "/technician-tasks/",
      menu: [item("Dashboard","home","#dashboard"),item("My Job Cards","job","/technician-job-cards/"),item("Customer Machines","machine","/technician-tasks/"),item("Diagnosis & Repair","inspect","/breakdown-workflow/?actor=technician"),item("Spare Requests","stock","/spare-parts-manager/"),item("Testing & Completion","test","/technician-job-cards/"),item("Daily Checklists","checklist","/tech-report/"),item("Communication","message","/technician-tasks/"),item("My Reports","report","/tech-checked-report/")],
      process: ["Assigned","Inspect","Diagnose","Repair","Test & complete"]
    },
    procurement: {
      title: "Procurement Dashboard", initials: "PR", eyebrow: "PURCHASING & SUPPLY", description: "Purchase spare parts, manage pending proforma records, suppliers and department analysis.", primary: "/belm-procurement/",
      menu: [item("Dashboard","home","#dashboard"),item("Spare Part Purchases","buy","/belm-procurement/"),item("Purchase Records","record","/belm-procurement/?view=records"),item("Pending Proforma","quote","/belm-procurement/?view=proforma"),item("Purchase Reports","report","/belm-procurement/?view=reports"),item("Department Analysis","report","/belm-procurement/?view=analysis"),item("Suppliers","supplier","/suppliers-manager/")],
      process: ["Request received","Source supplier","Review proforma","Place order","Store receives"]
    },
    "store-keeper": {
      title: "Store Keeper Dashboard", initials: "SK", eyebrow: "STOCK · TOOLS · ISSUES", description: "Control inventory, stock movements, spare requests, tools and stock audits.", primary: "/spare-parts-manager/",
      menu: [item("Dashboard","home","#dashboard"),item("Spare Parts Inventory","stock","/spare-parts-manager/"),item("Stock In","record","/spare-parts-manager/?view=stock-in"),item("Stock Out & Issues","tool","/spare-parts-manager/?view=stock-out"),item("Spare Requests","buy","/spare-parts-manager/?view=requests"),item("Low Stock & Shortages","alert","/spare-parts-manager/?view=low-stock"),item("Tools Register","tool","/spare-parts-manager/?view=tools"),item("Stock Audit","checklist","/spare-parts-manager/?view=audit"),item("Inventory Reports","report","/reports-manager/")],
      process: ["Request","Verify stock","Issue or purchase","Receive stock","Audit record"]
    },
    "registration-sales": {
      title: "Customer Registration & Sales", initials: "RS", eyebrow: "CUSTOMERS · REQUESTS · SALES", description: "Register and manage customers, service requests, quotations, sales documents and portal access.", primary: "/customers-manager/",
      menu: [item("Dashboard","home","#dashboard"),item("Register Customer","customer","#new-customer"),item("All Customers","user","/customers-manager/"),item("Customer Machines","machine","/customers-manager/"),item("Service Requests","job","/service-request-manager/"),item("Quotations & Proforma","quote","/billing-manager/"),item("Sales Documents","money","/billing-manager/"),item("Customer Communication","message","/customers-manager/"),item("Sales Reports","report","/reports-manager/")],
      process: ["Capture details","Check duplicates","Approve access","Register machines","Support customer"]
    },
    finance: {
      title: "Finance & Payments Dashboard", initials: "FN", eyebrow: "ACCOUNTS · BILLING · VAT", description: "Manage Proforma Invoices, invoices, receipts, payments, expenses, VAT and petty cash.", primary: "/billing-manager/",
      menu: [item("Dashboard","home","#dashboard"),item("Proforma Invoices","quote","/billing-manager/?view=proforma"),item("Invoices","money","/billing-manager/?view=invoices"),item("Payments & Receipts","record","/billing-manager/?view=payments"),item("Company Expenses","money","/billing-manager/?view=expenses"),item("VAT Records","report","/billing-manager/?view=vat"),item("Petty Cash","money","/belm-workshop/petty-cash/"),item("Finance Reports","report","/reports-manager/")],
      process: ["Prepare proforma","Approval","Issue invoice","Record payment","Reconcile"]
    },
    "bank-controller": {
      title: "Bank Controller Dashboard", initials: "BC", eyebrow: "PROTECTED BANK CONTROL", description: "Authorized bank balances, deposits, withdrawals, approvals and reconciliations.", primary: "/bank-controller/",
      menu: [item("Dashboard","home","#dashboard"),item("Bank Accounts","bank","/bank-controller/"),item("Deposits","money","/bank-controller/?view=deposits"),item("Withdrawals","record","/bank-controller/?view=withdrawals"),item("Pending Approvals","alert","/bank-controller/?view=approvals"),item("Reconciliation","checklist","/bank-controller/?view=reconciliation"),item("Bank Reports","report","/bank-controller/?view=reports")],
      process: ["Request","Verify authority","Approve","Post movement","Reconcile"]
    },
    "system-coordinator": {
      title: "System Coordinator Dashboard", initials: "SC", eyebrow: "PORTAL & SERVICE SETTINGS", description: "Manage the portal, customer access, communication services and provider settings.", primary: "/coordinator/",
      menu: [item("Dashboard","home","#dashboard"),item("Portal Management","settings","/coordinator/"),item("Customer Access","customer","/customers-manager/"),item("Departments & Roles","user","/coordinator/departments/"),item("Notifications","alert","/coordinator/notifications/"),item("Email & WhatsApp","message","/coordinator/communications/"),item("Service Provider Settings","tool","/settings-manager/"),item("Activity Log","log","/admin/activity-log")],
      process: ["Configure","Grant access","Connect service","Monitor","Audit"]
    },
    operator: {
      title: "Machine Operator Dashboard", initials: "OP", eyebrow: "DAILY MACHINE OPERATIONS", description: "Daily machine checks, operating hours, fuel, alerts, service status and reports.", primary: "/operator/",
      menu: [item("Dashboard","home","#dashboard"),item("My Machine","machine","/operator/"),item("Daily Checklist","checklist","/operator/#check-up"),item("Operation Log","log","/operator/#operation-log"),item("Fuel Consumption","fuel","/customer-fuel-usage/"),item("Machine Alerts","alert","/operator/#alerts"),item("Service Status","tool","/operator/#service"),item("Report Issue","message","/operator/#report"),item("Operator Reports","report","/operator/#reports")],
      process: ["Sign in","Daily check","Operate","Report issue","Sign out"]
    },
    "customer-admin": {
      title: `${companyName} Dashboard`, initials: "CA", eyebrow: "CUSTOMER OPERATIONS", description: "Company machines, Job Cards, store, procurement, users, finance and service communication.", primary: "/portal-cwm/",
      menu: [item("Dashboard","home","#dashboard"),item("Company Machines","machine","/portal/dashboard?view=machines"),item("Service Requests","job","/customer-service-request/"),item("Workshop & Job Cards","inspect","/customer-workshop/"),item("Store & Spares","stock","/customer-store/"),item("Procurement","buy","/customer-procurement-home/"),item("Finance & Payments","money","/customer-billing/"),item("Roles & Users","user","/customer-users/"),item("Reports","report","/portal-cwm/"),item("Settings","settings","/customer-settings-center/")],
      process: ["Machine report","Service request","BELM action","Customer approval","Completion"]
    },
    "customer-procurement": {
      title: `${companyName} Procurement`, initials: "CP", eyebrow: "CUSTOMER PROCUREMENT", description: "Company spare requests, proforma approvals, purchase records, suppliers and procurement reports.", primary: "/customer-procurement-home/",
      menu: [item("Dashboard","home","#dashboard"),item("Spare Requests","buy","/customer-procurement-home/"),item("Purchase Records","record","/customer-procurement/"),item("Pending Proforma","quote","/customer-sales-documents/"),item("Suppliers","supplier","/customer-procurement/"),item("Delivery Tracking","machine","/customer-procurement/"),item("Procurement Reports","report","/customer-procurement-home/")],
      process: ["Department request","Review shortage","Approve proforma","Track purchase","Receive delivery"]
    },
    "customer-store": {
      title: `${companyName} Store Dashboard`, initials: "CS", eyebrow: "CUSTOMER STORE & TOOLS", description: "Company stock, tools, spare issues, low-stock alerts and inventory movement records.", primary: "/customer-store/",
      menu: [item("Dashboard","home","#dashboard"),item("Store Inventory","stock","/customer-store/"),item("Stock In","record","/customer-store/?view=stock-in"),item("Stock Out & Issues","tool","/customer-store/?view=issues"),item("Spare Requests","buy","/customer-store/?view=requests"),item("Tools Register","tool","/customer-store/?view=tools"),item("Stock Reports","report","/customer-store/?view=reports")],
      process: ["Request","Verify stock","Issue","Record movement","Audit"]
    },
    "customer-finance": {
      title: `${companyName} Finance Dashboard`, initials: "CF", eyebrow: "CUSTOMER FINANCE & PAYMENTS", description: "Customer Proforma Invoices, invoices, payment records, receipts, petty cash and finance reports.", primary: "/customer-billing/",
      menu: [item("Dashboard","home","#dashboard"),item("Proforma Invoices","quote","/customer-sales-documents/"),item("Invoices","money","/customer-billing/"),item("Payments & Receipts","record","/customer-billing/"),item("Petty Cash","money","/customer-petty-cash/"),item("Finance Reports","report","/customer-billing/")],
      process: ["Receive proforma","Approve","Pay","Receive receipt","Reconcile"]
    },
    "customer-technician": {
      title: `${companyName} Technician Dashboard`, initials: "CT", eyebrow: "CUSTOMER TECHNICAL TEAM", description: "Customer workshop inspections, diagnosis, repair records, spare requests and testing.", primary: "/customer-workshop/",
      menu: [item("Dashboard","home","#dashboard"),item("Assigned Machines","machine","/portal/dashboard?view=machines"),item("Workshop Job Cards","job","/customer-workshop/"),item("Inspection & Diagnosis","inspect","/customer-workshop/"),item("Spare Requests","stock","/customer-store/"),item("Testing & Completion","test","/customer-workshop/"),item("Checklists","checklist","/customer-workshop-checklists/"),item("Technical Reports","report","/customer-workshop/")],
      process: ["Assigned","Inspect","Diagnose","Repair","Test & close"]
    },
    "customer-workshop": {
      title: `${companyName} Workshop Manager`, initials: "CW", eyebrow: "CUSTOMER WORKSHOP CONTROL", description: "Manage company Job Cards, technicians, inspections, spares, testing and workshop analysis.", primary: "/customer-workshop/",
      menu: [item("Dashboard","home","#dashboard"),item("Company Machines","machine","/portal/dashboard?view=machines"),item("Open Job Cards","job","/customer-workshop/"),item("Inspection & Repair","inspect","/customer-workshop/"),item("Manage Technicians","user","/customer-technicians/"),item("Store & Spares","stock","/customer-store/"),item("Checklists","checklist","/customer-workshop-checklists/"),item("Workshop Analysis","report","/workshop-analysis/")],
      process: ["Open Job Card","Assign","Inspect & repair","Test","Approve completion"]
    },
    analysis: {
      title: "General Analysis Dashboard", initials: "AN", eyebrow: "MANAGEMENT ANALYTICS", description: "Consolidated operational trends, performance, stock, procurement and finance analysis.", primary: "/general-analysis/",
      menu: [item("Dashboard","home","#dashboard"),item("General Analysis","report","/general-analysis/"),item("Workshop Analysis","inspect","/workshop-analysis/"),item("Reports Archive","record","/reports-manager/"),item("Export Reports","report","/general-report/")],
      process: ["Collect data","Validate","Analyze","Report","Management action"]
    },
    staff: {
      title: `${titleCase(rawRole)} Dashboard`, initials: "ST", eyebrow: "BELM ROLE WORKSPACE", description: "Authorized BELM operations and records for your assigned role.", primary: "/belm-workshop/",
      menu: [item("Dashboard","home","#dashboard"),item("My Workspace","tool","/belm-workshop/"),item("Reports","report","/reports-manager/"),item("My Profile","profile","/settings-manager/")],
      process: ["Receive work","Review","Process","Update","Complete"]
    }
  };

  const config = ROLE_CONFIG[roleKey] || ROLE_CONFIG.staff;
  let dashboardData = {};
  let activeView = "home";

  function initials(name) {
    return String(name || "BU").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "BU";
  }
  function roleLabel() {
    if (roleKey === "super-admin") return "BELM Super Admin";
    if (roleKey === "customer-admin") return rawRole.toLowerCase() === "owner" ? "Company Administrator" : titleCase(rawRole);
    return config.title.replace(/ Dashboard$/i, "");
  }
  function setIdentity() {
    const avatar = initials(displayName);
    ["sideAvatar", "topAvatar"].forEach((id) => { $(id).textContent = avatar; });
    ["sideName", "topName"].forEach((id) => { $(id).textContent = displayName; });
    ["sideRole", "topRole"].forEach((id) => { $(id).textContent = roleLabel(); });
    $("homeSubtitle").textContent = session.type === "customer" ? `${companyName} · secure company operations.` : "Your secure starting point for BELM company operations.";
    document.title = `${roleLabel()} — BELM Operations`;
  }

  function uniqueMenu(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.label.toLowerCase()}|${row.href}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function renderNav(home = activeView === "home") {
    const rows = home
      ? [item("Home Dashboard", "home", "#home"), item("View My Role", "tool", "#role")]
      : uniqueMenu(config.menu);
    $("navCaption").textContent = home ? "HOME MENU" : `${config.initials} ROLE MENU`;
    $("navCount").textContent = String(rows.length);
    $("roleNav").innerHTML = rows.map((row, index) => {
      const internal = row.href.startsWith("#");
      const active = home ? index === 0 : index === 0;
      return `<a href="${esc(row.href)}" data-internal="${internal ? esc(row.href) : ""}" class="${active ? "is-active" : ""}"><span class="nav-icon">${iconSvg(row.icon)}</span><span>${esc(row.label)}</span><span class="nav-arrow">›</span></a>`;
    }).join("");
  }

  function showView(view) {
    activeView = view === "role" ? "role" : "home";
    $("homeView").hidden = activeView !== "home";
    $("roleView").hidden = activeView !== "role";
    // Keep one Home Dashboard control visible at a time. On Home, it lives in
    // the HOME MENU; inside a role workspace, the footer button becomes the
    // single clear route back to Home.
    $("homeButton").hidden = activeView === "home";
    $("crumbParent").textContent = activeView === "home" ? "BELM PORTAL" : roleLabel().toUpperCase();
    $("crumbCurrent").textContent = activeView === "home" ? "Home Dashboard" : config.title;
    renderNav();
    closeMenu();
    history.replaceState(null, "", activeView === "role" ? "/portal-v2/#role" : "/portal-v2/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setStatus(message, error = false) {
    $("statusBar").textContent = message;
    $("statusBar").classList.toggle("error", error);
    $("statusBar").hidden = !message;
    if (message && !error) setTimeout(() => { $("statusBar").hidden = true; }, 4200);
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options, cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}`, ...(options.headers || {}) }
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (response.status === 401) {
      localStorage.removeItem(session.key); localStorage.removeItem("belm_active_account_type");
      location.replace("/login"); throw new Error("Your session expired. Please sign in again.");
    }
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  const stat = (label, value, note, icon) => ({ label, value, note, icon });
  function homeModel(data) {
    if (session.type === "customer") {
      const machines = data.machines || [];
      const alerts = machines.filter((m) => m.latestOperatorMessage && !["CLOSED", "RESOLVED", "RECORDED"].includes(String(m.latestOperatorMessage.status).toUpperCase())).length;
      return {
        stats: [stat("Registered machines", machines.length, "Company fleet", "MC"), stat("Active alerts", alerts, "Operator and service alerts", "AL"), stat("Company role", titleCase(data.customer?.actorRole || rawRole), "Authorized access", "US"), stat("Service mode", data.customer?.belmServiceProviderActive ? "BELM" : "SELF", "Maintenance provider", "SV")],
        bars: [["Fleet registered", machines.length], ["Machines with reports", machines.filter((m) => m.latestOperatorMessage).length], ["Alerts needing action", alerts]],
        attention: machines.filter((m) => m.latestOperatorMessage).slice(0, 4).map((m) => ({ label: [m.brand,m.model].filter(Boolean).join(" ") || m.machineType || "Machine", note: m.latestOperatorMessage.message, value: m.latestOperatorMessage.status })),
        recent: machines.slice(0, 6).map((m) => ({ label: [m.brand,m.model].filter(Boolean).join(" ") || m.machineType || "Machine", note: m.serialNumber || m.regNumber || "Machine record", time: m.lastCheckedAt }))
      };
    }
    if (roleKey === "technician") {
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      const pending = tasks.filter((t) => String(t.status).toUpperCase() === "PENDING").length;
      const progress = tasks.filter((t) => String(t.status).toUpperCase() === "IN_PROGRESS").length;
      const done = tasks.filter((t) => String(t.status).toUpperCase() === "DONE").length;
      return { stats:[stat("Assigned jobs",tasks.length,"All allocated work","JC"),stat("Pending",pending,"Awaiting action","PD"),stat("In progress",progress,"Work underway","IP"),stat("Completed",done,"Finished records","OK")], bars:[["Pending",pending],["In progress",progress],["Completed",done]], attention:tasks.filter((t)=>String(t.status).toUpperCase()!=="DONE").slice(0,4).map((t)=>({label:t.title||"Assigned task",note:t.customerName||t.machineLabel||"BELM work",value:t.priority||t.status})), recent:tasks.slice(0,6).map((t)=>({label:t.title,note:t.customerName||t.machineLabel||t.status,time:t.createdAt||t.dueDate})) };
    }
    const t = data.totals || {};
    return {
      stats: [stat("Active customers",t.customers||0,"Registered companies","CU"),stat("Registered machines",t.machines||0,"Customer fleet","MC"),stat("Open Job Cards",t.openRequests||0,"Workshop queue","JC"),stat("Pending approvals",t.pendingApplications||0,"Require decision","AP")],
      bars: [["Completed tasks",t.completedTasks||0],["Pending tasks",t.pendingTasks||0],["Open Job Cards",t.openRequests||0]],
      attention: [{label:"Registration approvals",note:"Waiting for a decision",value:t.pendingApplications||0},{label:"Open Job Cards",note:"Workshop work not completed",value:t.openRequests||0},{label:"Low stock parts",note:"At or below reorder level",value:t.lowStockParts||0}],
      recent: (data.recentActivities||[]).slice(0,6).map((r)=>({label:`${titleCase(r.action)} · ${r.entity||"System"}`,note:`${r.userName||"System user"} · ${r.roleName||""}`,time:r.createdAt}))
    };
  }

  function fmtDate(value) {
    if (!value) return "—";
    const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
  }
  function renderStats(target, rows) {
    $(target).innerHTML = rows.map((row) => `<article class="stat-card"><div><small>${esc(row.label)}</small><strong>${esc(typeof row.value === "number" ? number.format(row.value) : row.value)}</strong><em>${esc(row.note)}</em></div><span class="stat-icon">${esc(row.icon)}</span></article>`).join("");
  }
  function renderHome(data) {
    const model = homeModel(data);
    renderStats("homeStats", model.stats);
    const max = Math.max(...model.bars.map((r) => Number(r[1]) || 0), 1);
    $("workflowBars").innerHTML = model.bars.map(([label,value]) => `<div class="bar-row"><span>${esc(label)}</span><div class="bar-track"><i class="bar-fill" style="width:${Math.max(3,(Number(value)||0)/max*100)}%"></i></div><b>${number.format(Number(value)||0)}</b></div>`).join("");
    $("attentionList").innerHTML = model.attention.length ? model.attention.map((row) => `<div class="attention-item"><i></i><div><strong>${esc(row.label)}</strong><small>${esc(row.note)}</small></div><b>${esc(row.value)}</b></div>`).join("") : '<div class="attention-item"><i style="background:var(--green)"></i><div><strong>All clear</strong><small>No urgent item is currently recorded.</small></div></div>';
    $("recentTable").innerHTML = model.recent.length ? model.recent.map((row) => `<div class="data-row"><span class="nav-icon">${iconSvg("record")}</span><div><strong>${esc(row.label)}</strong><small>${esc(row.note)}</small></div><time>${esc(fmtDate(row.time))}</time></div>`).join("") : '<div class="data-row"><div><strong>No recent records</strong><small>New system activity will appear here.</small></div></div>';
    const priority = model.attention.filter((r)=>Number(r.value)>0 || (typeof r.value === "string" && !["CLOSED","RESOLVED","RECORDED"].includes(r.value.toUpperCase()))).length;
    $("notificationCount").hidden = priority < 1; $("notificationCount").textContent = String(priority);
    $("lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;
  }

  function roleModel() {
    const base = homeModel(dashboardData);
    if (roleKey === "procurement") {
      const m = dashboardData.metrics || {};
      base.stats = [stat("Purchase requests",(m.waitingSourcing||0)+(m.waitingAccounts||0),"Current purchase queue","PR"),stat("Pending proforma",m.waitingAccounts||0,"Accounts action","PF"),stat("Orders placed",m.ordered||0,"Awaiting delivery","PO"),stat("Suppliers",m.suppliers||0,"Supplier directory","SP")];
      const rows = [...(dashboardData.jobCardRequests||[]),...(dashboardData.inventoryRequests||[])];
      base.recent = rows.slice(0,6).map((r)=>({label:r.partNumber?`${r.partNumber} · ${r.spareName||r.partName||r.description}`:(r.spareName||r.partName||"Spare request"),note:r.customerName||"BELM stock",time:r.requestedAt||r.createdAt}));
    } else if (roleKey === "store-keeper") {
      const parts = dashboardData.parts || [], requests = dashboardData.requests || [];
      const low = parts.filter((p)=>Number(p.stockQty??p.stock_qty??0)<=Number(p.reorderThreshold??p.reorder_threshold??0)).length;
      base.stats=[stat("Stock items",parts.length,"Inventory records","ST"),stat("Low stock",low,"At reorder level","AL"),stat("Open requests",requests.length,"Pending spare requests","RQ"),stat("Stock quantity",parts.reduce((s,p)=>s+Number(p.stockQty??p.stock_qty??0),0),"Units recorded","QT")];
      base.recent=parts.slice(0,6).map((p)=>({label:p.name||p.partName||"Spare part",note:p.partNumber||p.part_number||"Inventory",time:p.updatedAt||p.createdAt||p.created_at}));
    } else if (roleKey === "finance") {
      const invoices=dashboardData.invoices||[], expenses=dashboardData.expenses||[];
      const pending=invoices.filter((i)=>!["PAID","CANCELLED"].includes(String(i.status).toUpperCase())).length;
      base.stats=[stat("Invoices",invoices.length,"All invoice records","IV"),stat("Outstanding",pending,"Awaiting full payment","PD"),stat("Expenses",expenses.length,"Company expenses","EX"),stat("Paid invoices",invoices.filter((i)=>String(i.status).toUpperCase()==="PAID").length,"Completed payments","OK")];
      base.recent=invoices.slice(0,6).map((i)=>({label:i.invoiceNo||i.invoice_no||"Invoice",note:`${i.customerName||i.customer_name||"Customer"} · ${i.status||""}`,time:i.issueDate||i.createdAt||i.created_at}));
    }
    return base;
  }

  function renderRole() {
    $("roleEyebrow").textContent = config.eyebrow;
    $("roleTitle").textContent = config.title;
    $("roleDescription").textContent = config.description;
    $("roleInitials").textContent = config.initials;
    $("roleGreeting").textContent = `${displayName.split(" ")[0] || displayName}, here is your work summary`;
    $("primaryWorkspaceLink").href = config.primary;
    $("activityLink").href = config.primary;
    const model = roleModel();
    renderStats("roleStats", model.stats);
    const actions = uniqueMenu(config.menu.filter((row) => row.href !== "#dashboard")).slice(0, 8);
    $("roleActions").innerHTML = actions.map((row) => `<a class="action-card" href="${esc(row.href)}" ${row.href==="#new-customer"?'data-register-customer="1"':''}><span class="nav-icon">${iconSvg(row.icon)}</span><span><strong>${esc(row.label)}</strong><small>${esc(row.note||"Open live records and tools")}</small></span><b>›</b></a>`).join("");
    $("roleQueue").innerHTML = model.recent.length ? model.recent.slice(0,5).map((row)=>`<div class="queue-item"><span class="nav-icon">${iconSvg("record")}</span><div><strong>${esc(row.label||"Record")}</strong><small>${esc(row.note||"")}</small></div></div>`).join("") : '<div class="queue-item"><div><strong>No pending records</strong><small>Your live work queue is currently clear.</small></div></div>';
    $("processTitle").textContent = `${roleLabel()} workflow`;
    $("processFlow").innerHTML = config.process.map((step,index)=>`<div class="process-step"><b>STEP ${index+1}</b><span>${esc(step)}</span></div>`).join("");
  }

  async function loadData() {
    $("refreshButton").disabled = true;
    try {
      if (session.key === "belm_preview_token") dashboardData={totals:{customers:24,machines:68,openRequests:11,pendingApplications:3,completedTasks:42,pendingTasks:9,lowStockParts:6},recentActivities:[{action:"job card updated",entity:"Workshop",userName:"Asha M.",roleName:"Workshop Manager",createdAt:new Date().toISOString()},{action:"stock received",entity:"Inventory",userName:"Store Team",roleName:"Store Keeper",createdAt:new Date(Date.now()-3600000).toISOString()},{action:"customer approved",entity:"Registration",userName:"BELM Admin",roleName:"Super Admin",createdAt:new Date(Date.now()-7200000).toISOString()}]};
      else if (session.type === "customer") dashboardData = await api("/customer-portal/dashboard");
      else if (roleKey === "technician") {
        const tasks = await api(`/tasks/user/${encodeURIComponent(session.payload.id || storedUser?.id || "")}`);
        dashboardData = { tasks: Array.isArray(tasks) ? tasks : (tasks?.tasks || []) };
      } else if (roleKey === "procurement") dashboardData = await api("/belm-procurement");
      else if (roleKey === "store-keeper") {
        const [parts,requests] = await Promise.all([api("/spare-parts"),api("/spare-parts/requests")]);
        dashboardData={parts:Array.isArray(parts)?parts:(parts?.parts||[]),requests:Array.isArray(requests)?requests:(requests?.requests||[])};
      } else if (roleKey === "finance") {
        const [invoices,expenses] = await Promise.all([api("/billing/invoices"),api("/company-expenses")]);
        dashboardData={invoices:Array.isArray(invoices)?invoices:(invoices?.invoices||[]),expenses:Array.isArray(expenses)?expenses:(expenses?.expenses||[])};
      } else dashboardData = await api("/reports/all-overview?period=month");
      renderHome(dashboardData); renderRole();
    } catch (error) {
      const fallback = { totals:{}, recentActivities:[], machines:[], customer:{actorRole:rawRole} };
      dashboardData = fallback; renderHome(fallback); renderRole();
      setStatus(error.message || "Some live dashboard data could not be loaded.", true);
    } finally { $("refreshButton").disabled = false; }
  }

  function closeMenu(){ document.body.classList.remove("menu-open"); $("menuScrim").hidden=true; $("menuButton").setAttribute("aria-expanded","false"); }
  function openMenu(){ document.body.classList.add("menu-open"); $("menuScrim").hidden=false; $("menuButton").setAttribute("aria-expanded","true"); }
  function openCustomerDialog(){ $("customerForm").reset(); $("customerFormError").hidden=true; $("customerDialog").showModal(); }

  async function registerCustomer(event) {
    event.preventDefault();
    const button=$("saveCustomerButton"), error=$("customerFormError"); error.hidden=true; button.disabled=true; button.textContent="Checking & registering…";
    const form=new FormData(event.currentTarget); const payload=Object.fromEntries(form.entries());
    try {
      const result=await api("/customers",{method:"POST",body:JSON.stringify(payload)});
      $("customerDialog").close();
      const info=result.portalLoginInfo||{};
      $("credentialFields").innerHTML=[["Portal ID",info.portalId],["Login URL",info.portalUrl||info.portalLink],["Temporary password",info.temporaryPassword],["Recovery code",info.recoveryCode]].map(([label,value])=>`<div class="credential-row"><span>${esc(label)}</span><code>${esc(value||"—")}</code></div>`).join("");
      $("credentialDialog").showModal(); await loadData();
    } catch (err) { error.textContent=err.message||"Customer could not be registered."; error.hidden=false; }
    finally { button.disabled=false; button.textContent="Register Customer"; }
  }

  function logout() {
    ["belm_customer_token","belm_tech_token","belm_tech_user","belm_admin_token","belm_admin_user","belm_operator_token","belm_active_account_type"].forEach((key)=>localStorage.removeItem(key));
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({type:"CLEAR_BELM_CACHES"});
    location.replace("/login");
  }

  function updateLiveClock(){
    const el=$("liveClock"); if(!el) return;
    const now=new Date();
    const datePart=now.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short"});
    const timePart=now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    el.textContent=`${datePart} · ${timePart}`;
  }
  updateLiveClock(); setInterval(updateLiveClock, 30000);

  setIdentity(); renderNav(true); $("year").textContent=String(new Date().getFullYear());
  $("enterRoleButton").addEventListener("click",()=>showView("role"));
  $("homeButton").addEventListener("click",()=>showView("home"));
  $("menuButton").addEventListener("click",()=>document.body.classList.contains("menu-open")?closeMenu():openMenu());
  $("menuScrim").addEventListener("click",closeMenu);
  $("refreshButton").addEventListener("click",async()=>{await loadData();setStatus("Dashboard refreshed from the live database.");});
  $("logoutButton").addEventListener("click",logout);
  $("roleNav").addEventListener("click",(event)=>{
    const link=event.target.closest("a"); if(!link)return;
    const action=link.dataset.internal;
    if(action==="#home"){event.preventDefault();showView("home");}
    if(action==="#role"||action==="#dashboard"){event.preventDefault();showView("role");}
    if(action==="#new-customer"){event.preventDefault();openCustomerDialog();}
    closeMenu();
  });
  $("roleActions").addEventListener("click",(event)=>{const link=event.target.closest("[data-register-customer]");if(link){event.preventDefault();openCustomerDialog();}});
  $("customerForm").addEventListener("submit",registerCustomer);
  document.querySelectorAll("[data-close-modal]").forEach((button)=>button.addEventListener("click",()=>$("customerDialog").close()));
  document.querySelectorAll("[data-close-credential]").forEach((button)=>button.addEventListener("click",()=>$("credentialDialog").close()));
  $("copyCredentials").addEventListener("click",async()=>{const text=Array.from($("credentialFields").querySelectorAll(".credential-row")).map((row)=>`${row.querySelector("span").textContent}: ${row.querySelector("code").textContent}`).join("\n");try{await navigator.clipboard.writeText(text);setStatus("Customer credentials copied.");}catch(_){setStatus("Copy was blocked. Select the credentials manually.",true);}});
  $("notificationButton").addEventListener("click",()=>$("attentionList").scrollIntoView({behavior:"smooth",block:"center"}));

  const savedTheme=localStorage.getItem("belm_theme")||localStorage.getItem("belm-theme")||"dark";
  function setTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem("belm_theme",theme);$("themeButton").innerHTML=theme==="dark"?'☀ <span>Light mode</span>':'☾ <span>Dark mode</span>';}
  setTheme(savedTheme==="light"?"light":"dark");
  $("themeButton").addEventListener("click",()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark"));

  loadData().then(()=>{ if(location.hash==="#role") showView("role"); });
})();
