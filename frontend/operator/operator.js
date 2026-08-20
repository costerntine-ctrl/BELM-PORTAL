(function () {
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  let token = localStorage.getItem("belm_operator_token");
  let operatorName = localStorage.getItem("belm_operator_name") || "";
  let machineName = localStorage.getItem("belm_operator_machine_name") || "";

  const alertBox = document.getElementById("alertBox");
  function showAlert(message, isError = true) {
    alertBox.textContent = message;
    alertBox.className = `op-alert${isError ? " error" : ""}`;
  }
  function clearAlert() {
    alertBox.className = "op-alert hidden";
  }

  function showSection(id) {
    ["loginSection", "shiftSection", "signOutSection", "doneSection"].forEach((sectionId) => {
      document.getElementById(sectionId).classList.toggle("hidden", sectionId !== id);
    });
    // "Exit" only makes sense once signed in (shift/sign-out/done
    // screens) — it just returns to the login screen without ending the
    // open shift, in case the device needs to be handed to someone else
    // or the operator wants to come back to it later.
    document.getElementById("exitButton").classList.toggle("hidden", id === "loginSection");
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/operator${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("belm_operator_token");
        token = null;
      }
      throw new Error(data?.error || "Something went wrong.");
    }
    return data;
  }

  const dashboardRoot = document.getElementById("operatorMachineDashboard");
  let dashboardRefreshTimer = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    }[char]));
  }

  function conditionMeta(status) {
    const normalized = String(status || "UNKNOWN").toUpperCase();
    const map = {
      GREEN: ["Good condition", "Machine is operational."],
      YELLOW: ["Needs attention", "Inspection or maintenance action is required."],
      RED: ["Critical condition", "Do not operate until the fault is corrected."],
      UNKNOWN: ["Not inspected", "Complete a checklist to confirm the condition."],
    };
    return { status: map[normalized] ? normalized : "UNKNOWN", label: (map[normalized] || map.UNKNOWN)[0], note: (map[normalized] || map.UNKNOWN)[1] };
  }

  function activityLabel(value) {
    return ({
      NORMAL: "Normal",
      SERVICE_IN_PROGRESS: "Service in progress",
      CHECKUP_IN_PROGRESS: "Check-up in progress",
      MAINTENANCE_IN_PROGRESS: "Maintenance in progress",
      GROUNDED: "Grounded",
    })[String(value || "NORMAL").toUpperCase()] || String(value || "Normal").replaceAll("_", " ");
  }

  function tzParts(value, withTime = false) {
    if (!value) return "Not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    const options = { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "2-digit", year: "numeric" };
    if (withTime) Object.assign(options, { hour: "2-digit", minute: "2-digit", hour12: false });
    const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return withTime
      ? `${get("day")}/${get("month")}/${get("year")} - ${get("hour")}.${get("minute")}`
      : `${get("day")}/${get("month")}/${get("year")}`;
  }

  function tzDateKey(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  }

  function checklistNumber(report) {
    if (!report) return "";
    const dateKey = tzDateKey(report.createdAt).replace(/-/g, "") || "00000000";
    const compactId = String(report.id || "AUTO").replace(/[^a-z0-9]/gi, "").toUpperCase();
    return `CHK-${dateKey}-${compactId.slice(0, 8) || "AUTO"}`;
  }

  function serviceRangeText(status) {
    if (!status) return "Service range: checking…";
    const remaining = Math.round(Number(status.hoursRemaining || 0));
    const overdue = Math.max(0, Math.round(Math.abs(Math.min(0, remaining))));
    const serviceType = status.serviceType || `${status.intervalHours || 250}-Hour Service`;
    const state = String(status.level || "GREEN").toUpperCase() === "RED"
      ? (overdue ? `OVERDUE BY ${overdue} HRS` : "DUE NOW")
      : String(status.level || "GREEN").toUpperCase() === "YELLOW" ? "DUE SOON" : "ON SCHEDULE";
    return `Service range: ${serviceType} · ${state}`;
  }

  function renderOperatorMachineDashboard(payload) {
    if (!dashboardRoot || !payload?.machine) return;
    const machine = payload.machine;
    const condition = conditionMeta(machine.status);
    const reasons = Array.isArray(machine.alertReasons) ? machine.alertReasons.filter(Boolean) : [];
    const conditionMessage = reasons.length
      ? reasons.join(" · ")
      : condition.status === "RED" ? "Critical machine alert — do not operate until corrected."
      : condition.status === "YELLOW" ? "Machine needs attention — inspection or maintenance is required."
      : condition.status === "GREEN" ? "Machine condition normal."
      : "Machine condition has not been checked yet.";
    const operatorMessage = machine.latestOperatorMessage;
    const operatorMessageText = operatorMessage?.message || "No operator message reported yet.";
    const operatorMessageMeta = operatorMessage
      ? `${operatorMessage.operatorName || "Operator"} · ${tzParts(operatorMessage.createdAt, true)} · ${String(operatorMessage.status || "OPEN").toUpperCase()}`
      : "Waiting for Operator report";
    const latestCheck = machine.latestChecklist;
    const checkedToday = latestCheck?.createdAt && tzDateKey(latestCheck.createdAt) === tzDateKey(Date.now());
    const serviceStatus = machine.serviceStatus || null;
    const serviceLevel = String(serviceStatus?.level || "GREEN").toLowerCase();
    const serviceType = serviceStatus?.serviceType || "Service plan";
    const remaining = Math.round(Number(serviceStatus?.hoursRemaining || 0));
    const overdue = Math.max(0, Math.round(Math.abs(Math.min(0, remaining))));
    const serviceState = !serviceStatus ? "CHECKING"
      : String(serviceStatus.level || "GREEN").toUpperCase() === "RED" ? (overdue ? `OVERDUE BY ${overdue} HRS` : "DUE NOW")
      : String(serviceStatus.level || "GREEN").toUpperCase() === "YELLOW" ? "DUE SOON" : "ON SCHEDULE";

    dashboardRoot.innerHTML = `
      <article class="op-machine-card status-${esc(condition.status.toLowerCase())}" data-operator-machine-id="${esc(machine.id)}">
        <header class="op-machine-head">
          <div><span class="op-dashboard-kicker">MACHINE OPERATOR DASHBOARD</span><h2>${esc(machine.model || machine.brand || "Machine")}</h2></div>
          <span class="op-fleet-badge"><small>Fleet No.</small><b>${esc(machine.fleetNumber || "—")}</b></span>
        </header>
        <div class="op-machine-subhead">${esc(machine.machineType || "Machine")} · ${esc(machine.serialNumber || machine.regNumber || "No serial recorded")}</div>

        <section class="op-machine-health status-${esc(condition.status.toLowerCase())}">
          <div><span>Machine Status</span><strong>${esc(condition.status)}</strong></div>
          <div><span>Condition</span><strong>${esc(condition.label)}</strong><small>${esc(condition.note)}${reasons.length ? ` ${esc(reasons.slice(0,2).join(" · "))}` : ""}</small></div>
        </section>

        ${checkedToday ? `<div class="op-check-stamp"><strong>${esc(latestCheck.filledBy || "Technician")} checked ${esc(tzParts(latestCheck.createdAt, true))}</strong><span>Checklist No. ${esc(checklistNumber(latestCheck))} · Auto reset 00.00</span></div>` : ""}

        <section class="op-message-panel">
          <div class="op-operator-message${String(operatorMessage?.status || "").toUpperCase() === "OPEN" ? " is-open" : ""}">
            <span class="op-message-kicker">Operator Message</span>
            <strong>${esc(operatorMessageText)}</strong>
            <small>${esc(operatorMessageMeta)}</small>
          </div>
          <div class="op-condition-message">
            <span class="op-message-kicker">Machine Alert</span>
            <strong>${esc(conditionMessage)}</strong>
            <span>${esc(serviceRangeText(serviceStatus))}</span>
          </div>
        </section>

        <details class="op-machine-details">
          <summary>Machine details <span>Type, registration, serial & service kit</span></summary>
          <div class="op-machine-data">
            <div><span>Brand</span><b>${esc(machine.brand || "Not recorded")}</b></div>
            <div><span>Machine Type</span><b>${esc(machine.machineType || "Not recorded")}</b></div>
            <div><span>Serial No.</span><b>${esc(machine.serialNumber || "Not recorded")}</b></div>
            <div><span>Registration</span><b>${esc(machine.regNumber || "Not recorded")}</b></div>
            <div><span>Service Kit</span><b>${esc(machine.serviceKit || "OK")}</b></div>
            <div><span>Last Checked</span><b>${esc(tzParts(machine.lastCheckedAt, false))}</b></div>
          </div>
        </details>

        <div class="op-activity-status">
          <div><span>Activity Status</span><small>Synced live to Customer and BELM</small></div>
          <div class="op-activity-value">${esc(activityLabel(machine.operationalStatus))}</div>
        </div>

        ${serviceStatus ? `<section class="op-service-panel status-${esc(serviceLevel)}">
          <div class="op-service-head"><div><span>SERVICE PLAN</span><b>${esc(serviceType)}</b></div><strong>${esc(serviceState)}</strong></div>
          <div class="op-service-grid">
            <div><span>Current Hrs</span><b>${esc(Math.round(Number(serviceStatus.totalHours || 0)))}</b></div>
            <div><span>Next Service At</span><b>${esc(serviceStatus.dueHour || 0)} Hrs</b></div>
            <div><span>${remaining < 0 ? "Overdue By" : remaining === 0 ? "Service Due" : "Remaining"}</span><b>${remaining < 0 ? `${esc(overdue)} Hrs` : remaining === 0 ? "Now" : `${esc(remaining)} Hrs`}</b></div>
          </div>
        </section>` : ""}

        <div class="op-machine-actions" aria-label="Operator machine actions">
          <button type="button" class="report" data-operator-action="report">Report</button>
          <button type="button" class="checkup" data-operator-action="checkup">Check Up</button>
          <button type="button" class="parts is-closed" data-operator-action="parts" disabled aria-disabled="true" title="Closed by default for Machine Operator">Service Parts<span>Closed</span></button>
          <button type="button" class="jobcard" data-operator-action="operation-card">Operation Card</button>
        </div>
      </article>`;
  }

  async function refreshOperatorDashboard() {
    if (!token || !dashboardRoot) return;
    try {
      const result = await api("/dashboard");
      renderOperatorMachineDashboard(result);
    } catch (error) {
      dashboardRoot.innerHTML = `<div class="op-dashboard-loading error">${esc(error.message || "Could not load machine dashboard.")}</div>`;
    }
  }

  function scheduleOperatorDashboardRefresh() {
    clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = setInterval(() => {
      if (!document.hidden && token) refreshOperatorDashboard();
    }, 30000);
  }

  async function startShift() {
    showSection("shiftSection");
    document.getElementById("shiftMachineName").textContent = machineName || "MACHINE";
    document.getElementById("shiftGreeting").textContent = `Hello, ${operatorName}`;
    await refreshOperatorDashboard();
    scheduleOperatorDashboardRefresh();
    try {
      const result = await api("/sign-in", { method: "POST" });
      document.getElementById("containerCount").textContent = result.containerCount;
      document.getElementById("shiftSignedInAt").textContent = result.resumed
        ? "Continuing your open shift."
        : `Shift started at ${new Date().toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" })}.`;
    } catch (error) {
      showAlert(error.message);
    }
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    if (!machineId) {
      showAlert("This link is missing the machine. Ask your Machine Admin for your operator link.");
      return;
    }
    const name = document.getElementById("loginName").value.trim();
    const pin = document.getElementById("loginPin").value.trim();
    const button = document.getElementById("loginButton");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      const result = await api("/login", {
        method: "POST",
        body: JSON.stringify({ machineId, name, pin }),
      });
      token = result.token;
      operatorName = result.operator.name;
      machineName = result.operator.machineName;
      localStorage.setItem("belm_operator_token", token);
      localStorage.setItem("belm_operator_name", operatorName);
      localStorage.setItem("belm_operator_machine_name", machineName);
      await startShift();
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });

  document.getElementById("logContainerButton").addEventListener("click", async () => {
    const button = document.getElementById("logContainerButton");
    button.disabled = true;
    try {
      const result = await api("/log-container", { method: "POST" });
      document.getElementById("containerCount").textContent = result.containerCount;
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  const operatorCheckupDialog = document.getElementById("operatorCheckupDialog");
  const operatorCheckupForm = document.getElementById("operatorCheckupForm");
  const operatorReportDialog = document.getElementById("operatorReportDialog");
  const operatorReportForm = document.getElementById("operatorReportForm");

  function openOperatorCheckup() {
    clearAlert();
    operatorCheckupForm.reset();
    operatorCheckupDialog.showModal();
  }

  function closeOperatorCheckup() {
    if (operatorCheckupDialog.open) operatorCheckupDialog.close();
  }

  function openOperatorReport() {
    clearAlert();
    operatorReportForm.reset();
    operatorReportDialog.showModal();
    setTimeout(() => document.getElementById("operatorReportComment")?.focus(), 20);
  }

  function closeOperatorReport() {
    if (operatorReportDialog.open) operatorReportDialog.close();
  }

  dashboardRoot?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-operator-action]");
    if (!button) return;
    if (button.dataset.operatorAction === "checkup") openOperatorCheckup();
    if (button.dataset.operatorAction === "report") openOperatorReport();
  });

  document.getElementById("closeOperatorCheckupButton").addEventListener("click", closeOperatorCheckup);
  document.getElementById("cancelOperatorCheckupButton").addEventListener("click", closeOperatorCheckup);
  operatorCheckupDialog.addEventListener("click", (event) => {
    if (event.target === operatorCheckupDialog) closeOperatorCheckup();
  });
  document.getElementById("closeOperatorReportButton").addEventListener("click", closeOperatorReport);
  document.getElementById("cancelOperatorReportButton").addEventListener("click", closeOperatorReport);
  operatorReportDialog.addEventListener("click", (event) => {
    if (event.target === operatorReportDialog) closeOperatorReport();
  });

  operatorCheckupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    const button = document.getElementById("saveOperatorCheckupButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api("/check-up", {
        method: "POST",
        body: JSON.stringify({
          engineOilLevel: document.getElementById("operatorEngineOil").value,
          gearboxOilLevel: document.getElementById("operatorGearboxOil").value,
          coolantLevel: document.getElementById("operatorCoolant").value,
          tires: document.getElementById("operatorTires").value,
          brakes: document.getElementById("operatorBrakes").value,
        }),
      });
      closeOperatorCheckup();
      showAlert(result.status === "OPEN"
        ? "Check Up saved in Operator Reports. Attention is required."
        : "Check Up saved in Operator Reports.", false);
      await refreshOperatorDashboard();
    } catch (error) {
      showAlert(error.message || "Could not save Operator Check Up.");
    } finally {
      button.disabled = false;
      button.textContent = "Save Check Up";
    }
  });

  operatorReportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAlert();
    const message = document.getElementById("operatorReportComment").value.trim();
    if (!message) {
      showAlert("Write the Operator Report message first.");
      return;
    }
    const button = document.getElementById("saveOperatorReportButton");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const result = await api("/report", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      closeOperatorReport();
      const delivery = result.whatsappDelivery || {};
      const sent = Number(delivery.sent || 0);
      const pending = Number(delivery.pending || 0);
      showAlert(sent > 0
        ? `Operator Report saved. WhatsApp sent to ${sent} team recipient${sent === 1 ? "" : "s"}.`
        : pending > 0
          ? "Operator Report saved. WhatsApp is waiting for the configured provider."
          : "Operator Report saved for BELM and Customer teams.", false);
      await refreshOperatorDashboard();
    } catch (error) {
      showAlert(error.message || "Could not save Operator Report.");
    } finally {
      button.disabled = false;
      button.textContent = "Send Report";
    }
  });

  document.getElementById("signOutButton").addEventListener("click", () => {
    clearAlert();
    document.getElementById("problemDescription").value = "";
    document.getElementById("problemLabel").classList.add("hidden");
    document.getElementById("confirmSignOutButton").disabled = true;
    document.getElementById("confirmSignOutButton").dataset.choice = "";
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    showSection("signOutSection");
  });
  document.getElementById("cancelSignOutButton").addEventListener("click", () => showSection("shiftSection"));

  document.getElementById("reportOkButton").addEventListener("click", () => {
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    document.getElementById("reportOkButton").classList.add("active");
    document.getElementById("problemLabel").classList.add("hidden");
    document.getElementById("confirmSignOutButton").disabled = false;
    document.getElementById("confirmSignOutButton").dataset.choice = "ok";
  });
  document.getElementById("reportProblemButton").addEventListener("click", () => {
    document.querySelectorAll(".op-toggle").forEach((btn) => btn.classList.remove("active"));
    document.getElementById("reportProblemButton").classList.add("active");
    document.getElementById("problemLabel").classList.remove("hidden");
    document.getElementById("confirmSignOutButton").disabled = false;
    document.getElementById("confirmSignOutButton").dataset.choice = "problem";
  });

  document.getElementById("confirmSignOutButton").addEventListener("click", async () => {
    const choice = document.getElementById("confirmSignOutButton").dataset.choice;
    const description = document.getElementById("problemDescription").value.trim();
    if (choice === "problem" && !description) {
      showAlert("Describe the challenge before confirming.");
      return;
    }
    const button = document.getElementById("confirmSignOutButton");
    button.disabled = true;
    button.textContent = "Signing out…";
    try {
      const result = await api("/sign-out", {
        method: "POST",
        body: JSON.stringify({ hasProblem: choice === "problem", problemDescription: description }),
      });
      let problemStatus = "";
      if (choice === "problem") {
        const delivery = result.whatsappDelivery || {};
        const sent = Number(delivery.sent || 0);
        const pending = Number(delivery.pending || 0);
        problemStatus = sent > 0
          ? `Your challenge report was saved and WhatsApp sent to ${sent} team recipient${sent === 1 ? "" : "s"}.`
          : pending > 0
            ? "Your challenge report was saved. WhatsApp is waiting for the configured provider."
            : "Your challenge report was saved for the BELM and Customer teams.";
      }
      document.getElementById("doneSummary").textContent =
        `Containers handled: ${result.containerCount}. ${choice === "problem" ? problemStatus : "No problems reported — great work!"}`;
      showSection("doneSection");
    } catch (error) {
      showAlert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Confirm sign out";
    }
  });

  document.getElementById("startNewShiftButton").addEventListener("click", startShift);

  document.getElementById("exitButton").addEventListener("click", () => {
    clearInterval(dashboardRefreshTimer);
    clearAlert();
    document.getElementById("loginForm").reset();
    showSection("loginSection");
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    clearInterval(dashboardRefreshTimer);
    localStorage.removeItem("belm_operator_token");
    localStorage.removeItem("belm_operator_name");
    localStorage.removeItem("belm_operator_machine_name");
    token = null;
    document.getElementById("loginForm").reset();
    showSection("loginSection");
  });

  if (token) {
    startShift();
  } else {
    showSection("loginSection");
  }
})();
