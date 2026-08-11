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

  // Dark/light mode is handled centrally by admin-sidebar.js (per-admin
  // localStorage preference) — this page no longer sets its own theme or
  // reads/writes a shared company-wide setting.

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
  const money = (value) => `TZS ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

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
          ${request.customerId ? `<button class="proforma-button" data-generate-proforma="${escapeHtml(request.id)}">+ Generate Proforma</button>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  let selectedPartIds = new Set();

  function updateSelectedCount() {
    document.getElementById("selectedPartsCount").textContent = `${selectedPartIds.size} selected`;
    document.getElementById("exportSelectedButton").disabled = selectedPartIds.size === 0;
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
      <thead><tr><th></th><th>Part number</th><th>Reference No.</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Purchase</th><th>Selling</th><th>Profit</th><th></th></tr></thead>
      <tbody>${filtered.map((part) => {
        const profit = Number(part.sellingPrice || 0) - Number(part.purchasePrice || 0);
        const stockQty = Number(part.stockQty || 0);
        const stockClass = stockQty <= 0 ? "off" : stockQty <= 5 ? "warn" : "";
        return `<tr>
          <td><input type="checkbox" data-select-part="${escapeHtml(part.id)}" ${selectedPartIds.has(part.id) ? "checked" : ""}></td>
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
    updateSelectedCount();
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
  document.getElementById("partsPanel").addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-part]");
    if (!checkbox) return;
    if (checkbox.checked) selectedPartIds.add(checkbox.dataset.selectPart);
    else selectedPartIds.delete(checkbox.dataset.selectPart);
    updateSelectedCount();
  });

  document.getElementById("selectLowStockButton").addEventListener("click", () => {
    parts.forEach((part) => {
      if (Number(part.stockQty || 0) <= 5) selectedPartIds.add(part.id);
    });
    renderParts();
  });

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  document.getElementById("exportSelectedButton").addEventListener("click", () => {
    const selected = parts.filter((part) => selectedPartIds.has(part.id));
    if (!selected.length) return;
    const headers = ["Part Number", "Reference No.", "Name", "Category", "Current Stock", "Reorder Threshold", "Suggested Order Qty", "Purchase Price", "Notes"];
    const rows = selected.map((part) => {
      const stockQty = Number(part.stockQty || 0);
      const reorder = Number(part.reorderThreshold || 5);
      const suggestedQty = Math.max(reorder * 2 - stockQty, reorder);
      return [
        part.partNumber, part.referenceNumber || "", part.name, part.category || "",
        stockQty, reorder, suggestedQty, part.purchasePrice || 0,
        stockQty <= 0 ? "OUT OF STOCK" : "LOW STOCK",
      ].map(csvEscape).join(",");
    });
    const csv = [headers.map(csvEscape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `BELM-restock-order-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showAlert(`Exported ${selected.length} part(s) to CSV — ready to send to your supplier.`);
  });

  // ------------------------------------------------------------------
  // IMPORT CSV — bulk add/update spare parts. Expected header row:
  // Part Number, Reference No., Name, Category, Stock, Reorder,
  // Purchase, Selling  (case-insensitive, extra/missing columns tolerated)
  // ------------------------------------------------------------------
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') inQuotes = false;
        else field += char;
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field); field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  document.getElementById("importButton").addEventListener("click", () =>
    document.getElementById("importFileInput").click());

  document.getElementById("importFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      showAlert("That CSV file has no data rows to import.", true);
      return;
    }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => names.map((n) => header.indexOf(n)).find((i) => i !== -1) ?? -1;
    const idx = {
      partNumber: col("part number", "partnumber", "part no", "part_number"),
      referenceNumber: col("reference no.", "reference no", "reference number", "referencenumber"),
      name: col("name", "spare part name"),
      category: col("category"),
      stockQty: col("stock", "current stock", "stockqty"),
      reorderThreshold: col("reorder", "reorder threshold", "reorderthreshold"),
      purchasePrice: col("purchase", "purchase price", "purchaseprice"),
      sellingPrice: col("selling", "selling price", "sellingprice"),
    };
    if (idx.partNumber === -1 || idx.name === -1) {
      showAlert("CSV must include at least a 'Part Number' and 'Name' column.", true);
      return;
    }

    const button = document.getElementById("importButton");
    button.disabled = true;
    button.textContent = "Importing…";
    let created = 0, updated = 0, failed = 0;
    for (const row of rows.slice(1)) {
      const partNumber = (row[idx.partNumber] || "").trim();
      const name = (row[idx.name] || "").trim();
      if (!partNumber || !name) { failed++; continue; }
      const existing = parts.find((p) => p.partNumber.toUpperCase() === partNumber.toUpperCase());
      const payload = {
        partNumber,
        name,
        referenceNumber: idx.referenceNumber !== -1 ? (row[idx.referenceNumber] || "").trim() : (existing?.referenceNumber || ""),
        category: idx.category !== -1 ? (row[idx.category] || "").trim() : (existing?.category || ""),
        stockQty: idx.stockQty !== -1 ? Number(row[idx.stockQty] || 0) : (existing?.stockQty ?? 0),
        reorderThreshold: idx.reorderThreshold !== -1 ? Number(row[idx.reorderThreshold] || 5) : (existing?.reorderThreshold ?? 5),
        purchasePrice: idx.purchasePrice !== -1 ? Number(row[idx.purchasePrice] || 0) : (existing?.purchasePrice ?? 0),
        sellingPrice: idx.sellingPrice !== -1 ? Number(row[idx.sellingPrice] || 0) : (existing?.sellingPrice ?? 0),
      };
      try {
        if (existing) {
          await api(`/spare-parts/${existing.id}`, { method: "PUT", body: JSON.stringify(payload) });
          updated++;
        } else {
          await api("/spare-parts", { method: "POST", body: JSON.stringify(payload) });
          created++;
        }
      } catch (_) {
        failed++;
      }
    }
    button.disabled = false;
    button.textContent = "Import CSV";
    await loadParts();
    showAlert(`Import complete — ${created} added, ${updated} updated${failed ? `, ${failed} failed` : ""}.`, failed > 0 && created === 0 && updated === 0);
  });

  document.getElementById("requestsPanel").addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-request]");
    const purchase = event.target.closest("[data-purchase-request]");
    const resolve = event.target.closest("[data-resolve-request]");
    const generateProforma = event.target.closest("[data-generate-proforma]");
    if (generateProforma) {
      const request = requests.find((item) => item.id === generateProforma.dataset.generateProforma);
      if (!request) return;
      sessionStorage.setItem("belm_prefill_proforma", JSON.stringify({
        customerId: request.customerId,
        partNumber: request.partNumber || request.referenceNumber || "",
        description: request.description || request.partName || "Spare part",
        qty: request.quantity || 1,
        unitPrice: request.sellingPrice || 0,
      }));
      window.location.href = "/billing-manager/#new-proforma";
    }
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
