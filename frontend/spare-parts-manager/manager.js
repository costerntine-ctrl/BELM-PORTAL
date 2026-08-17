(function () {
  const token = localStorage.getItem("belm_admin_token");
  let parts = [];
  let equivalentsIndex = {};
  let equivalentLinks = [];
  let requests = [];
  let activeRequestId = "";
  let choosingRequestId = "";
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
      const selected = Boolean(request.sparePartId);
      const stockQty = Number(request.stockQty || 0);
      const customerRequest = Boolean(request.customerId) && !request.requestedById;
      const title = selected
        ? `${request.partNumber || ""} — ${request.partName || request.description || "Spare part"}`
        : (request.referenceNumber ? `${request.referenceNumber} — ${request.description || ""}` : (request.description || "Spare request"));
      const badgeText = purchaseRequired
        ? "PURCHASE REQUIRED"
        : selected
          ? (stockQty > 0 ? "BELM SPARE SELECTED · IN STOCK" : "BELM SPARE SELECTED · STOCK 0")
          : (customerRequest ? "CUSTOMER REQUEST · SELECT SPARE" : "TECHNICIAN REQUEST");
      return `<article class="request-card${purchaseRequired ? " purchase" : ""}">
        <div class="request-card-head">
          <div>
            <span class="badge ${purchaseRequired ? "off" : "warn"}">${escapeHtml(badgeText)}</span>
            <h3>${escapeHtml(title)}</h3>
          </div>
          ${selected ? `<strong>Stock ${escapeHtml(stockQty)}</strong>` : ""}
        </div>
        <dl>
          <div><dt>Machine</dt><dd>${escapeHtml(machineName)} · ${escapeHtml(reference)}</dd></div>
          <div><dt>Machine type</dt><dd>${escapeHtml(request.machineType || "—")}</dd></div>
          <div><dt>Customer</dt><dd>${escapeHtml(request.customerName || "—")}</dd></div>
          <div><dt>Requested by</dt><dd>${escapeHtml(request.requestedByName || "Customer")}</dd></div>
          <div><dt>Quantity</dt><dd>${escapeHtml(request.quantity ?? 1)}</dd></div>
          ${selected && request.description ? `<div><dt>Customer asked</dt><dd>${escapeHtml(request.description)}</dd></div>` : ""}
        </dl>
        <div class="row-actions request-actions">
          ${!selected ? `<button data-choose-request="${escapeHtml(request.id)}">Choose BELM Spare</button>` : ""}
          ${selected && stockQty <= 0 ? `<button data-add-request="${escapeHtml(request.id)}">Add / Receive Stock</button>` : ""}
          <button class="purchase-button" data-purchase-request="${escapeHtml(request.id)}"${purchaseRequired ? " disabled" : ""}>${purchaseRequired ? "Awaiting Purchase" : "Purchase Required"}</button>
          ${request.customerId && selected ? `<button class="proforma-button" data-generate-proforma="${escapeHtml(request.id)}">Generate Proforma</button>` : ""}
          ${selected && stockQty >= Number(request.quantity || 1) ? `<button data-resolve-request="${escapeHtml(request.id)}">Mark Fulfilled</button>` : ""}
        </div>
      </article>`;
    }).join("");
  }

  let selectedPartIds = new Set();

  function updateSelectedCount() {
    document.getElementById("selectedPartsCount").textContent = `${selectedPartIds.size} selected`;
    document.getElementById("exportSelectedButton").disabled = selectedPartIds.size === 0;
  }


  function renderEquivalentSummary() {
    const panel = document.getElementById("equivalentSummaryPanel");
    const count = document.getElementById("equivalentPairCount");
    if (!panel || !count) return;
    count.textContent = `${equivalentLinks.length.toLocaleString()} link${equivalentLinks.length === 1 ? "" : "s"}`;
    if (!equivalentLinks.length) {
      panel.className = "empty";
      panel.innerHTML = 'No equivalent spare links yet. Open <strong>Spare Parts Inventory</strong>, edit a spare, then use <strong>Equivalent spare parts</strong> to link an approved alternative.';
      return;
    }
    panel.className = "equivalent-summary-grid";
    panel.innerHTML = equivalentLinks.map((link) => `
      <article class="equivalent-summary-card">
        <div class="equivalent-summary-link">
          <div class="equivalent-summary-part">
            <strong>${escapeHtml(link.partANumber)} — ${escapeHtml(link.partAName)}</strong>
            <span>${escapeHtml(link.partAReference || "No reference number")}</span>
            <small>Stock ${escapeHtml(link.partAStock ?? 0)}</small>
          </div>
          <div class="equivalent-summary-symbol" aria-label="Equivalent to">≈</div>
          <div class="equivalent-summary-part">
            <strong>${escapeHtml(link.partBNumber)} — ${escapeHtml(link.partBName)}</strong>
            <span>${escapeHtml(link.partBReference || "No reference number")}</span>
            <small>Stock ${escapeHtml(link.partBStock ?? 0)}</small>
          </div>
        </div>
        <div class="equivalent-summary-actions">
          <button type="button" data-equivalent-edit="${escapeHtml(link.partAId)}">Open ${escapeHtml(link.partANumber)}</button>
          <button type="button" data-equivalent-edit="${escapeHtml(link.partBId)}">Open ${escapeHtml(link.partBNumber)}</button>
        </div>
      </article>`).join("");
  }

  function renderParts() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = parts.filter((part) => {
      const ownMatch = [part.partNumber, part.referenceNumber, part.name, part.category]
        .some((value) => String(value || "").toLowerCase().includes(query));
      if (ownMatch) return true;
      // Also match if the query hits one of this part's linked
      // equivalents — e.g. searching "670" for an LF670 finds the part
      // that's been marked equivalent to it too.
      const linked = equivalentsIndex[part.id] || [];
      return linked.some((text) => text.toLowerCase().includes(query));
    });
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
          <td class="nowrap"><strong>${escapeHtml(part.partNumber)}</strong>${part.equivalentCount > 0 ? ` <span class="badge" title="Linked equivalent spare parts">≈${escapeHtml(part.equivalentCount)}</span>` : ""}</td>
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
      window.location.href = "/login";
      return;
    }
    try {
      parts = await api("/spare-parts");
      requests = await api("/spare-parts/requests");
      try { equivalentsIndex = await api("/spare-parts?action=all-equivalents"); } catch (_) { equivalentsIndex = {}; }
      try { equivalentLinks = await api("/spare-parts?action=equivalent-links"); } catch (_) { equivalentLinks = []; }
      updateMetrics();
      renderParts();
      renderRequests();
      renderEquivalentSummary();
      if (window.location.hash === "#equivalent-spares-panel") {
        requestAnimationFrame(() => document.getElementById("equivalent-spares-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (error) {
      document.getElementById("partsPanel").className = "empty";
      document.getElementById("partsPanel").innerHTML = `${escapeHtml(error.message)}<br><a href="/login">Go to admin login</a>`;
      showAlert(error.message, true);
    }
  }

  function toggleMeasurementFields() {
    const category = document.getElementById("category").value;
    document.querySelectorAll("#measurementsBlock [data-measure]").forEach((label) => {
      const categories = label.dataset.measure.split(",");
      label.classList.toggle("hidden", category !== "" && !categories.includes(category));
    });
  }
  document.getElementById("category").addEventListener("change", toggleMeasurementFields);

  function openPart(part = null, requestId = "") {
    activeRequestId = requestId;
    document.getElementById("partForm").reset();
    document.getElementById("partId").value = part?.id || "";
    document.getElementById("dialogTitle").textContent = part ? "Edit spare part" : "Add spare part";
    document.getElementById("partNumber").value = part?.partNumber || "";
    document.getElementById("referenceNumber").value = part?.referenceNumber || "";
    document.getElementById("partName").value = part?.name || "";
    document.getElementById("category").value = part?.category || "";
    document.getElementById("machineBrand").value = part?.machineBrand || "";
    document.getElementById("machineType").value = part?.machineType || "";
    document.getElementById("stockQty").value = part?.stockQty ?? 0;
    document.getElementById("reorderThreshold").value = part?.reorderThreshold ?? 5;
    document.getElementById("purchasePrice").value = part?.purchasePrice ?? 0;
    document.getElementById("sellingPrice").value = part?.sellingPrice ?? 0;
    document.getElementById("heightMm").value = part?.heightMm ?? "";
    document.getElementById("lengthMm").value = part?.lengthMm ?? "";
    document.getElementById("outerDiameterMm").value = part?.outerDiameterMm ?? "";
    document.getElementById("innerDiameterMm").value = part?.innerDiameterMm ?? "";
    document.getElementById("threadSize").value = part?.threadSize || "";
    toggleMeasurementFields();
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
    const equivalentsBlock = document.getElementById("equivalentsBlock");
    if (part?.id) {
      equivalentsBlock.classList.remove("hidden");
      loadEquivalents(part.id);
    } else {
      equivalentsBlock.classList.add("hidden");
    }
    document.getElementById("partDialog").showModal();
    document.getElementById("partNumber").focus();
  }

  async function loadEquivalents(partId) {
    const list = document.getElementById("equivalentsList");
    list.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const equivalents = await api(`/spare-parts/${partId}?action=equivalents`);
      list.innerHTML = equivalents.length
        ? equivalents.map((eq) => `
            <div class="equivalent-chip">
              <span>${escapeHtml(eq.name)} (${escapeHtml(eq.partNumber)})</span>
              <button type="button" data-unlink-equivalent="${escapeHtml(eq.id)}">×</button>
            </div>`).join("")
        : '<p class="muted">No equivalents linked yet.</p>';
    } catch (error) {
      list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  let equivalentSearchTimer = null;
  document.getElementById("equivalentSearchInput").addEventListener("input", (event) => {
    clearTimeout(equivalentSearchTimer);
    const query = event.target.value.trim();
    const resultsBox = document.getElementById("equivalentSearchResults");
    if (!query) {
      resultsBox.classList.add("hidden");
      resultsBox.innerHTML = "";
      return;
    }
    equivalentSearchTimer = setTimeout(async () => {
      try {
        const currentPartId = document.getElementById("partId").value;
        const results = await api(`/spare-parts?action=search-with-equivalents&q=${encodeURIComponent(query)}`);
        const filtered = results.filter((r) => r.id !== currentPartId);
        resultsBox.innerHTML = filtered.length
          ? filtered.map((r) => `
              <button type="button" class="equivalent-search-result" data-add-equivalent="${escapeHtml(r.id)}">
                ${escapeHtml(r.name)} (${escapeHtml(r.part_number || r.partNumber)})
              </button>`).join("")
          : '<p class="muted">No matches.</p>';
        resultsBox.classList.remove("hidden");
      } catch (_) { /* keep the box quiet on failure */ }
    }, 300);
  });

  document.getElementById("equivalentSearchResults").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-add-equivalent]");
    if (!button) return;
    const partId = document.getElementById("partId").value;
    try {
      await api("/spare-parts?action=link-equivalent", {
        method: "POST",
        body: JSON.stringify({ partId, equivalentPartId: button.dataset.addEquivalent }),
      });
      document.getElementById("equivalentSearchInput").value = "";
      document.getElementById("equivalentSearchResults").classList.add("hidden");
      await loadEquivalents(partId);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  document.getElementById("equivalentsList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-unlink-equivalent]");
    if (!button) return;
    const partId = document.getElementById("partId").value;
    try {
      await api(`/spare-parts?action=unlink-equivalent&partId=${encodeURIComponent(partId)}&equivalentPartId=${encodeURIComponent(button.dataset.unlinkEquivalent)}`, {
        method: "DELETE",
      });
      await loadEquivalents(partId);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

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
      machineBrand: document.getElementById("machineBrand").value.trim(),
      machineType: document.getElementById("machineType").value.trim(),
      stockQty: Number(document.getElementById("stockQty").value),
      reorderThreshold: Number(document.getElementById("reorderThreshold").value),
      purchasePrice: Number(document.getElementById("purchasePrice").value),
      sellingPrice: Number(document.getElementById("sellingPrice").value),
      heightMm: document.getElementById("heightMm").value.trim(),
      lengthMm: document.getElementById("lengthMm").value.trim(),
      outerDiameterMm: document.getElementById("outerDiameterMm").value.trim(),
      innerDiameterMm: document.getElementById("innerDiameterMm").value.trim(),
      threadSize: document.getElementById("threadSize").value.trim(),
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
      const result = await api(id ? `/spare-parts/${id}` : "/spare-parts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (resolvingRequestId) {
        await api(`/spare-parts/requests/${resolvingRequestId}`, {
          method: "PUT",
          body: JSON.stringify({ action: "resolve" }),
        });
      }
      // A brand-new part doesn't have equivalents linked yet — reopen it
      // in edit mode right away so the "Equivalent spare parts" search
      // becomes available without a second manual click.
      if (!id && result?.id) {
        closePart();
        await loadParts();
        const savedPart = parts.find((item) => item.id === result.id);
        if (savedPart) { openPart(savedPart); return; }
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


  function renderChooseSpareResults() {
    const query = document.getElementById("chooseSpareSearch").value.trim().toLowerCase();
    const list = parts.filter((part) => !query || [part.partNumber, part.referenceNumber, part.name, part.category]
      .some((value) => String(value || "").toLowerCase().includes(query)));
    const box = document.getElementById("chooseSpareResults");
    box.innerHTML = list.length ? list.slice(0, 100).map((part) => `
      <label class="spare-choice">
        <input type="radio" name="chosenSpare" value="${escapeHtml(part.id)}">
        <span><strong>${escapeHtml(part.partNumber)} — ${escapeHtml(part.name)}</strong><small>${escapeHtml(part.referenceNumber || "No reference")} · ${money(part.sellingPrice)}</small></span>
        <span class="badge">Stock ${escapeHtml(part.stockQty ?? 0)}</span>
      </label>`).join("") : '<div class="empty">No BELM spare matches this search.</div>';
  }

  function openChooseSpare(requestId) {
    const request = requests.find((item) => item.id === requestId);
    if (!request) return;
    choosingRequestId = requestId;
    document.getElementById("chooseSpareSearch").value = request.referenceNumber || request.description || "";
    document.getElementById("chooseSpareContext").textContent =
      `Customer requested: ${request.description || request.referenceNumber || "Spare part"} · Qty ${request.quantity || 1}. Selection below is internal to BELM.`;
    renderChooseSpareResults();
    document.getElementById("chooseSpareDialog").showModal();
  }

  function closeChooseSpare() {
    choosingRequestId = "";
    document.getElementById("chooseSpareDialog").close();
  }

  document.getElementById("chooseSpareSearch").addEventListener("input", renderChooseSpareResults);
  document.querySelectorAll("[data-close-choose]").forEach((button) => button.addEventListener("click", closeChooseSpare));
  document.getElementById("chooseSpareForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const sparePartId = document.querySelector('input[name="chosenSpare"]:checked')?.value || "";
    if (!sparePartId) { showAlert("Choose the BELM spare that matches this customer request.", true); return; }
    const button = document.getElementById("chooseSpareSave");
    button.disabled = true;
    try {
      const result = await api(`/spare-parts/requests/${encodeURIComponent(choosingRequestId)}`, {
        method: "PUT",
        body: JSON.stringify({ action: "select-spare", sparePartId }),
      });
      closeChooseSpare();
      await loadParts();
      showAlert(result?.message || "BELM spare selected. Accounts can now prepare the Proforma.");
    } catch (error) {
      showAlert(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

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
      showAlert("Spare request marked Purchase Required.");
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
    const choose = event.target.closest("[data-choose-request]");
    if (choose) openChooseSpare(choose.dataset.chooseRequest);
    if (generateProforma) {
      const request = requests.find((item) => item.id === generateProforma.dataset.generateProforma);
      if (!request) return;
      sessionStorage.setItem("belm_prefill_proforma", JSON.stringify({
        customerId: request.customerId,
        partNumber: request.partNumber || request.referenceNumber || "",
        description: request.description || request.partName || "Spare part",
        qty: request.quantity || 1,
        unitPrice: request.sellingPrice || 0,
        sourceSpareRequestId: request.id,
        machineId: request.machineId || "",
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


  document.getElementById("equivalentSummaryPanel")?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-equivalent-edit]");
    if (!edit) return;
    const part = parts.find((item) => item.id === edit.dataset.equivalentEdit);
    if (!part) { showAlert("That spare-part record could not be opened.", true); return; }
    confirmThenOpen("Review equivalent spare?", `Open ${part.partNumber} — ${part.name} to review its equivalent links.`, () => openPart(part));
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#equivalent-spares-panel") {
      document.getElementById("equivalent-spares-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  loadParts();
})();
