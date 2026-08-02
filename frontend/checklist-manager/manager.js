(function () {
  const token = localStorage.getItem("belm_admin_token");
  const templateList = document.getElementById("templateList");
  const alertBox = document.getElementById("alertBox");
  const dialog = document.getElementById("templateDialog");
  const form = document.getElementById("templateForm");
  let templates = [];
  let items = [];
  let serviceParts = [];
  let pendingEditPin = null;

  async function confirmThenOpen(title, message, openFn) {
    const confirmation = await window.belmConfirmEdit({ title, message });
    if (!confirmation) return;
    pendingEditPin = confirmation.editPin;
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
    const response = await fetch(`/api/checklist-templates${path}`, {
      ...options,
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
    return {
      key: item.key || item.id || crypto.randomUUID(),
      label: item.label || "",
      inputType: item.inputType || "TEXT",
      safetyLevel: item.safetyLevel || "GREEN",
      dropdownOptions: Array.isArray(item.options) ? item.options.map((value) => ({
        value,
        safetyLevel: item.optionSafety?.[value] || item.safetyLevel || "GREEN",
      })) : [],
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
            <button class="edit" type="button" data-edit="${escapeHtml(template.id)}">Edit & save</button>
            <button class="delete" type="button" data-delete="${escapeHtml(template.id)}">Delete</button>
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
    itemList.innerHTML = items.map((item, index) => `
      <article class="item-card" data-key="${escapeHtml(item.key)}">
        <span class="item-number">${index + 1}</span>
        <label class="label-field">Item label<input data-field="label" value="${escapeHtml(item.label)}" maxlength="255" required placeholder="e.g. Hydraulic oil level"></label>
        <label>Input type
          <select data-field="inputType">
            ${["TEXT", "NUMBER", "YES_NO", "DROPDOWN", "DATE", "PHOTO"].map((value) => `<option value="${value}" ${item.inputType === value ? "selected" : ""}>${value.replace("_", " / ")}</option>`).join("")}
          </select>
        </label>
        <label>Safety
          <select data-field="safetyLevel">
            ${["GREEN", "YELLOW", "RED"].map((value) => `<option value="${value}" ${item.safetyLevel === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
        </label>
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
        ` : item.inputType === "PHOTO"
          ? '<div class="options-field options-help">Technician will get a camera/file uploader. The photo is compressed automatically to 0.5 MB or less before saving.</div>'
          : '<div class="options-field options-help">Choose DROPDOWN to add selectable values.</div>'}
        <label class="required">Required<input data-field="isRequired" type="checkbox" ${item.isRequired ? "checked" : ""}></label>
        <button class="remove-item" type="button" data-remove="${escapeHtml(item.key)}" aria-label="Remove item">×</button>
      </article>
    `).join("");
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
      templateList.innerHTML = '<div class="locked">Administrator login required.<br><a href="/admin/login">Go to admin login</a></div>';
      return;
    }
    try {
      templates = await api("");
      renderTemplates();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        templateList.innerHTML = `<div class="locked">${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a></div>`;
      } else {
        templateList.innerHTML = '<div class="empty">Could not load checklist templates.</div>';
        showAlert(error.message, true);
      }
    }
  }

  function openNew() {
    form.reset();
    document.getElementById("templateId").value = "";
    document.getElementById("dialogTitle").textContent = "New template";
    document.getElementById("serviceType").value = "Preventive Service";
    document.getElementById("isActive").checked = true;
    document.getElementById("formError").className = "alert error hidden";
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
      document.getElementById("machineType").value = template.machineType || "";
      document.getElementById("serviceType").value = template.serviceType || "General Service";
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
    const payload = {
      name: document.getElementById("templateName").value.trim(),
      machineType: document.getElementById("machineType").value.trim(),
      serviceType: document.getElementById("serviceType").value.trim(),
      isActive: document.getElementById("isActive").checked,
      items: items.map((item) => ({
        label: item.label.trim(),
        inputType: item.inputType,
        safetyLevel: item.safetyLevel,
        options: item.inputType === "DROPDOWN"
          ? item.dropdownOptions.map((option) => option.value.trim()).filter(Boolean)
          : item.inputType === "YES_NO" ? ["YES", "NO"] : [],
        optionSafety: item.inputType === "DROPDOWN"
          ? Object.fromEntries(item.dropdownOptions
            .filter((option) => option.value.trim())
            .map((option) => [option.value.trim(), option.safetyLevel]))
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
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
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
    const confirmation = await window.belmConfirmDelete({
      title: "Delete checklist template?",
      message: `Delete checklist template "${template.name}"? It will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await loadTemplates();
      showAlert("Checklist template moved to the Recycle Bin.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("newButton").addEventListener("click", openNew);
  document.getElementById("addItemButton").addEventListener("click", () => {
    items.push(emptyItem());
    renderItems();
  });
  document.getElementById("addServicePartButton").addEventListener("click", () => {
    serviceParts.push(emptyServicePart());
    renderServiceParts();
  });
  document.getElementById("closeButton").addEventListener("click", () => dialog.close());
  document.getElementById("cancelButton").addEventListener("click", () => dialog.close());
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
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
    const remove = event.target.closest("[data-delete]");
    if (edit) {
      const template = templates.find((item) => item.id === edit.dataset.edit);
      confirmThenOpen("Edit checklist template?", `Confirm you want to edit "${template?.name || "this template"}".`, () => openEdit(edit.dataset.edit));
    }
    if (remove) deleteTemplate(remove.dataset.delete);
  });
  form.addEventListener("submit", saveTemplate);
  loadTemplates();
})();
