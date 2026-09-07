(() => {
  const token = localStorage.getItem("belm_customer_token") || "";
  if (!token) {
    location.replace("/login");
    return;
  }

  const decodeToken = (value) => {
    try {
      const raw = value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = raw + "=".repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map((character) =>
        `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    } catch (_) { return {}; }
  };

  const session = decodeToken(token);
  const role = String(session.actorType === "owner" ? "owner" : (session.customerRole || "assistant")).trim().toLowerCase();
  const roleLabels = {
    owner: "Customer Owner",
    admin: "Customer Admin",
    workshop_manager: "Workshop Manager",
    store_keeper: "Store Keeper",
    procurement: "Procurement",
    accounts: "Accounts / Finance",
    operator: "Machine Operator",
    assistant: "Portal User",
  };
  const roleLabel = roleLabels[role] || role.replaceAll("_", " ");
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat("en-TZ");
  const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const n = (value) => number.format(Number(value) || 0);
  const m = (value) => money.format(Number(value) || 0);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function canUse(roles) {
    return roles === "all" || String(roles || "").split(",").includes(role);
  }

  function configureRoleAccess() {
    const navItems = [...document.querySelectorAll("#roleNavigation [data-roles]")];
    navItems.forEach((item) => { item.hidden = !canUse(item.dataset.roles); });
    document.querySelectorAll("[data-section-roles]").forEach((section) => {
      section.hidden = !canUse(section.dataset.sectionRoles);
    });
    const visible = navItems.filter((item) => !item.hidden);
    set("roleNavCount", visible.length);

    const requested = new URLSearchParams(location.search).get("module") || "overview";
    const active = visible.find((item) => item.dataset.roleItem === requested) || visible[0];
    visible.forEach((item) => item.classList.toggle("active", item === active));
  }

  function configureIdentity() {
    const actor = String(session.actorName || session.name || "Customer User");
    const initials = actor.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "CU";
    set("roleActor", actor);
    set("roleName", roleLabel);
    set("roleInitials", initials);
    set("roleSummary", `Signed in as ${roleLabel}. Sidebar activities follow this role's access.`);
  }

  async function request(url) {
    const response = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (response.status === 401) {
      ["belm_customer_token", "belm_active_account_type", "belm_session_refreshed_belm_customer_token"].forEach((key) => localStorage.removeItem(key));
      location.replace("/login");
      throw new Error("Your session has expired.");
    }
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  const api = (path) => request(`/api/customer-portal${path}`);

  function machineState(machine) {
    return [
      machine.activityStatus, machine.activity_status, machine.condition,
      machine.machineCondition, machine.machine_condition, machine.status,
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function renderMachines(machines) {
    const active = machines.filter((machine) => /active|working|operational|good|normal|available/.test(machineState(machine))).length;
    const attention = machines.filter((machine) => /breakdown|stopped|repair|fault|critical|overdue|inactive/.test(machineState(machine))).length;
    set("machineCount", n(machines.length));
    set("machinesRegistered", n(machines.length));
    set("operatorMachines", n(machines.length));
    set("operatorActive", n(active));
    set("operatorAttention", n(attention));
  }

  function renderTechnicians(data) {
    const rows = Array.isArray(data) ? data : [];
    const active = rows.filter((item) => Boolean(item.isActive ?? item.is_active ?? true)).length;
    set("techCount", n(active));
    set("techniciansTotal", n(rows.length));
    set("techniciansActive", n(active));
  }

  function renderStore(data) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const quantity = items.reduce((sum, item) => sum + Number(item.qty_on_hand ?? item.qtyOnHand ?? 0), 0);
    const out = items.filter((item) => Number(item.qty_on_hand ?? item.qtyOnHand ?? 0) <= 0).length;
    set("storeCount", n(items.length));
    set("storeItems", n(items.length));
    set("storeQty", n(quantity));
    set("storeOut", n(out));
  }

  function renderFinance(data) {
    const account = data?.account || {};
    set("pettyBalance", m(account.balance));
    set("pettyFunded", m(account.totalToppedUp));
    set("pettySpent", m(account.totalUsed));
  }

  function renderUsers(data) {
    const departments = Array.isArray(data?.departments) ? data.departments : [];
    const total = departments.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const active = departments.reduce((sum, item) => sum + Number(item.active || 0), 0);
    set("userTotal", n(total));
    set("userActive", n(active));
    set("departmentCount", n(departments.filter((item) => Number(item.total || 0) > 0).length));
  }

  function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function renderAttendance(data) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    set("attendancePresent", n(data?.present));
    set("attendanceNoLogin", n(data?.noLogin));
    set("attendanceTotal", n(data?.total));
    set("attendanceDate", data?.date || "Today");
    $("attendanceRows").innerHTML = rows.length ? rows.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.email || "")}</small></td>
        <td>${escapeHtml(String(item.role || "").replaceAll("_", " "))}</td>
        <td class="${item.status === "PRESENT" ? "status-present" : "status-no-login"}">${item.status === "PRESENT" ? "PRESENT" : "NO LOGIN"}</td>
        <td>${escapeHtml(formatTime(item.firstLogin))}</td>
        <td>${escapeHtml(formatTime(item.lastLogin))}</td>
      </tr>`).join("") : '<tr><td colspan="5">No portal users found.</td></tr>';
  }

  async function loadProcurement(machines) {
    if (!canUse("owner,admin,workshop_manager,store_keeper,procurement")) return;
    if (!machines.length) {
      set("procurementNote", "No machines are registered, so there are no machine-linked Procurement requests.");
      return;
    }
    const results = await Promise.allSettled(machines.map((machine) =>
      api(`/procurement-requests/${encodeURIComponent(machine.id)}`)));
    const successful = results.filter((result) => result.status === "fulfilled");
    if (!successful.length) throw new Error("Procurement Analysis could not read the machine request queues.");
    const rows = successful.flatMap((result) => Array.isArray(result.value?.items) ? result.value.items : []);
    const statusOf = (item) => String(item.status || "").toUpperCase();
    const open = rows.filter((item) => !["PARTS_READY", "COMPLETED", "REJECTED", "CANCELLED"].includes(statusOf(item))).length;
    const shortage = rows.filter((item) => /SHORTAGE|NOT_IN_STORE/.test(String(item.storeMatchStatus || item.store_match_status || "").toUpperCase())).length;
    const ordered = rows.filter((item) => statusOf(item) === "ORDERED").length;
    const ready = rows.filter((item) => statusOf(item) === "PARTS_READY").length;
    set("procurementOpenTop", n(open));
    set("procurementOpen", n(open));
    set("procurementShortage", n(shortage));
    set("procurementOrdered", n(ordered));
    set("procurementReady", n(ready));
    const unavailable = results.length - successful.length;
    set("procurementNote", `${n(rows.length)} total request record(s) across ${n(successful.length)} machine(s)${unavailable ? `; ${unavailable} machine queue could not be read` : ""}.`);
  }

  function showAlert(messages) {
    const box = $("alertBox");
    if (!messages.length) {
      box.hidden = true;
      return;
    }
    box.textContent = `Some Role Activity sections could not synchronize: ${messages.join(", ")}.`;
    box.hidden = false;
  }

  async function load() {
    const refresh = $("refreshButton");
    refresh.disabled = true;
    refresh.textContent = "Syncing…";
    $("syncLine").textContent = "Synchronizing permitted Role Activity…";
    const errors = [];
    try {
      const dashboard = await api("/dashboard");
      const customer = dashboard?.customer || {};
      const machines = Array.isArray(dashboard?.machines) ? dashboard.machines : [];
      const company = String(customer.name || session.name || "Customer");
      set("companyTitle", `${company} Role Activity`);
      set("sidebarCompany", company.toUpperCase());
      document.title = `${company} Role Activity — PORTAL-CWM`;
      renderMachines(machines);

      const tasks = [
        { name: "Technicians", enabled: canUse("owner,admin,workshop_manager"), run: () => api("/technicians"), render: renderTechnicians },
        { name: "Store", enabled: canUse("owner,admin,workshop_manager,store_keeper,procurement"), run: () => api("/store"), render: renderStore },
        { name: "Finance", enabled: canUse("owner,admin,accounts"), run: () => api("/petty-cash-account"), render: renderFinance },
        { name: "Users", enabled: canUse("owner,admin"), run: () => api("/users/analysis"), render: renderUsers },
        { name: "Attendance", enabled: true, run: () => request(`/api/activity-log?scope=attendance&_=${Date.now()}`), render: renderAttendance },
        { name: "Procurement", enabled: canUse("owner,admin,workshop_manager,store_keeper,procurement"), run: () => loadProcurement(machines), render: () => {} },
      ].filter((task) => task.enabled);

      const results = await Promise.allSettled(tasks.map((task) => task.run()));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") tasks[index].render(result.value);
        else errors.push(tasks[index].name);
      });
      $("syncLine").textContent = `LIVE ROLE ACTIVITY · ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
    } catch (error) {
      errors.push("Company Home");
      $("syncLine").textContent = error.message || "Role Activity synchronization failed.";
    } finally {
      showAlert(errors);
      refresh.disabled = false;
      refresh.textContent = "↻ Refresh";
    }
  }

  function closeMenu() {
    document.body.classList.remove("role-menu-open");
    $("roleMenuButton").setAttribute("aria-expanded", "false");
    $("roleMenuScrim").hidden = true;
  }

  $("roleMenuButton").addEventListener("click", () => {
    const open = !document.body.classList.contains("role-menu-open");
    document.body.classList.toggle("role-menu-open", open);
    $("roleMenuButton").setAttribute("aria-expanded", String(open));
    $("roleMenuScrim").hidden = !open;
  });
  $("roleMenuScrim").addEventListener("click", closeMenu);
  document.querySelectorAll("#roleNavigation a").forEach((item) => item.addEventListener("click", () => {
    document.querySelectorAll("#roleNavigation a").forEach((other) => other.classList.toggle("active", other === item));
    closeMenu();
  }));
  $("refreshButton").addEventListener("click", load);
  $("logoutButton").addEventListener("click", () => {
    ["belm_customer_token", "belm_active_account_type", "belm_session_refreshed_belm_customer_token"].forEach((key) => localStorage.removeItem(key));
    location.replace("/login");
  });
  $("themeButton").addEventListener("click", async () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    if (window.BELMTheme?.set) await window.BELMTheme.set(next);
    else document.documentElement.dataset.theme = next;
  });
  window.addEventListener("resize", () => { if (innerWidth > 820) closeMenu(); });

  configureIdentity();
  configureRoleAccess();
  load();
})();
