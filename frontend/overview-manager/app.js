(function () {
  const token = localStorage.getItem("belm_admin_token");
  const money = new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat("en-TZ");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

  function displayRoleName(name) { return name === "Engineer" ? "Workshop Manager" : (name || ""); }

async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token || ""}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/admin/login";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Could not load overview analysis.");
    return data;
  }

  function metric(label, value, note, tone = "") {
    return `<article class="metric-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>`;
  }

  function renderBars(id, values) {
    const target = document.getElementById(id);
    const entries = Object.entries(values || {});
    if (!entries.length) {
      target.innerHTML = '<div class="empty-state">No records yet.</div>';
      return;
    }
    const maximum = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
    target.innerHTML = entries.map(([label, value]) => `<div class="bar-row">
      <div class="bar-label"><span>${escapeHtml(label.replaceAll("_", " "))}</span><strong>${number.format(value)}</strong></div>
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Number(value) / maximum * 100)}%"></span></div>
    </div>`).join("");
  }

  function render(data) {
    const totals = data.totals || {};
    document.getElementById("periodLabel").textContent =
      `${data.period?.label || "Selected period"} · ${data.period?.from || ""} → ${data.period?.to || ""}`;
    document.getElementById("actionMetrics").innerHTML = [
      metric("Registration approvals", number.format(totals.pendingApplications || 0), "Waiting for Administration decision", totals.pendingApplications ? "yellow" : "green"),
      metric("Open Job Cards", number.format(totals.openRequests || 0), "Customer work still open", totals.openRequests ? "yellow" : "green"),
      metric("Pending tasks", number.format(totals.pendingTasks || 0), "Work waiting for completion", totals.pendingTasks ? "yellow" : "green"),
      metric("Low stock parts", number.format(totals.lowStockParts || 0), "At or below reorder point", totals.lowStockParts ? "red" : "green"),
    ].join("");
    document.getElementById("primaryMetrics").innerHTML = [
      metric("Customers", number.format(totals.customers || 0), `${number.format(totals.machines || 0)} registered machines`, "green"),
      metric("Employees", number.format(totals.employees || 0), `${number.format(totals.activeEmployees || 0)} active accounts`),
      metric("Machines", number.format(totals.machines || 0), "Entire customer fleet"),
      metric("Completed work", number.format(totals.completedTasks || 0), "Tasks marked done", "green"),
    ].join("");

    const finance = data.finance || {};
    document.getElementById("financeMetrics").innerHTML = [
      metric("Sales invoiced", money.format(finance.sales || 0), "Invoice value in selected period"),
      metric("Cash received", money.format(finance.revenue || 0), "Payments recorded", "green"),
      metric("Business expenses", money.format(finance.expenses || 0), "Expenses recorded", finance.expenses ? "red" : ""),
      metric("Profit / loss", money.format(finance.profitLoss || 0), "Received minus expenses", Number(finance.profitLoss) >= 0 ? "green" : "red"),
    ].join("");

    const inventory = data.inventory || {};
    const inventorySummary = inventory.summary || {};
    document.getElementById("inventoryMetrics").innerHTML = [
      metric("Part types", number.format(inventorySummary.totalPartTypes || 0), "Active inventory records", "green"),
      metric("Total stock quantity", number.format(inventorySummary.totalStockQty || 0), "Units currently recorded"),
      metric("Low stock", number.format(inventorySummary.lowStockParts || 0), "At or below reorder point", inventorySummary.lowStockParts ? "yellow" : "green"),
      metric("Out of stock", number.format(inventorySummary.outOfStockParts || 0), "Parts with zero quantity", inventorySummary.outOfStockParts ? "red" : "green"),
      metric("Purchase stock value", money.format(inventorySummary.purchaseStockValue || 0), "Quantity × purchase price"),
      metric("Expected sales value", money.format(inventorySummary.sellingStockValue || 0), "Quantity × selling price", "green"),
      metric("Potential margin", money.format(inventorySummary.potentialMargin || 0), "Sales value minus purchase value", Number(inventorySummary.potentialMargin || 0) >= 0 ? "green" : "red"),
    ].join("");

    const inventoryItems = Array.isArray(inventory.items) ? inventory.items : [];
    document.getElementById("inventoryRows").innerHTML = inventoryItems.length
      ? inventoryItems.map((part) => {
          const status = part.stockStatus || "IN_STOCK";
          const statusLabel = status.replaceAll("_", " ");
          return `<tr>
            <td><strong>${escapeHtml(part.name)}</strong></td>
            <td>${escapeHtml(part.partNumber || "—")}</td>
            <td>${escapeHtml(part.category || "Uncategorized")}</td>
            <td><strong>${number.format(part.stockQty || 0)}</strong></td>
            <td>${number.format(part.reorderThreshold || 0)}</td>
            <td>${money.format(part.purchaseStockValue || 0)}</td>
            <td><span class="stock-badge ${escapeHtml(status.toLowerCase())}">${escapeHtml(statusLabel)}</span></td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="7" class="empty-state">No spare parts have been recorded yet.</td></tr>';

    const roles = data.roles || [];
    document.getElementById("roleGrid").innerHTML = roles.length
      ? roles.map((role) => `<article class="role-card">
          <h3>${escapeHtml(displayRoleName(role.name))}</h3>
          <div class="role-stats">
            <div><span>Staff</span><strong>${number.format(role.staffTotal || 0)}</strong></div>
            <div><span>Active</span><strong>${number.format(role.activeTotal || 0)}</strong></div>
            <div><span>Pending</span><strong>${number.format(role.pendingTasks || 0)}</strong></div>
            <div><span>Completed</span><strong>${number.format(role.completedTasks || 0)}</strong></div>
          </div>
        </article>`).join("")
      : '<div class="empty-state">No roles are configured.</div>';

    renderBars("serviceBars", data.serviceStatus);
    renderBars("machineBars", data.machineStatus);
    renderBars("attendanceBars", data.attendanceToday);

    const activities = data.recentActivities || [];
    const activityList = document.getElementById("activityList");
    if (activityList) {
      activityList.innerHTML = activities.length
        ? activities.map((activity) => `<article class="belm-sidebar-activity-item">
            <span class="belm-sidebar-activity-icon">${escapeHtml((activity.roleName || "U").slice(0, 2).toUpperCase())}</span>
            <div class="belm-sidebar-activity-copy">
              <strong>${escapeHtml(activity.userName || "System user")} · ${escapeHtml(activity.action || "Activity")}</strong>
              <span>${escapeHtml(displayRoleName(activity.roleName))} · ${escapeHtml(activity.entity || "System")}</span>
              <time>${activity.createdAt ? escapeHtml(new Date(activity.createdAt).toLocaleString()) : ""}</time>
            </div>
          </article>`).join("")
        : '<div class="belm-sidebar-activity-empty">No recent employee activity recorded.</div>';
    }
  }

  async function load() {
    const alert = document.getElementById("pageAlert");
    alert.classList.add("hidden");
    try {
      const period = document.getElementById("periodSelect").value;
      render(await api(`/reports/all-overview?period=${encodeURIComponent(period)}`));
    } catch (error) {
      alert.textContent = error.message;
      alert.classList.remove("hidden");
    }
  }

  document.getElementById("periodSelect").addEventListener("change", load);
  document.getElementById("refreshButton").addEventListener("click", load);
  load();
})();
