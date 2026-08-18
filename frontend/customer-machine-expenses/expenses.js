(function () {
  const token = localStorage.getItem("belm_customer_token");
  const machineId = new URLSearchParams(window.location.search).get("machine") || "";
  const alertBox = document.getElementById("alertBox");
  let receiptPhotoData = "";
  let receiptPhotoName = "";
  let openReceiptUrl = "";
  let storeItemsCache = [];
  let canManageStore = false;
  let canApproveStoreIssue = false;
  let canManageProcurement = false;
  let procurementRequestsCache = [];
  const money = new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 2,
  });

  if (!token) {
    window.location.replace("/login");
    return;
  }
  if (!machineId) {
    showAlert("Choose a machine from the Customer dashboard.", true);
    document.getElementById("entryPanel").classList.add("hidden");
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

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return `${formatDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
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

  function showAlert(message, isError = false) {
    alertBox.textContent = message;
    alertBox.className = `alert${isError ? " error" : ""}`;
  }

  function clearAlert() {
    alertBox.textContent = "";
    alertBox.className = "alert hidden";
  }

  function hasReceipt(value) {
    return value === true || value === 1 || value === "1" || value === "t" || value === "true";
  }

  function clearReceiptInput() {
    receiptPhotoData = "";
    receiptPhotoName = "";
    document.getElementById("receiptPhoto").value = "";
    const preview = document.getElementById("receiptPreview");
    preview.removeAttribute("src");
    preview.style.display = "";
    const pdfBadge = document.getElementById("receiptPdfBadge");
    if (pdfBadge) pdfBadge.style.display = "none";
    document.getElementById("receiptPreviewWrap").classList.add("hidden");
  }

  function compressReceipt(file) {
    if (file.type === "application/pdf") {
      return new Promise((resolve, reject) => {
        if (file.size > 4 * 1024 * 1024) {
          reject(new Error("Receipt PDF is too large (max 4MB)."));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the receipt PDF."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        reject(new Error("Receipt must be a JPG, PNG, WebP image, or a PDF."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the receipt photo."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Receipt photo is not a valid image."));
        image.onload = () => {
          const maximum = 1280;
          const scale = Math.min(1, maximum / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL("image/jpeg", 0.78);
          if (compressed.length > 2.8 * 1024 * 1024) {
            reject(new Error("Receipt photo is too large. Choose a smaller or clearer crop."));
            return;
          }
          resolve(compressed);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
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
      if (response.status === 401) {
        localStorage.removeItem("belm_customer_token");
        window.location.replace("/login");
      }
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }

  function calculateTotal() {
    const quantity = Number(document.getElementById("quantity").value || 0);
    const unitPrice = Number(document.getElementById("unitPrice").value || 0);
    document.getElementById("calculatedTotal").textContent =
      `Total: ${money.format(quantity * unitPrice)}`;
  }

  function storeItemForPart(partNumber) {
    const key = String(partNumber || "").trim().toUpperCase();
    return storeItemsCache.find(item => String(item.partNumber || "").trim().toUpperCase() === key) || null;
  }

  function syncStoreIssueForm() {
    const source = document.getElementById("stockSource").value;
    const unitPrice = document.getElementById("unitPrice");
    const hint = document.getElementById("storeIssueHint");
    if (source !== "CUSTOMER_STORE") {
      unitPrice.readOnly = false;
      hint.classList.add("hidden");
      calculateTotal();
      return;
    }
    const item = storeItemForPart(document.getElementById("partNumber").value);
    unitPrice.readOnly = true;
    if (!item) {
      hint.innerHTML = '<b>Customer Store:</b> Part number not found. Receive stock first or choose Direct purchase.';
      hint.classList.remove("hidden");
      unitPrice.value = "0";
      calculateTotal();
      return;
    }
    document.getElementById("description").value = item.description || document.getElementById("description").value.trim();
    document.getElementById("unit").value = ["PC", "SET", "L", "KG"].includes(item.unit) ? item.unit : "PC";
    unitPrice.value = Number(item.averageUnitCost || 0).toFixed(2);
    const requested = Number(document.getElementById("quantity").value || 0);
    const balance = Number(item.qtyOnHand || 0);
    const after = balance - requested;
    hint.innerHTML = `<b>Customer Store balance:</b> ${balance.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")} available · after this issue: <b class="${after < 0 ? "negative" : ""}">${after.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</b>`;
    hint.classList.remove("hidden");
    calculateTotal();
  }

  function procurementShortage(item) {
    const required = Number(item.quantity || 0);
    const current = Number(item.currentStoreBalance ?? item.storeAvailableAtRequest ?? 0);
    return Math.max(0, required - Math.max(0, current));
  }

  function selectedProcurementRequests() {
    const ids = new Set([...document.querySelectorAll("[data-procurement-select]:checked")].map(input => input.dataset.procurementSelect));
    return procurementRequestsCache.filter(item => ids.has(String(item.id)));
  }

  function renderProcurementRequests(items) {
    procurementRequestsCache = Array.isArray(items) ? items : [];
    const open = procurementRequestsCache.filter(item => !["PARTS_READY","REJECTED"].includes(String(item.status || "")));
    document.getElementById("procurementRequestCount").textContent = `${open.length} open`;
    document.getElementById("procurementRequestRows").innerHTML = procurementRequestsCache.length
      ? procurementRequestsCache.map(item => {
          const status = String(item.status || "PENDING_PROCUREMENT");
          const current = Number(item.currentStoreBalance ?? item.storeAvailableAtRequest ?? 0);
          const qty = Number(item.quantity || 0);
          const shortage = procurementShortage(item);
          const inStore = Boolean(item.currentStoreItemId || item.storeItemId);
          const enough = inStore && shortage <= 0.00001 && qty > 0;
          const selectable = canManageProcurement && shortage > 0.00001 && ["PENDING_PROCUREMENT","PURCHASE_REQUIRED"].includes(status);
          let storeText = "NOT IN STORE";
          if (inStore && enough) storeText = `${current.toLocaleString("en-TZ")} ${item.unit || "PC"} AVAILABLE`;
          else if (inStore) storeText = `${current.toLocaleString("en-TZ")} ${item.unit || "PC"} IN STOCK`;
          let actions = "—";
          if (canManageProcurement && !["PARTS_READY","REJECTED"].includes(status)) {
            const buttons = [];
            if (status === "PENDING_PROCUREMENT") {
              if (enough) buttons.push(`<button class="store-action" type="button" data-procurement-action="ISSUE_STORE" data-procurement-id="${escapeHtml(item.id)}">Issue from Store</button>`);
              if (shortage > 0) buttons.push(`<button class="purchase-action" type="button" data-procurement-action="PURCHASE_REQUIRED" data-procurement-id="${escapeHtml(item.id)}">Purchase Required</button>`);
              buttons.push(`<button class="reject-action" type="button" data-procurement-action="REJECT" data-procurement-id="${escapeHtml(item.id)}">Reject</button>`);
            } else if (status === "PURCHASE_REQUIRED") {
              buttons.push(`<button class="purchase-action" type="button" data-procurement-action="ORDERED" data-procurement-id="${escapeHtml(item.id)}">Mark Ordered</button>`);
              buttons.push(`<button class="ready-action" type="button" data-procurement-action="PARTS_READY" data-procurement-id="${escapeHtml(item.id)}">Parts Ready</button>`);
              buttons.push(`<button class="reject-action" type="button" data-procurement-action="REJECT" data-procurement-id="${escapeHtml(item.id)}">Reject</button>`);
            } else if (status === "ORDERED") {
              buttons.push(`<button class="ready-action" type="button" data-procurement-action="PARTS_READY" data-procurement-id="${escapeHtml(item.id)}">Parts Received / Ready</button>`);
              buttons.push(`<button class="reject-action" type="button" data-procurement-action="REJECT" data-procurement-id="${escapeHtml(item.id)}">Reject</button>`);
            } else if (status === "BELM_REQUESTED") {
              buttons.push(`<button class="ready-action" type="button" data-procurement-action="PARTS_READY" data-procurement-id="${escapeHtml(item.id)}">BELM Parts Received / Ready</button>`);
            }
            actions = `<div class="procurement-actions">${buttons.join("")}</div>`;
          } else if (item.decisionNote || item.handledByName) {
            actions = escapeHtml(item.decisionNote || item.handledByName);
          }
          return `<tr>
            <td class="procurement-select-cell"><input type="checkbox" data-procurement-select="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(item.partNumber || item.description || "spare")}" ${selectable ? "" : "disabled"}></td>
            <td>${formatDateTime(item.requestedAt)}</td>
            <td><strong>${escapeHtml(item.partNumber || "-")}</strong><br><small>${escapeHtml(item.description || "-")}</small></td>
            <td>${qty.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</td>
            <td><div class="procurement-store-state"><b class="${enough ? "stock-ok" : "stock-zero"}">${escapeHtml(storeText)}</b><small>${enough ? "IN STORE" : inStore ? "STORE SHORTAGE" : "NOT IN STORE"}</small><span class="shortage-value ${shortage <= 0 ? "zero" : ""}">Shortage: ${shortage.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</span></div></td>
            <td>${escapeHtml(String(item.maintenanceSpareStatus || "PROCUREMENT REVIEW").replaceAll("_"," "))}</td>
            <td><span class="procurement-status ${status.toLowerCase()}">${escapeHtml(status.replaceAll("_"," "))}</span></td>
            <td>${escapeHtml(item.requestedByName || "Customer")}</td>
            <td class="procurement-action-cell">${actions}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="9" class="empty">No Procurement requests for this machine yet.</td></tr>';
  }

  function renderStoreApprovals(items) {
    const rows = Array.isArray(items) ? items : [];
    const pending = rows.filter(item => item.status === "PENDING_APPROVAL");
    document.getElementById("storeApprovalPanel").classList.toggle("hidden", rows.length === 0);
    document.getElementById("storeApprovalCount").textContent = `${pending.length} pending`;
    document.getElementById("storeApprovalRows").innerHTML = rows.length
      ? rows.map(item => {
          const status = String(item.status || "PENDING_APPROVAL");
          const current = Number(item.currentStoreBalance || 0);
          const qty = Number(item.quantity || 0);
          const enough = current + 0.00001 >= qty;
          const decision = status === "PENDING_APPROVAL" && canApproveStoreIssue
            ? `<div class="approval-actions">
                 <button type="button" class="approve-store-issue" data-approve-store-issue="${escapeHtml(item.id)}" ${enough ? "" : "disabled"}>Approve</button>
                 <button type="button" class="reject-store-issue" data-reject-store-issue="${escapeHtml(item.id)}">Reject</button>
               </div>${enough ? "" : '<small class="stock-warning">Insufficient balance now</small>'}`
            : escapeHtml(item.decisionNote || item.approvedByName || item.rejectedByName || "—");
          return `<tr>
            <td>${formatDateTime(item.requestedAt)}</td>
            <td><strong>${escapeHtml(item.partNumber || "-")}</strong></td>
            <td>${escapeHtml(item.description || "-")}</td>
            <td>${qty.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</td>
            <td><strong class="${enough ? "stock-ok" : "stock-zero"}">${current.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</strong></td>
            <td>${escapeHtml(item.requestedByName || "Customer")}</td>
            <td><span class="approval-status ${status.toLowerCase()}">${escapeHtml(status.replaceAll("_", " "))}</span></td>
            <td>${decision}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="8" class="empty">No Customer Store issue approvals for this machine.</td></tr>';
  }

  function renderStore(items, summary) {
    storeItemsCache = Array.isArray(items) ? items : [];
    const datalist = document.getElementById("storePartOptions");
    datalist.innerHTML = storeItemsCache.map(item =>
      `<option value="${escapeHtml(item.partNumber)}">${escapeHtml(item.description)} · Balance ${Number(item.qtyOnHand || 0).toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</option>`
    ).join("");
    document.getElementById("storeItemCount").textContent = Number(summary?.itemCount || 0).toLocaleString("en-TZ");
    document.getElementById("storeIssueCount").textContent = Number(summary?.machineIssueCount || 0).toLocaleString("en-TZ");
    document.getElementById("storeStockValueStrip").textContent = money.format(Number(summary?.stockValue || 0));
    document.getElementById("machineStoreIssued").textContent = money.format(Number(summary?.machineIssuedValue || 0));
    document.getElementById("customerStoreValue").textContent = money.format(Number(summary?.stockValue || 0));
    document.getElementById("storeRows").innerHTML = storeItemsCache.length
      ? storeItemsCache.map(item => {
          const balance = Number(item.qtyOnHand || 0);
          const avg = Number(item.averageUnitCost || 0);
          return `<tr>
            <td><strong>${escapeHtml(item.partNumber || "-")}</strong></td>
            <td>${escapeHtml(item.description || "-")}</td>
            <td>${escapeHtml(item.unit || "PC")}</td>
            <td>${Number(item.totalReceived || 0).toLocaleString("en-TZ")}</td>
            <td>${Number(item.totalIssued || 0).toLocaleString("en-TZ")}</td>
            <td><strong class="${balance <= 0 ? "stock-zero" : "stock-ok"}">${balance.toLocaleString("en-TZ")}</strong></td>
            <td>${money.format(avg)}</td>
            <td>${money.format(balance * avg)}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="8" class="empty">Customer Store is empty. Receive stock to start the ledger.</td></tr>';
    syncStoreIssueForm();
  }

  async function openBelmDocument(url, downloadName="") {
    try {
      const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok){let message='Could not open document.';try{const e=await response.json();message=e.error||message}catch(_){}throw new Error(message)}
      const blob=await response.blob();const objectUrl=URL.createObjectURL(blob);
      if(downloadName){const a=document.createElement('a');a.href=objectUrl;a.download=downloadName;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500)}
      else{window.open(objectUrl,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
    } catch(error){showAlert(error.message,true)}
  }

  function renderServiceJobBilling(items) {
    const rows=Array.isArray(items)?items:[];
    const body=document.getElementById('serviceBillingRows');if(!body)return;
    body.innerHTML=rows.length?rows.map(item=>{
      const paid=String(item.invoice_status||'').toUpperCase()==='PAID'||(item.invoice_id&&Number(item.balance||0)<=0.005);
      const paymentLabel=item.invoice_id?(paid?'PAID':'OUTSTANDING'):'NO INVOICE';
      const paymentClass=item.invoice_id?(paid?'paid':'outstanding'):'pending';
      const proformaReady=item.proforma_id&&['SENT','RESPONDED'].includes(String(item.proforma_status||''));
      return `<tr>
        <td><strong>${escapeHtml(item.job_card_no||'-')}</strong><small>${escapeHtml(item.title||'')}</small></td>
        <td>${escapeHtml(item.issued_by_name||'Customer')}<small>${formatDateTime(item.issued_at)}</small></td>
        <td><span class="sync-status paid">RECEIVED BY BELM</span><small>${formatDateTime(item.issued_at)}</small><small>Current: ${escapeHtml(String(item.status||'RECEIVED').replaceAll('_',' '))}</small></td>
        <td>${item.hasSignedCopy?`<span class="sync-status paid">SIGNED</span><button class="doc-button" type="button" data-signed-copy="${escapeHtml(item.id)}">View</button>`:'<span class="sync-status outstanding">WAITING SIGNATURE</span>'}</td>
        <td>${item.proforma_id?`<strong>${escapeHtml(item.proforma_no||'Proforma')}</strong>${proformaReady?`<button class="doc-button" type="button" data-proforma-download="${escapeHtml(item.proforma_id)}">Download</button>`:`<small>${escapeHtml(item.proforma_status||'DRAFT')}</small>`}`:'<span class="muted">Not prepared</span>'}</td>
        <td>${item.invoice_id?`<strong>${escapeHtml(item.invoice_no||'Invoice')}</strong><button class="doc-button" type="button" data-invoice-download="${escapeHtml(item.invoice_id)}">Download</button>`:'<span class="muted">Not issued</span>'}</td>
        <td>${item.invoice_id?money.format(Number(item.balance||0)):'—'}</td>
        <td><span class="sync-status ${paymentClass}">${paymentLabel}</span></td>
      </tr>`;
    }).join(''):'<tr><td colspan="8" class="empty">No BELM Service Job Card billing records for this machine yet.</td></tr>';
    body.querySelectorAll('[data-signed-copy]').forEach(b=>b.onclick=()=>openBelmDocument(`/api/breakdown-workflow/signed-job-card-file/${encodeURIComponent(b.dataset.signedCopy)}`));
    body.querySelectorAll('[data-proforma-download]').forEach(b=>b.onclick=()=>openBelmDocument(`/api/customer-portal/proformas/${encodeURIComponent(b.dataset.proformaDownload)}/download`,`BELM-Proforma-${b.dataset.proformaDownload}.pdf`));
    body.querySelectorAll('[data-invoice-download]').forEach(b=>b.onclick=()=>openBelmDocument(`/api/customer-portal/invoices/${encodeURIComponent(b.dataset.invoiceDownload)}/download`,`BELM-Invoice-${b.dataset.invoiceDownload}.pdf`));
  }

  function render(data) {
    const machine = data.machine || {};
    const summary = data.summary || {};
    document.getElementById("pageTitle").textContent =
      `${machine.brand ? `${machine.brand} ` : ""}${machine.model || "Machine"} procurement`;
    document.getElementById("machineDetails").textContent = [
      machine.machineType,
      machine.serialNumber ? `Serial: ${machine.serialNumber}` : "",
      machine.regNumber ? `Registration: ${machine.regNumber}` : "",
    ].filter(Boolean).join(" · ");
    document.getElementById("totalCost").textContent = money.format(Number(summary.totalCost || 0));
    document.getElementById("totalQuantity").textContent =
      Number(summary.totalQuantity || 0).toLocaleString("en-TZ");
    document.getElementById("recordCount").textContent =
      Number(summary.recordCount || 0).toLocaleString("en-TZ");
    document.getElementById("averageCost").textContent =
      money.format(Number(summary.averageCost || 0));
    document.getElementById("receiptCount").textContent =
      Number(summary.receiptCount || 0).toLocaleString("en-TZ");
    canManageStore = Boolean(data.canManageStore);
    canApproveStoreIssue = Boolean(data.canApproveStoreIssue);
    canManageProcurement = Boolean(data.canManageProcurement);
    ["selectShortageButton", "downloadPurchaseCsvButton", "sendBelmSupplyButton"].forEach(id => {
      const control = document.getElementById(id);
      if (control) control.classList.toggle("hidden", !canManageProcurement);
    });
    renderProcurementRequests(data.procurementRequests || []);
    renderServiceJobBilling(data.serviceJobBilling || []);
    renderStoreApprovals(data.storeIssueRequests || []);
    document.getElementById("receiveStockButton").classList.toggle("hidden", !canManageStore);
    const storeOption = document.querySelector('#stockSource option[value="CUSTOMER_STORE"]');
    if (storeOption) storeOption.disabled = !canManageStore;
    if (!canManageStore && document.getElementById("stockSource").value === "CUSTOMER_STORE") document.getElementById("stockSource").value = "DIRECT_PURCHASE";
    renderStore(data.storeItems || [], data.storeSummary || {});
    const movements = Array.isArray(data.storeMovements) ? data.storeMovements : [];
    document.getElementById("storeMovementRows").innerHTML = movements.length
      ? movements.map(move => {
          const machineLabel = [move.machineBrand, move.machineModel].filter(Boolean).join(" ") || "STORE";
          return `<tr>
            <td>${formatDateTime(move.createdAt)}</td>
            <td><span class="movement-badge ${String(move.movementType || "").toLowerCase()}">${escapeHtml(move.movementType || "-")}</span></td>
            <td><strong>${escapeHtml(move.partNumber || "-")}</strong></td>
            <td>${escapeHtml(move.description || "-")}</td>
            <td>${Number(move.quantity || 0).toLocaleString("en-TZ")} ${escapeHtml(move.unit || "PC")}</td>
            <td><strong>${Number(move.balanceAfter || 0).toLocaleString("en-TZ")} ${escapeHtml(move.unit || "PC")}</strong></td>
            <td>${escapeHtml(machineLabel)}</td>
            <td>${escapeHtml(move.actorName || "-")}</td>
            <td>${escapeHtml(move.receivedBy || "-")}</td>
            <td>${escapeHtml(move.note || "-")}</td>
          </tr>`;
        }).join("")
      : '<tr><td colspan="10" class="empty">No Store movements are linked to this machine yet.</td></tr>';

    const rows = Array.isArray(data.expenses) ? data.expenses : [];
    document.getElementById("expenseRows").innerHTML = rows.length
      ? rows.map(expense => `<tr>
          <td>${formatDate(expense.date)}</td>
          <td><span class="source-badge ${expense.stockSource === "CUSTOMER_STORE" ? "store" : "direct"}">${expense.stockSource === "CUSTOMER_STORE" ? "Customer Store" : "Direct Purchase"}</span></td>
          <td><strong>${escapeHtml(expense.partNumber || "-")}</strong></td>
          <td>${escapeHtml(expense.description)}</td>
          <td>${Number(expense.quantity || 0).toLocaleString("en-TZ")} ${escapeHtml(expense.unit || "PC")}</td>
          <td>${money.format(Number(expense.unitPrice || 0))}</td>
          <td><strong>${money.format(Number(expense.cost || 0))}</strong></td>
          <td>${expense.storeBalanceAfter === null || expense.storeBalanceAfter === undefined ? "—" : `<strong>${Number(expense.storeBalanceAfter).toLocaleString("en-TZ")} ${escapeHtml(expense.unit || "PC")}</strong>`}</td>
          <td>${escapeHtml(expense.issuedBy || expense.loggedBy || "Customer")}</td>
          <td>${escapeHtml(expense.receivedBy || "—")}</td>
          <td>${hasReceipt(expense.hasReceipt)
            ? `<button class="receipt-button" type="button" data-receipt="${escapeHtml(expense.id)}">View</button>
               <button class="receipt-button" type="button" data-download-receipt="${escapeHtml(expense.id)}">Download</button>
               <button class="receipt-button" type="button" data-print-receipt="${escapeHtml(expense.id)}">Print</button>`
            : `<label class="receipt-upload-inline">
                 <span class="receipt-button">Upload</span>
                 <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-attach-receipt="${escapeHtml(expense.id)}" hidden>
               </label>`}</td>
        </tr>`).join("")
      : '<tr><td colspan="11" class="empty">No machine procurement/material records yet.</td></tr>';
  }

  function currentRangeQuery() {
    const scope = document.getElementById("printScope").value;
    if (scope === "date") {
      const value = document.getElementById("printDateInput").value;
      return value ? `?date=${encodeURIComponent(value)}` : "";
    }
    if (scope === "month") {
      const value = document.getElementById("printMonthInput").value;
      return value ? `?month=${encodeURIComponent(value)}` : "";
    }
    return "";
  }

  async function loadSidebarAnalysis() {
    try {
      const data = await api(`/machine-analysis/${encodeURIComponent(machineId)}`);
      document.getElementById("sidebarTotalExpenses").textContent = money.format(Number(data.machineExpensesTotal || 0));
      document.getElementById("sidebarServiceRequests").textContent =
        `${data.serviceRequests.total} (${data.serviceRequests.open} open)`;
      document.getElementById("sidebarChecklistReports").textContent = data.checklistReportsCount;
    } catch (_) {}
  }

  async function load() {
    clearAlert();
    try {
      render(await api(`/machine-expenses/${encodeURIComponent(machineId)}${currentRangeQuery()}`));
      loadSidebarAnalysis();
    } catch (error) {
      showAlert(error.message || "Could not load procurement records.", true);
    }
  }

  async function download(format, buttonId = "") {
    const button = document.getElementById(buttonId || `${format}Button`);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      const response = await fetch(
        `/api/customer-portal/machine-expenses/${encodeURIComponent(machineId)}/${format}${currentRangeQuery()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        let message = `Could not download ${format.toUpperCase()}.`;
        try {
          const error = await response.json();
          message = error.error || message;
        } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const matchedName = disposition.match(/filename="([^"]+)"/i);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = matchedName?.[1] || `procurement.${format === "audit-pdf" ? "pdf" : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showAlert(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function viewReceipt(expenseId) {
    try {
      const response = await fetch(
        `/api/customer-portal/machine-expenses/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(expenseId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not load receipt.");
      const contentType = response.headers.get("Content-Type") || "";
      const blob = await response.blob();
      if (openReceiptUrl) URL.revokeObjectURL(openReceiptUrl);
      openReceiptUrl = URL.createObjectURL(blob);
      if (contentType === "application/pdf") {
        // <img> can't render a PDF — open it in its own tab instead of
        // showing a broken image inside the dialog.
        window.open(openReceiptUrl, "_blank");
        return;
      }
      document.getElementById("receiptImage").src = openReceiptUrl;
      document.getElementById("receiptDialog").showModal();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function printReceipt(expenseId) {
    try {
      const response = await fetch(
        `/api/customer-portal/machine-expenses/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(expenseId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not load receipt.");
      const contentType = response.headers.get("Content-Type") || "";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (contentType === "application/pdf") {
        // A PDF already has its own print button in the browser's PDF
        // viewer — just open it, rather than trying to embed it as <img>.
        window.open(url, "_blank");
        return;
      }
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`<!doctype html><html><head><title>Receipt</title>
        <style>body{margin:0;display:flex;justify-content:center;padding:20px;font-family:sans-serif}
        img{max-width:100%;height:auto}</style></head>
        <body><img src="${url}" onload="window.print()"></body></html>`);
      printWindow.document.close();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function downloadReceipt(expenseId) {
    try {
      const response = await fetch(
        `/api/customer-portal/machine-expenses/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(expenseId)}&download=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Could not download receipt.");
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const nameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = nameMatch ? nameMatch[1] : "receipt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showAlert(error.message || "Could not download receipt.", true);
    }
  }

  async function attachReceiptToExpense(expenseId, file) {
    try {
      const dataUrl = await compressReceipt(file);
      await api(`/machine-expenses/${encodeURIComponent(machineId)}/receipt?expenseId=${encodeURIComponent(expenseId)}`, {
        method: "PUT",
        body: JSON.stringify({ receiptPhoto: dataUrl, receiptName: file.name }),
      });
      showAlert("Receipt attached successfully.", false);
      await load();
    } catch (error) {
      showAlert(error.message || "Could not attach receipt.", true);
    }
  }

  document.getElementById("serviceRequestLink").href = `/customer-service-request/?machine=${encodeURIComponent(machineId)}`;
  document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("quantity").addEventListener("input", () => { calculateTotal(); syncStoreIssueForm(); });
  document.getElementById("unitPrice").addEventListener("input", calculateTotal);
  document.getElementById("stockSource").addEventListener("change", syncStoreIssueForm);
  document.getElementById("partNumber").addEventListener("input", syncStoreIssueForm);
  document.getElementById("partNumber").addEventListener("change", syncStoreIssueForm);
  document.getElementById("receiptPhoto").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) {
      clearReceiptInput();
      return;
    }
    try {
      showAlert(file.type === "application/pdf" ? "Preparing receipt PDF…" : "Preparing and compressing receipt photo…");
      receiptPhotoData = await compressReceipt(file);
      receiptPhotoName = file.name || (file.type === "application/pdf" ? "receipt.pdf" : "receipt-photo.jpg");
      const preview = document.getElementById("receiptPreview");
      if (file.type === "application/pdf") {
        preview.style.display = "none";
        let pdfBadge = document.getElementById("receiptPdfBadge");
        if (!pdfBadge) {
          pdfBadge = document.createElement("div");
          pdfBadge.id = "receiptPdfBadge";
          pdfBadge.className = "receipt-pdf-badge";
          preview.insertAdjacentElement("afterend", pdfBadge);
        }
        pdfBadge.textContent = `📄 ${receiptPhotoName}`;
        pdfBadge.style.display = "block";
      } else {
        preview.style.display = "";
        preview.src = receiptPhotoData;
        const pdfBadge = document.getElementById("receiptPdfBadge");
        if (pdfBadge) pdfBadge.style.display = "none";
      }
      document.getElementById("receiptPreviewWrap").classList.remove("hidden");
      clearAlert();
    } catch (error) {
      clearReceiptInput();
      showAlert(error.message, true);
    }
  });
  document.getElementById("removeReceiptButton").addEventListener("click", clearReceiptInput);
  document.getElementById("expenseRows").addEventListener("click", event => {
    const button = event.target.closest("[data-receipt]");
    const printButton = event.target.closest("[data-print-receipt]");
    const downloadButton = event.target.closest("[data-download-receipt]");
    if (button) viewReceipt(button.dataset.receipt);
    if (printButton) printReceipt(printButton.dataset.printReceipt);
    if (downloadButton) downloadReceipt(downloadButton.dataset.downloadReceipt);
  });
  document.getElementById("expenseRows").addEventListener("change", event => {
    const input = event.target.closest("[data-attach-receipt]");
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    attachReceiptToExpense(input.dataset.attachReceipt, file);
    input.value = "";
  });
  document.getElementById("closeReceiptButton").addEventListener("click", () => {
    document.getElementById("receiptDialog").close();
  });
  document.getElementById("printScope").addEventListener("change", event => {
    document.getElementById("printDateInput").classList.toggle("hidden", event.target.value !== "date");
    document.getElementById("printMonthInput").classList.toggle("hidden", event.target.value !== "month");
    if (event.target.value === "all") load();
  });
  document.getElementById("printDateInput").addEventListener("change", load);
  document.getElementById("printMonthInput").addEventListener("change", load);
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("csvButton").addEventListener("click", () => download("csv"));
  document.getElementById("pdfButton").addEventListener("click", () => download("pdf"));
  document.getElementById("auditPdfButton").addEventListener("click", () => download("audit-pdf", "auditPdfButton"));
  document.getElementById("receiptsButton").addEventListener("click", downloadAllReceipts);

  async function downloadAllReceipts() {
    const button = document.getElementById("receiptsButton");
    button.disabled = true;
    button.textContent = "Finding receipts…";
    try {
      const list = await api(`/machine-expenses/${encodeURIComponent(machineId)}/receipts-list${currentRangeQuery()}`);
      if (!list.length) {
        showAlert("No receipts found for the selected range.", true);
        return;
      }
      button.textContent = `Downloading 0/${list.length}…`;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const response = await fetch(`/api${item.downloadUrl}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) continue;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        button.textContent = `Downloading ${i + 1}/${list.length}…`;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      showAlert(`Downloaded ${list.length} receipt(s).`, false);
    } catch (error) {
      showAlert(error.message || "Could not download receipts.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Download Receipts";
    }
  }
  document.querySelectorAll('[data-close-dialog="receiveStockDialog"]').forEach(button => {
    button.addEventListener("click", () => document.getElementById("receiveStockDialog").close());
  });
  document.getElementById("receiveStockButton").addEventListener("click", () => {
    if (!canManageStore) return;
    document.getElementById("receiveStockForm").reset();
    document.getElementById("receiveUnitCost").value = "0";
    document.getElementById("receiveStockError").classList.add("hidden");
    document.getElementById("receiveStockDialog").showModal();
  });
  document.getElementById("receiveStockForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("saveReceiveStockButton");
    const errorBox = document.getElementById("receiveStockError");
    errorBox.classList.add("hidden");
    button.disabled = true;
    button.textContent = "Receiving…";
    try {
      const result = await api("/store", {
        method: "POST",
        body: JSON.stringify({
          partNumber: document.getElementById("receivePartNumber").value.trim(),
          description: document.getElementById("receiveDescription").value.trim(),
          quantity: Number(document.getElementById("receiveQuantity").value),
          unit: document.getElementById("receiveUnit").value,
          unitCost: Number(document.getElementById("receiveUnitCost").value),
          note: document.getElementById("receiveNote").value.trim(),
        }),
      });
      document.getElementById("receiveStockDialog").close();
      await load();
      showAlert(result.message || "Stock received and Store balance updated.");
    } catch (error) {
      errorBox.textContent = error.message || "Could not receive stock.";
      errorBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.textContent = "Receive into Store";
    }
  });

  document.getElementById("procurementRequestRows").addEventListener("click", async event => {
    const button = event.target.closest("[data-procurement-action]");
    if (!button) return;
    const id = button.dataset.procurementId;
    const action = button.dataset.procurementAction;
    const prompts = {
      ISSUE_STORE: "Store issue note / receiver (optional):",
      PURCHASE_REQUIRED: "Purchase/source note (optional):",
      ORDERED: "Order / PO reference (optional):",
      PARTS_READY: "Receiving / parts-ready note (optional):",
      REJECT: "Reason for rejection (optional):",
    };
    const note = window.prompt(prompts[action] || "Procurement note (optional):", "");
    if (note === null) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Updating…";
    try {
      const result = await api(`/procurement-requests/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ action, note: note.trim() }),
      });
      await load();
      showAlert(result.message || "Procurement status updated. Maintenance Process has been synchronized.");
    } catch (error) {
      showAlert(error.message || "Could not update Procurement request.", true);
      button.disabled = false;
      button.textContent = original;
    }
  });

  function safeCsvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  document.getElementById("selectShortageButton").addEventListener("click", () => {
    let selected = 0;
    document.querySelectorAll("[data-procurement-select]").forEach(input => {
      const item = procurementRequestsCache.find(row => String(row.id) === String(input.dataset.procurementSelect));
      const choose = !input.disabled && item && procurementShortage(item) > 0.00001;
      input.checked = Boolean(choose);
      if (choose) selected += 1;
    });
    showAlert(selected ? `${selected} shortage item(s) selected automatically.` : "No open spare shortage is available to select.", selected === 0);
  });

  document.getElementById("downloadPurchaseCsvButton").addEventListener("click", () => {
    const rows = selectedProcurementRequests().filter(item => procurementShortage(item) > 0.00001);
    if (!rows.length) {
      showAlert("Select at least one shortage item first. You can use Select Shortage.", true);
      return;
    }
    const lines = [["Part Number","Description","Required Qty","In Stock","Shortage Qty","Unit","Status","Requested By","Requested At"]];
    rows.forEach(item => {
      const inStock = Number(item.currentStoreBalance ?? item.storeAvailableAtRequest ?? 0);
      lines.push([
        item.partNumber || "", item.description || "", item.quantity || 0, inStock,
        procurementShortage(item), item.unit || "PC", item.status || "", item.requestedByName || "", formatDateTime(item.requestedAt),
      ]);
    });
    const csv = lines.map(row => row.map(safeCsvCell).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `procurement-shortage-${machineId.slice(0,8)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showAlert(`${rows.length} selected shortage item(s) downloaded for Procurement sourcing.`);
  });

  document.getElementById("sendBelmSupplyButton").addEventListener("click", async () => {
    const rows = selectedProcurementRequests().filter(item => procurementShortage(item) > 0.00001);
    if (!rows.length) {
      showAlert("Select at least one shortage item first. You can use Select Shortage.", true);
      return;
    }
    if (!window.confirm(`Send ${rows.length} selected shortage item(s) to BELM for supply? Only the shortage quantities will be sent.`)) return;
    const button = document.getElementById("sendBelmSupplyButton");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const result = await api(`/procurement-belm-supply/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({ requestIds: rows.map(item => item.id) }),
      });
      await load();
      showAlert(result.message || `${result.createdCount || 0} shortage item(s) sent to BELM.`);
    } catch (error) {
      showAlert(error.message || "Could not send selected shortage to BELM.", true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  document.getElementById("storeApprovalRows").addEventListener("click", async event => {
    const approve = event.target.closest("[data-approve-store-issue]");
    const reject = event.target.closest("[data-reject-store-issue]");
    const target = approve || reject;
    if (!target) return;
    const id = approve ? approve.dataset.approveStoreIssue : reject.dataset.rejectStoreIssue;
    const action = approve ? "APPROVE" : "REJECT";
    const note = window.prompt(approve ? "Approval note (optional):" : "Reason for rejection (optional):", "");
    if (note === null) return;
    target.disabled = true;
    const original = target.textContent;
    target.textContent = approve ? "Approving…" : "Rejecting…";
    try {
      const result = await api(`/store-issue-requests/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ action, note: note.trim() }),
      });
      await load();
      showAlert(result.message || (approve ? "Store issue approved." : "Store issue rejected."));
    } catch (error) {
      showAlert(error.message || "Could not process Store issue approval.", true);
      target.disabled = false;
      target.textContent = original;
    }
  });

  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/login";
  });

  document.getElementById("expenseForm").addEventListener("submit", async event => {
    event.preventDefault();
    clearAlert();
    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const saveResult = await api(`/machine-expenses/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({
          date: document.getElementById("expenseDate").value,
          description: document.getElementById("description").value.trim(),
          partNumber: document.getElementById("partNumber").value.trim(),
          stockSource: document.getElementById("stockSource").value,
          quantity: Number(document.getElementById("quantity").value),
          unit: document.getElementById("unit").value,
          unitPrice: Number(document.getElementById("unitPrice").value),
          receivedBy: document.getElementById("receivedBy").value.trim(),
          receiptPhoto: receiptPhotoData,
          receiptName: receiptPhotoName,
        }),
      });
      event.target.reset();
      clearReceiptInput();
      document.getElementById("expenseDate").value = new Date().toISOString().slice(0, 10);
      document.getElementById("quantity").value = "1";
      document.getElementById("unitPrice").value = "0";
      document.getElementById("stockSource").value = "DIRECT_PURCHASE";
      document.getElementById("unitPrice").readOnly = false;
      document.getElementById("storeIssueHint").classList.add("hidden");
      calculateTotal();
      await load();
      showAlert(saveResult.message || "Procurement record saved successfully.");
    } catch (error) {
      showAlert(error.message || "Could not save procurement record.", true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save procurement";
    }
  });

  if (String(tokenPayload().customerRole || "").toLowerCase() === "viewer") {
    document.getElementById("entryPanel").classList.add("hidden");
  }

  calculateTotal();
  load();
})();
