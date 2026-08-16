(function () {
  const token = localStorage.getItem("belm_customer_token");
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  const prefillNote = new URLSearchParams(window.location.search).get("note") || "";
  const alertBox = document.getElementById("alertBox");
  let serviceOptions = [];
  let machine = null;
  let partRowCount = 0;
  let selfServiceMode = false;
  let belmBusiness = {};

  if (!token) {
    window.location.replace("/portal/login");
    return;
  }
  if (!machineId) {
    showAlert("Choose a machine from the Customer dashboard.", true);
    document.getElementById("submitButton").disabled = true;
    return;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function showAlert(message, isError = false) {
    alertBox.textContent = message;
    alertBox.className = `alert${isError ? " error" : ""}`;
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.className = "alert hidden";
  }

  function tokenPayload() {
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
      return JSON.parse(decodeURIComponent(Array.from(atob(padded))
        .map(character => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch (_) {
      return {};
    }
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/customer-portal${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      let message = "Request failed.";
      try {
        const error = await response.json();
        message = error.error || message;
      } catch (_) {}
      throw new Error(message);
    }
    return response.json();
  }

  function selectedOption() {
    const id = document.getElementById("serviceTemplate").value;
    return serviceOptions.find(option => option.id === id) || null;
  }

  function applyServiceDescription() {
    const option = selectedOption();
    if (option && !document.getElementById("description").value.trim()) {
      document.getElementById("description").value =
        `Request ${option.serviceType} for ${machine?.brand ? `${machine.brand} ` : ""}${machine?.model || "machine"}.`;
    }
  }

  function render(data) {
    machine = data.machine || {};
    serviceOptions = Array.isArray(data.serviceOptions) ? data.serviceOptions : [];
    if (typeof data.selfServiceMode === "boolean") selfServiceMode = data.selfServiceMode;
    if (data.belmBusiness) belmBusiness = data.belmBusiness;
    const machineLabel = `${machine.brand ? `${machine.brand} ` : ""}${machine.model || "Machine"}`;
    document.getElementById("pageTitle").textContent = selfServiceMode
      ? `Request BELM Technical Support — ${machineLabel}`
      : `Service request — ${machineLabel}`;
    const notice = document.getElementById("supportModeNotice");
    notice.classList.remove("hidden", "error");
    if (selfServiceMode) {
      notice.textContent = `SELF-SERVICE MODE: Your own technicians/operators handle normal maintenance. Use this page only when you want BELM involved. Requests here are sent to ${belmBusiness.email || "BELM Business Email"}.`;
      document.getElementById("portalModeSubtitle").textContent = "Customer Self-Service · BELM Support Gateway";
      document.getElementById("servicePanelTitle").textContent = "Request BELM Technical Support";
      document.getElementById("servicePanelIntro").textContent = "Describe the technical assistance you want BELM to provide. Your internal maintenance work remains with your own team.";
      document.getElementById("submitButton").textContent = "Send to BELM Technical Support";
    } else {
      notice.textContent = `BELM SERVICE PROVIDER ACTIVE: Maintenance/service requests are handled by BELM and sent to ${belmBusiness.email || "the BELM Business Email"}. Your other customer portal operations remain under your company.`;
      document.getElementById("portalModeSubtitle").textContent = "BELM Managed Service Request";
      document.getElementById("servicePanelTitle").textContent = "Service request details";
      document.getElementById("servicePanelIntro").textContent = "Select the service required for this machine. BELM handles internal parts matching separately.";
      document.getElementById("submitButton").textContent = "Submit service request to BELM";
    }
    document.getElementById("machineDetails").textContent = [
      machine.machineType,
      machine.serialNumber ? `Serial: ${machine.serialNumber}` : "",
      machine.regNumber ? `Registration: ${machine.regNumber}` : "",
    ].filter(Boolean).join(" · ");

    const select = document.getElementById("serviceTemplate");
    if (serviceOptions.length) {
      select.innerHTML = serviceOptions.map(option =>
        `<option value="${escapeHtml(option.id)}">${escapeHtml(option.serviceType)} — ${escapeHtml(option.name)}</option>`
      ).join("");
      document.getElementById("matchStatus").textContent =
        `${serviceOptions.length} matching service type${serviceOptions.length === 1 ? "" : "s"}`;
    } else {
      select.innerHTML = '<option value="">General / diagnostic service</option>';
      document.getElementById("matchStatus").textContent = "No matching template";
      showAlert("No active Checklist Template matches this machine type. You can submit a general request, or Admin can add the service type and parts first.");
    }
    applyServiceDescription();
  }

  async function load() {
    try {
      render(await api(`/service-options/${encodeURIComponent(machineId)}`));
    } catch (error) {
      showAlert(error.message || "Could not detect machine service options.", true);
      document.getElementById("submitButton").disabled = true;
    }
  }

  function customFieldsHtml() {
    return `
        <label class="spare-field"><span>Spare name</span><input type="text" placeholder="e.g. Hydraulic return filter" data-description maxlength="255" required></label>
        <label class="spare-field"><span>Reference / part number <small>(if known)</small></span><input type="text" placeholder="Optional" data-reference maxlength="100"></label>
        <label class="spare-field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value="1" data-qty required></label>`;
  }

  function addPartRow() {
    partRowCount += 1;
    const row = document.createElement("div");
    row.className = "part-request-row";
    row.dataset.rowId = `partRow${partRowCount}`;
    row.innerHTML = `
      <div class="part-request-row-head">
        <strong>Spare request ${partRowCount}</strong>
        <button type="button" class="remove-part-row" data-remove-row>Remove</button>
      </div>
      <div class="part-request-fields customer-spare-fields" data-fields>${customFieldsHtml()}</div>`;
    document.getElementById("partRequestRows").appendChild(row);
    row.querySelector("[data-description]")?.focus();
  }

  function collectPartRows() {
    const rows = [...document.querySelectorAll(".part-request-row")];
    const parts = [];
    for (const row of rows) {
      const quantity = Number(row.querySelector("[data-qty]")?.value || 0);
      const referenceNumber = row.querySelector("[data-reference]")?.value.trim() || "";
      const description = row.querySelector("[data-description]")?.value.trim() || "";
      if (!description && !referenceNumber) continue;
      if (!description) throw new Error("Enter the spare name before submitting.");
      if (quantity <= 0 || !Number.isInteger(quantity)) throw new Error("Spare quantity must be a whole number above zero.");
      parts.push({ referenceNumber, description, quantity });
    }
    return parts;
  }

  document.getElementById("addPartRowButton").addEventListener("click", addPartRow);

  document.getElementById("partRequestRows").addEventListener("click", (event) => {
    const row = event.target.closest(".part-request-row");
    if (!row) return;
    if (event.target.closest("[data-remove-row]")) row.remove();
  });
  // Safety net for mobile browsers that sometimes fail to focus an
  // <input>/<select> created via innerHTML on the very first tap. Some
  // mobile browsers only open the on-screen keyboard when .focus() runs
  // SYNCHRONOUSLY inside the user's own gesture — wrapping it in
  // setTimeout (even 0ms) breaks that "trusted gesture" chain on those
  // browsers, so the field silently never gets a working keyboard. Also
  // listens on "focus" itself in case the field IS logically focused but
  // the keyboard still didn't open, re-asserting focus to nudge it.
  function forceFieldFocus(event) {
    const field = event.target.closest("input, select, textarea");
    if (!field) return;
    field.focus();
    if (document.activeElement !== field) {
      // Second attempt on the next tick only if the first genuinely
      // didn't take, as a last resort for stubborn browsers.
      setTimeout(() => field.focus(), 30);
    }
  }
  const partRequestRowsEl = document.getElementById("partRequestRows");
  partRequestRowsEl.addEventListener("pointerdown", forceFieldFocus);
  partRequestRowsEl.addEventListener("touchstart", forceFieldFocus, { passive: true });
  partRequestRowsEl.addEventListener("click", forceFieldFocus);

  document.getElementById("serviceTemplate").addEventListener("change", () => {
    document.getElementById("description").value = "";
    applyServiceDescription();
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/portal/login";
  });
  let isSubmittingServiceRequest = false;
  document.getElementById("serviceForm").addEventListener("submit", async event => {
    event.preventDefault();
    // Guards against duplicate submissions from a fast double-click/tap —
    // checked before anything else runs, so a second click while the
    // first request is still in flight is simply ignored instead of
    // firing the request twice.
    if (isSubmittingServiceRequest) return;
    isSubmittingServiceRequest = true;
    clearAlert();
    const button = document.getElementById("submitButton");
    const option = selectedOption();
    button.disabled = true;
    button.classList.remove("success");
    button.textContent = "Submitting…";
    try {
      const result = await api("/service-requests", {
        method: "POST",
        body: JSON.stringify({
          machineId,
          templateId: option?.id || "",
          serviceType: option?.serviceType || "General / Diagnostic Service",
          priority: document.getElementById("priority").value,
          description: document.getElementById("description").value.trim(),
        }),
      });

      const partRows = collectPartRows();
      let partErrors = 0;
      for (const part of partRows) {
        try {
          await api("/spare-part-requests", {
            method: "POST",
            body: JSON.stringify({ ...part, serviceRequestId: result.id, machineId }),
          });
        } catch (_) {
          partErrors += 1;
        }
      }

      showAlert(
        `${result.emailSent ? "BELM received your request by official business email." : "Request saved in BELM Portal; email delivery needs attention."} Reference: ${result.id}`
        + (partRows.length ? ` · ${partRows.length - partErrors} of ${partRows.length} spare-part request(s) saved.` : "")
      );
      document.getElementById("serviceForm").reset();
      document.getElementById("partRequestRows").innerHTML = "";
      render({ machine, serviceOptions, selfServiceMode, belmBusiness });

      // Unmistakable "it worked" confirmation right on the button itself
      // — not just the alert banner above — so there's no doubt the tap
      // registered, before the button returns to its normal state.
      button.classList.add("success");
      button.textContent = "✓ Sent";
      await new Promise(resolve => setTimeout(resolve, 1600));
    } catch (error) {
      showAlert(error.message || "Could not submit service request.", true);
    } finally {
      button.classList.remove("success");
      button.disabled = false;
      button.textContent = selfServiceMode ? "Send to BELM Technical Support" : "Submit service request to BELM";
      isSubmittingServiceRequest = false;
    }
  });

  if (String(tokenPayload().customerRole || "").toLowerCase() === "viewer") {
    document.getElementById("submitButton").disabled = true;
    showAlert("Viewer assistants can review service requests but cannot submit new requests.");
  }

  async function loadHistory() {
    const rows = document.getElementById("historyRows");
    rows.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
    try {
      const requests = await api("/service-requests");
      rows.innerHTML = requests.length
        ? requests.map((request) => {
            const statusLower = String(request.status || "").toLowerCase();
            let handledBy = "—";
            if (request.status === "COMPLETED" && request.completedBy) {
              handledBy = `Completed by ${escapeHtml(request.completedBy.name)}`;
            } else if (request.status === "CANCELLED" && request.cancelledBy) {
              handledBy = `Cancelled by ${escapeHtml(request.cancelledBy.name)}`;
            }
            return `<tr>
              <td>${formatDate(request.createdAt)}</td>
              <td>${escapeHtml(request.machine?.model || "—")}</td>
              <td>${escapeHtml((request.description || "").slice(0, 60))}${(request.description || "").length > 60 ? "…" : ""}</td>
              <td><span class="status-pill ${statusLower}">${escapeHtml(request.status)}</span></td>
              <td class="handled-by">${handledBy}</td>
            </tr>`;
          }).join("")
        : '<tr><td colspan="5" class="empty">No service requests yet.</td></tr>';
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(error.message || "Could not load history.")}</td></tr>`;
    }
  }

  document.getElementById("refreshHistoryButton").addEventListener("click", loadHistory);

  load().then(addPartRow).then(() => {
    if (prefillNote) {
      const descriptionField = document.getElementById("description");
      if (descriptionField && !descriptionField.value.trim()) descriptionField.value = prefillNote;
    }
  });
  loadHistory();
})();
