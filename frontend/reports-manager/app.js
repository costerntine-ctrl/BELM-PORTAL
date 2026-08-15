(function () {
  const token = localStorage.getItem("belm_admin_token");
  const moneyFormatter = new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat("en-TZ");
  let reportData = null;
  let reportLoading = false;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
  const money = (value) => moneyFormatter.format(Number(value) || 0);
  const number = (value) => numberFormatter.format(Number(value) || 0);

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/admin/login";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Report request failed.");
    return data;
  }

  function metric(label, value, note, tone = "") {
    return `<article class="metric-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </article>`;
  }

  function change(current, previous) {
    const currentValue = Number(current) || 0;
    const previousValue = Number(previous) || 0;
    if (previousValue === 0) return currentValue === 0 ? "0%" : "New";
    const amount = (currentValue - previousValue) / Math.abs(previousValue) * 100;
    return `${amount >= 0 ? "+" : ""}${amount.toFixed(1)}%`;
  }

  function renderBars(id, values) {
    const target = document.getElementById(id);
    const entries = Object.entries(values || {});
    if (!entries.length) {
      target.innerHTML = '<div class="empty-state">No data in this period.</div>';
      return;
    }
    const maximum = Math.max(...entries.map(([, value]) => Number(value) || 0), 1);
    target.innerHTML = entries.map(([label, value]) => `<div class="bar-row">
      <div class="bar-label"><span>${escapeHtml(label.replaceAll("_", " "))}</span><strong>${number(value)}</strong></div>
      <div class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Number(value) / maximum * 100)}%"></span></div>
    </div>`).join("");
  }

  function renderReport(data) {
    reportData = data;
    const current = data.current || {};
    const previous = data.previous || {};
    document.getElementById("periodLabel").textContent =
      `${data.period?.label || "Selected period"} · ${data.period?.from || ""} → ${data.period?.to || ""}`;

    document.getElementById("financeMetrics").innerHTML = [
      metric("Sales invoiced", money(current.sales), `${number(current.invoiceCount)} invoice(s) · ${change(current.sales, previous.sales)} vs previous`),
      metric("Revenue received", money(current.revenue), `${number(current.paymentCount)} payment(s) · ${change(current.revenue, previous.revenue)} vs previous`, "green"),
      metric("Expenses", money(current.expenses), `${number(current.expenseCount)} expense(s) · ${change(current.expenses, previous.expenses)} vs previous`, current.expenses ? "red" : ""),
      metric("Profit / loss", money(current.profitLoss), `Received minus expenses · ${change(current.profitLoss, previous.profitLoss)} vs previous`, Number(current.profitLoss) >= 0 ? "green" : "red"),
      metric("Outstanding", money(current.outstanding), `Balance as of ${data.period?.to || "period end"}`, current.outstanding ? "yellow" : "green"),
    ].join("");

    const syncStatus = document.getElementById("syncStatus");
    if (syncStatus) {
      const syncedAt = data.syncedAt ? new Date(data.syncedAt) : new Date();
      syncStatus.textContent = `SYNCED · Billing invoices + payments + company expenses · ${syncedAt.toLocaleString()}`;
      syncStatus.className = "sync-status ok";
    }

    const rows = [
      ["Sales invoiced", current.sales, previous.sales],
      ["Revenue received", current.revenue, previous.revenue],
      ["Expenses", current.expenses, previous.expenses],
      ["Profit / loss", current.profitLoss, previous.profitLoss],
      ["Outstanding", current.outstanding, previous.outstanding],
    ];
    document.getElementById("comparisonTable").innerHTML = `<table>
      <thead><tr><th>Measure</th><th>Current period</th><th>Previous period</th><th>Difference</th></tr></thead>
      <tbody>${rows.map(([label, now, before]) => `<tr>
        <td><strong>${escapeHtml(label)}</strong></td><td>${money(now)}</td><td>${money(before)}</td><td>${escapeHtml(change(now, before))}</td>
      </tr>`).join("")}</tbody>
    </table>`;

    const trend = data.trend || [];
    const maximum = Math.max(...trend.flatMap((row) => [
      Number(row.sales) || 0,
      Number(row.revenue) || 0,
      Number(row.expenses) || 0,
    ]), 1);
    document.getElementById("trendGrid").innerHTML = trend.length
      ? trend.map((row) => `<div class="trend-month" title="${escapeHtml(row.month)} · Sales ${money(row.sales)} · Revenue ${money(row.revenue)} · Expenses ${money(row.expenses)}">
          <div class="trend-bars">
            <span class="trend-bar sales" style="height:${Math.max(2, Number(row.sales) / maximum * 100)}%"></span>
            <span class="trend-bar revenue" style="height:${Math.max(2, Number(row.revenue) / maximum * 100)}%"></span>
            <span class="trend-bar expenses" style="height:${Math.max(2, Number(row.expenses) / maximum * 100)}%"></span>
          </div>
          <small>${escapeHtml(row.month.slice(5))}/${escapeHtml(row.month.slice(2, 4))}</small>
        </div>`).join("")
      : '<div class="empty-state">No twelve-month finance records yet.</div>';

    renderBars("attendanceBars", data.attendance);
    renderBars("taskBars", data.tasks);
    renderBars("serviceBars", data.serviceRequests);

    const roles = data.roleActivity || [];
    document.getElementById("roleTable").innerHTML = roles.length
      ? `<table><thead><tr><th>Role</th><th>Active users</th><th>Recorded activities</th><th>Pending tasks</th><th>Completed tasks</th><th>Completion</th></tr></thead>
        <tbody>${roles.map((role) => {
          const total = Number(role.pendingTasks || 0) + Number(role.completedTasks || 0);
          const completion = total ? `${(Number(role.completedTasks || 0) / total * 100).toFixed(0)}%` : "—";
          return `<tr><td><strong>${escapeHtml(role.name)}</strong></td><td>${number(role.activeUsers)}</td><td>${number(role.activities)}</td>
          <td>${number(role.pendingTasks)}</td><td>${number(role.completedTasks)}</td><td>${completion}</td></tr>`;
        }).join("")}</tbody></table>`
      : '<div class="empty-state">No role activity recorded for this period.</div>';
  }

  function queryString() {
    const period = document.getElementById("periodSelect").value;
    if (period !== "custom") return `period=${encodeURIComponent(period)}`;
    return `dateFrom=${encodeURIComponent(document.getElementById("dateFrom").value)}&dateTo=${encodeURIComponent(document.getElementById("dateTo").value)}`;
  }

  async function loadReport() {
    if (reportLoading) return;
    reportLoading = true;
    const alert = document.getElementById("pageAlert");
    const syncStatus = document.getElementById("syncStatus");
    const syncButton = document.getElementById("applyButton");
    alert.classList.add("hidden");
    if (syncStatus) {
      syncStatus.textContent = "SYNCING · Billing invoices + payments + company expenses…";
      syncStatus.className = "sync-status syncing";
    }
    if (syncButton) {
      syncButton.disabled = true;
      syncButton.textContent = "Syncing…";
    }
    try {
      renderReport(await api(`/reports/analytics?${queryString()}&_sync=${Date.now()}`));
    } catch (error) {
      alert.textContent = error.message;
      alert.classList.remove("hidden");
      if (syncStatus) {
        syncStatus.textContent = `SYNC ERROR · ${error.message}`;
        syncStatus.className = "sync-status error";
      }
    } finally {
      reportLoading = false;
      if (syncButton) {
        syncButton.disabled = false;
        syncButton.textContent = "Sync report";
      }
    }
  }

  function timeValue(value) {
    if (!value) return "";
    const match = String(value).match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
    return String(value).slice(0, 5);
  }

  async function loadAttendance() {
    const date = document.getElementById("attendanceDate").value;
    const target = document.getElementById("attendanceTable");
    target.innerHTML = '<div class="empty-state">Loading employee attendance…</div>';
    try {
      const data = await api(`/reports/attendance?date=${encodeURIComponent(date)}`);
      const employees = data.employees || [];
      target.innerHTML = employees.length
        ? `<table><thead><tr><th>Employee</th><th>Role</th><th>Status</th><th>Check in</th><th>Check out</th><th>Notes</th><th class="no-print">Action</th></tr></thead>
          <tbody>${employees.map((employee) => `<tr data-user="${escapeHtml(employee.userId)}">
            <td><strong>${escapeHtml(employee.name)}</strong><br><small>${escapeHtml(employee.email)}</small></td>
            <td>${escapeHtml(employee.roleName)}</td>
            <td><select data-field="status">
              ${["NOT_RECORDED", "PRESENT", "LATE", "ABSENT", "LEAVE", "REMOTE"].map((status) =>
                `<option value="${status}" ${status === employee.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
            </select></td>
            <td><input data-field="checkIn" type="time" value="${escapeHtml(timeValue(employee.checkIn))}"></td>
            <td><input data-field="checkOut" type="time" value="${escapeHtml(timeValue(employee.checkOut))}"></td>
            <td><input data-field="notes" value="${escapeHtml(employee.notes || "")}" maxlength="500"></td>
            <td class="no-print"><button data-save-attendance type="button">Save</button></td>
          </tr>`).join("")}</tbody></table>`
        : '<div class="empty-state">No active employees are available.</div>';
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveAttendance(button) {
    const row = button.closest("tr");
    const message = document.getElementById("attendanceMessage");
    const status = row.querySelector('[data-field="status"]').value;
    if (status === "NOT_RECORDED") {
      message.textContent = "Choose a recorded status before saving.";
      message.classList.remove("hidden");
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api("/reports/attendance", {
        method: "POST",
        body: JSON.stringify({
          userId: row.dataset.user,
          workDate: document.getElementById("attendanceDate").value,
          status,
          checkIn: row.querySelector('[data-field="checkIn"]').value,
          checkOut: row.querySelector('[data-field="checkOut"]').value,
          notes: row.querySelector('[data-field="notes"]').value.trim(),
        }),
      });
      message.textContent = result.message || "Attendance saved.";
      message.classList.remove("hidden");
      await loadReport();
    } catch (error) {
      message.textContent = error.message;
      message.classList.remove("hidden");
      message.classList.remove("success");
    } finally {
      button.disabled = false;
      button.textContent = "Save";
    }
  }

  function exportCsv() {
    if (!reportData) return;
    const rows = [
      ["BELM Management Report", reportData.period?.label || ""],
      ["From", reportData.period?.from || "", "To", reportData.period?.to || ""],
      [],
      ["Financial measure", "Current", "Previous", "Difference"],
      ...["sales", "revenue", "expenses", "profitLoss", "outstanding"].map((key) => [
        key, reportData.current?.[key] || 0, reportData.previous?.[key] || 0,
        change(reportData.current?.[key], reportData.previous?.[key]),
      ]),
      [],
      ["Role", "Active users", "Activities", "Pending tasks", "Completed tasks"],
      ...(reportData.roleActivity || []).map((role) => [
        role.name, role.activeUsers, role.activities, role.pendingTasks, role.completedTasks,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) =>
      `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BELM-report-${reportData.period?.from || "report"}-${reportData.period?.to || ""}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setDefaultDates() {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    document.getElementById("attendanceDate").value = iso;
    document.getElementById("dateTo").value = iso;
    document.getElementById("dateFrom").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  }

  document.getElementById("periodSelect").addEventListener("change", () => {
    const custom = document.getElementById("periodSelect").value === "custom";
    document.getElementById("dateFromLabel").classList.toggle("hidden", !custom);
    document.getElementById("dateToLabel").classList.toggle("hidden", !custom);
    if (!custom) loadReport();
  });
  document.getElementById("dateFrom").addEventListener("change", () => {
    if (document.getElementById("periodSelect").value === "custom" && document.getElementById("dateTo").value) loadReport();
  });
  document.getElementById("dateTo").addEventListener("change", () => {
    if (document.getElementById("periodSelect").value === "custom" && document.getElementById("dateFrom").value) loadReport();
  });
  document.getElementById("applyButton").addEventListener("click", loadReport);
  document.getElementById("attendanceRefreshButton").addEventListener("click", loadAttendance);
  document.getElementById("attendanceTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-attendance]");
    if (button) saveAttendance(button);
  });
  document.getElementById("csvButton").addEventListener("click", exportCsv);
  document.getElementById("printButton").addEventListener("click", () => window.print());

  setDefaultDates();
  loadReport();
  loadAttendance();

  // V221 live reconciliation: refresh when the manager returns to this page
  // and periodically while it stays open. The API remains no-store.
  window.addEventListener("focus", loadReport);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadReport();
  });
  window.setInterval(() => {
    if (!document.hidden) loadReport();
  }, 60000);
})();
