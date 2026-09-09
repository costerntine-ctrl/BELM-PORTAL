(function () {
  const token = localStorage.getItem("belm_admin_token");
  let user = null;
  try { user = JSON.parse(localStorage.getItem("belm_admin_user") || "null"); } catch (_) {}
  if (!token || !user) { window.location.replace("/login"); return; }

  const $ = (id) => document.getElementById(id);
  const number = new Intl.NumberFormat("en-TZ");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[c]);

  // ---- Sidebar navigation (matches the simplified Home Dashboard layout) ----
  const NAV_ICONS = {
    home: '<svg viewBox="0 0 20 20"><path d="M3 9.5 10 3l7 6.5"/><path d="M5 8.5V17h10V8.5"/></svg>',
    personPlus: '<svg viewBox="0 0 20 20"><circle cx="8" cy="6.5" r="3"/><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M15.5 6.5h3M17 5v3"/></svg>',
    users: '<svg viewBox="0 0 20 20"><circle cx="6.5" cy="6.5" r="2.7"/><circle cx="14" cy="7" r="2.3"/><path d="M2 17c0-2.8 2-4.7 4.5-4.7s4.5 1.9 4.5 4.7M11.5 17c0-2.3 1.7-4 4-4s4 1.7 4 4"/></svg>',
    truck: '<svg viewBox="0 0 20 20"><path d="M2 6h9v7H2z"/><path d="M11 9h4l3 3v1h-7z"/><circle cx="5.5" cy="15" r="1.5"/><circle cx="14.5" cy="15" r="1.5"/></svg>',
    shield: '<svg viewBox="0 0 20 20"><path d="M10 2.5 16 5v5c0 4-3 6.5-6 7.5-3-1-6-3.5-6-7.5V5z"/><path d="M7.3 9.8l1.8 1.8 3.6-3.9"/></svg>',
    wrench: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5a4 4 0 0 0-5.4 4.6L3 13.2V17h3.8l5.1-5.1a4 4 0 0 0 4.6-5.4l-2.8 2.8-2-2z"/></svg>',
    box: '<svg viewBox="0 0 20 20"><path d="M10 2.5 17 6v8l-7 3.5L3 14V6z"/><path d="M3 6l7 3.5M17 6l-7 3.5M10 9.5V17"/></svg>',
    cart: '<svg viewBox="0 0 20 20"><circle cx="7" cy="17" r="1.4"/><circle cx="14.5" cy="17" r="1.4"/><path d="M2 3h2l2 10h9l2-7H5"/></svg>',
    receipt: '<svg viewBox="0 0 20 20"><path d="M5 2.5h10v15l-2-1.3-1.7 1.3-1.3-1.3-1.3 1.3-1.7-1.3-2 1.3z"/><path d="M7.5 7h5M7.5 10h5M10 6v2m0 3v1"/></svg>',
    bank: '<svg viewBox="0 0 20 20"><path d="M10 2 2 6.5h16z"/><path d="M3.5 8v7M7 8v7M13 8v7M16.5 8v7"/><path d="M2 17h16"/></svg>',
    chart: '<svg viewBox="0 0 20 20"><path d="M3 17V9M9 17V3M15 17v-6"/></svg>',
    gear: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2.2M10 15.2v2.2M17.4 10h-2.2M4.8 10H2.6M15.1 4.9l-1.6 1.6M6.5 13.5l-1.6 1.6M15.1 15.1l-1.6-1.6M6.5 6.5 4.9 4.9"/></svg>',
  };
  const NAV_ITEMS = [
    { label: "Home", icon: "home", href: "/home-dashboard/" },
    { label: "Customer Registration", icon: "personPlus", href: "/admin-applications/" },
    { label: "Customers", icon: "users", href: "/customers-manager/" },
    { label: "Machines", icon: "truck", href: "/customers-manager/" },
    { label: "Roles & Users", icon: "shield", href: "/roles-manager/" },
    { label: "Workshop & Job Cards", icon: "wrench", href: "/breakdown-workflow/?actor=admin&view=job-cards" },
    { label: "Spare Parts Inventory", icon: "box", href: "/spare-parts-manager/" },
    { label: "Procurement", icon: "cart", href: "/belm-procurement/" },
    { label: "Finance & Accounts", icon: "receipt", href: "/billing-manager/" },
    { label: "Bank Control", icon: "bank", href: "/bank-controller/" },
    { label: "Reports & Analysis", icon: "chart", href: "/reports-manager/" },
    { label: "System Settings", icon: "gear", href: "/settings-manager/" },
  ];
  const currentPath = window.location.pathname;
  $("hdNav").innerHTML = NAV_ITEMS.map((item) => {
    const active = currentPath === item.href.split("?")[0] || (item.href.includes("home-dashboard") && currentPath.startsWith("/home-dashboard/"));
    return `<a href="${escapeHtml(item.href)}" class="${active ? "is-active" : ""}">${NAV_ICONS[item.icon] || ""}<span>${escapeHtml(item.label)}</span></a>`;
  }).join("");

  // ---- Identity ----
  const initials = String(user.name || "BU").trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "BU";
  $("hdUserAvatar").textContent = initials;
  $("hdUserName").textContent = user.name || "BELM User";
  $("hdUserRole").textContent = user.role === "Engineer" ? "Workshop Manager" : (user.role || "Assigned role");

  // ---- Mobile menu ----
  const menuButton = $("menuButton");
  const scrim = $("menuScrim");
  const setOpen = (open) => {
    document.body.classList.toggle("hd-menu-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    scrim.hidden = !open;
  };
  menuButton.addEventListener("click", () => setOpen(!document.body.classList.contains("hd-menu-open")));
  scrim.addEventListener("click", () => setOpen(false));
  $("hdNav").addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });

  // ---- Theme + logout ----
  $("hdThemeToggle").addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    if (window.BELMTheme?.set) await window.BELMTheme.set(next);
  });
  $("hdLogout").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login";
  });

  // ---- Live data from the real overview endpoint ----
  async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/login";
      throw new Error("Session expired.");
    }
    if (!response.ok) throw new Error(data.error || "Could not load dashboard data.");
    return data;
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderStats(totals) {
    $("hdStatCustomers").textContent = number.format(totals.customers || 0);
    $("hdStatCustomersNote").textContent = `${number.format(totals.machines || 0)} registered machines`;
    $("hdStatMachines").textContent = number.format(totals.machines || 0);
    $("hdStatMachinesNote").textContent = "Entire customer fleet";
    $("hdStatJobs").textContent = number.format(totals.openRequests || 0);
    $("hdStatJobsNote").textContent = "Customer work still open";
    $("hdStatApprovals").textContent = number.format(totals.pendingApplications || 0);
    $("hdStatApprovalsNote").textContent = "Waiting for a decision";

    const badge = $("hdBellBadge");
    const pending = Number(totals.pendingApplications || 0);
    badge.hidden = pending < 1;
    badge.textContent = String(pending);
  }

  function renderWorkshopBars(totals) {
    const rows = [
      { label: "Completed tasks", value: totals.completedTasks || 0, color: "#00a958" },
      { label: "Pending tasks", value: totals.pendingTasks || 0, color: "#f2ce00" },
      { label: "Open job cards", value: totals.openRequests || 0, color: "#1684ff" },
    ];
    const max = Math.max(...rows.map((r) => r.value), 1);
    $("hdWorkshopBars").innerHTML = rows.map((row) => `
      <div class="hd-bar-row">
        <div class="hd-bar-label"><span>${escapeHtml(row.label)}</span><strong>${number.format(row.value)}</strong></div>
        <div class="hd-bar-track"><span class="hd-bar-fill" style="width:${Math.max(4, (row.value / max) * 100)}%;background:${row.color}"></span></div>
      </div>`).join("");
  }

  function renderAttention(totals) {
    const items = [
      { label: "Registration approvals", note: "Waiting for a decision", value: totals.pendingApplications || 0, href: "/admin-applications/" },
      { label: "Open Job Cards", note: "Workshop work not yet completed", value: totals.openRequests || 0, href: "/breakdown-workflow/?actor=admin&view=job-cards" },
      { label: "Low stock parts", note: "At or below reorder point", value: totals.lowStockParts || 0, href: "/spare-parts-manager/" },
    ];
    $("hdAttentionList").innerHTML = items.map((item) => `
      <li><a href="${escapeHtml(item.href)}">
        <span><strong>${escapeHtml(item.label)}</strong><br><small>${escapeHtml(item.note)}</small></span>
        <span class="hd-attention-count ${item.value < 1 ? "zero" : ""}">${number.format(item.value)}</span>
      </a></li>`).join("");
  }

  function renderActivity(rows) {
    const list = Array.isArray(rows) ? rows.slice(0, 8) : [];
    $("hdActivityRows").innerHTML = list.length
      ? list.map((row) => `
        <tr>
          <td>${escapeHtml(timeAgo(row.createdAt))}</td>
          <td>${escapeHtml(String(row.action || "").replaceAll("_", " "))} · ${escapeHtml(row.entity || "")}</td>
          <td>${escapeHtml(row.userName || "—")}</td>
          <td>${escapeHtml(row.roleName || "—")}</td>
        </tr>`).join("")
      : '<tr><td colspan="4" class="hd-empty">No recent activity recorded yet.</td></tr>';
  }

  async function load() {
    try {
      const data = await api("/reports/all-overview?period=month");
      const totals = data.totals || {};
      $("hdCompanyName").textContent = "BELM General Technical Service LTD";
      renderStats(totals);
      renderWorkshopBars(totals);
      renderAttention(totals);
      renderActivity(data.recentActivities);
    } catch (error) {
      $("hdActivityRows").innerHTML = `<tr><td colspan="4" class="hd-empty">${escapeHtml(error.message || "Could not load dashboard data.")}</td></tr>`;
    }
  }

  load();
})();
