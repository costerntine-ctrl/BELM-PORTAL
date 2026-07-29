(function () {
  const token = localStorage.getItem("belm_admin_token");
  let parts = [];
  let requests = [];
  let activeRequestId = "";

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
  const money = (value) => `TZS ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

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
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showAlert(message, error = false) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = `alert${error ? " error" : ""}`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function formError(message) {
    const box = document.getElementById("formAlert");
    box.textContent = message;
    box.className = "alert error";
  }

  function updateMetrics() {
    document.getElementById("partCount").textContent = parts.length.toLocaleString();
    document.getElementById("unitCount").textContent = parts.reduce((sum, part) => sum + Number(part.stockQty || 0), 0).toLocaleString();
    document.getElementById("inventoryCost").textContent = money(parts.reduce((sum, part) =>
      sum + Number(part.stockQty || 0) * Number(part.purchasePrice || 0), 0));
    document.getElementById("lowStockCount").textContent = parts.filter((part) =>
      Number(part.stockQty) <= Number(part.reorderThreshold)).length.toLocaleString();
  }

  function renderRequests() {
    const panel = document.getElementById("requestsPanel");
    const count = document.getElementById("requestCount");
    count.textContent = `${requests.length.toLocaleString()} open`;
    if (!requests.length) {
      panel.className = "empty";
      panel.textContent = "No open Technician spare alerts.";
      return;
    }

    panel.className = "request-grid";
    panel.innerHTML = requests.map((request) => {
      const machineName = [request.machineBrand, request.machineModel].filter(Boolean).join(" ") || "Machine";
      const reference = request.serialNumber || request.regNumber || "No serial recorded";
      const purchaseRequired = request.status === "PURCHASE_REQUIRED";
      return `<article class="request-card${purchaseRequired ? " purchase" : ""}">
        <div class="request-card-head">
          <div>
            <span class="badge ${purchaseRequired ? "off" : "warn"}">${purchaseRequired ? "PURCHASE REQUIRED" : "STOCK 0 · NEW REQUEST"}</span>
            <h3>${escapeHtml(request.partNumber)} — ${escapeHtml(request.description || request.partName)}</h3>
          </div>
          <strong>Stock ${escapeHtml(request.stockQty ?? 0)}</strong>
        </div>
        <dl>
          <div><dt>Machine</dt><dd>${escapeHtml(machineName)} · ${escapeHtml(reference)}</dd></div>
          <div><dt>Machine type</dt><dd>${escapeHtml(request.machineType || "—")}</dd></div>
          <div><dt>Customer</dt><dd>${escapeHtml(request.customerName || "—")}</dd></div>
          <div><dt>Requested by</dt><dd>${escapeHtml(request.requestedByName || "Technician")}</dd></div>
        </dl>
        <div class="row-actions request-actions">
          <button data-add-request="${escapeHtml(request.id)}">Add to Inventory</button>
          <button class="purchase-button" data-purchase-request="${escapeHtml(request.id)}"${purchaseRequired ? " disabled" : ""}>${purchaseRequired ? "Awaiting Purchase" : "Purchase Required"}</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderParts() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = parts.filter((part) =>
      [part.partNumber, part.name, part.category].some((value) => String(value || "").toLowerCase().includes(query)));
    const panel = document.getElementById("partsPanel");
    if (!filtered.length) {
      panel.className = "empty";
      panel.textContent = query ? "No spare parts match this search." : "No spare parts saved yet. Select “Add spare part” to create the first record.";
      return;
    }

    panel.className = "table-wrap";
    panel.innerHTML = `<table>
      <thead><tr><th>Part number</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Purchase</th><th>Selling</th><th>Profit</th><th></th></tr></thead>
      <tbody>${filtered.map((part) => {
        const profit = Number(part.sellingPrice || 0) - Number(part.purchasePrice || 0);
        const low = Number(part.stockQty) <= Number(part.reorderThreshold);
        return `<tr>
          <td class="nowrap"><strong>${escapeHtml(part.partNumber)}</strong></td>
          <td>${escapeHtml(part.name)}</td>
          <td class="muted">${escapeHtml(part.category || "—")}</td>
          <td><span class="badge ${low ? "warn" : ""}">${escapeHtml(part.stockQty)}</span></td>
          <td>${escapeHtml(part.reorderThreshold)}</td>
          <td class="nowrap">${money(part.purchasePrice)}</td>
          <td class="nowrap">${money(part.sellingPrice)}</td>
          <td class="nowrap">${money(profit)}</td>
          <td><div class="row-actions"><button data-edit="${escapeHtml(part.id)}">Edit</button><button class="delete" data-delete="${escapeHtml(part.id)}">Delete</button></div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  async function loadParts() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      parts = await api("/spare-parts");
      requests = await api("/spare-parts/requests");
      updateMetrics();
      renderParts();
      renderRequests();
      try {
        const settings = await api("/settings");
        if (["light", "dark"].includes(settings.displayTheme)) applyTheme(settings.displayTheme);
      } catch (_) {}
    } catch (error) {
      document.getElementById("partsPanel").className = "empty";
      document.getElementById("partsPanel").innerHTML = `${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a>`;
      showAlert(error.message, true);
    }
  }

  function openPart(part = null, requestId = "") {
    activeRequestId = requestId;
    document.getElementById("partForm").reset();
    document.getElementById("partId").value = part?.id || "";
    document.getElementById("dialogTitle").textContent = part ? "Edit spare part" : "Add spare part";
    document.getElementById("partNumber").value = part?.partNumber || "";
    document.getElementById("partName").value = part?.name || "";
    document.getElementById("category").value = part?.category || "";
    document.getElementById("stockQty").value = part?.stockQty ?? 0;
    document.getElementById("reorderThreshold").value = part?.reorderThreshold ?? 5;
    document.getElementById("purchasePrice").value = part?.purchasePrice ?? 0;
    document.getElementById("sellingPrice").value = part?.sellingPrice ?? 0;
    document.getElementById("formAlert").className = "alert error hidden";
    const context = document.getElementById("requestContext");
    const request = requests.find((item) => item.id === requestId);
    if (request) {
      context.className = "alert";
      context.textContent = `${request.requestedByName || "Technician"} requested ${request.partNumber} for ${request.machineBrand || ""} ${request.machineModel || "machine"}. Enter received stock and prices to close the alert.`;
    } else {
      context.className = "alert hidden";
      context.textContent = "";
    }
    document.getElementById("partDialog").showModal();
    document.getElementById("partNumber").focus();
  }

  function closePart() {
    activeRequestId = "";
    document.getElementById("partDialog").close();
  }

  async function savePart(event) {
    event.preventDefault();
    const id = document.getElementById("partId").value;
    const resolvingRequestId = activeRequestId;
    const payload = {
      partNumber: document.getElementById("partNumber").value.trim(),
      name: document.getElementById("partName").value.trim(),
      category: document.getElementById("category").value.trim(),
      stockQty: Number(document.getElementById("stockQty").value),
      reorderThreshold: Number(document.getElementById("reorderThreshold").value),
      purchasePrice: Number(document.getElementById("purchasePrice").value),
      sellingPrice: Number(document.getElementById("sellingPrice").value),
    };
    const button = document.getElementById("saveButton");
    if (resolvingRequestId && payload.stockQty <= 0) {
      formError("Enter received stock quantity above 0 to close this Technician alert.");
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/spare-parts/${id}` : "/spare-parts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (resolvingRequestId) {
        await api(`/spare-parts/requests/${resolvingRequestId}`, {
          method: "PUT",
          body: JSON.stringify({ action: "resolve" }),
        });
      }
      closePart();
      await loadParts();
      showAlert(resolvingRequestId
        ? "Spare part added to Inventory and Technician alert closed."
        : (id ? "Spare part updated and saved." : "Spare part added and saved."));
    } catch (error) {
      formError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save spare part";
    }
  }

  async function deletePart(id) {
    const part = parts.find((item) => item.id === id);
    if (!part || !confirm(`Delete ${part.partNumber} — ${part.name}? It will move to the Recycle Bin.`)) return;
    try {
      await api(`/spare-parts/${id}`, { method: "DELETE" });
      await loadParts();
      showAlert("Spare part moved to the Recycle Bin.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function markPurchaseRequired(id) {
    try {
      await api(`/spare-parts/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify({ action: "purchase" }),
      });
      await loadParts();
      showAlert("Technician request marked Purchase Required.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("addButton").addEventListener("click", () => openPart());
  document.getElementById("refreshButton").addEventListener("click", loadParts);
  document.getElementById("searchInput").addEventListener("input", renderParts);
  document.getElementById("partForm").addEventListener("submit", savePart);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", closePart));
  document.getElementById("partsPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openPart(parts.find((part) => part.id === edit.dataset.edit));
    if (remove) deletePart(remove.dataset.delete);
  });
  document.getElementById("requestsPanel").addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-request]");
    const purchase = event.target.closest("[data-purchase-request]");
    if (add) {
      const request = requests.find((item) => item.id === add.dataset.addRequest);
      const part = request && parts.find((item) => item.id === request.sparePartId);
      if (!request || !part) {
        showAlert("The linked spare-part record could not be opened.", true);
        return;
      }
      openPart(part, request.id);
    }
    if (purchase) markPurchaseRequired(purchase.dataset.purchaseRequest);
  });

  loadParts();
})();
