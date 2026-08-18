(function () {
  const token = localStorage.getItem("belm_admin_token");
  const requestList = document.getElementById("requestList");
  const statusTabs = document.getElementById("statusTabs");
  const alertBox = document.getElementById("alertBox");
  const noteDialog = document.getElementById("noteDialog");
  const statuses = ["", "OPEN", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED", "HIDDEN"];
  let requests = [];
  let hiddenRequests = [];
  let technicians = [];
  let activeStatus = "";
  let activeHistoryRequestId = "";

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


  function localDateKey(value = new Date()) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function displayDateKey(value) {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value || "");
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
      const count = status === "HIDDEN"
        ? hiddenRequests.length
        : status
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
    const visible = activeStatus === "HIDDEN"
      ? hiddenRequests
      : activeStatus
        ? requests.filter((request) => request.status === activeStatus)
        : requests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.status));
    if (visible.length === 0) {
      requestList.innerHTML = activeStatus === "HIDDEN"
        ? '<div class="empty">Nothing hidden. Activated Job Cards and manually hidden history appear here.</div>'
        : activeStatus
          ? '<div class="empty">No service requests in this status.</div>'
          : '<div class="empty">No active service requests waiting in this inbox. Activated work continues in Engineering → Job Cards.</div>';
      return;
    }
    requestList.innerHTML = visible.map((request) => {
      const isFinal = ["COMPLETED", "CANCELLED"].includes(request.status);
      const isHidden = Boolean(request.hiddenAt);
      const controlsLocked = isFinal || isHidden;
      const canActivate = Boolean(request.machine?.id) && !isFinal && !isHidden;
      const company = request.customer?.name || "Unknown customer";
      const machine = request.machine?.model || "General request";
      const instruction = request.description || request.serviceType || "No work instruction supplied.";
      const jobCardLabel = request.jobCard
        ? `${request.jobCard.jobCardNo || "Job Card"} · ${String(request.jobCard.status || "RECEIVED").replaceAll("_", " ")}`
        : "Job Card not yet confirmed";
      return `
      <article class="request-card compact-request ${String(request.priority || "").toLowerCase()}" data-request-card="${escapeHtml(request.id)}">
        <div class="request-compact-row">
          <div class="compact-company" title="${escapeHtml(instruction)}">
            <div class="compact-company-line">
              <strong>${escapeHtml(company)}</strong>
              <span class="priority ${escapeHtml(request.priority)}">${escapeHtml(request.priority)}</span>
            </div>
            <div class="compact-machine">${escapeHtml(machine)}${request.serviceType ? ` · ${escapeHtml(request.serviceType)}` : ""}</div>
            <div class="compact-instruction">${escapeHtml(instruction)}</div>
          </div>
          <label class="compact-field">Assigned Technician
            <select data-assign="${escapeHtml(request.id)}" ${controlsLocked ? "disabled" : ""}>${technicianOptions(request)}</select>
          </label>
          <label class="compact-field">Job Status
            <select data-status-update="${escapeHtml(request.id)}" ${controlsLocked ? "disabled" : ""}>
              ${statuses.filter((status) => status && status !== "HIDDEN").map((status) => `<option value="${status}" ${request.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
            </select>
          </label>
          ${canActivate
            ? `<button class="activate-jc-button" type="button" data-activate-job-card="${escapeHtml(request.id)}">OK · Activate JC</button>`
            : `<div class="compact-job-state ${request.jobCard ? "ready" : ""}">${escapeHtml(jobCardLabel)}</div>`}
          <button class="details-toggle" type="button" data-toggle-request="${escapeHtml(request.id)}" aria-expanded="false">Details</button>
        </div>
        <div class="request-extra" data-request-extra="${escapeHtml(request.id)}" hidden>
          <div class="request-extra-grid">
            <div><b>Company</b><span>${escapeHtml(company)}</span></div>
            <div><b>Machine</b><span>${escapeHtml(machine)}</span></div>
            <div><b>Created</b><span>${formatDateTime(request.createdAt)}</span></div>
            <div><b>Job Card</b><span>${escapeHtml(jobCardLabel)}</span></div>
          </div>
          ${request.customer?.phone ? `<a class="whatsapp-link" target="_blank" rel="noopener" href="https://wa.me/${escapeHtml(String(request.customer.phone).replace(/[^0-9]/g, ""))}?text=${encodeURIComponent(`Hello, this is BELM regarding your service request for ${request.machine?.model || "your machine"}.`)}">💬 WhatsApp ${escapeHtml(company)}</a>` : ""}
          <div class="job-card-instructions"><b>Job Card instructions</b><span>${escapeHtml(instruction)}</span></div>
          ${request.jobCard
            ? `<div class="job-card-receipt-banner received"><b>✓ JOB CARD RECEIVED BY BELM / ACTIVE</b><span>${escapeHtml(jobCardLabel)} · Received ${formatDateTime(request.jobCard.receivedAt)}</span></div>`
            : (request.machine?.id ? `<div class="job-card-receipt-banner missing"><b>JOB CARD RECEIPT NOT CONFIRMED — SYNC NEEDS ATTENTION</b><span>Press OK · Activate JC to force-create/repair the Job Card from these instructions.</span></div>` : "")}
          ${request.assignedTo?.temporaryOverride ? `<div class="temporary-override-banner"><b>TEMPORARY OVERRIDE</b> · ${escapeHtml(request.assignedTo.name)} remains attached to ${escapeHtml(request.assignedTo.homeCustomerName || "their home customer")}; this assignment is for this request only.</div>` : ""}
          ${(request.serviceParts || []).length ? `
            <div class="request-parts">
              <b>Synchronized service parts</b>
              <div>${request.serviceParts.map((part) => `<span>${escapeHtml(part.spareName)} · ${escapeHtml(part.partNumber)} · Qty ${Number(part.quantity).toLocaleString("en-TZ")}${part.inventoryMatch ? ` <em class="inventory-match-badge">✓ In stock: ${escapeHtml(part.inventoryMatch.name)} (${escapeHtml(part.inventoryMatch.stockQty)} available)</em>` : ' <em class="inventory-match-missing">Not in BELM inventory</em>'}</span>`).join("")}</div>
            </div>` : ""}
          <div class="compact-secondary-actions">
            <button class="note-button" type="button" data-note="${escapeHtml(request.id)}">Notes (${(request.notes || []).length})</button>
            <button class="note-button history-button" type="button" data-history="${escapeHtml(request.id)}">History</button>
            ${request.hiddenAt
              ? `<button class="note-button unhide-button" type="button" data-unhide="${escapeHtml(request.id)}">Restore to list</button>`
              : isFinal
                ? `<button class="note-button hide-button" type="button" data-hide="${escapeHtml(request.id)}">Hide from list</button>`
                : ""}
          </div>
        </div>
      </article>`;
    }).join("");
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
      const request = requests.find((item) => item.id === requestId);
      const technician = technicians.find((item) => item.id === assignedToId);
      const temporaryOverride = Boolean(
        request?.customer?.id && technician?.assignedCustomerId
        && String(request.customer.id) !== String(technician.assignedCustomerId)
      );
      if (temporaryOverride) {
        const ok = confirm(
          `${technician.name} is permanently attached to ${technician.assignedCustomerName || "another customer"}.\n\n` +
          `Use TEMPORARY OVERRIDE for this service request only? Their permanent customer will not change.`
        );
        if (!ok) { await load(); return; }
      }
      await api(`/service-requests/${requestId}/assign`, {
        method: "PUT",
        body: JSON.stringify({ assignedToId, temporaryOverride }),
      });
      await load();
      showAlert(assignedToId ? (temporaryOverride ? "Temporary Technician Override assigned successfully." : "Technician assigned successfully.") : "Service request is now unassigned.", false);
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

  function setActivateState(button, state, text) {
    if (!button) return;
    button.classList.remove("is-busy", "is-success", "is-error", "has-pending-change");
    if (state) button.classList.add(state);
    if (text) button.textContent = text;
  }

  async function activateJobCard(requestId, button) {
    const request = requests.find((item) => item.id === requestId);
    const card = button?.closest("[data-request-card]");
    const assignedSelect = card?.querySelector("[data-assign]");
    const statusSelect = card?.querySelector("[data-status-update]");
    const assignedToId = assignedSelect?.value || request?.assignedTo?.id || "";
    let desiredStatus = statusSelect?.value || request?.status || "OPEN";
    if (!request) return;
    if (!request.machine?.id) {
      showAlert("Link this Service Request to a machine before activating its Job Card.", true);
      setActivateState(button, "is-error", "Machine required");
      return;
    }
    if (!assignedToId) {
      showAlert("Select Assigned Technician first, then press OK to activate the Job Card.", true);
      setActivateState(button, "is-error", "Select Technician");
      return;
    }
    if (desiredStatus === "OPEN") desiredStatus = "ASSIGNED";

    const technician = technicians.find((item) => item.id === assignedToId);
    const temporaryOverride = Boolean(
      request.customer?.id && technician?.assignedCustomerId
      && String(request.customer.id) !== String(technician.assignedCustomerId)
    );
    if (temporaryOverride && String(request.assignedTo?.id || "") !== String(assignedToId)) {
      const ok = confirm(
        `${technician.name} is permanently attached to ${technician.assignedCustomerName || "another customer"}.\n\n` +
        `Use TEMPORARY OVERRIDE for this Job Card only? Their permanent customer will not change.`
      );
      if (!ok) return;
    }

    button.disabled = true;
    setActivateState(button, "is-busy", "Activating…");
    try {
      if (String(request.assignedTo?.id || "") !== String(assignedToId)) {
        await api(`/service-requests/${requestId}/assign`, {
          method: "PUT",
          body: JSON.stringify({ assignedToId, temporaryOverride }),
        });
      }
      if (desiredStatus !== request.status || (request.status === "OPEN" && assignedToId)) {
        await api(`/service-requests/${requestId}/status`, {
          method: "PUT",
          body: JSON.stringify({ status: desiredStatus }),
        });
      }
      const result = await api(`/service-requests/${requestId}/activate-job-card`, { method: "PUT" });
      setActivateState(button, "is-success", `✓ ${result.jobCard?.jobCardNo || "Activated"}`);
      card?.classList.add("activation-complete");
      showAlert(`✓ ${result.jobCard?.jobCardNo || "Job Card"} activated. Service Request moved out of the active inbox; continue in Engineering → Job Cards.`, false);
      window.setTimeout(load, 550);
    } catch (error) {
      button.disabled = false;
      setActivateState(button, "is-error", "Try Again");
      showAlert(error.message || "Could not activate this Job Card.", true);
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
    HIDDEN: "Visibility changed",
    JOB_CARD_ACTIVATED: "Job Card activated",
  };

  async function openHistory(requestId) {
    const dialog = document.getElementById("historyDialog");
    const body = document.getElementById("historyBody");
    activeHistoryRequestId = requestId;
    const downloadButton = document.getElementById("downloadHistoryReportButton");
    if (downloadButton) {
      downloadButton.disabled = false;
      downloadButton.textContent = "Download Report (PDF)";
    }
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
        } else if (entry.eventType === "HIDDEN") {
          description = `By ${escapeHtml(entry.actorName || "BELM")}`;
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

  async function downloadHistoryReport() {
    if (!activeHistoryRequestId) return;
    const button = document.getElementById("downloadHistoryReportButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Preparing PDF…";
    }
    try {
      const response = await fetch(`/api/service-requests?action=history-pdf&requestId=${encodeURIComponent(activeHistoryRequestId)}`, {
        method: "GET",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      if (!response.ok) {
        const text = await response.text();
        let message = "Could not download the history report.";
        try { message = JSON.parse(text)?.error || message; } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `BELM-Service-Request-History-${activeHistoryRequestId}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showAlert("History report downloaded as PDF.", false);
    } catch (error) {
      showAlert(error.message || "Could not download the history report.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Download Report (PDF)";
      }
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

  statusTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    activeStatus = button.dataset.status;
    if (activeStatus === "HIDDEN" && hiddenRequests.length === 0) {
      try {
        hiddenRequests = await api("/service-requests?hidden=1");
      } catch (error) {
        showAlert(error.message, true);
      }
    }
    renderRequests();
  });
  requestList.addEventListener("change", (event) => {
    const card = event.target.closest("[data-request-card]");
    if (!card) return;
    const activateButton = card.querySelector("[data-activate-job-card]");
    if (event.target.dataset.assign) {
      const statusSelect = card.querySelector("[data-status-update]");
      if (event.target.value && statusSelect?.value === "OPEN") statusSelect.value = "ASSIGNED";
      if (!event.target.value && statusSelect?.value === "ASSIGNED") statusSelect.value = "OPEN";
    }
    if (event.target.dataset.assign || event.target.dataset.statusUpdate) {
      setActivateState(activateButton, "has-pending-change", "OK · Apply & Activate");
    }
  });
  requestList.addEventListener("click", (event) => {
    const activateButton = event.target.closest("[data-activate-job-card]");
    const toggleButton = event.target.closest("[data-toggle-request]");
    const button = event.target.closest("[data-note]");
    const historyButton = event.target.closest("[data-history]");
    const hideButton = event.target.closest("[data-hide]");
    const unhideButton = event.target.closest("[data-unhide]");
    if (activateButton) activateJobCard(activateButton.dataset.activateJobCard, activateButton);
    if (toggleButton) {
      const panel = requestList.querySelector(`[data-request-extra="${toggleButton.dataset.toggleRequest}"]`);
      if (panel) {
        panel.hidden = !panel.hidden;
        toggleButton.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
        toggleButton.textContent = panel.hidden ? "Details" : "Close";
      }
    }
    if (button) openNotes(button.dataset.note);
    if (historyButton) openHistory(historyButton.dataset.history);
    if (hideButton) hideRequest(hideButton.dataset.hide);
    if (unhideButton) unhideRequest(unhideButton.dataset.unhide);
  });

  async function hideRequest(requestId) {
    try {
      await api(`/service-requests/${requestId}/hide`, { method: "PUT" });
      requests = requests.filter((request) => request.id !== requestId);
      renderRequests();
      showAlert("Hidden from the daily list. It still appears in daily reports and History.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function unhideRequest(requestId) {
    try {
      await api(`/service-requests/${requestId}/unhide`, { method: "PUT" });
      hiddenRequests = hiddenRequests.filter((request) => request.id !== requestId);
      renderRequests();
      showAlert("Restored to the daily list.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }
  document.getElementById("downloadHistoryReportButton")?.addEventListener("click", downloadHistoryReport);
  document.getElementById("closeHistoryButton")?.addEventListener("click", () => {
    activeHistoryRequestId = "";
    document.getElementById("historyDialog").close();
  });
  document.getElementById("noteForm").addEventListener("submit", saveNote);
  document.getElementById("closeNoteButton").addEventListener("click", () => noteDialog.close());
  document.getElementById("cancelNoteButton").addEventListener("click", () => noteDialog.close());
  async function loadDailyReport(date) {
    const rows = document.getElementById("dailyReportRows");
    const summaryBox = document.getElementById("dailyReportSummary");
    rows.innerHTML = '<tr><td colspan="6" class="empty">Loading…</td></tr>';
    if (summaryBox) summaryBox.textContent = "Synchronizing final-status actions…";
    try {
      const result = await api(`/service-requests?action=daily-report&date=${encodeURIComponent(date)}`);
      const reportRequests = result.requests || [];
      const summary = result.summary || {};
      if (summaryBox) {
        summaryBox.innerHTML = `<strong>${escapeHtml(displayDateKey(result.date || date))}</strong> · ${Number(summary.completed || 0)} completed · ${Number(summary.cancelled || 0)} cancelled <span>Status tabs: ${Number(summary.visibleCompleted || 0)} completed · ${Number(summary.visibleCancelled || 0)} cancelled</span>`;
      }
      rows.innerHTML = reportRequests.length
        ? reportRequests.map((request) => {
            const isCompleted = request.status === "COMPLETED";
            const handledBy = request.handledBy?.name || (isCompleted
              ? (request.completedBy?.name || "—")
              : (request.cancelledBy?.name || "—"));
            const when = request.actionAt || (isCompleted ? request.completedAt : request.cancelledAt);
            return `<tr>
              <td>${when ? formatDateTime(when) : "—"}</td>
              <td>${escapeHtml(request.customer?.name || "—")}</td>
              <td>${escapeHtml(request.machine?.model || "—")}</td>
              <td>${escapeHtml((request.description || "").slice(0, 50))}${(request.description || "").length > 50 ? "…" : ""}</td>
              <td>${escapeHtml(request.status)}</td>
              <td><strong>${escapeHtml(handledBy)}</strong></td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="6" class="empty">No completion/cancellation action on ${escapeHtml(displayDateKey(result.date || date))}. Status-tab totals are all dates; choose the date when the job was actually completed or cancelled.</td></tr>`;
    } catch (error) {
      if (summaryBox) summaryBox.textContent = "Daily Report sync failed.";
      rows.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message || "Could not load the daily report.")}</td></tr>`;
    }
  }

  document.getElementById("dailyReportButton").addEventListener("click", () => {
    const dateInput = document.getElementById("dailyReportDate");
    if (!dateInput.value) dateInput.value = localDateKey();
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

  document.getElementById("jobCardButton")?.addEventListener("click", () => {
    const embedded = new URLSearchParams(window.location.search).get("embed") === "1" && window.parent !== window;
    if (embedded) {
      window.parent.postMessage({ type: "belm-engineering-open-job-cards" }, window.location.origin);
      return;
    }
    window.location.href = "/engineering-manager/#job-cards";
  });
  document.getElementById("refreshButton").addEventListener("click", load);

  if (new URLSearchParams(window.location.search).get("embed") === "1" && window.parent !== window) {
    const reportEmbedHeight = () => {
      const height = Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
      window.parent.postMessage({ type: "belm-service-requests-height", height }, window.location.origin);
    };
    window.addEventListener("load", reportEmbedHeight);
    window.addEventListener("resize", reportEmbedHeight);
    if (window.ResizeObserver) new ResizeObserver(reportEmbedHeight).observe(document.body);
    window.setTimeout(reportEmbedHeight, 80);
  }

  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
  load();
})();
