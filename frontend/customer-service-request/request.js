(function () {
  const token = localStorage.getItem("belm_customer_token");
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  const alertBox = document.getElementById("alertBox");
  let serviceOptions = [];
  let machine = null;

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
      showAlert(`Service request saved successfully. Reference: ${result.id}`);
      document.getElementById("serviceForm").reset();
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

  load();
})();
