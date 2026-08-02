(function () {
  const token = localStorage.getItem("belm_customer_token");
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  const alertBox = document.getElementById("alertBox");
  let serviceOptions = [];
  let machine = null;
  let partRowCount = 0;

  if (!token) {
    window.location.replace("/portal/login");
    return;
  }
  if (!machineId) {
    showAlert("Choose a machine from the Customer dashboard.", true);
    document.getElementById("submitButton").disabled = true;
    return;
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

  function renderParts() {
    const option = selectedOption();
    const parts = option?.serviceParts || [];
    document.getElementById("partCount").textContent =
      `${parts.length} part${parts.length === 1 ? "" : "s"}`;
    document.getElementById("partsList").innerHTML = parts.length
      ? parts.map(part => `
        <article class="part-row">
          <div><span>Spare-parts name</span><b>${escapeHtml(part.spareName)}</b></div>
          <div><span>Part number</span><b>${escapeHtml(part.partNumber)}</b></div>
          <div><span>Quantity</span><b>${Number(part.quantity).toLocaleString("en-TZ")}</b></div>
        </article>
      `).join("")
      : '<div class="empty">No spare parts configured for this service type.</div>';

    if (option && !document.getElementById("description").value.trim()) {
      document.getElementById("description").value =
        `Request ${option.serviceType} for ${machine?.brand ? `${machine.brand} ` : ""}${machine?.model || "machine"}.`;
    }
  }

  function render(data) {
    machine = data.machine || {};
    serviceOptions = Array.isArray(data.serviceOptions) ? data.serviceOptions : [];
    document.getElementById("pageTitle").textContent =
      `Service request — ${machine.brand ? `${machine.brand} ` : ""}${machine.model || "Machine"}`;
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
    renderParts();
  }

  async function load() {
    try {
      render(await api(`/service-options/${encodeURIComponent(machineId)}`));
    } catch (error) {
      showAlert(error.message || "Could not detect machine service options.", true);
      document.getElementById("submitButton").disabled = true;
    }
  }

  function machineListOptionsHtml(selectedIndex = "") {
    const option = selectedOption();
    const parts = option?.serviceParts || [];
    return `<option value="">Select from this machine's parts list…</option>${parts.map((part, index) =>
      `<option value="${index}" ${String(index) === String(selectedIndex) ? "selected" : ""}>${escapeHtml(part.spareName)} (${escapeHtml(part.partNumber)})</option>`
    ).join("")}`;
  }

  function hasMachineList() {
    return (selectedOption()?.serviceParts || []).length > 0;
  }

  function addPartRow() {
    partRowCount += 1;
    const rowId = `partRow${partRowCount}`;
    const row = document.createElement("div");
    row.className = "part-request-row";
    row.dataset.rowId = rowId;
    row.dataset.mode = "custom";
    const listButton = hasMachineList()
      ? '<button type="button" data-mode="machine-list">Choose from this machine\'s list</button>'
      : "";
    row.innerHTML = `
      <div class="part-request-row-head">
        <div class="part-source-toggle">
          <button type="button" data-mode="custom" class="active">Fill in part needed</button>
          ${listButton}
        </div>
        <button type="button" class="remove-part-row" data-remove-row>Remove</button>
      </div>
      <div class="part-request-fields custom" data-fields>
        <input type="text" placeholder="Reference number" data-reference maxlength="100">
        <input type="text" placeholder="Description" data-description maxlength="255">
        <input type="number" min="1" step="1" placeholder="Qty" data-qty required>
      </div>`;
    document.getElementById("partRequestRows").appendChild(row);
  }

  function setRowMode(row, mode) {
    if (mode === "machine-list" && !hasMachineList()) return;
    row.dataset.mode = mode;
    row.querySelectorAll(".part-source-toggle button").forEach((button) =>
      button.classList.toggle("active", button.dataset.mode === mode));
    const fields = row.querySelector("[data-fields]");
    if (mode === "machine-list") {
      fields.className = "part-request-fields";
      fields.innerHTML = `
        <select data-machine-part>${machineListOptionsHtml()}</select>
        <input type="number" min="1" step="1" placeholder="Qty" data-qty required>`;
    } else {
      fields.className = "part-request-fields custom";
      fields.innerHTML = `
        <input type="text" placeholder="Reference number" data-reference maxlength="100">
        <input type="text" placeholder="Description" data-description maxlength="255">
        <input type="number" min="1" step="1" placeholder="Qty" data-qty required>`;
    }
  }

  function collectPartRows() {
    const rows = [...document.querySelectorAll(".part-request-row")];
    const parts = [];
    const machineParts = selectedOption()?.serviceParts || [];
    for (const row of rows) {
      const mode = row.dataset.mode;
      const qty = Number(row.querySelector("[data-qty]")?.value || 0);
      if (mode === "machine-list") {
        const index = row.querySelector("[data-machine-part]")?.value ?? "";
        const part = machineParts[Number(index)];
        if (!part || qty <= 0) continue;
        parts.push({ referenceNumber: part.partNumber, description: part.spareName, quantity: qty });
      } else {
        const referenceNumber = row.querySelector("[data-reference]")?.value.trim() || "";
        const description = row.querySelector("[data-description]")?.value.trim() || "";
        if ((!referenceNumber && !description) || qty <= 0) continue;
        parts.push({ referenceNumber, description, quantity: qty });
      }
    }
    return parts;
  }

  document.getElementById("addPartRowButton").addEventListener("click", addPartRow);
  document.getElementById("partRequestRows").addEventListener("click", (event) => {
    const row = event.target.closest(".part-request-row");
    if (!row) return;
    if (event.target.closest("[data-remove-row]")) {
      row.remove();
      return;
    }
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) setRowMode(row, modeButton.dataset.mode);
  });

  document.getElementById("serviceTemplate").addEventListener("change", () => {
    document.getElementById("description").value = "";
    renderParts();
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/portal/login";
  });
  document.getElementById("serviceForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearAlert();
    const button = document.getElementById("submitButton");
    const option = selectedOption();
    button.disabled = true;
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
        `Service request saved successfully. Reference: ${result.id}`
        + (partRows.length ? ` · ${partRows.length - partErrors} of ${partRows.length} spare-part request(s) saved.` : "")
      );
      document.getElementById("serviceForm").reset();
      document.getElementById("partRequestRows").innerHTML = "";
      render({ machine, serviceOptions });
    } catch (error) {
      showAlert(error.message || "Could not submit service request.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Submit service request";
    }
  });

  if (String(tokenPayload().customerRole || "").toLowerCase() === "viewer") {
    document.getElementById("submitButton").disabled = true;
    showAlert("Viewer assistants can review service parts but cannot submit requests.");
  }

  load().then(addPartRow);
})();
