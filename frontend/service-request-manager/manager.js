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
      const count = status ? requests.filter((request) => request.status === status).length : requests.length;
      const label = status ? status.replaceAll("_", " ") : "ALL";
      return `<button class="${activeStatus === status ? "active" : ""}" data-status="${status}">${label}<b>${count}</b></button>`;
    }).join("");
  }

  function technicianOptions(request) {
    const eligible = technicians.filter((technician) =>
      !request.customer?.id || technician.assignedCustomerId === request.customer.id
    );
    return [
      '<option value="">Unassigned</option>',
      ...eligible.map((technician) => `<option value="${escapeHtml(technician.id)}" ${request.assignedTo?.id === technician.id ? "selected" : ""}>${escapeHtml(technician.name)}</option>`),
    ].join("");
  }

  function renderRequests() {
    renderTabs();
    const visible = activeStatus ? requests.filter((request) => request.status === activeStatus) : requests;
    if (visible.length === 0) {
      requestList.innerHTML = '<div class="empty">No service requests in this status.</div>';
      return;
    }
    requestList.innerHTML = visible.map((request) => `
      <article class="request-card ${String(request.priority || "").toLowerCase()}">
        <div class="request-head">
          <div>
            <h2>${escapeHtml(request.customer?.name || "Unknown customer")} · ${escapeHtml(request.machine?.model || "General request")}</h2>
            <div class="meta">${new Date(request.createdAt).toLocaleString()} · ${escapeHtml(request.status.replaceAll("_", " "))}</div>
          </div>
          <span class="priority ${escapeHtml(request.priority)}">${escapeHtml(request.priority)}</span>
        </div>
        <div class="description">${escapeHtml(request.description)}</div>
        <div class="control-grid">
          <label>Assigned Technician
            <select data-assign="${escapeHtml(request.id)}">${technicianOptions(request)}</select>
          </label>
          <label>Job status
            <select data-status-update="${escapeHtml(request.id)}">
              ${statuses.filter(Boolean).map((status) => `<option value="${status}" ${request.status === status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}
            </select>
          </label>
          <button class="note-button" type="button" data-note="${escapeHtml(request.id)}">Notes (${(request.notes || []).length})</button>
        </div>
      </article>
    `).join("");
  }

  async function load() {
    requestList.innerHTML = '<div class="loading">Loading service requests…</div>';
    if (!token) {
      requestList.innerHTML = '<div class="locked">Administrator login required.<br><a href="/login/">Go to portal login</a></div>';
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
        ? `<div class="locked">${escapeHtml(error.message)}<br><a href="/login/">Go to portal login</a></div>`
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
      ? request.notes.map((note) => `<div class="note"><small>${new Date(note.createdAt).toLocaleString()} · ${escapeHtml(note.author || "BELM")}</small>${escapeHtml(note.note)}</div>`).join("")
      : '<div class="note">No notes yet.</div>';
    noteDialog.showModal();
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
    if (button) openNotes(button.dataset.note);
  });
  document.getElementById("noteForm").addEventListener("submit", saveNote);
  document.getElementById("closeNoteButton").addEventListener("click", () => noteDialog.close());
  document.getElementById("cancelNoteButton").addEventListener("click", () => noteDialog.close());
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login/";
  });
  load();
})();
