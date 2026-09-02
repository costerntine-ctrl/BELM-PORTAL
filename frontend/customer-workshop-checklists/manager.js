(function () {
  const token = localStorage.getItem("belm_customer_token");
  const templateList = document.getElementById("templateList");
  const alertBox = document.getElementById("alertBox");
  const dialog = document.getElementById("templateDialog");
  const form = document.getElementById("templateForm");
  let templates = [];
  let items = [];
  let serviceParts = [];
  async function confirmThenOpen(title, message, openFn) {
    if (!window.confirm(`${title}

${message}`)) return;
    openFn();
  }

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
    const response = await fetch(`/api/customer-portal/workshop-checklists${path}`, {
      ...options,
      cache: "no-store",
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

  function emptyItem() {
    return {
      key: crypto.randomUUID(),
      label: "",
      inputType: "TEXT",
      safetyLevel: "GREEN",
      dropdownOptions: [],
      yesNoSafety: { YES: "GREEN", NO: "RED" },
      isRequired: true,
    };
  }

  function emptyServicePart() {
    return {
      key: crypto.randomUUID(),
      spareName: "",
      partNumber: "",
      quantity: 1,
    };
  }

  function normalizeItem(item) {
    const inputType = item.inputType || "TEXT";
    return {
      key: item.key || item.id || crypto.randomUUID(),
      label: item.label || "",
      inputType,
      safetyLevel: inputType === "PHOTO" ? "NONE" : (item.safetyLevel || "GREEN"),
      dropdownOptions: Array.isArray(item.options) && inputType === "DROPDOWN" ? item.options.map((value) => ({
        value,
        safetyLevel: item.optionSafety?.[value] || item.safetyLevel || "GREEN",
      })) : [],
      yesNoSafety: inputType === "YES_NO"
        ? { YES: item.optionSafety?.YES || "GREEN", NO: item.optionSafety?.NO || "RED" }
        : { YES: "GREEN", NO: "RED" },
      isRequired: item.isRequired !== false,
    };
  }

  function normalizeServicePart(part) {
    return {
      key: part.key || part.id || crypto.randomUUID(),
      spareName: part.spareName || part.spare_name || "",
      partNumber: part.partNumber || part.part_number || "",
      quantity: Number(part.quantity || 1),
    };
  }

  function renderTemplates() {
    if (templates.length === 0) {
      templateList.innerHTML = '<div class="empty">No checklist templates yet. Create the first template.</div>';
      return;
    }
    templateList.innerHTML = templates.map((template) => {
      const preview = (template.items || []).slice(0, 5).map((item) => `
        <li><span class="dot ${escapeHtml(item.safetyLevel || "GREEN")}"></span>${escapeHtml(item.label)} <small>(${escapeHtml(item.inputType)})</small></li>
      `).join("");
      const extra = (template.items || []).length > 5
        ? `<li class="more">+ ${(template.items || []).length - 5} more items</li>`
        : "";
      return `
        <article class="template-card ${template.isActive ? "" : "inactive"}">
          <div class="card-head">
            <div><h2>${escapeHtml(template.name)}</h2><div class="machine">${escapeHtml(template.machineType)} · ${escapeHtml(template.serviceType || "General Service")} · ${(template.items || []).length} items · ${(template.serviceParts || []).length} parts</div></div>
            <span class="status ${template.isActive ? "" : "off"}">${template.isActive ? "Active" : "Inactive"}</span>
          </div>
          <ul class="item-preview">${preview}${extra}</ul>
          <div class="card-actions">
            <button class="edit" type="button" data-edit="${escapeHtml(template.id)}">Edit</button>
            <button class="duplicate" type="button" data-duplicate="${escapeHtml(template.id)}">Duplicate</button>
            <button class="toggle" type="button" data-toggle="${escapeHtml(template.id)}">${template.isActive ? "Deactivate" : "Activate"}</button>
            <button class="delete" type="button" data-delete="${escapeHtml(template.id)}">Delete → Bin</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderItems() {
    const itemList = document.getElementById("itemList");
    if (items.length === 0) {
      itemList.innerHTML = '<div class="empty">Add at least one checklist item.</div>';
      return;
    }
    itemList.innerHTML = items.map((item, index) => {
      const inputType = item.inputType;
      const isPhoto = inputType === "PHOTO";
      return `
      <article class="item-card" data-key="${escapeHtml(item.key)}">
        <span class="item-number">${index + 1}</span>
        <label class="label-field">Item label<input data-field="label" value="${escapeHtml(item.label)}" maxlength="255" required placeholder="e.g. Hydraulic oil level"></label>
        <label>Input type
          <select data-field="inputType">
            ${["TEXT", "NUMBER", "YES_NO", "DROPDOWN", "DATE", "PHOTO"].map((value) => `<option value="${value}" ${item.inputType === value ? "selected" : ""}>${value.replace("_", " / ")}</option>`).join("")}
          </select>
        </label>
        ${isPhoto ? "" : `
        <label>Safety <small>(NONE = informational only, no color shown on the report)</small>
          <select data-field="safetyLevel">
            ${["NONE", "GREEN", "YELLOW", "RED"].map((value) => `<option value="${value}" ${(item.safetyLevel || "GREEN") === value ? "selected" : ""}>${value === "NONE" ? "No color (informational)" : value}</option>`).join("")}
          </select>
        </label>`}
        ${item.inputType === "DROPDOWN" ? `
          <div class="options-field dropdown-editor">
            <div class="dropdown-title"><span>Dropdown values</span><button type="button" data-add-option="${escapeHtml(item.key)}">+ Add value</button></div>
            <div class="dropdown-options">
              ${(item.dropdownOptions || []).map((option, optionIndex) => `
                <div class="dropdown-option">
                  <input data-option-index="${optionIndex}" data-option-field="value" required value="${escapeHtml(option.value)}" placeholder="e.g. OK">
                  <select data-option-index="${optionIndex}" data-option-field="safetyLevel" aria-label="Dropdown value safety">
                    ${["GREEN", "YELLOW", "RED"].map((level) => `<option value="${level}" ${option.safetyLevel === level ? "selected" : ""}>${level}</option>`).join("")}
                  </select>
                  <button type="button" data-remove-option="${optionIndex}" aria-label="Remove dropdown value">×</button>
                </div>
              `).join("")}
            </div>
          </div>
        ` : item.inputType === "YES_NO" ? `
          <div class="options-field dropdown-editor">
            <div class="dropdown-title"><span>Which answer is safe?</span></div>
            <div class="yes-no-safety-editor">
              <label>“Yes” means
                <select data-yes-no-safety="YES">
                  ${["GREEN", "YELLOW", "RED"].map((level) => `<option value="${level}" ${(item.yesNoSafety?.YES || "GREEN") === level ? "selected" : ""}>${level}</option>`).join("")}
                </select>
              </label>
              <label>“No” means
                <select data-yes-no-safety="NO">
                  ${["GREEN", "YELLOW", "RED"].map((level) => `<option value="${level}" ${(item.yesNoSafety?.NO || "RED") === level ? "selected" : ""}>${level}</option>`).join("")}
                </select>
              </label>
            </div>
            <p class="options-help">When the technician picks the answer marked YELLOW or RED, they'll be asked to describe the issue.</p>
          </div>
        ` : item.inputType === "PHOTO"
          ? '<div class="options-field options-help">Technician will get a camera/file uploader. The photo is compressed automatically to 0.5 MB or less before saving. Photo items never carry a safety color.</div>'
          : '<div class="options-field options-help">Choose DROPDOWN to add selectable values.</div>'}
        <label class="required">Required<input data-field="isRequired" type="checkbox" ${item.isRequired ? "checked" : ""}></label>
        <button class="remove-item" type="button" data-remove="${escapeHtml(item.key)}" aria-label="Remove item">×</button>
      </article>
    `;
    }).join("");
  }

  function renderServiceParts() {
    const list = document.getElementById("servicePartList");
    if (serviceParts.length === 0) {
      list.innerHTML = '<div class="empty">No spare parts added for this service type.</div>';
      return;
    }
    list.innerHTML = serviceParts.map((part) => `
      <article class="service-part-row" data-service-part-key="${escapeHtml(part.key)}">
        <label>Spare-parts name
          <input data-service-part-field="spareName" maxlength="255" value="${escapeHtml(part.spareName)}" placeholder="e.g. Engine oil filter">
        </label>
        <label>Part number
          <input data-service-part-field="partNumber" maxlength="100" value="${escapeHtml(part.partNumber)}" placeholder="e.g. 923855.0996">
        </label>
        <label>Quantity
          <input data-service-part-field="quantity" type="number" min="0.01" step="0.01" value="${escapeHtml(part.quantity)}">
        </label>
        <button class="remove-service-part" data-remove-service-part="${escapeHtml(part.key)}" type="button" aria-label="Remove spare part">×</button>
      </article>
    `).join("");
  }

  async function loadTemplates() {
    templateList.innerHTML = '<div class="loading">Loading templates…</div>';
    if (!token) {
      templateList.innerHTML = '<div class="locked">Customer login required.<br><a href="/portal/login">Go to customer login</a></div>';
      return;
    }
    try {
      templates = await api("");
      renderTemplates();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        templateList.innerHTML = `<div class="locked">${escapeHtml(error.message)}<br><a href="/portal/login">Go to customer login</a></div>`;
      } else {
        templateList.innerHTML = '<div class="empty">Could not load checklist templates.</div>';
        showAlert(error.message, true);
      }
    }
  }

  function setMachineTypeField(value) {
    const select = document.getElementById("machineType");
    const otherWrap = document.getElementById("machineTypeOtherWrap");
    const otherInput = document.getElementById("machineTypeOther");
    const isKnown = Array.from(select.options).some((option) => option.value === value);
    if (value && !isKnown) {
      select.value = "__other__";
      otherWrap.classList.remove("hidden");
      otherInput.value = value;
    } else {
      select.value = value || "";
      otherWrap.classList.add("hidden");
      otherInput.value = "";
    }
  }
  function readMachineTypeField() {
    const select = document.getElementById("machineType");
    if (select.value === "__other__") return document.getElementById("machineTypeOther").value.trim();
    return select.value.trim();
  }
  document.getElementById("machineType").addEventListener("change", (event) => {
    document.getElementById("machineTypeOtherWrap").classList.toggle("hidden", event.target.value !== "__other__");
  });

  function openNew() {
    form.reset();
    document.getElementById("templateId").value = "";
    document.getElementById("dialogTitle").textContent = "New template";
    document.getElementById("serviceType").value = "250hrs";
    document.getElementById("isActive").checked = true;
    document.getElementById("formError").className = "alert error hidden";
    setMachineTypeField("");
    items = [emptyItem()];
    serviceParts = [emptyServicePart()];
    renderItems();
    renderServiceParts();
    dialog.showModal();
  }

  async function openEdit(id) {
    try {
      const template = await api(`/${id}`);
      document.getElementById("templateId").value = template.id;
      document.getElementById("templateName").value = template.name || "";
      setMachineTypeField(template.machineType || "");
      const serviceTypeSelect = document.getElementById("serviceType");
      const validServiceTypes = Array.from(serviceTypeSelect.options).map((option) => option.value);
      serviceTypeSelect.value = validServiceTypes.includes(template.serviceType) ? template.serviceType : "250hrs";
      document.getElementById("isActive").checked = Boolean(template.isActive);
      document.getElementById("dialogTitle").textContent = "Edit template";
      document.getElementById("formError").className = "alert error hidden";
      items = (template.items || []).map(normalizeItem);
      if (items.length === 0) items = [emptyItem()];
      serviceParts = (template.serviceParts || []).map(normalizeServicePart);
      renderItems();
      renderServiceParts();
      dialog.showModal();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  function updateItem(key, field, value) {
    items = items.map((item) => {
      if (item.key !== key) return item;
      if (field === "inputType" && value === "DROPDOWN" && item.dropdownOptions.length === 0) {
        return { ...item, [field]: value, dropdownOptions: [{ value: "", safetyLevel: item.safetyLevel || "GREEN" }] };
      }
      if (field === "inputType" && value === "PHOTO") {
        return { ...item, [field]: value, safetyLevel: "NONE" };
      }
      if (field === "inputType" && value === "YES_NO" && !item.yesNoSafety) {
        return { ...item, [field]: value, yesNoSafety: { YES: "GREEN", NO: "RED" } };
      }
      if (field === "inputType" && item.safetyLevel === "NONE" && value !== "PHOTO") {
        return { ...item, [field]: value, safetyLevel: "GREEN" };
      }
      return { ...item, [field]: value };
    });
    if (field === "inputType") renderItems();
  }

  function updateDropdownOption(key, optionIndex, field, value) {
    items = items.map((item) => item.key === key ? {
      ...item,
      dropdownOptions: item.dropdownOptions.map((option, index) =>
        index === optionIndex ? { ...option, [field]: value } : option),
    } : item);
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const id = document.getElementById("templateId").value;
    const errorBox = document.getElementById("formError");
    const machineType = readMachineTypeField();
    if (!machineType) {
      errorBox.textContent = "Select a machine type (or choose \"Other\" and type one in).";
      errorBox.className = "alert error";
      return;
    }
    const payload = {
      name: document.getElementById("templateName").value.trim(),
      machineType,
      serviceType: document.getElementById("serviceType").value.trim(),
      isActive: document.getElementById("isActive").checked,
      items: items.map((item) => ({
        label: item.label.trim(),
        inputType: item.inputType,
        safetyLevel: item.inputType === "PHOTO" ? "NONE" : item.safetyLevel,
        options: item.inputType === "DROPDOWN"
          ? item.dropdownOptions.map((option) => option.value.trim()).filter(Boolean)
          : item.inputType === "YES_NO" ? ["YES", "NO"] : [],
        optionSafety: item.inputType === "DROPDOWN"
          ? Object.fromEntries(item.dropdownOptions
            .filter((option) => option.value.trim())
            .map((option) => [option.value.trim(), option.safetyLevel]))
          : item.inputType === "YES_NO"
            ? { YES: item.yesNoSafety?.YES || "GREEN", NO: item.yesNoSafety?.NO || "RED" }
            : {},
        isRequired: item.isRequired,
      })),
      serviceParts: serviceParts
        .filter((part) => part.spareName.trim() || part.partNumber.trim())
        .map((part) => ({
          spareName: part.spareName.trim(),
          partNumber: part.partNumber.trim(),
          quantity: Number(part.quantity),
        })),
    };
    if (payload.items.length === 0) {
      errorBox.textContent = "Add at least one checklist item.";
      errorBox.className = "alert error";
      return;
    }

    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving safely…";
    try {
      const saved = await api(id ? `/${id}` : "", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (
        !saved
        || !saved.id
        || !Array.isArray(saved.items)
        || saved.items.length !== payload.items.length
        || !Array.isArray(saved.serviceParts)
        || saved.serviceParts.length !== payload.serviceParts.length
      ) {
        throw new Error("Save verification failed. Please try again.");
      }
      dialog.close();
      await loadTemplates();
      showAlert(`Template “${saved.name}” saved with ${saved.items.length} checklist item(s) and ${saved.serviceParts.length} service part(s).`, false);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.className = "alert error";
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save template";
    }
  }

  async function deleteTemplate(id) {
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    if (!window.confirm(`Move checklist template "${template.name}" to Bin? Existing submitted checklist reports will remain.`)) return;
    try {
      await api(`/${id}`, { method: "DELETE" });
      await Promise.all([loadTemplates(), loadBin()]);
      showAlert("Checklist template moved to Bin.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function duplicateTemplate(id) {
    try {
      const copy = await api(`/${id}/duplicate`, { method: "POST", body: JSON.stringify({}) });
      await loadTemplates();
      showAlert(`Created duplicate “${copy.name}”. It starts inactive so you can review it first.`, false);
    } catch (error) { showAlert(error.message, true); }
  }

  async function toggleTemplate(id) {
    try {
      const updated = await api(`/${id}/toggle`, { method: "POST", body: JSON.stringify({}) });
      await loadTemplates();
      showAlert(`Template “${updated.name}” is now ${updated.isActive ? "Active" : "Inactive"}.`, false);
    } catch (error) { showAlert(error.message, true); }
  }

  async function binApi(path, options = {}) {
    const response = await fetch(`/api/customer-portal/workshop-checklists-bin${path}`, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}`, ...(options.headers || {}) },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.error || "Request failed.");
    return data;
  }

  async function loadBin() {
    const list = document.getElementById("binList");
    try {
      const rows = await binApi("");
      document.getElementById("binCount").textContent = rows.length;
      list.innerHTML = rows.length ? rows.map((row) => `
        <div class="bin-row">
          <div class="bin-meta"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.machineType)} · ${escapeHtml(row.serviceType || "General Service")} · deleted ${escapeHtml(row.deletedAt || "")}</small></div>
          <div class="bin-actions"><button class="restore" type="button" data-restore="${escapeHtml(row.id)}">Restore</button></div>
        </div>`).join("") : '<div class="empty">Bin is empty.</div>';
    } catch (error) {
      document.getElementById("binCount").textContent = "!";
      list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  }


  document.getElementById("newButton").addEventListener("click", openNew);
  document.getElementById("addItemButton").addEventListener("click", () => {
    items.push(emptyItem());
    renderItems();
  });

  // CSV upload: an alternate, second way to build the same items list —
  // it doesn't save anything by itself, it just appends parsed rows into
  // the same `items` array the manual "+ Add item" button uses, so every
  // normal editing/review/Save-template path afterwards works identically
  // either way.
  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (char === '"') { inQuotes = false; }
        else { current += char; }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }
  const SAFE_LEVELS = new Set(["NONE", "GREEN", "YELLOW", "RED"]);
  const SAFE_INPUT_TYPES = new Set(["TEXT", "NUMBER", "YES_NO", "DROPDOWN", "DATE", "PHOTO"]);
  function parseChecklistCsv(text) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (!lines.length) return { rows: [], errors: ["The CSV file is empty."] };
    const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
    const hasHeader = header[0]?.includes("item") || header[0]?.includes("label");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = [];
    const errors = [];
    dataLines.forEach((line, index) => {
      const rowNumber = index + (hasHeader ? 2 : 1);
      const cells = parseCsvLine(line);
      const [label, inputTypeRaw, safetyRaw, requiredRaw, optionsRaw] = cells;
      if (!label) { errors.push(`Row ${rowNumber}: missing item label — skipped.`); return; }
      const inputType = String(inputTypeRaw || "TEXT").toUpperCase().replace(/[\s-]/g, "_");
      if (!SAFE_INPUT_TYPES.has(inputType)) {
        errors.push(`Row ${rowNumber} ("${label}"): unknown input type "${inputTypeRaw}" — defaulted to TEXT.`);
      }
      const resolvedType = SAFE_INPUT_TYPES.has(inputType) ? inputType : "TEXT";
      const safetyLevel = String(safetyRaw || "GREEN").toUpperCase();
      const isRequired = String(requiredRaw ?? "YES").trim().toUpperCase() !== "NO";
      const pairs = String(optionsRaw || "").split("|").map((pair) => pair.trim()).filter(Boolean).map((pair) => {
        const [value, color] = pair.split(":").map((part) => (part || "").trim());
        const safeColor = SAFE_LEVELS.has((color || "").toUpperCase()) ? color.toUpperCase() : "GREEN";
        return { value, safetyLevel: safeColor };
      });
      const item = emptyItem();
      item.label = label;
      item.inputType = resolvedType;
      item.safetyLevel = resolvedType === "PHOTO" ? "NONE" : (SAFE_LEVELS.has(safetyLevel) ? safetyLevel : "GREEN");
      item.isRequired = isRequired;
      if (resolvedType === "DROPDOWN") {
        item.dropdownOptions = pairs.filter((pair) => pair.value);
        if (!item.dropdownOptions.length) errors.push(`Row ${rowNumber} ("${label}"): DROPDOWN with no valid "Value:COLOR" entries in Dropdown Values.`);
      } else if (resolvedType === "YES_NO") {
        const yes = pairs.find((pair) => pair.value.toUpperCase() === "YES");
        const no = pairs.find((pair) => pair.value.toUpperCase() === "NO");
        item.yesNoSafety = { YES: yes?.safetyLevel || "GREEN", NO: no?.safetyLevel || "RED" };
      }
      rows.push(item);
    });
    return { rows, errors };
  }
  document.getElementById("uploadItemsCsvButton").addEventListener("click", () => {
    document.getElementById("itemsCsvInput").click();
  });
  document.getElementById("itemsCsvInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { rows, errors } = parseChecklistCsv(text);
      if (!rows.length) {
        showAlert(errors.length ? errors.join(" ") : "No usable rows found in that CSV file.", true);
        return;
      }
      items.push(...rows);
      renderItems();
      showAlert(errors.length
        ? `Added ${rows.length} item(s) from CSV, with ${errors.length} warning(s): ${errors.join(" ")} Review the list below, then click Save template.`
        : `Added ${rows.length} item(s) from CSV. Review the list below, then click Save template.`, errors.length > 0);
    } catch (error) {
      showAlert(`Could not read that CSV file: ${error.message}`, true);
    }
  });

  document.getElementById("addServicePartButton").addEventListener("click", () => {
    serviceParts.push(emptyServicePart());
    renderServiceParts();
  });
  document.getElementById("closeButton").addEventListener("click", () => dialog.close());
  document.getElementById("cancelButton").addEventListener("click", () => dialog.close());
  document.getElementById("itemList").addEventListener("input", (event) => {
    const card = event.target.closest("[data-key]");
    const optionField = event.target.dataset.optionField;
    if (card && optionField) {
      updateDropdownOption(card.dataset.key, Number(event.target.dataset.optionIndex), optionField, event.target.value);
      return;
    }
    const field = event.target.dataset.field;
    if (!card || !field) return;
    updateItem(card.dataset.key, field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });
  document.getElementById("itemList").addEventListener("change", (event) => {
    const card = event.target.closest("[data-key]");
    const optionField = event.target.dataset.optionField;
    if (card && optionField) {
      updateDropdownOption(card.dataset.key, Number(event.target.dataset.optionIndex), optionField, event.target.value);
      return;
    }
    const yesNoKey = event.target.dataset.yesNoSafety;
    if (card && yesNoKey) {
      items = items.map((item) => item.key === card.dataset.key ? {
        ...item,
        yesNoSafety: { ...(item.yesNoSafety || { YES: "GREEN", NO: "RED" }), [yesNoKey]: event.target.value },
      } : item);
      return;
    }
    const field = event.target.dataset.field;
    if (!card || !field) return;
    updateItem(card.dataset.key, field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });
  document.getElementById("itemList").addEventListener("click", (event) => {
    const card = event.target.closest("[data-key]");
    const addOption = event.target.closest("[data-add-option]");
    const removeOption = event.target.closest("[data-remove-option]");
    if (addOption && card) {
      items = items.map((item) => item.key === card.dataset.key ? {
        ...item,
        dropdownOptions: [...item.dropdownOptions, { value: "", safetyLevel: item.safetyLevel || "GREEN" }],
      } : item);
      renderItems();
      return;
    }
    if (removeOption && card) {
      items = items.map((item) => item.key === card.dataset.key ? {
        ...item,
        dropdownOptions: item.dropdownOptions.filter((_, index) => index !== Number(removeOption.dataset.removeOption)),
      } : item);
      renderItems();
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (!remove) return;
    items = items.filter((item) => item.key !== remove.dataset.remove);
    renderItems();
  });
  document.getElementById("servicePartList").addEventListener("input", (event) => {
    const row = event.target.closest("[data-service-part-key]");
    const field = event.target.dataset.servicePartField;
    if (!row || !field) return;
    serviceParts = serviceParts.map((part) => part.key === row.dataset.servicePartKey
      ? { ...part, [field]: field === "quantity" ? Number(event.target.value) : event.target.value }
      : part);
  });
  document.getElementById("servicePartList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-service-part]");
    if (!remove) return;
    serviceParts = serviceParts.filter((part) => part.key !== remove.dataset.removeServicePart);
    renderServiceParts();
  });
  templateList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const duplicate = event.target.closest("[data-duplicate]");
    const toggle = event.target.closest("[data-toggle]");
    const remove = event.target.closest("[data-delete]");
    if (edit) {
      const template = templates.find((item) => item.id === edit.dataset.edit);
      confirmThenOpen("Edit checklist template?", `Confirm you want to edit "${template?.name || "this template"}".`, () => openEdit(edit.dataset.edit));
    }
    if (duplicate) duplicateTemplate(duplicate.dataset.duplicate);
    if (toggle) toggleTemplate(toggle.dataset.toggle);
    if (remove) deleteTemplate(remove.dataset.delete);
  });
  document.getElementById("binButton").addEventListener("click", async () => {
    const panel = document.getElementById("binPanel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) { await loadBin(); panel.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  document.getElementById("binList").addEventListener("click", async (event) => {
    const restore = event.target.closest("[data-restore]");
    if (!restore) return;
    try {
      await binApi(`/${restore.dataset.restore}/restore`, { method: "POST", body: JSON.stringify({}) });
      await Promise.all([loadTemplates(), loadBin()]);
      showAlert("Checklist template restored from Bin.", false);
    } catch (error) { showAlert(error.message, true); }
  });
  form.addEventListener("submit", saveTemplate);
  if (!token) window.location.href = "/portal/login";
  else Promise.all([loadTemplates(), loadBin()]);
})();
