(function () {
  const token = localStorage.getItem("belm_admin_token");
  const templateList = document.getElementById("templateList");
  const alertBox = document.getElementById("alertBox");
  const dialog = document.getElementById("templateDialog");
  const form = document.getElementById("templateForm");
  let templates = [];
  let items = [];

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
      optionsText: "",
      optionSafety: {},
      isRequired: true,
    };
  }

  function normalizeItem(item) {
    return {
      key: item.key || item.id || crypto.randomUUID(),
      label: item.label || "",
      inputType: item.inputType || "TEXT",
      safetyLevel: item.safetyLevel || "GREEN",
      optionsText: Array.isArray(item.options) ? item.options.join(", ") : "",
      optionSafety: item.optionSafety || {},
      isRequired: item.isRequired !== false,
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
            <div><h2>${escapeHtml(template.name)}</h2><div class="machine">${escapeHtml(template.machineType)} · ${(template.items || []).length} items</div></div>
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
        <label class="options-field">Dropdown values<input data-field="optionsText" value="${escapeHtml(item.optionsText)}" placeholder="OK, Low, Critical" ${item.inputType === "DROPDOWN" ? "" : "disabled"}></label>
        <label class="required">Required<input data-field="isRequired" type="checkbox" ${item.isRequired ? "checked" : ""}></label>
        <button class="remove-item" type="button" data-remove="${escapeHtml(item.key)}" aria-label="Remove item">×</button>
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
    document.getElementById("isActive").checked = true;
    document.getElementById("formError").className = "alert error hidden";
    items = [emptyItem()];
    renderItems();
    dialog.showModal();
  }

  async function openEdit(id) {
    try {
      const template = await api(`/${id}`);
      document.getElementById("templateId").value = template.id;
      document.getElementById("templateName").value = template.name || "";
      document.getElementById("machineType").value = template.machineType || "";
      document.getElementById("isActive").checked = Boolean(template.isActive);
      document.getElementById("dialogTitle").textContent = "Edit template";
      document.getElementById("formError").className = "alert error hidden";
      items = (template.items || []).map(normalizeItem);
      if (items.length === 0) items = [emptyItem()];
      renderItems();
      dialog.showModal();
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  function updateItem(key, field, value) {
    items = items.map((item) => item.key === key ? { ...item, [field]: value } : item);
    if (field === "inputType") renderItems();
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const id = document.getElementById("templateId").value;
    const errorBox = document.getElementById("formError");
    const payload = {
      name: document.getElementById("templateName").value.trim(),
      machineType: document.getElementById("machineType").value.trim(),
      isActive: document.getElementById("isActive").checked,
      items: items.map((item) => ({
        label: item.label.trim(),
        inputType: item.inputType,
        safetyLevel: item.safetyLevel,
        options: item.inputType === "DROPDOWN"
          ? item.optionsText.split(",").map((value) => value.trim()).filter(Boolean)
          : item.inputType === "YES_NO" ? ["YES", "NO"] : [],
        optionSafety: item.optionSafety || {},
        isRequired: item.isRequired,
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
      if (!saved || !saved.id || !Array.isArray(saved.items) || saved.items.length !== payload.items.length) {
        throw new Error("Save verification failed. Please try again.");
      }
      dialog.close();
      await loadTemplates();
      showAlert(`Template “${saved.name}” saved successfully with ${saved.items.length} checklist item(s).`, false);
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
    if (!template || !confirm(`Delete checklist template “${template.name}”?`)) return;
    try {
      await api(`/${id}`, { method: "DELETE" });
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
  document.getElementById("closeButton").addEventListener("click", () => dialog.close());
  document.getElementById("cancelButton").addEventListener("click", () => dialog.close());
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });
  document.getElementById("itemList").addEventListener("input", (event) => {
    const card = event.target.closest("[data-key]");
    const field = event.target.dataset.field;
    if (!card || !field) return;
    updateItem(card.dataset.key, field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });
  document.getElementById("itemList").addEventListener("change", (event) => {
    const card = event.target.closest("[data-key]");
    const field = event.target.dataset.field;
    if (!card || !field) return;
    updateItem(card.dataset.key, field, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  });
  document.getElementById("itemList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove]");
    if (!remove) return;
    items = items.filter((item) => item.key !== remove.dataset.remove);
    renderItems();
  });
  templateList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openEdit(edit.dataset.edit);
    if (remove) deleteTemplate(remove.dataset.delete);
  });
  form.addEventListener("submit", saveTemplate);
  loadTemplates();
})();
