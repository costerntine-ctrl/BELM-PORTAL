(function () {
  const token = localStorage.getItem("belm_admin_token");
  const requestList = document.getElementById("requestList");
  const statusTabs = document.getElementById("statusTabs");
  const alertBox = document.getElementById("alertBox");
  const noteDialog = document.getElementById("noteDialog");
  const statuses = ["", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
  let requests = [];
  let technicians = [];
  let activeStatus = "";

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}, ${hours}:${minutes}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
  }

  function showAlert(message, error) {
    alertBox.textContent = message;
    alertBox.className = `alert${error ? " error" : ""}`;
  }

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
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || "Request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function renderTabs() {
    statusTabs.innerHTML = statuses.map((status) => {
      const count = status
        ? requests.filter((request) => request.status === status).length
        : requests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.status)).length;
      const label = status ? status.replaceAll("_", " ") : "ACTIVE";
      return `<button class="${activeStatus === status ? "active" : ""}" data-status="${status}">${label}<b>${count}</b></button>`;
    }).join("");
  }

  function technicianOptions(request) {
    return [
      '<option value="">Unassigned</option>',
      ...technicians.map((technician) => {
        const context = technician.assignedCustomerName ? ` — ${technician.assignedCustomerName}` : "";
        return `<option value="${escapeHtml(technician.id)}" ${request.assignedTo?.id === technician.id ? "selected" : ""}>${escapeHtml(technician.name)}${escapeHtml(context)}</option>`;
      }),
    ].join("");
  }

  function renderRequests() {
    renderTabs();
    const visible = activeStatus
      ? requests.filter((request) => request.status === activeStatus)
      : requests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.status));
    if (visible.length === 0) {
      requestList.innerHTML = activeStatus
        ? '<div class="empty">No service requests in this status.</div>'
        : '<div class="empty">No active service requests. Check the COMPLETED or CANCELLED tabs for history.</div>';
      return;
    }
    requestList.innerHTML = visible.map((request) => `
      <article class="request-card ${String(request.priority || "").toLowerCase()}">
        <div class="request-head">
          <div>
            <h2>${escapeHtml(request.customer?.name || "Unknown customer")} · ${escapeHtml(request.machine?.model || "General request")}</h2>
            <div class="meta">${formatDateTime(request.createdAt)} · ${escapeHtml(request.status.replaceAll("_", " "))}</div>
          </div>
          <span class="priority ${escapeHtml(request.priority)}">${escapeHtml(request.priority)}</span>
        </div>
        ${request.serviceType ? `<div class="service-type"><b>Service type:</b> ${escapeHtml(request.serviceType)}</div>` : ""}
        <div class="description">${escapeHtml(request.description)}</div>
        ${(request.serviceParts || []).length ? `
          <div class="request-parts">
            <b>Synchronized service parts</b>
            <div>
              ${request.serviceParts.map((part) => `
                <span>${escapeHtml(part.spareName)} · ${escapeHtml(part.partNumber)} · Qty ${Number(part.quantity).toLocaleString("en-TZ")}</span>
              `).join("")}
            </div>
          </div>
        ` : ""}
        <div class="control-grid">
          <label>Assigned Technician
            <select data-assign="${escapeHtml(request.id)}" ${["COMPLETED", "CANCELLED"].includes(request.status) ? "disabled" : ""}>${technicianOptions(request)}</select>
          </label>
          <label>Job status
            <select data-status-update="${escapeHtml(request.id)}">
              ${statuses.filter(Boolean).map((status) => `<option value="${status}" ${request.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
            </select>
          </label>
          <button class="note-button" type="button" data-note="${escapeHtml(request.id)}">Notes (${(request.notes || []).length})</button>
          <button class="note-button history-button" type="button" data-history="${escapeHtml(request.id)}">History</button>
        </div>
      </article>
    `).join("");
  }

  async function load() {
    requestList.innerHTML = '<div class="loading">Loading service requests…</div>';
    if (!token) {
      requestList.innerHTML = '<div class="locked">Administrator login required.<br><a href="/admin/login">Go to admin login</a></div>';
      return;
    }
    try {
      [requests, technicians] = await Promise.all([
        api("/service-requests"),
        api("/service-requests/assignees"),
      ]);
      renderRequests();
    } catch (error) {
      requestList.innerHTML = error.status === 401 || error.status === 403
        ? `<div class="locked">${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a></div>`
        : '<div class="empty">Could not load service requests.</div>';
      showAlert(error.message, true);
    }
  }

  async function assign(requestId, assignedToId) {
    try {
      await api(`/service-requests/${requestId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ assignedToId }),
      });
      await load();
      showAlert(assignedToId ? "Technician assigned successfully." : "Service request is now unassigned.", false);
    } catch (error) {
      showAlert(error.message, true);
      await load();
    }
  }

  async function updateStatus(requestId, status) {
    try {
      await api(`/service-requests/${requestId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await load();
      showAlert("Service request status updated.", false);
    } catch (error) {
      showAlert(error.message, true);
      await load();
    }
  }

  function openNotes(requestId) {
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    document.getElementById("noteRequestId").value = request.id;
    document.getElementById("noteText").value = "";
    document.getElementById("noteError").className = "alert error hidden";
    document.getElementById("noteHistory").innerHTML = (request.notes || []).length
      ? request.notes.map((note) => `<div class="note"><small>${formatDateTime(note.createdAt)} · ${escapeHtml(note.author || "BELM")}</small>${escapeHtml(note.note)}</div>`).join("")
      : '<div class="note">No notes yet.</div>';
    noteDialog.showModal();
  }

  const HISTORY_EVENT_LABELS = {
    OPENED: "Opened",
    STATUS: "Status changed",
    ASSIGNMENT: "Assignment changed",
  };

  async function openHistory(requestId) {
    const dialog = document.getElementById("historyDialog");
    const body = document.getElementById("historyBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    dialog.showModal();
    try {
      const timeline = await api(`/service-requests?action=history&requestId=${encodeURIComponent(requestId)}`);
      body.innerHTML = timeline.length ? timeline.map((entry) => {
        if (entry.kind === "NOTE") {
          return `<div class="history-entry history-note">
            <b>Note by ${escapeHtml(entry.actorName || "BELM")}</b>
            <small>${formatDateTime(entry.createdAt)}</small>
            <p>${escapeHtml(entry.note || "")}</p>
          </div>`;
        }
        const label = HISTORY_EVENT_LABELS[entry.eventType] || entry.eventType;
        let description;
        if (entry.eventType === "OPENED") {
          description = `Opened by ${escapeHtml(entry.actorName || "Customer")}`;
        } else if (entry.eventType === "ASSIGNMENT") {
          description = entry.to
            ? `Assigned to <b>${escapeHtml(entry.to)}</b> by ${escapeHtml(entry.actorName || "BELM")}`
            : `Unassigned by ${escapeHtml(entry.actorName || "BELM")}`;
        } else {
          description = `Changed from <b>${escapeHtml((entry.from || "—").replaceAll("_", " "))}</b> to <b>${escapeHtml((entry.to || "—").replaceAll("_", " "))}</b> by ${escapeHtml(entry.actorName || "BELM")}`;
        }
        return `<div class="history-entry">
          <b>${escapeHtml(label)}</b>
          <small>${formatDateTime(entry.createdAt)}</small>
          <p>${description}${entry.note ? ` — ${escapeHtml(entry.note)}` : ""}</p>
        </div>`;
      }).join("") : '<p class="muted">No history recorded yet.</p>';
    } catch (error) {
      body.innerHTML = `<p class="alert error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function saveNote(event) {
    event.preventDefault();
    const requestId = document.getElementById("noteRequestId").value;
    const note = document.getElementById("noteText").value.trim();
    const errorBox = document.getElementById("noteError");
    const button = document.getElementById("saveNoteButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(`/service-requests/${requestId}/notes`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      noteDialog.close();
      await load();
      showAlert("Service note saved.", false);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.className = "alert error";
    } finally {
      button.disabled = false;
      button.textContent = "Save note";
    }
  }

  statusTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    activeStatus = button.dataset.status;
    renderRequests();
  });
  requestList.addEventListener("change", (event) => {
    if (event.target.dataset.assign) assign(event.target.dataset.assign, event.target.value);
    if (event.target.dataset.statusUpdate) updateStatus(event.target.dataset.statusUpdate, event.target.value);
  });
  requestList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-note]");
    const historyButton = event.target.closest("[data-history]");
    if (button) openNotes(button.dataset.note);
    if (historyButton) openHistory(historyButton.dataset.history);
  });
  document.getElementById("closeHistoryButton")?.addEventListener("click", () =>
    document.getElementById("historyDialog").close());
  document.getElementById("noteForm").addEventListener("submit", saveNote);
  document.getElementById("closeNoteButton").addEventListener("click", () => noteDialog.close());
  document.getElementById("cancelNoteButton").addEventListener("click", () => noteDialog.close());
  async function loadDailyReport(date) {
    const rows = document.getElementById("dailyReportRows");
    rows.innerHTML = '<tr><td colspan="6" class="empty">Loading…</td></tr>';
    try {
      const result = await api(`/service-requests?action=daily-report&date=${encodeURIComponent(date)}`);
      const requests = result.requests || [];
      rows.innerHTML = requests.length
        ? requests.map((request) => {
            const isCompleted = request.status === "COMPLETED";
            const handledBy = isCompleted
              ? (request.completedBy?.name || "—")
              : (request.cancelledBy?.name || "—");
            const when = isCompleted ? request.completedAt : request.cancelledAt;
            return `<tr>
              <td>${when ? formatDateTime(when) : "—"}</td>
              <td>${escapeHtml(request.customer?.name || "—")}</td>
              <td>${escapeHtml(request.machine?.model || "—")}</td>
              <td>${escapeHtml((request.description || "").slice(0, 50))}${(request.description || "").length > 50 ? "…" : ""}</td>
              <td>${escapeHtml(request.status)}</td>
              <td><strong>${escapeHtml(handledBy)}</strong></td>
            </tr>`;
          }).join("")
        : '<tr><td colspan="6" class="empty">No completed or cancelled requests on this date.</td></tr>';
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message || "Could not load the daily report.")}</td></tr>`;
    }
  }

  document.getElementById("dailyReportButton").addEventListener("click", () => {
    const dateInput = document.getElementById("dailyReportDate");
    if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
    document.getElementById("dailyReportDialog").showModal();
    loadDailyReport(dateInput.value);
  });
  document.getElementById("dailyReportDate").addEventListener("change", (event) => loadDailyReport(event.target.value));
  document.getElementById("closeDailyReportButton").addEventListener("click", () =>
    document.getElementById("dailyReportDialog").close());

  async function loadOperatorReports(status = "") {
    const rows = document.getElementById("operatorReportsRows");
    rows.innerHTML = '<tr><td colspan="7" class="empty">Loading…</td></tr>';
    try {
      const reports = await api(`/service-requests?action=operator-reports${status ? `&status=${status}` : ""}`);
      rows.innerHTML = reports.length
        ? reports.map((report) => `<tr>
            <td>${formatDateTime(report.createdAt)}</td>
            <td>${escapeHtml(report.customer?.name || "—")}</td>
            <td>${escapeHtml(report.machine?.model || "—")}</td>
            <td>${escapeHtml(report.operatorName || "—")}${report.operatorContact ? ` <small>(${escapeHtml(report.operatorContact)})</small>` : ""}</td>
            <td>${escapeHtml(report.message)}</td>
            <td>${escapeHtml(report.status)}</td>
            <td>${report.status === "OPEN" ? `<button type="button" class="secondary compact" data-resolve-report="${escapeHtml(report.id)}">Mark Resolved</button>` : "—"}</td>
          </tr>`).join("")
        : '<tr><td colspan="7" class="empty">No operator reports found.</td></tr>';
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(error.message || "Could not load operator reports.")}</td></tr>`;
    }
  }

  document.getElementById("operatorReportsButton").addEventListener("click", () => {
    document.getElementById("operatorReportsDialog").showModal();
    loadOperatorReports();
  });
  document.getElementById("closeOperatorReportsButton").addEventListener("click", () =>
    document.getElementById("operatorReportsDialog").close());
  document.getElementById("operatorReportsTabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-op-status]");
    if (!button) return;
    document.querySelectorAll("#operatorReportsTabs button").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    loadOperatorReports(button.dataset.opStatus);
  });
  document.getElementById("operatorReportsRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-resolve-report]");
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/service-requests?action=operator-reports&id=${button.dataset.resolveReport}`, { method: "PUT" });
      const activeStatus = document.querySelector("#operatorReportsTabs button.active")?.dataset.opStatus || "";
      loadOperatorReports(activeStatus);
    } catch (error) {
      showAlert(error.message || "Could not mark this report resolved.", true);
    }
  });

  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
  load();
})();
