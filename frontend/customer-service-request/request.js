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
  let latestStoreChecks = [];
  let spareWorkspaceLoaded = false;

  // V253 - a second "Send to BELM" button lives at the bottom of the
  // Spare Parts panel (submits the same #serviceForm via the `form`
  // attribute) so it's reachable without scrolling all the way back up
  // once someone has added spare part rows. Both buttons must always
  // mirror each other's label/disabled state.
  function submitButtons() {
    return [document.getElementById("submitButton")].filter(Boolean);
  }
  function setSubmitButtonsText(text) {
    submitButtons().forEach((button) => { button.textContent = text; });
  }
  function setSubmitButtonsDisabled(disabled) {
    submitButtons().forEach((button) => { button.disabled = disabled; });
  }

  if (!token) {
    window.location.replace("/portal/login");
    return;
  }
  if (!machineId) {
    showAlert("Choose a machine from the Customer dashboard.", true);
    setSubmitButtonsDisabled(true);
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
    document.getElementById("pageTitle").textContent = `Spare & Service Request — ${machineLabel}`;
    const notice = document.getElementById("supportModeNotice");
    notice.classList.remove("hidden", "error");
    if (selfServiceMode) {
      notice.textContent = `SELF-SERVICE MODE: Your own technicians/operators handle normal maintenance. Use this page only when you want BELM involved. Requests here are sent to ${belmBusiness.email || "BELM Business Email"}.`;
      document.getElementById("portalModeSubtitle").textContent = "Customer Self-Service · BELM Support Gateway";
      document.getElementById("servicePanelTitle").textContent = "Request BELM Technical Support";
      document.getElementById("servicePanelIntro").textContent = "Describe the technical assistance you want BELM to provide. Your internal maintenance work remains with your own team.";
      setSubmitButtonsText("Send to BELM Technical Support");
    } else {
      notice.textContent = `BELM SERVICE PROVIDER ACTIVE: Maintenance/service requests are handled by BELM and sent to ${belmBusiness.email || "the BELM Business Email"}. Your other customer portal operations remain under your company.`;
      document.getElementById("portalModeSubtitle").textContent = "BELM Managed Spare & Service Request";
      document.getElementById("servicePanelTitle").textContent = "Service request details";
      document.getElementById("servicePanelIntro").textContent = "Select the service required for this machine. Spare requirements stay in the machine spare list and are handled through Procurement.";
      setSubmitButtonsText("Submit service request to BELM");
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
      setSubmitButtonsDisabled(true);
    }
  }

  function customFieldsHtml(initial = {}) {
    return `
        <label class="spare-field"><span>Spare name</span><input type="text" placeholder="e.g. Hydraulic return filter" data-description maxlength="255" required value="${escapeHtml(initial.description || "")}"></label>
        <label class="spare-field"><span>Reference / part number <small>(best for Store sync)</small></span><input type="text" placeholder="Optional" data-reference maxlength="100" value="${escapeHtml(initial.referenceNumber || "")}"></label>
        <label class="spare-field qty-field"><span>Quantity</span><input type="number" min="1" step="1" value="${Number(initial.quantity || 1)}" data-qty required></label>`;
  }

  function addPartRow(initial = {}) {
    partRowCount += 1;
    const row = document.createElement("div");
    row.className = "part-request-row";
    row.dataset.rowId = `partRow${partRowCount}`;
    row.innerHTML = `
      <div class="part-request-row-head">
        <label class="part-select"><input type="checkbox" data-selected ${initial.selected === false ? "" : "checked"}> <strong>Spare request ${partRowCount}</strong></label>
        <button type="button" class="remove-part-row" data-remove-row>Remove</button>
      </div>
      <div class="part-request-fields customer-spare-fields" data-fields>${customFieldsHtml(initial)}</div>
      <div class="store-match-status pending" data-store-status>Store balance: waiting for sync</div>`;
    document.getElementById("partRequestRows").appendChild(row);
    if (!initial.description && !initial.referenceNumber) row.querySelector("[data-description]")?.focus();
    return row;
  }

  function collectPartRows({ selectedOnly = false, allowBlank = false } = {}) {
    const rows = [...document.querySelectorAll(".part-request-row")];
    const parts = [];
    for (const row of rows) {
      const selected = Boolean(row.querySelector("[data-selected]")?.checked);
      if (selectedOnly && !selected) continue;
      const quantity = Number(row.querySelector("[data-qty]")?.value || 0);
      const referenceNumber = row.querySelector("[data-reference]")?.value.trim() || "";
      const description = row.querySelector("[data-description]")?.value.trim() || "";
      if (!description && !referenceNumber) {
        if (allowBlank) continue;
        continue;
      }
      if (!description) throw new Error("Enter the spare name before continuing.");
      if (quantity <= 0 || !Number.isInteger(quantity)) throw new Error("Spare quantity must be a whole number above zero.");
      parts.push({ referenceNumber, description, quantity, selected, row });
    }
    return parts;
  }

  function plainPartRows(parts) {
    return parts.map(part => ({
      referenceNumber: part.referenceNumber,
      description: part.description,
      quantity: part.quantity,
      selected: part.selected,
    }));
  }

  function renderStoreChecks(parts, checks) {
    latestStoreChecks = Array.isArray(checks) ? checks : [];
    parts.forEach((part, index) => {
      const status = part.row?.querySelector("[data-store-status]");
      if (!status) return;
      const check = latestStoreChecks.find(item => Number(item.inputIndex) === index);
      status.className = "store-match-status";
      if (!check || !check.inStore) {
        status.classList.add("not-found");
        status.innerHTML = `<b>NOT IN CUSTOMER STORE</b> · ${part.referenceNumber ? `Part ${escapeHtml(part.referenceNumber)} not found.` : "No exact Store match by spare name."} Procurement will handle purchasing/source selection after you submit.`;
        return;
      }
      const available = Number(check.available || 0);
      const shortage = Number(check.shortage || 0);
      if (check.enough) {
        status.classList.add("available");
        status.innerHTML = `<b>IN STORE</b> · ${available.toLocaleString("en-TZ")} ${escapeHtml(check.unit || "PC")} available · requested ${Number(part.quantity).toLocaleString("en-TZ")} · available for Procurement to issue from Store.`;
      } else {
        status.classList.add("shortage");
        status.innerHTML = `<b>STORE SHORTAGE</b> · ${available.toLocaleString("en-TZ")} ${escapeHtml(check.unit || "PC")} available in Store · shortage <b>${shortage.toLocaleString("en-TZ")} ${escapeHtml(check.unit || "PC")}</b>. Procurement will decide Store issue and purchasing.`;
      }
    });
  }

  async function checkStoreBalance(showMessage = true) {
    let parts;
    try { parts = collectPartRows(); } catch (error) { showAlert(error.message, true); return []; }
    if (!parts.length) {
      if (showMessage) showAlert("Add at least one spare before syncing Store balance.", true);
      return [];
    }
    const button = document.getElementById("checkStoreButton");
    if (button) { button.disabled = true; button.textContent = "Syncing…"; }
    try {
      const result = await api(`/spare-store-check/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({ items: plainPartRows(parts) }),
      });
      renderStoreChecks(parts, result.items || []);
      if (showMessage) {
        const enough = (result.items || []).filter(item => item.enough).length;
        const shortage = (result.items || []).length - enough;
        showAlert(`Customer Store checked: ${enough} item(s) fully available; ${shortage} item(s) need Procurement sourcing or Store replenishment.`);
      }
      return result.items || [];
    } catch (error) {
      if (showMessage) showAlert(error.message || "Could not sync Customer Store balance.", true);
      return null;
    } finally {
      if (button) { button.disabled = false; button.textContent = "Sync Store Balance"; }
    }
  }

  function renderSavedSpareList(items) {
    const container = document.getElementById("partRequestRows");
    container.innerHTML = "";
    partRowCount = 0;
    (items || []).forEach(item => addPartRow({
      referenceNumber: item.referenceNumber || "",
      description: item.description || "",
      quantity: Number(item.quantity || 1),
      selected: item.selected !== false && Number(item.selected) !== 0,
    }));
    if (!(items || []).length) addPartRow();
    const selectedInputs = [...document.querySelectorAll("[data-selected]")];
    document.getElementById("selectAllSpares").checked = selectedInputs.length > 0 && selectedInputs.every(input => input.checked);
  }

  async function loadSpareWorkspace() {
    try {
      const data = await api(`/spare-workspace/${encodeURIComponent(machineId)}`);
      renderSavedSpareList(data.items || []);
      spareWorkspaceLoaded = true;
      const parts = collectPartRows({ allowBlank: true });
      if (parts.length) renderStoreChecks(parts, data.storeChecks || []);
      const pending = (data.procurementRequests || []).filter(item => !["PARTS_READY","REJECTED"].includes(item.status)).length;
      const link = document.getElementById("openExpensesApprovalLink");
      link.href = `/customer-procurement/?machine=${encodeURIComponent(machineId)}`;
      document.getElementById("openMaintenanceStatusLink").href = `/breakdown-workflow/?machine=${encodeURIComponent(machineId)}&actor=customer`;
      link.classList.toggle("hidden", pending === 0);
      if (pending) link.textContent = `Open Procurement (${pending})`;
    } catch (error) {
      renderSavedSpareList([]);
      spareWorkspaceLoaded = true;
      showAlert(error.message || "Could not load saved spare list.", true);
    }
  }


  function addSearchResultToList(item) {
    const container = document.getElementById("partRequestRows");
    const onlyRow = container.querySelectorAll(".part-request-row");
    if (onlyRow.length === 1) {
      const row = onlyRow[0];
      const blank = !(row.querySelector("[data-description]")?.value.trim() || row.querySelector("[data-reference]")?.value.trim());
      if (blank) row.remove();
    }
    addPartRow({
      referenceNumber: item.partNumber || "",
      description: item.description || item.partNumber || "",
      quantity: 1,
      selected: true,
    });
    checkStoreBalance(false);
  }

  function renderSpareSearchResults(query, items) {
    const box = document.getElementById("spareSearchResults");
    box.classList.remove("hidden");
    if (!items.length) {
      box.innerHTML = `<div class="spare-search-empty"><b>No Customer Store match.</b><br>"${escapeHtml(query)}" can still be sent to Procurement for purchasing/source action.<br><button type="button" class="secondary" data-use-search-text="name">Use as spare name</button> <button type="button" class="secondary" data-use-search-text="reference">Use as part number</button></div>`;
      return;
    }
    box.innerHTML = items.map((item, index) => {
      const balance = Number(item.qtyOnHand || 0);
      return `<div class="spare-search-result">
        <div><b>${escapeHtml(item.partNumber || "No part number")} — ${escapeHtml(item.description || "Spare")}</b><small>Customer Store: <span class="${balance > 0 ? "stock-ok" : "stock-zero"}">${balance.toLocaleString("en-TZ")} ${escapeHtml(item.unit || "PC")}</span></small></div>
        <button type="button" class="secondary" data-pick-search-result="${index}">Select</button>
      </div>`;
    }).join("");
    box.dataset.searchItems = JSON.stringify(items);
  }

  async function searchSpare() {
    const input = document.getElementById("spareSearchInput");
    const q = input.value.trim();
    if (!q) { showAlert("Enter a spare name or reference / part number to search.", true); input.focus(); return; }
    const button = document.getElementById("searchSpareButton");
    button.disabled = true;
    button.textContent = "Searching…";
    try {
      const result = await api(`/spare-search/${encodeURIComponent(machineId)}?q=${encodeURIComponent(q)}`);
      renderSpareSearchResults(q, result.items || []);
    } catch (error) {
      showAlert(error.message || "Could not search Customer Store.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Search Store";
    }
  }

  document.getElementById("searchSpareButton").addEventListener("click", searchSpare);
  document.getElementById("spareSearchInput").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); searchSpare(); }
  });
  document.getElementById("spareSearchResults").addEventListener("click", event => {
    const pick = event.target.closest("[data-pick-search-result]");
    if (pick) {
      let items = [];
      try { items = JSON.parse(document.getElementById("spareSearchResults").dataset.searchItems || "[]"); } catch (_) {}
      const item = items[Number(pick.dataset.pickSearchResult)];
      if (item) addSearchResultToList(item);
      return;
    }
    const use = event.target.closest("[data-use-search-text]");
    if (use) {
      const q = document.getElementById("spareSearchInput").value.trim();
      if (!q) return;
      addSearchResultToList(use.dataset.useSearchText === "reference"
        ? { partNumber: q, description: q, qtyOnHand: 0, unit: "PC" }
        : { partNumber: "", description: q, qtyOnHand: 0, unit: "PC" });
    }
  });

  document.getElementById("addPartRowButton").addEventListener("click", () => addPartRow());

  document.getElementById("partRequestRows").addEventListener("click", (event) => {
    const row = event.target.closest(".part-request-row");
    if (!row) return;
    if (event.target.closest("[data-remove-row]")) row.remove();
  });


  document.getElementById("selectAllSpares").addEventListener("change", event => {
    document.querySelectorAll("[data-selected]").forEach(input => { input.checked = event.target.checked; });
  });

  document.getElementById("saveSpareListButton").addEventListener("click", async () => {
    let parts;
    try { parts = collectPartRows(); } catch (error) { showAlert(error.message, true); return; }
    if (!parts.length) { showAlert("Add at least one spare before saving the machine list.", true); return; }
    const button = document.getElementById("saveSpareListButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api(`/spare-workspace/${encodeURIComponent(machineId)}`, {
        method: "PUT",
        body: JSON.stringify({ items: plainPartRows(parts) }),
      });
      renderStoreChecks(parts, result.storeChecks || []);
      showAlert(result.message || "Spare list saved for this machine.");
    } catch (error) {
      showAlert(error.message || "Could not save spare list.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Save Spare List";
    }
  });

  document.getElementById("checkStoreButton").addEventListener("click", () => checkStoreBalance(true));

  let storeSyncTimer = null;
  document.getElementById("partRequestRows").addEventListener("input", event => {
    if (!event.target.matches("[data-description],[data-reference],[data-qty]")) return;
    const status = event.target.closest(".part-request-row")?.querySelector("[data-store-status]");
    if (status) {
      status.className = "store-match-status pending";
      status.textContent = "Store balance: checking…";
    }
    clearTimeout(storeSyncTimer);
    storeSyncTimer = setTimeout(() => { if (spareWorkspaceLoaded) checkStoreBalance(false); }, 500);
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
    const option = selectedOption();
    setSubmitButtonsDisabled(true);
    submitButtons().forEach((btn) => btn.classList.remove("success"));
    setSubmitButtonsText("Submitting…");
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

      showAlert(
        `${result.emailSent ? "BELM received your request by official business email." : "Request saved in BELM Portal; email delivery needs attention."} Reference: ${result.id}`
      );
      document.getElementById("serviceForm").reset();
      render({ machine, serviceOptions, selfServiceMode, belmBusiness });

      // Unmistakable "it worked" confirmation right on the button itself
      // — not just the alert banner above — so there's no doubt the tap
      // registered, before the button returns to its normal state.
      submitButtons().forEach((btn) => btn.classList.add("success"));
      setSubmitButtonsText("✓ Sent");
      await new Promise(resolve => setTimeout(resolve, 1600));
    } catch (error) {
      showAlert(error.message || "Could not submit service request.", true);
    } finally {
      submitButtons().forEach((btn) => btn.classList.remove("success"));
      setSubmitButtonsDisabled(false);
      setSubmitButtonsText(selfServiceMode ? "Send to BELM Technical Support" : "Submit service request to BELM");
      isSubmittingServiceRequest = false;
    }
  });

  // V297 - customer spare requirements go to the customer's Procurement
  // queue only. Procurement owns Store vs purchase decisions; the request
  // screen never sends a spare directly to BELM or a supplier.
  let isSubmittingSpareParts = false;
  document.getElementById("sparePartsForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (isSubmittingSpareParts) return;
    let partRows;
    try { partRows = collectPartRows({ selectedOnly: true }); }
    catch (error) { showAlert(error.message, true); return; }
    if (!partRows.length) {
      showAlert("Select at least one spare part before sending to Procurement.", true);
      return;
    }
    isSubmittingSpareParts = true;
    clearAlert();
    const submitBtn = document.getElementById("submitSparePartsButton");
    submitBtn.classList.remove("success");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending to Procurement…";
    try {
      // Save the current machine list first so the same requirement remains
      // available for later editing/reuse even after Procurement receives it.
      await api(`/spare-workspace/${encodeURIComponent(machineId)}`, {
        method: "PUT",
        body: JSON.stringify({ items: plainPartRows(collectPartRows()) }),
      });
      const result = await api(`/procurement-requests/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({ items: plainPartRows(partRows) }),
      });
      await checkStoreBalance(false);
      const link = document.getElementById("openExpensesApprovalLink");
      link.href = `/customer-procurement/?machine=${encodeURIComponent(machineId)}`;
      link.classList.remove("hidden");
      const openCount = (result.requests || []).filter(item => !["PARTS_READY","REJECTED"].includes(item.status)).length;
      link.textContent = openCount ? `Open Procurement (${openCount})` : "Open Procurement";
      const duplicateCount = (result.alreadyPending || []).length;
      showAlert(`${Number(result.createdCount || 0)} spare item(s) sent to Procurement. ${duplicateCount ? `${duplicateCount} already pending. ` : ""}Maintenance Process now shows Procurement status.`);
      submitBtn.classList.add("success");
      submitBtn.textContent = "✓ Sent to Procurement";
      await new Promise(resolve => setTimeout(resolve, 1400));
    } catch (error) {
      showAlert(error.message || "Could not send spare request to Procurement.", true);
    } finally {
      submitBtn.classList.remove("success");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Requirements to Procurement";
      isSubmittingSpareParts = false;
    }
  });

  if (String(tokenPayload().customerRole || "").toLowerCase() === "viewer") {
    setSubmitButtonsDisabled(true);
    ["saveSpareListButton", "submitSparePartsButton", "addPartRowButton", "searchSpareButton"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = true;
    });
    showAlert("Viewer assistants can review service/spare information but cannot save, approve, or submit new requests.");
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

  load().then(loadSpareWorkspace).then(() => {
    if (prefillNote) {
      const descriptionField = document.getElementById("description");
      if (descriptionField && !descriptionField.value.trim()) descriptionField.value = prefillNote;
    }
  });
  loadHistory();
})();
