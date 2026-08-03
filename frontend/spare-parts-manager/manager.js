(function () {
  const token = localStorage.getItem("belm_admin_token");
  let parts = [];
  let requests = [];
  let activeRequestId = "";
  let pendingEditPin = null;

  async function confirmThenOpen(title, message, openFn) {
    const confirmation = await window.belmConfirmEdit({ title, message });
    if (!confirmation) return;
    pendingEditPin = confirmation.editPin;
    openFn();
  }

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
      Number(part.stockQty || 0) <= 5).length.toLocaleString();
  }

  function renderRequests() {
    const panel = document.getElementById("requestsPanel");
    const count = document.getElementById("requestCount");
    count.textContent = `${requests.length.toLocaleString()} open`;
    if (!requests.length) {
      panel.className = "empty";
      panel.textContent = "No open spare-part requests.";
      return;
    }

    panel.className = "request-grid";
    panel.innerHTML = requests.map((request) => {
      const machineName = [request.machineBrand, request.machineModel].filter(Boolean).join(" ") || "Machine";
      const reference = request.serialNumber || request.regNumber || "No serial recorded";
      const purchaseRequired = request.status === "PURCHASE_REQUIRED";
      const isCustom = !request.sparePartId;
      const title = isCustom
        ? (request.referenceNumber ? `${request.referenceNumber} — ${request.description || ""}` : (request.description || "Custom part"))
        : `${request.partNumber} — ${request.description || request.partName}`;
      return `<article class="request-card${purchaseRequired ? " purchase" : ""}">
        <div class="request-card-head">
          <div>
            <span class="badge ${purchaseRequired ? "off" : "warn"}">${purchaseRequired ? "PURCHASE REQUIRED" : (isCustom ? "NOT IN INVENTORY" : "STOCK 0 · NEW REQUEST")}</span>
            <h3>${escapeHtml(title)}</h3>
          </div>
          ${isCustom ? "" : `<strong>Stock ${escapeHtml(request.stockQty ?? 0)}</strong>`}
        </div>
        <dl>
          <div><dt>Machine</dt><dd>${escapeHtml(machineName)} · ${escapeHtml(reference)}</dd></div>
          <div><dt>Machine type</dt><dd>${escapeHtml(request.machineType || "—")}</dd></div>
          <div><dt>Customer</dt><dd>${escapeHtml(request.customerName || "—")}</dd></div>
          <div><dt>Requested by</dt><dd>${escapeHtml(request.requestedByName || "Customer")}</dd></div>
          <div><dt>Quantity</dt><dd>${escapeHtml(request.quantity ?? 1)}</dd></div>
        </dl>
        <div class="row-actions request-actions">
          ${isCustom
            ? `<button class="purchase-button" data-purchase-request="${escapeHtml(request.id)}"${purchaseRequired ? " disabled" : ""}>${purchaseRequired ? "Awaiting Purchase" : "Purchase Required"}</button>
               <button data-resolve-request="${escapeHtml(request.id)}">Mark Fulfilled</button>`
            : `<button data-add-request="${escapeHtml(request.id)}">Add to Inventory</button>
               <button class="purchase-button" data-purchase-request="${escapeHtml(request.id)}"${purchaseRequired ? " disabled" : ""}>${purchaseRequired ? "Awaiting Purchase" : "Purchase Required"}</button>`}
        </div>
      </article>`;
    }).join("");
  }

  function renderParts() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = parts.filter((part) =>
      [part.partNumber, part.referenceNumber, part.name, part.category].some((value) => String(value || "").toLowerCase().includes(query)));
    const panel = document.getElementById("partsPanel");
    if (!filtered.length) {
      panel.className = "empty";
      panel.textContent = query ? "No spare parts match this search." : "No spare parts saved yet. Select “Add spare part” to create the first record.";
      return;
    }

    panel.className = "table-wrap";
    panel.innerHTML = `<table>
      <thead><tr><th>Part number</th><th>Reference No.</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Purchase</th><th>Selling</th><th>Profit</th><th></th></tr></thead>
      <tbody>${filtered.map((part) => {
        const profit = Number(part.sellingPrice || 0) - Number(part.purchasePrice || 0);
        const stockQty = Number(part.stockQty || 0);
        const stockClass = stockQty <= 0 ? "off" : stockQty <= 5 ? "warn" : "";
        return `<tr>
          <td class="nowrap"><strong>${escapeHtml(part.partNumber)}</strong></td>
          <td class="muted nowrap">${escapeHtml(part.referenceNumber || "—")}</td>
          <td>${escapeHtml(part.name)}</td>
          <td class="muted">${escapeHtml(part.category || "—")}</td>
          <td><span class="badge ${stockClass}">${escapeHtml(part.stockQty)}</span></td>
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
    document.getElementById("referenceNumber").value = part?.referenceNumber || "";
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
    pendingEditPin = null;
    document.getElementById("partDialog").close();
  }

  async function savePart(event) {
    event.preventDefault();
    const id = document.getElementById("partId").value;
    const resolvingRequestId = activeRequestId;
    const payload = {
      partNumber: document.getElementById("partNumber").value.trim(),
      referenceNumber: document.getElementById("referenceNumber").value.trim(),
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
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
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
    if (!part) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete spare part?",
      message: `Delete ${part.partNumber} — ${part.name}? It will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/spare-parts/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
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

  async function markFulfilled(id) {
    try {
      await api(`/spare-parts/requests/${id}`, {
        method: "PUT",
        body: JSON.stringify({ action: "resolve" }),
      });
      await loadParts();
      showAlert("Marked as fulfilled — customer's part has been sourced.");
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
    if (edit) {
      const part = parts.find((item) => item.id === edit.dataset.edit);
      confirmThenOpen("Edit spare part?", `Confirm you want to edit ${part?.name || "this spare part"}.`, () => openPart(part));
    }
    if (remove) deletePart(remove.dataset.delete);
  });
  document.getElementById("requestsPanel").addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-request]");
    const purchase = event.target.closest("[data-purchase-request]");
    const resolve = event.target.closest("[data-resolve-request]");
    if (resolve) markFulfilled(resolve.dataset.resolveRequest);
    if (add) {
      const request = requests.find((item) => item.id === add.dataset.addRequest);
      const part = request && parts.find((item) => item.id === request.sparePartId);
      if (!request || !part) {
        showAlert("The linked spare-part record could not be opened.", true);
        return;
      }
      confirmThenOpen("Edit spare part?", `Confirm you want to edit ${part.name}.`, () => openPart(part, request.id));
    }
    if (purchase) markPurchaseRequired(purchase.dataset.purchaseRequest);
  });

  loadParts();
})();
