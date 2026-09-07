(() => {
  const token = localStorage.getItem("belm_admin_token") || "";
  if (!token) {
    location.replace(localStorage.getItem("belm_customer_token") ? "/portal-cwm/" : "/login");
    return;
  }

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "{}") || {}; }
    catch (_) { return {}; }
  })();

  const decodeToken = (value) => {
    try {
      const raw = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map((character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    } catch (_) { return {}; }
  };

  const tokenUser = decodeToken(token);
  // Prefer the refreshed JWT because an administrator may have changed this
  // user's roles since the browser last stored the profile object.
  const primaryRole = String(tokenUser.roleName || currentUser.role || "Assigned role");
  const roleNames = [...new Set(
    (Array.isArray(tokenUser.roleNames) ? tokenUser.roleNames :
      Array.isArray(currentUser.roleNames) ? currentUser.roleNames : [primaryRole])
      .filter(Boolean)
      .map((role) => role === "Engineer" ? "Workshop Manager" : String(role))
  )];
  const allowedPages = Array.isArray(tokenUser.allowedPages)
    ? tokenUser.allowedPages
    : Array.isArray(currentUser.allowedPages) ? currentUser.allowedPages : [];
  // Bank Manager is intentionally stricter than merged page permissions: the
  // backend permits it only when Super Admin is the primary role.
  const isSuperAdmin = primaryRole.toLowerCase() === "super admin";

  const modules = {
    overview: {
      eyebrow: "ALL DEPARTMENTS",
      title: "Multi-Role Analysis",
      description: "A live management view across BELM roles, people, machines and finance.",
      href: "/overview-manager/",
      action: "Open detailed analysis →",
      secondary: "/reports-manager/",
      secondaryLabel: "View reports →",
    },
    procurement: {
      eyebrow: "PROCUREMENT",
      title: "Procurement Analysis",
      description: "Stock shortage, purchasing exposure and supplier work that needs action.",
      href: "/belm-procurement/",
      action: "Open Procurement →",
      secondary: "/suppliers-manager/",
      secondaryLabel: "Supplier directory →",
    },
    store: {
      eyebrow: "STORE KEEPER",
      title: "Store & Spare Parts Analysis",
      description: "Current stock position, reorder warnings and inventory value.",
      href: "/spare-parts-manager/",
      action: "Open BELM Store →",
      secondary: "/spare-parts-manager/#equivalent-spares-panel",
      secondaryLabel: "Equivalent spares →",
    },
    bank: {
      eyebrow: "BANK CONTROL",
      title: "Bank Control Analysis",
      description: "Protected company balances, money received, expenses and withdrawals.",
      href: "/bank-controller/",
      action: "Open Bank Manager →",
      secondary: "/billing-manager/",
      secondaryLabel: "Billing & finance →",
    },
    registration: {
      eyebrow: "REGISTRATION & SALES",
      title: "Registration & Sales Analysis",
      description: "Customer growth, pending approvals, machine coverage and invoiced sales.",
      href: "/admin-applications/",
      action: "Open Registrations →",
      secondary: "/billing-manager/",
      secondaryLabel: "Open sales documents →",
    },
    finance: {
      eyebrow: "FINANCE",
      title: "Finance Analysis",
      description: "Invoiced sales, received revenue, business expenses and outstanding balances.",
      href: "/billing-manager/",
      action: "Open Billing & Finance →",
      secondary: "/reports-manager/",
      secondaryLabel: "Finance reports →",
    },
    technician: {
      eyebrow: "TECHNICIAN",
      title: "Technician Analysis",
      description: "Technician availability, assigned work and completion performance.",
      href: "/roles-manager/?from=workshop-management-home&role=Technician&technical=1",
      action: "Manage Technicians →",
      secondary: "/breakdown-workflow/?actor=admin&view=assigned",
      secondaryLabel: "Assigned work →",
    },
    workshop: {
      eyebrow: "WORKSHOP MANAGER",
      title: "Workshop Management Analysis",
      description: "Live Job Card responsibility from assignment through repair, testing and completion.",
      href: "/belm-workshop/",
      action: "Open BELM Workshop →",
      secondary: "/workshop-analysis/?actor=admin",
      secondaryLabel: "Workshop analysis →",
    },
    reports: {
      eyebrow: "GENERAL REPORT",
      title: "General Report Centre",
      description: "Decision-ready finance, service, people, machines and role comparisons.",
      href: "/reports-manager/",
      action: "Open General Reports →",
      secondary: "/overview-manager/",
      secondaryLabel: "Operations action centre →",
    },
    roles: {
      eyebrow: "ROLES & ACCESS",
      title: "Roles and Responsibility Analysis",
      description: "See who is active, which roles own work and where tasks remain pending.",
      href: "/roles-manager/",
      action: "Open BELM Staff Access →",
      secondary: "/coordinator/",
      secondaryLabel: "Coordinator controls →",
    },
  };

  const state = {
    activeModule: "overview",
    overview: null,
    bank: null,
    jobs: null,
    lastSynced: null,
    loading: false,
  };

  const $ = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat("en-TZ");
  const money = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 });
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
  const roleLabel = (name) => name === "Engineer" ? "Workshop Manager" : (name || "Unassigned role");
  const n = (value) => number.format(Number(value) || 0);
  const m = (value) => money.format(Number(value) || 0);

  function hasPage(key) {
    return isSuperAdmin || allowedPages.includes(key)
      || (key === "job-cards" && allowedPages.includes("service-requests"));
  }

  function configureIdentity() {
    const name = String(currentUser.name || tokenUser.name || "BELM User");
    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "BU";
    $("signedUserName").textContent = name;
    $("signedUserPrimaryRole").textContent = roleNames.join(" · ");
    $("userInitials").textContent = initials;
    $("headerRole").textContent = roleNames.join(" / ");
    $("coordinatorLink").hidden = !isSuperAdmin;
  }

  function updateDate() {
    $("headerDate").textContent = new Intl.DateTimeFormat("en-GB", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Dar_es_Salaam",
    }).format(new Date());
  }

  function configureNavigation() {
    const buttons = [...document.querySelectorAll(".role-nav")];
    buttons.forEach((button) => {
      const exact = button.dataset.pageKey;
      const any = String(button.dataset.anyPageKey || "").split(",").filter(Boolean);
      const visible = button.dataset.superAdmin === "true"
        ? isSuperAdmin
        : exact ? hasPage(exact) : any.length ? any.some(hasPage) : true;
      button.hidden = !visible;
      button.addEventListener("click", () => selectModule(button.dataset.module));
    });
    const visibleButtons = buttons.filter((button) => !button.hidden);
    $("visibleModuleCount").textContent = visibleButtons.length;

    const requested = new URLSearchParams(location.search).get("module")
      || localStorage.getItem("belm_management_active_module")
      || "overview";
    const requestedButton = visibleButtons.find((button) => button.dataset.module === requested);
    state.activeModule = (requestedButton || visibleButtons[0])?.dataset.module || "overview";
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.module === state.activeModule));
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
    $("menuScrim").hidden = true;
    $("menuButton").setAttribute("aria-expanded", "false");
  }

  function setLoading() {
    $("metricGrid").innerHTML = '<article class="metric skeleton"></article>'.repeat(4);
    $("primaryPanelBody").innerHTML = '<div class="loading-state">Loading live analysis…</div>';
    $("attentionList").innerHTML = '<div class="loading-state">Checking priorities…</div>';
    $("activityBody").innerHTML = '<div class="loading-state">Loading latest records…</div>';
  }

  async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (response.status === 401) {
      ["belm_admin_token", "belm_admin_user", "belm_active_account_type"].forEach((key) => localStorage.removeItem(key));
      location.replace("/login");
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data?.error || "The live dashboard could not be synchronized.");
    return data;
  }

  function metric(label, value, note, tone = "") {
    return `<article class="metric ${escapeHtml(tone)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
  }

  function setMetrics(items) {
    $("metricGrid").innerHTML = items.map((item) => metric(item.label, item.value, item.note, item.tone)).join("");
  }

  function setPrimary(eyebrow, title, html, badge = "LIVE") {
    $("primaryPanelEyebrow").textContent = eyebrow;
    $("primaryPanelTitle").textContent = title;
    $("primaryPanelBadge").textContent = badge;
    $("primaryPanelBody").innerHTML = html;
  }

  function setAttention(items) {
    $("attentionList").innerHTML = items.length ? items.map((item) => `
      <a class="attention-item ${escapeHtml(item.tone || "")}" href="${escapeHtml(item.href || "#")}">
        <span class="attention-icon">${escapeHtml(item.code)}</span>
        <span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></span>
        <b>${escapeHtml(item.value)}</b>
      </a>`).join("") : '<div class="loading-state">No urgent item is recorded.</div>';
  }

  function activityHtml(items) {
    return items.length ? items.slice(0, 9).map((item) => {
      const stamp = item.createdAt ? new Date(item.createdAt).toLocaleString("en-GB") : "—";
      const initials = String(item.roleName || "BE").slice(0, 2).toUpperCase();
      return `<article class="activity-item"><span class="activity-icon">${escapeHtml(initials)}</span><div>
        <strong>${escapeHtml(item.userName || "BELM system")} · ${escapeHtml(String(item.action || "Activity").replaceAll("-", " "))}</strong>
        <span>${escapeHtml(roleLabel(item.roleName))} · ${escapeHtml(item.entity || "System")}</span><time>${escapeHtml(stamp)}</time>
      </div></article>`;
    }).join("") : '<div class="loading-state">No recent activity has been recorded.</div>';
  }

  function setActivity(title, html) {
    $("activityTitle").textContent = title;
    $("activityBody").innerHTML = html;
  }

  function roleCards(roles) {
    return roles.length ? `<div class="role-analysis-grid">${roles.map((role) => {
      const pending = Number(role.pendingTasks || 0);
      const complete = Number(role.completedTasks || 0);
      const total = pending + complete;
      const completion = total ? `${Math.round(complete / total * 100)}% complete` : "No task history";
      return `<article class="role-analysis-card"><div class="role-analysis-title"><strong>${escapeHtml(roleLabel(role.name))}</strong><span>${escapeHtml(completion)}</span></div>
        <div class="role-stats"><div><span>Active</span><b>${n(role.activeTotal)}</b></div><div><span>Pending</span><b>${n(pending)}</b></div><div><span>Completed</span><b>${n(complete)}</b></div></div></article>`;
    }).join("")}</div>` : '<div class="loading-state">No role records are configured.</div>';
  }

  function workspaceCards(items) {
    return `<div class="workspace-cards">${items.map((item) => `<a class="workspace-card" href="${escapeHtml(item.href)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.note)}</small></span><b>›</b></a>`).join("")}</div>`;
  }

  function bars(values) {
    const entries = Object.entries(values || {});
    if (!entries.length) return '<div class="loading-state">No records in this period.</div>';
    const maximum = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
    return `<div class="bar-list">${entries.map(([label, value]) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(label.replaceAll("_", " "))}</span><b>${n(value)}</b></div><div class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Number(value) / maximum * 100)}%"></span></div></div>`).join("")}</div>`;
  }

  function inventoryTable(items, limit = 9) {
    const rows = [...items].sort((a, b) => Number(a.stockQty || 0) - Number(b.stockQty || 0)).slice(0, limit);
    if (!rows.length) return '<div class="loading-state">No spare parts are recorded.</div>';
    return `<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Spare part</th><th>Part no.</th><th>Stock</th><th>Reorder</th><th>Status</th></tr></thead><tbody>${rows.map((part) => {
      const status = String(part.stockStatus || (Number(part.stockQty) <= 0 ? "OUT_OF_STOCK" : Number(part.stockQty) <= Number(part.reorderThreshold || 5) ? "LOW_STOCK" : "IN_STOCK"));
      const tone = status === "OUT_OF_STOCK" ? "danger" : status === "LOW_STOCK" ? "warning" : "good";
      return `<tr><td><strong>${escapeHtml(part.name || "Spare part")}</strong><br><small>${escapeHtml(part.category || "Uncategorized")}</small></td><td>${escapeHtml(part.partNumber || "—")}</td><td><strong>${n(part.stockQty)}</strong></td><td>${n(part.reorderThreshold)}</td><td><span class="status-badge ${tone}">${escapeHtml(status.replaceAll("_", " "))}</span></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderOverview(data) {
    const totals = data.totals || {};
    const finance = data.finance || {};
    const inventory = data.inventory?.summary || {};
    setMetrics([
      { label: "Customers", value: n(totals.customers), note: `${n(totals.machines)} registered machines`, tone: "green" },
      { label: "Active employees", value: n(totals.activeEmployees), note: `${n(totals.employees)} total BELM users`, tone: "blue" },
      { label: "Open Job Cards", value: n(totals.openRequests), note: "Customer work still open", tone: totals.openRequests ? "yellow" : "green" },
      { label: "Revenue received", value: m(finance.revenue), note: `${data.period?.label || "Selected period"}`, tone: "cyan" },
    ]);
    setPrimary("ROLE PERFORMANCE", "Responsibilities by role", roleCards(data.roles || []), `${n((data.roles || []).length)} ROLES`);
    setAttention([
      { code: "RG", label: "Registration approvals", note: "Waiting for an Administration decision", value: n(totals.pendingApplications), tone: totals.pendingApplications ? "warning" : "", href: "/admin-applications/" },
      { code: "JC", label: "Open Job Cards", note: "Workshop work not yet completed", value: n(totals.openRequests), tone: totals.openRequests ? "warning" : "", href: "/belm-workshop/#job-cards" },
      { code: "TK", label: "Pending tasks", note: "Assigned work awaiting completion", value: n(totals.pendingTasks), tone: totals.pendingTasks ? "warning" : "", href: "/roles-manager/" },
      { code: "SP", label: "Low stock parts", note: `${n(inventory.outOfStockParts)} out of stock`, value: n(inventory.lowStockParts), tone: inventory.outOfStockParts ? "danger" : inventory.lowStockParts ? "warning" : "", href: "/spare-parts-manager/" },
    ]);
    setActivity("Recent BELM activity", activityHtml(data.recentActivities || []));
  }

  function renderProcurement(data) {
    const summary = data.inventory?.summary || {};
    const finance = data.finance || {};
    setMetrics([
      { label: "Low stock parts", value: n(summary.lowStockParts), note: "At or below reorder level", tone: summary.lowStockParts ? "yellow" : "green" },
      { label: "Out of stock", value: n(summary.outOfStockParts), note: "Immediate sourcing required", tone: summary.outOfStockParts ? "red" : "green" },
      { label: "Purchase stock value", value: m(summary.purchaseStockValue), note: "Current inventory cost", tone: "blue" },
      { label: "Outstanding sales", value: m(finance.outstanding), note: "Useful for purchasing decisions", tone: finance.outstanding ? "yellow" : "green" },
    ]);
    setPrimary("PURCHASE PRIORITY", "Parts requiring Procurement attention", inventoryTable(data.inventory?.items || []), "STOCK SYNC");
    setAttention([
      { code: "OS", label: "Out-of-stock parts", note: "Check request and supplier availability", value: n(summary.outOfStockParts), tone: summary.outOfStockParts ? "danger" : "", href: "/belm-procurement/" },
      { code: "LS", label: "Low-stock parts", note: "Prepare reorder before interruption", value: n(summary.lowStockParts), tone: summary.lowStockParts ? "warning" : "", href: "/spare-parts-manager/" },
      { code: "SU", label: "Supplier directory", note: "Compare sourcing contacts and references", value: "›", href: "/suppliers-manager/" },
    ]);
    setActivity("Procurement workspaces", workspaceCards([
      { title: "Procurement Manager", note: "Process shortage, supplier and purchase stages.", href: "/belm-procurement/" },
      { title: "Spare Parts Inventory", note: "Confirm stock before creating a purchase.", href: "/spare-parts-manager/" },
      { title: "Equivalent Spares", note: "Use approved alternative part references.", href: "/spare-parts-manager/#equivalent-spares-panel" },
      { title: "Suppliers Directory", note: "Open BELM sourcing contacts.", href: "/suppliers-manager/" },
    ]));
  }

  function renderStore(data) {
    const summary = data.inventory?.summary || {};
    setMetrics([
      { label: "Part types", value: n(summary.totalPartTypes), note: "Active inventory records", tone: "green" },
      { label: "Stock quantity", value: n(summary.totalStockQty), note: "Total units recorded", tone: "blue" },
      { label: "Out of stock", value: n(summary.outOfStockParts), note: "Zero quantity records", tone: summary.outOfStockParts ? "red" : "green" },
      { label: "Expected sales value", value: m(summary.sellingStockValue), note: "Recorded selling value", tone: "cyan" },
    ]);
    setPrimary("STORE BALANCE", "Inventory position", inventoryTable(data.inventory?.items || [], 12), `${n(summary.totalPartTypes)} ITEMS`);
    setAttention([
      { code: "OS", label: "Out of stock", note: "Send confirmed shortages to Procurement", value: n(summary.outOfStockParts), tone: summary.outOfStockParts ? "danger" : "", href: "/belm-procurement/" },
      { code: "RP", label: "At reorder point", note: "Verify count before purchase", value: n(summary.lowStockParts), tone: summary.lowStockParts ? "warning" : "", href: "/spare-parts-manager/" },
      { code: "EQ", label: "Equivalent spares", note: "Review approved substitutes", value: "›", href: "/spare-parts-manager/#equivalent-spares-panel" },
    ]);
    setActivity("Store workspaces", workspaceCards([
      { title: "BELM Store", note: "Add parts, adjust stock and review value.", href: "/spare-parts-manager/" },
      { title: "Workshop Tools", note: "Issue and return workshop tools.", href: "/belm-workshop/tool-issues/" },
      { title: "Procurement", note: "Process confirmed stock shortages.", href: "/belm-procurement/" },
      { title: "General Report", note: "Review inventory movement with other departments.", href: "/reports-manager/" },
    ]));
  }

  function renderBank(data, bankData) {
    const summary = bankData?.summary || {};
    const accounts = Array.isArray(bankData?.accounts) ? bankData.accounts : [];
    setMetrics([
      { label: "All bank balance", value: m(summary.allBankBalance), note: `${n(accounts.length)} configured account(s)`, tone: Number(summary.allBankBalance) < 0 ? "red" : "green" },
      { label: "Payments received", value: m(summary.paymentsReceived), note: "Allocated bank receipts", tone: "blue" },
      { label: "Company expenses", value: m(summary.companyExpenses), note: "Recorded money out", tone: summary.companyExpenses ? "yellow" : "green" },
      { label: "Withdrawals", value: m(summary.totalWithdrawals), note: "Protected withdrawal records", tone: summary.totalWithdrawals ? "yellow" : "green" },
    ]);
    const accountRows = accounts.length ? `<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Bank</th><th>Account name</th><th>Account no.</th><th>Current balance</th></tr></thead><tbody>${accounts.map((account) => {
      const accountNumber = String(account.accountNumber || account.account_number || "");
      const masked = accountNumber.length > 4 ? `•••• ${accountNumber.slice(-4)}` : accountNumber || "—";
      return `<tr><td><strong>${escapeHtml(account.bankName || account.bank_name || "Bank")}</strong></td><td>${escapeHtml(account.accountName || account.account_name || "—")}</td><td>${escapeHtml(masked)}</td><td><strong>${m(account.balance)}</strong></td></tr>`;
    }).join("")}</tbody></table></div>` : '<div class="loading-state">No bank account is configured.</div>';
    setPrimary("PROTECTED ACCOUNTS", "Bank position by account", accountRows, "SUPER ADMIN");
    setAttention([
      { code: "DB", label: "Customer debt", note: "Outstanding invoice balance", value: m(summary.customerDebt || data.finance?.outstanding), tone: Number(summary.customerDebt || data.finance?.outstanding) ? "warning" : "", href: "/bank-controller/" },
      { code: "VT", label: "VAT debt", note: "Calculated tax position", value: m(summary.vatDebt), tone: Number(summary.vatDebt) ? "warning" : "", href: "/bank-controller/" },
      { code: "PL", label: Number(summary.loss) > 0 ? "Recorded loss" : "BELM profit", note: "Current synchronized company position", value: m(Number(summary.loss) > 0 ? summary.loss : summary.belmProfit), tone: Number(summary.loss) > 0 ? "danger" : "", href: "/bank-controller/" },
    ]);
    setActivity("Bank & finance workspaces", workspaceCards([
      { title: "Bank Manager", note: "Accounts, withdrawals, customer debt and audit.", href: "/bank-controller/" },
      { title: "Billing & Finance", note: "Invoices, payments, receipts and expenses.", href: "/billing-manager/" },
      { title: "Reports & Comparisons", note: "Compare the current and previous periods.", href: "/reports-manager/" },
      { title: "Petty Cash", note: "BELM internal workshop cash records.", href: "/belm-workshop/petty-cash/" },
    ]));
  }

  function renderRegistration(data) {
    const totals = data.totals || {};
    const finance = data.finance || {};
    setMetrics([
      { label: "Pending approvals", value: n(totals.pendingApplications), note: "Customer and user applications", tone: totals.pendingApplications ? "yellow" : "green" },
      { label: "Registered customers", value: n(totals.customers), note: "Active BELM customer records", tone: "green" },
      { label: "Machines covered", value: n(totals.machines), note: "Across registered customers", tone: "blue" },
      { label: "Sales invoiced", value: m(finance.sales), note: data.period?.label || "Selected period", tone: "cyan" },
    ]);
    setPrimary("CUSTOMER GROWTH", "Registration and sales workspaces", workspaceCards([
      { title: "Registration approvals", note: "Approve customer and BELM staff requests.", href: "/admin-applications/" },
      { title: "Customer overview", note: "Open companies, machines and connection status.", href: "/customers-manager/" },
      { title: "Billing & sales", note: "Prepare Proforma, invoice and receipt records.", href: "/billing-manager/" },
      { title: "Customer Workshop Portal", note: "Inspect the PORTAL-CWM operating surface.", href: "/portal-cwm/" },
    ]), "LIVE TOTALS");
    setAttention([
      { code: "RG", label: "Applications waiting", note: "Approval is required before first login", value: n(totals.pendingApplications), tone: totals.pendingApplications ? "warning" : "", href: "/admin-applications/" },
      { code: "AR", label: "Accounts receivable", note: "Outstanding invoiced balance", value: m(finance.outstanding), tone: finance.outstanding ? "warning" : "", href: "/billing-manager/" },
      { code: "CM", label: "Customer machines", note: "Registered machine coverage", value: n(totals.machines), href: "/customers-manager/" },
    ]);
    setActivity("Recent registration & sales activity", activityHtml(data.recentActivities || []));
  }

  function renderFinance(data) {
    const finance = data.finance || {};
    setMetrics([
      { label: "Sales invoiced", value: m(finance.sales), note: data.period?.label || "Selected period", tone: "blue" },
      { label: "Revenue received", value: m(finance.revenue), note: "Payments recorded", tone: "green" },
      { label: "Business expenses", value: m(finance.expenses), note: "Company expenses recorded", tone: finance.expenses ? "yellow" : "green" },
      { label: "Profit / loss", value: m(finance.profitLoss), note: "Received minus expenses", tone: Number(finance.profitLoss) >= 0 ? "green" : "red" },
    ]);
    const financeRows = [
      ["Sales invoiced", finance.sales], ["Cash received", finance.revenue], ["Business expenses", finance.expenses],
      ["Profit / loss", finance.profitLoss], ["Outstanding balance", finance.outstanding],
    ];
    setPrimary("FINANCIAL POSITION", "Current selected period", `<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Measure</th><th>Amount</th><th>Meaning</th></tr></thead><tbody>${financeRows.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td><strong>${m(value)}</strong></td><td>${label === "Outstanding balance" ? "Still owed by customers" : "Synchronized financial record"}</td></tr>`).join("")}</tbody></table></div>`, data.period?.label || "LIVE");
    setAttention([
      { code: "AR", label: "Outstanding", note: "Customer balance not yet received", value: m(finance.outstanding), tone: finance.outstanding ? "warning" : "", href: "/billing-manager/" },
      { code: "EX", label: "Expenses", note: "Business expenses in this period", value: m(finance.expenses), tone: finance.expenses ? "warning" : "", href: "/billing-manager/" },
      { code: "PL", label: Number(finance.profitLoss) >= 0 ? "Positive position" : "Loss position", note: "Received revenue minus expenses", value: m(finance.profitLoss), tone: Number(finance.profitLoss) < 0 ? "danger" : "", href: "/reports-manager/" },
    ]);
    setActivity("Finance workspaces", workspaceCards([
      { title: "Billing & Finance", note: "Invoices, payments, receipts and expenses.", href: "/billing-manager/" },
      { title: "Bank Manager", note: "Protected banking position for Super Admin.", href: "/bank-controller/" },
      { title: "Reports & Comparisons", note: "Current versus previous period.", href: "/reports-manager/" },
      { title: "BELM Petty Cash", note: "Workshop internal cash flow.", href: "/belm-workshop/petty-cash/" },
    ]));
  }

  function roleAggregate(roles, matcher) {
    return roles.filter((role) => matcher(String(role.name || "").toLowerCase())).reduce((out, role) => ({
      staff: out.staff + Number(role.staffTotal || 0),
      active: out.active + Number(role.activeTotal || 0),
      pending: out.pending + Number(role.pendingTasks || 0),
      completed: out.completed + Number(role.completedTasks || 0),
    }), { staff: 0, active: 0, pending: 0, completed: 0 });
  }

  function renderTechnician(data) {
    const tech = roleAggregate(data.roles || [], (name) => name.includes("technician"));
    const completion = tech.pending + tech.completed ? Math.round(tech.completed / (tech.pending + tech.completed) * 100) : 0;
    setMetrics([
      { label: "Technicians", value: n(tech.staff), note: "Registered BELM Technician accounts", tone: "blue" },
      { label: "Active technicians", value: n(tech.active), note: "Accounts available for assignment", tone: tech.active ? "green" : "yellow" },
      { label: "Pending tasks", value: n(tech.pending), note: "Assigned work not completed", tone: tech.pending ? "yellow" : "green" },
      { label: "Task completion", value: `${completion}%`, note: `${n(tech.completed)} completed tasks`, tone: "cyan" },
    ]);
    const relatedRoles = (data.roles || []).filter((role) => /technician|engineer|workshop/i.test(role.name || ""));
    setPrimary("TECHNICAL TEAM", "Technician and Workshop responsibility", roleCards(relatedRoles), `${n(tech.active)} ACTIVE`);
    setAttention([
      { code: "JC", label: "Open Job Cards", note: "Workshop cases requiring progress", value: n(data.totals?.openRequests), tone: data.totals?.openRequests ? "warning" : "", href: "/breakdown-workflow/?actor=admin&view=assigned" },
      { code: "TK", label: "Pending Technician tasks", note: "Not yet marked completed", value: n(tech.pending), tone: tech.pending ? "warning" : "", href: "/roles-manager/?role=Technician&technical=1" },
      { code: "TM", label: "Manage Technician access", note: "Roles, customer assignment and account status", value: "›", href: "/roles-manager/?role=Technician&technical=1" },
    ]);
    const techActivity = (data.recentActivities || []).filter((item) => /technician|engineer|workshop/i.test(item.roleName || ""));
    setActivity("Recent technical activity", activityHtml(techActivity.length ? techActivity : data.recentActivities || []));
  }

  function jobStage(job) {
    const value = `${job.processCode || job.process_code || job.status || ""} ${job.processLabel || job.process_label || job.processDetail || ""}`.toUpperCase();
    if (/COMPLET|CLOSED|DONE/.test(value)) return "Completed";
    if (/REVIEW|APPROVAL/.test(value)) return "Manager review";
    if (/TEST|REPAIR|IN_PROGRESS|WORKING/.test(value)) return "Repair & testing";
    if (/PROCUREMENT|PURCHASE|SHORTAGE/.test(value)) return "Procurement";
    if (/SPARE|STORE|PART/.test(value)) return "Waiting for spare";
    if (/TECHNICIAN|DIAGNOSIS|RECEIVED/.test(value)) return "Technician";
    if (/ASSIGN|DISPATCH|MANAGER/.test(value)) return "Assigned";
    return "Job Card";
  }

  function renderWorkshop(data, jobs) {
    const rows = Array.isArray(jobs) ? jobs : [];
    const completed = rows.filter((job) => jobStage(job) === "Completed").length;
    const active = rows.length - completed;
    const waiting = rows.filter((job) => /spare|procurement/i.test(jobStage(job))).length;
    setMetrics([
      { label: "Open Job Cards", value: n(data.totals?.openRequests), note: "All unfinished customer work", tone: data.totals?.openRequests ? "yellow" : "green" },
      { label: "Live process rows", value: n(active), note: "Currently moving through Workshop", tone: active ? "blue" : "green" },
      { label: "Waiting parts", value: n(waiting), note: "Store or Procurement action", tone: waiting ? "yellow" : "green" },
      { label: "Completed process", value: n(completed), note: "Closed live Job Card rows", tone: "green" },
    ]);
    const table = rows.length ? `<div class="table-wrap"><table class="dashboard-table"><thead><tr><th>Job Card</th><th>Technician</th><th>Machine</th><th>Customer</th><th>Process</th></tr></thead><tbody>${rows.slice(0, 10).map((job) => `<tr><td><strong>${escapeHtml(job.jobCardNo || job.job_card_no || job.jcNumber || "Job Card")}</strong></td><td>${escapeHtml(job.technicianName || job.technician_name || "Not assigned")}</td><td>${escapeHtml(job.machineFleetNo || job.machine_fleet_no || job.fleetNumber || "—")}</td><td>${escapeHtml(job.companyName || job.company_name || job.customerName || "—")}</td><td><span class="status-badge ${jobStage(job) === "Completed" ? "good" : /spare|procurement/i.test(jobStage(job)) ? "warning" : ""}">${escapeHtml(jobStage(job))}</span></td></tr>`).join("")}</tbody></table></div>` : bars(data.serviceStatus);
    setPrimary("JOB CARD MOVEMENT", "Live Workshop responsibility", table, `${n(active)} ACTIVE`);
    setAttention([
      { code: "JC", label: "Open Job Cards", note: "Requires an owner and next action", value: n(data.totals?.openRequests), tone: data.totals?.openRequests ? "warning" : "", href: "/belm-workshop/#job-cards" },
      { code: "SP", label: "Waiting spare / purchase", note: "Follow Store and Procurement", value: n(waiting), tone: waiting ? "warning" : "", href: "/belm-procurement/" },
      { code: "WM", label: "Workshop control centre", note: "Assign, diagnose, test and review", value: "›", href: "/belm-workshop/control-center/" },
    ]);
    setActivity("Workshop workspaces", workspaceCards([
      { title: "BELM Workshop", note: "Customer machines, Job Cards and alerts.", href: "/belm-workshop/" },
      { title: "Workshop Control Centre", note: "Assignment, Store, Procurement and review flow.", href: "/belm-workshop/control-center/" },
      { title: "Workshop Analysis", note: "Technician performance and Job Card trends.", href: "/workshop-analysis/?actor=admin" },
      { title: "Customer Machines", note: "Open BELM customer fleet records.", href: "/customers-manager/" },
    ]));
  }

  function renderReports(data) {
    setMetrics([
      { label: "Sales invoiced", value: m(data.finance?.sales), note: data.period?.label || "Selected period", tone: "blue" },
      { label: "Revenue received", value: m(data.finance?.revenue), note: "Synchronized payments", tone: "green" },
      { label: "Completed tasks", value: n(data.totals?.completedTasks), note: "BELM work marked done", tone: "cyan" },
      { label: "Registered machines", value: n(data.totals?.machines), note: "Fleet reporting coverage", tone: "yellow" },
    ]);
    setPrimary("REPORT CATEGORIES", "Choose the report workspace", workspaceCards([
      { title: "Finance comparison", note: "Sales, revenue, expenses and profit/loss.", href: "/reports-manager/" },
      { title: "Workshop Analysis", note: "Job Cards, workload, repeat work and completion.", href: "/workshop-analysis/?actor=admin" },
      { title: "Checklist Reports", note: "Completed machine checklists and safety results.", href: "/coordinator/general-report/checklist-report/" },
      { title: "Operations Action Centre", note: "Management priorities and business snapshot.", href: "/overview-manager/" },
    ]), "REPORT CENTRE");
    setAttention([
      { code: "JC", label: "Open service work", note: "Must remain visible in reports", value: n(data.totals?.openRequests), tone: data.totals?.openRequests ? "warning" : "", href: "/reports-manager/" },
      { code: "LS", label: "Low stock", note: "Inventory exception for reporting", value: n(data.totals?.lowStockParts), tone: data.totals?.lowStockParts ? "warning" : "", href: "/spare-parts-manager/" },
      { code: "AR", label: "Outstanding finance", note: "Customer balance still open", value: m(data.finance?.outstanding), tone: data.finance?.outstanding ? "warning" : "", href: "/reports-manager/" },
    ]);
    setActivity("Service status comparison", bars(data.serviceStatus));
  }

  function renderRoles(data) {
    const roles = data.roles || [];
    const inactive = roles.reduce((sum, role) => sum + Number(role.inactiveTotal || 0), 0);
    setMetrics([
      { label: "Configured roles", value: n(roles.length), note: "BELM responsibility groups", tone: "blue" },
      { label: "System users", value: n(data.totals?.employees), note: "All BELM staff accounts", tone: "cyan" },
      { label: "Active users", value: n(data.totals?.activeEmployees), note: "Accounts currently enabled", tone: "green" },
      { label: "Inactive users", value: n(inactive), note: "Accounts not available for work", tone: inactive ? "yellow" : "green" },
    ]);
    setPrimary("ALL BELM ROLES", "People and task ownership", roleCards(roles), `${n(roles.length)} ROLES`);
    setAttention([
      { code: "IA", label: "Inactive users", note: "Review whether access should stay disabled", value: n(inactive), tone: inactive ? "warning" : "", href: "/roles-manager/" },
      { code: "TK", label: "Pending tasks", note: "Role-owned work awaiting completion", value: n(data.totals?.pendingTasks), tone: data.totals?.pendingTasks ? "warning" : "", href: "/roles-manager/" },
      { code: "AC", label: "Access controller", note: "Assign one or more roles safely", value: "›", href: "/roles-manager/" },
    ]);
    setActivity("Recent role activity", activityHtml(data.recentActivities || []));
  }

  function renderUnavailable() {
    setMetrics([
      { label: "Your role", value: roleNames.join(" / "), note: "Signed-in BELM responsibility", tone: "green" },
      { label: "Visible modules", value: $("visibleModuleCount").textContent, note: "Based on role permissions", tone: "blue" },
      { label: "Live analysis", value: "Restricted", note: "Overview permission is required", tone: "yellow" },
      { label: "Data safety", value: "Preserved", note: "No operational record was changed", tone: "cyan" },
    ]);
    const config = modules[state.activeModule];
    setPrimary("ROLE WORKSPACE", "Open your permitted department", workspaceCards([
      { title: config.title, note: config.description, href: config.href },
    ]), "ROLE ACCESS");
    setAttention([{ code: "AC", label: "Analysis access", note: "Ask BELM Admin to add Overview permission if required", value: "—", href: config.href }]);
    setActivity("Your access", workspaceCards([{ title: "Open assigned workspace", note: "Continue to the operational page allowed for this role.", href: config.href }]));
  }

  function updateModuleHeader() {
    const config = modules[state.activeModule] || modules.overview;
    $("moduleEyebrow").textContent = config.eyebrow;
    $("moduleTitle").textContent = config.title;
    $("moduleDescription").textContent = config.description;
    $("openWorkspaceButton").href = config.href;
    $("openWorkspaceButton").textContent = config.action;
    $("secondaryWorkspaceLink").href = config.secondary;
    $("secondaryWorkspaceLink").textContent = config.secondaryLabel;
    document.title = `${config.title} — BELM`;
  }

  function render() {
    updateModuleHeader();
    if (!state.overview) {
      renderUnavailable();
      return;
    }
    const data = state.overview;
    if (state.activeModule === "procurement") renderProcurement(data);
    else if (state.activeModule === "store") renderStore(data);
    else if (state.activeModule === "bank") renderBank(data, state.bank);
    else if (state.activeModule === "registration") renderRegistration(data);
    else if (state.activeModule === "finance") renderFinance(data);
    else if (state.activeModule === "technician") renderTechnician(data);
    else if (state.activeModule === "workshop") renderWorkshop(data, state.jobs);
    else if (state.activeModule === "reports") renderReports(data);
    else if (state.activeModule === "roles") renderRoles(data);
    else renderOverview(data);

    const label = data.period?.label || "Selected period";
    const dateRange = data.period?.from && data.period?.to ? ` · ${data.period.from} → ${data.period.to}` : "";
    const synced = state.lastSynced ? state.lastSynced.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "now";
    $("syncLine").textContent = `LIVE DATA · ${label}${dateRange} · synchronized ${synced}`;
  }

  async function ensureSupplement(module, force = false) {
    if (module === "bank" && isSuperAdmin && (!state.bank || force)) state.bank = await api("/bank-manager");
    if (module === "workshop" && (!state.jobs || force)) {
      const result = await api("/engineering?action=job-process");
      state.jobs = Array.isArray(result) ? result : (result?.rows || result?.items || []);
    }
  }

  async function load(force = false) {
    if (state.loading) return;
    state.loading = true;
    const button = $("refreshButton");
    const alert = $("dashboardAlert");
    alert.hidden = true;
    button.disabled = true;
    button.textContent = "Syncing…";
    setLoading();
    try {
      if (hasPage("overview")) {
        const period = $("periodSelect").value;
        const requests = [api(`/reports/all-overview?period=${encodeURIComponent(period)}&_sync=${Date.now()}`)];
        if (state.activeModule === "bank" && isSuperAdmin) requests.push(api("/bank-manager"));
        else if (state.activeModule === "workshop") requests.push(api("/engineering?action=job-process"));
        const results = await Promise.all(requests);
        state.overview = results[0];
        if (state.activeModule === "bank") state.bank = results[1];
        if (state.activeModule === "workshop") {
          const jobs = results[1];
          state.jobs = Array.isArray(jobs) ? jobs : (jobs?.rows || jobs?.items || []);
        }
      } else {
        state.overview = null;
      }
      state.lastSynced = new Date();
      render();
    } catch (error) {
      alert.textContent = error.message;
      alert.hidden = false;
      if (!state.overview) renderUnavailable();
      else render();
    } finally {
      state.loading = false;
      button.disabled = false;
      button.textContent = "↻ Refresh";
    }
  }

  async function selectModule(module) {
    if (!modules[module] || module === state.activeModule) { closeMenu(); return; }
    state.activeModule = module;
    document.querySelectorAll(".role-nav").forEach((button) => button.classList.toggle("active", button.dataset.module === module));
    localStorage.setItem("belm_management_active_module", module);
    const url = new URL(location.href);
    url.searchParams.set("module", module);
    history.replaceState({}, "", url);
    closeMenu();
    updateModuleHeader();
    if ((module === "bank" && !state.bank) || (module === "workshop" && !state.jobs)) {
      setLoading();
      try {
        await ensureSupplement(module);
      } catch (error) {
        $("dashboardAlert").textContent = error.message;
        $("dashboardAlert").hidden = false;
      }
    }
    render();
  }

  function updateThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    $("themeButton").textContent = dark ? "☀ Light mode" : "☾ Dark mode";
  }

  $("menuButton").addEventListener("click", () => {
    const open = !document.body.classList.contains("menu-open");
    document.body.classList.toggle("menu-open", open);
    $("menuScrim").hidden = !open;
    $("menuButton").setAttribute("aria-expanded", String(open));
  });
  $("menuScrim").addEventListener("click", closeMenu);
  $("periodSelect").addEventListener("change", () => load(true));
  $("refreshButton").addEventListener("click", () => load(true));
  $("themeButton").addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    if (window.BELMTheme?.set) await window.BELMTheme.set(next);
    else document.documentElement.dataset.theme = next;
    updateThemeButton();
  });
  window.addEventListener("belm-theme-change", updateThemeButton);
  $("logoutButton").addEventListener("click", () => {
    ["belm_admin_token", "belm_admin_user", "belm_active_account_type", "belm_management_active_module"].forEach((key) => localStorage.removeItem(key));
    location.replace("/login");
  });
  window.addEventListener("resize", () => { if (innerWidth > 900) closeMenu(); });

  configureIdentity();
  configureNavigation();
  updateDate();
  updateThemeButton();
  setInterval(updateDate, 60000);
  load();
})();
