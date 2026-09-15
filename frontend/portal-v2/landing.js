(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function decodeToken(token) {
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = encoded + "=".repeat((4 - encoded.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    } catch (_) { return null; }
  }

  function currentSession() {
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

  const session = currentSession();
  if (!session) { location.replace("/login"); return; }

  let storedUser = null;
  if (session.type !== "customer") {
    try {
      storedUser = JSON.parse(localStorage.getItem(session.type === "technician" ? "belm_tech_user" : "belm_admin_user") || "null");
    } catch (_) {}
  }

  const rawRole = session.type === "customer"
    ? String(session.payload.customerRole || session.payload.role || "owner")
    : String(storedUser?.role || session.payload.roleName || session.payload.role || "Staff");

  const role = rawRole.toLowerCase().trim();
  const staffRoutes = {
    "super admin": ["BELM SUPER ADMIN", "Open the BELM Super Admin dashboard", "/concept-dashboards/01-admin-home/"],
    "belm admin": ["BELM SUPER ADMIN", "Open the BELM Super Admin dashboard", "/concept-dashboards/01-admin-home/"],
    "admin": ["BELM SUPER ADMIN", "Open the BELM Super Admin dashboard", "/concept-dashboards/01-admin-home/"],
    "engineer": ["WORKSHOP MANAGER", "Open the Workshop Manager dashboard", "/concept-dashboards/11-workshop-manager/"],
    "workshop manager": ["WORKSHOP MANAGER", "Open the Workshop Manager dashboard", "/concept-dashboards/11-workshop-manager/"],
    "technical dep": ["WORKSHOP MANAGER", "Open the Workshop Manager dashboard", "/concept-dashboards/11-workshop-manager/"],
    "technical department": ["WORKSHOP MANAGER", "Open the Workshop Manager dashboard", "/concept-dashboards/11-workshop-manager/"],
    "technician": ["TECHNICIAN", "Open the Technician dashboard", "/concept-dashboards/02-technician/"],
    "procurement": ["PROCUREMENT", "Open the Procurement dashboard", "/concept-dashboards/03-procurement/"],
    "store keeper": ["STORE KEEPER", "Open the Store Keeper dashboard", "/concept-dashboards/06-storekeeper/"],
    "storekeeper": ["STORE KEEPER", "Open the Store Keeper dashboard", "/concept-dashboards/06-storekeeper/"],
    "registration & sales": ["REGISTRATION & SALES", "Open the Registration & Sales dashboard", "/concept-dashboards/04-customer-registration/"],
    "registration and sales": ["REGISTRATION & SALES", "Open the Registration & Sales dashboard", "/concept-dashboards/04-customer-registration/"],
    "sales": ["REGISTRATION & SALES", "Open the Registration & Sales dashboard", "/concept-dashboards/04-customer-registration/"],
    "finance": ["FINANCE / ACCOUNTS", "Open the Finance & Accounts dashboard", "/concept-dashboards/09-finance-accounts/"],
    "accounts": ["FINANCE / ACCOUNTS", "Open the Finance & Accounts dashboard", "/concept-dashboards/09-finance-accounts/"],
    "finance / accounts": ["FINANCE / ACCOUNTS", "Open the Finance & Accounts dashboard", "/concept-dashboards/09-finance-accounts/"],
    "bank controller": ["BANK CONTROLLER", "Open the Bank Controller dashboard", "/bank-controller/"],
    "system coordinator": ["SYSTEM COORDINATOR", "Open System Settings", "/concept-dashboards/10-system-settings/"],
    "coordinator": ["SYSTEM COORDINATOR", "Open System Settings", "/concept-dashboards/10-system-settings/"],
    "operator": ["MACHINE OPERATOR", "Open the Machine Operator dashboard", "/concept-dashboards/07-operator/"],
    "machine operator": ["MACHINE OPERATOR", "Open the Machine Operator dashboard", "/concept-dashboards/07-operator/"],
    "general analysis": ["GENERAL ANALYSIS", "Open the General Analysis dashboard", "/general-analysis/"],
    "analyst": ["GENERAL ANALYSIS", "Open the General Analysis dashboard", "/general-analysis/"]
  };

  const customerRoutes = {
    "owner": ["CUSTOMER ADMIN", "Open your company dashboard", "/portal-cwm/"],
    "administration": ["CUSTOMER ADMIN", "Open your company dashboard", "/portal-cwm/"],
    "customer admin": ["CUSTOMER ADMIN", "Open your company dashboard", "/portal-cwm/"],
    "workshop admin": ["CUSTOMER ADMIN", "Open your company dashboard", "/portal-cwm/"],
    "procurement": ["PROCUREMENT", "Open your company Procurement dashboard", "/customer-procurement-home/"],
    "store keeper": ["STORE KEEPER", "Open your company Store dashboard", "/customer-store/"],
    "storekeeper": ["STORE KEEPER", "Open your company Store dashboard", "/customer-store/"],
    "finance": ["FINANCE / ACCOUNTS", "Open your company Finance dashboard", "/customer-billing/"],
    "accounts": ["FINANCE / ACCOUNTS", "Open your company Finance dashboard", "/customer-billing/"],
    "technician": ["TECHNICIAN", "Open your company Technician workspace", "/customer-workshop/"],
    "workshop manager": ["WORKSHOP MANAGER", "Open your company Workshop dashboard", "/customer-workshop/"],
    "workshop supervisor": ["WORKSHOP MANAGER", "Open your company Workshop dashboard", "/customer-workshop/"],
    "operator": ["MACHINE OPERATOR", "Open your Machine Operator dashboard", "/concept-dashboards/07-operator/"]
  };

  const roleInfo = session.type === "customer"
    ? (customerRoutes[role] || [rawRole.toUpperCase(), "Open your assigned dashboard", "/portal-cwm/"])
    : (staffRoutes[role] || [rawRole.toUpperCase(), "Open your assigned BELM workspace", "/belm-workshop/"]);

  function go(url) {
    const curtain = $("navCurtain");
    if (curtain) {
      curtain.classList.add("show");
      curtain.setAttribute("aria-hidden", "false");
    }
    document.documentElement.style.background = "#03284f";
    document.body.style.pointerEvents = "none";
    requestAnimationFrame(() => location.assign(url));
  }

  $("roleLabel").textContent = roleInfo[0];
  $("roleSubtitle").textContent = roleInfo[1];
  $("viewRoleButton").addEventListener("click", () => go(roleInfo[2]));

  $("logoutButton").addEventListener("click", () => {
    ["belm_customer_token", "belm_tech_token", "belm_tech_user", "belm_admin_token", "belm_admin_user", "belm_operator_token", "belm_active_account_type"].forEach((key) => localStorage.removeItem(key));
    go("/login");
  });

  const alerts = [];
  let index = 0;
  let autoTimer = null;

  function machineName(machine) {
    return [machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType || machine.machine_type || "Machine";
  }

  function fleet(machine) {
    return machine.fleetNumber || machine.fleet_number || machine.regNumber || machine.reg_number || machine.serialNumber || machine.serial_number || "—";
  }

  function status(machine) {
    return String(machine.operationalStatus || machine.operational_status || machine.status || "NORMAL").toUpperCase();
  }

  function operatorText(machine) {
    const report = machine.latestOperatorMessage || machine.latest_operator_message;
    if (!report) return "";
    return String(report.message || "").trim();
  }

  function shouldShow(machine) {
    const condition = String(machine.status || "").toUpperCase();
    const operation = status(machine);
    const report = machine.latestOperatorMessage || machine.latest_operator_message;
    const reportStatus = String(report?.status || "").toUpperCase();
    return ["YELLOW", "RED", "CRITICAL", "ATTENTION"].includes(condition)
      || !["NORMAL", "", "UNKNOWN"].includes(operation)
      || (report && !["CLOSED", "RESOLVED", "RECORDED"].includes(reportStatus));
  }

  function setDots() {
    const dots = $("alertDots");
    dots.innerHTML = "";
    alerts.forEach((_, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = i === index ? "dot active" : "dot";
      button.setAttribute("aria-label", `Show machine alert ${i + 1}`);
      button.addEventListener("click", () => { index = i; renderAlert(); restartTimer(); });
      dots.appendChild(button);
    });
  }

  function renderAlert() {
    const empty = $("alertEmpty");
    const content = $("alertContent");
    if (!alerts.length) {
      content.hidden = true;
      empty.hidden = false;
      $("prevAlert").disabled = true;
      $("nextAlert").disabled = true;
      $("alertDots").innerHTML = "";
      return;
    }
    empty.hidden = true;
    content.hidden = false;
    const machine = alerts[index % alerts.length];
    $("machineTitle").textContent = `${machineName(machine)} · Fleet ${fleet(machine)}`;
    $("machineStatus").textContent = `Machine status: ${status(machine)}`;
    const note = operatorText(machine) || machine.operationalStatusNote || machine.operational_status_note || "Machine requires workshop attention.";
    $("machineNote").textContent = `— ${note}`;
    $("prevAlert").disabled = alerts.length < 2;
    $("nextAlert").disabled = alerts.length < 2;
    setDots();
  }

  function restartTimer() {
    if (autoTimer) clearInterval(autoTimer);
    if (alerts.length > 1) autoTimer = setInterval(() => { index = (index + 1) % alerts.length; renderAlert(); }, 6000);
  }

  $("prevAlert").addEventListener("click", () => {
    if (!alerts.length) return;
    index = (index - 1 + alerts.length) % alerts.length;
    renderAlert(); restartTimer();
  });
  $("nextAlert").addEventListener("click", () => {
    if (!alerts.length) return;
    index = (index + 1) % alerts.length;
    renderAlert(); restartTimer();
  });

  async function api(path) {
    const response = await fetch(`/api${path}`, { cache: "no-store", headers: { Authorization: `Bearer ${session.token}` } });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    return data;
  }

  function extractMachines(data) {
    if (Array.isArray(data?.machines)) return data.machines;
    if (Array.isArray(data)) return data.flatMap((row) => Array.isArray(row?.machines) ? row.machines : []);
    if (Array.isArray(data?.customers)) return data.customers.flatMap((row) => Array.isArray(row?.machines) ? row.machines : []);
    return [];
  }

  async function loadAlerts() {
    $("alertEmpty").textContent = "Checking machine alerts…";
    let machines = [];
    try {
      if (session.type === "customer") {
        machines = extractMachines(await api("/customer-portal/dashboard"));
      } else {
        try {
          machines = extractMachines(await api("/customers"));
        } catch (_) {
          const customerId = storedUser?.assignedCustomerId || session.payload.assignedCustomerId || "";
          if (customerId) machines = extractMachines([await api(`/customers/${encodeURIComponent(customerId)}`)]);
        }
      }
    } catch (_) {}

    const flagged = machines.filter(shouldShow);
    alerts.splice(0, alerts.length, ...(flagged.length ? flagged : machines.slice(0, 8)));
    if (!alerts.length) $("alertEmpty").textContent = "No active machine alerts at the moment.";
    index = 0;
    renderAlert();
    restartTimer();
  }

  window.addEventListener("pageshow", () => {
    const curtain = $("navCurtain");
    if (curtain) {
      curtain.classList.remove("show");
      curtain.setAttribute("aria-hidden", "true");
    }
    document.body.style.pointerEvents = "";
  });

  loadAlerts();
})();
