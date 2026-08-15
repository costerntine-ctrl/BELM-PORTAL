(function () {
  const token = localStorage.getItem("belm_customer_token");
  const userList = document.getElementById("userList");
  const alertBox = document.getElementById("alertBox");
  const dialog = document.getElementById("userDialog");
  const form = document.getElementById("userForm");
  let users = [];

  function tokenPayload() {
    if (!token) return null;
    try {
      const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(Array.from(atob(encoded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")));
    } catch {
      return null;
    }
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

  function clearAlert() {
    alertBox.className = "alert hidden";
    alertBox.textContent = "";
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/customer-portal${path}`, {
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

  const roleLabels = {
    admin: "Machinery Admin",
    assistant: "Machinery Admin Assistant",
    accounts: "Accounts",
    operator: "Machine Operator",
  };

  function render() {
    document.getElementById("totalCount").textContent = users.length;
    document.getElementById("activeCount").textContent = users.filter((user) => user.isActive).length;
    if (users.length === 0) {
      userList.innerHTML = '<div class="empty">No assistants yet. Use “Add assistant” to create the first login.</div>';
    } else {
      userList.innerHTML = users.map((user) => `
        <article class="user-card">
          <div class="identity"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.phone || "No phone number")}</span></div>
          <div class="email">${escapeHtml(user.email)}</div>
          <span class="badge ${escapeHtml(user.role)}">${escapeHtml(roleLabels[user.role] || user.role)}</span>
          <span class="badge ${user.isActive ? "operator" : "inactive"}">${user.isActive ? "Active" : "Inactive"}</span>
          <div class="actions">
            <button class="edit" type="button" data-edit="${escapeHtml(user.id)}">Edit</button>
            <button class="delete" type="button" data-delete="${escapeHtml(user.id)}">Delete</button>
          </div>
        </article>
      `).join("");
    }
    renderRoleCards();
  }

  function renderRoleCards() {
    const container = document.getElementById("roleCards");
    const roles = ["admin", "assistant", "accounts", "operator"];
    container.innerHTML = roles.map((roleKey) => {
      const members = users.filter((user) => user.role === roleKey);
      return `
        <article class="role-card">
          <div class="role-card-head">
            <span class="badge ${roleKey}">${escapeHtml(roleLabels[roleKey])}</span>
            <strong>${members.length}</strong>
          </div>
          ${members.length
            ? `<ul>${members.map((user) => `<li>${escapeHtml(user.name)} ${user.isActive ? "" : "<small>(inactive)</small>"}</li>`).join("")}</ul>`
            : '<p class="empty-role">No one in this role yet.</p>'}
        </article>`;
    }).join("");
  }

  async function loadTeamAnalysis() {
    const container = document.getElementById("analysisRows");
    try {
      const data = await api("/users/analysis");
      container.innerHTML = data.departments.map((dept) => `
        <div class="analysis-row">
          <span>${escapeHtml(dept.label)}</span>
          <b>${dept.active} active${dept.total !== dept.active ? ` <small>(${dept.total} total)</small>` : ""}</b>
        </div>`).join("")
        + `<div class="analysis-row"><span>Machine Operators (roster, no login)</span><b>${data.machineOperatorRosterCount}</b></div>`;
    } catch (error) {
      container.innerHTML = `<p class="empty-role">${escapeHtml(error.message || "Could not load team analysis.")}</p>`;
    }
  }

  async function loadActivityLog() {
    const container = document.getElementById("activityLogRows");
    try {
      const logs = await api("/activity-logs");
      container.innerHTML = logs.length
        ? logs.map((log) => `
            <div class="activity-log-row">
              <span>${escapeHtml(log.action)}</span>
              <small>${escapeHtml(log.actorName)} · ${new Date(log.createdAt).toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
            </div>`).join("")
        : '<p class="empty-role">No activity recorded yet.</p>';
    } catch (error) {
      container.innerHTML = `<p class="empty-role">${escapeHtml(error.message || "Could not load activity log.")}</p>`;
    }
  }

  let rosterMachines = [];
  let rosterEntries = [];

  async function loadRosterMachines() {
    const select = document.getElementById("rosterMachineSelect");
    try {
      const dashboard = await api("/dashboard");
      rosterMachines = dashboard.machines || [];
      select.innerHTML = '<option value="">Select a machine…</option>'
        + rosterMachines.map((machine) =>
          `<option value="${escapeHtml(machine.id)}">${escapeHtml([machine.brand, machine.model].filter(Boolean).join(" ") || machine.machineType)}</option>`
        ).join("");
    } catch (_) {
      select.innerHTML = '<option value="">Could not load machines</option>';
    }
  }

  async function loadRoster(machineId) {
    const list = document.getElementById("rosterList");
    if (!machineId) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = '<div class="loading">Loading operators…</div>';
    try {
      rosterEntries = await api(`/machine-operators/${encodeURIComponent(machineId)}`);
      list.innerHTML = rosterEntries.length
        ? rosterEntries.map((entry) => `
            <div class="roster-item">
              <span><strong>${escapeHtml(entry.name)}</strong> · ${escapeHtml(entry.contact)}
                ${entry.hasPin ? '<em class="roster-pin-set">PIN set</em>' : '<em class="roster-pin-missing">No PIN — cannot sign in yet</em>'}
              </span>
              <div class="roster-item-actions">
                <button type="button" data-set-pin="${escapeHtml(entry.id)}">${entry.hasPin ? "Reset PIN" : "Set PIN"}</button>
                <button type="button" class="delete" data-remove-operator="${escapeHtml(entry.id)}">Remove</button>
              </div>
            </div>`).join("")
        : '<p class="empty-role">No operators added for this machine yet.</p>';
    } catch (error) {
      list.innerHTML = `<p class="empty-role">${escapeHtml(error.message || "Could not load the operator roster.")}</p>`;
    }
  }

  async function loadUsers() {
    clearAlert();
    userList.innerHTML = '<div class="loading">Loading assistants…</div>';
    if (!token) {
      userList.innerHTML = '<div class="locked"><strong>Customer login required</strong>Please log in using the main customer account.<br><a href="/portal/login">Go to portal login</a></div>';
      return;
    }
    try {
      users = await api("/users");
      render();
      loadUserLimitInfo();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        userList.innerHTML = `<div class="locked"><strong>Owner access required</strong>${escapeHtml(error.message)}<br><a href="/portal/login">Log in as main customer</a></div>`;
        document.getElementById("addButton").disabled = true;
      } else {
        userList.innerHTML = '<div class="empty">Could not load assistant accounts.</div>';
        showAlert(error.message, true);
      }
    }
  }

  async function loadUserLimitInfo() {
    const info = document.getElementById("userLimitInfo");
    if (!info) return;
    try {
      const data = await api("/users/limit");
      const used = data.used ?? 0;
      const limit = data.limit ?? 0;
      info.textContent = `${used} of ${limit} portal user(s) used.`;
      info.classList.toggle("at-limit", used >= limit);
      const addButton = document.getElementById("addButton");
      if (addButton) addButton.disabled = used >= limit;
      if (used >= limit) {
        info.textContent += " Contact BELM Admin to request additional users.";
      }
    } catch (_) {
      info.textContent = "";
    }
  }

  async function loadPortalLink() {
    try {
      const dashboard = await api("/dashboard");
      if (dashboard?.customer?.portalUrl) {
        document.getElementById("customerPortalUrl").textContent = dashboard.customer.portalUrl;
        document.getElementById("copyLinkButton").dataset.portalUrl = dashboard.customer.portalUrl;
      }
      document.getElementById("technicianSection").classList.toggle("hidden", !dashboard?.customer?.isMachineryAdmin);
      const technicianOption = document.getElementById("role").querySelector('option[value="technician"]');
      if (technicianOption) technicianOption.disabled = !dashboard?.customer?.isMachineryAdmin;
      if (dashboard?.customer?.isMachineryAdmin) loadTechnicians();
    } catch {
      // The user list already shows the actionable authentication error.
    }
  }

  async function loadTechnicians() {
    const list = document.getElementById("technicianList");
    list.innerHTML = '<div class="loading">Loading your Technicians…</div>';
    try {
      const technicians = await api("/technicians");
      list.innerHTML = technicians.length
        ? technicians.map((tech) => `
            <div class="roster-item">
              <span><strong>${escapeHtml(tech.name)}</strong> · ${escapeHtml(tech.email)}${tech.phone ? ` · ${escapeHtml(tech.phone)}` : ""}
                ${tech.is_active ? '<em class="roster-pin-set">Active</em>' : '<em class="roster-pin-missing">Inactive</em>'}
              </span>
            </div>`).join("")
        : '<p class="empty-role">No Technicians added yet.</p>';
    } catch (error) {
      list.innerHTML = `<p class="empty-role">${escapeHtml(error.message || "Could not load your Technicians.")}</p>`;
    }
  }

  function setAccessUI(permissions) {
    const accessAll = document.getElementById("accessAll");
    const items = document.querySelectorAll(".access-item");
    if (!permissions) {
      accessAll.checked = true;
      document.getElementById("accessOptions").classList.add("hidden");
      items.forEach((item) => { item.checked = false; });
    } else {
      accessAll.checked = false;
      document.getElementById("accessOptions").classList.remove("hidden");
      items.forEach((item) => { item.checked = permissions.includes(item.value); });
    }
  }

  function readAccessPayload() {
    if (document.getElementById("accessAll").checked) return "all";
    return [...document.querySelectorAll(".access-item:checked")].map((item) => item.value);
  }

  function toggleFieldsForRole() {
    const isTechnician = document.getElementById("role").value === "technician";
    document.getElementById("password").closest("label").classList.toggle("hidden", isTechnician);
    document.getElementById("confirmPassword").closest("label").classList.toggle("hidden", isTechnician);
    document.getElementById("accessRoleWrap")?.classList.toggle("hidden", isTechnician);
    document.getElementById("password").required = !isTechnician;
    document.getElementById("confirmPassword").required = !isTechnician;
  }
  document.getElementById("role").addEventListener("change", toggleFieldsForRole);

  function openCreate() {
    form.reset();
    document.getElementById("userId").value = "";
    document.getElementById("dialogTitle").textContent = "Add assistant";
    document.getElementById("password").required = true;
    document.getElementById("confirmPassword").required = true;
    document.getElementById("passwordHint").textContent = "Required · at least 8 characters";
    document.getElementById("statusWrap").classList.add("hidden");
    document.getElementById("formError").className = "alert error hidden";
    setAccessUI(null);
    toggleFieldsForRole();
    dialog.showModal();
  }

  function openEdit(id) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    form.reset();
    document.getElementById("userId").value = user.id;
    document.getElementById("name").value = user.name || "";
    document.getElementById("email").value = user.email || "";
    document.getElementById("phone").value = user.phone || "";
    document.getElementById("role").value = user.role || "operator";
    document.getElementById("isActive").checked = Boolean(user.isActive);
    document.getElementById("dialogTitle").textContent = "Edit assistant";
    document.getElementById("password").required = false;
    document.getElementById("confirmPassword").required = false;
    document.getElementById("passwordHint").textContent = "Leave blank to keep the current password";
    document.getElementById("statusWrap").classList.remove("hidden");
    document.getElementById("formError").className = "alert error hidden";
    setAccessUI(user.permissions || null);
    toggleFieldsForRole();
    dialog.showModal();
  }

  document.getElementById("accessAll").addEventListener("change", (event) => {
    document.getElementById("accessOptions").classList.toggle("hidden", event.target.checked);
  });

  async function saveUser(event) {
    event.preventDefault();
    const id = document.getElementById("userId").value;
    const role = document.getElementById("role").value;
    const errorBox = document.getElementById("formError");

    // Technician is a different account type entirely under the hood (a
    // real BELM staff Technician login, not a customer_users assistant),
    // so it saves through its own endpoint — but shares this same "Add
    // assistant" form for a single, unified experience.
    if (role === "technician") {
      if (id) {
        errorBox.textContent = "Technicians can't be edited from here yet — remove and re-add if details change.";
        errorBox.className = "alert error";
        return;
      }
      const saveButton = document.getElementById("saveButton");
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      try {
        const result = await api("/technicians", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            phone: document.getElementById("phone").value.trim(),
          }),
        });
        dialog.close();
        await loadUsers();
        await loadTechnicians();
        alert(
          `Technician added. Share these login details securely:\n\nLogin: ${result.loginUrl || "/tech"}\nPassword: ${result.temporaryPassword || "—"}`
        );
        showAlert("Technician added successfully.", false);
      } catch (error) {
        errorBox.textContent = error.message;
        errorBox.className = "alert error";
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save assistant";
      }
      return;
    }

    const password = document.getElementById("password").value;
    const confirmation = document.getElementById("confirmPassword").value;
    if (password !== confirmation) {
      errorBox.textContent = "Passwords do not match.";
      errorBox.className = "alert error";
      return;
    }
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      role,
      password,
      permissions: readAccessPayload(),
    };
    if (id) payload.isActive = document.getElementById("isActive").checked;

    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const result = await api(id ? `/users/${id}` : "/users", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      dialog.close();
      await loadUsers();
      if (result?.recoveryCode) {
        alert(
          `${id ? "New" : "Assistant"} recovery code:\n\n${result.recoveryCode}\n\nCopy it now. It is required for self-service password recovery.`
        );
      }
      showAlert(id ? "Assistant account updated successfully." : "Assistant created. They can now log in with the email and password you entered.", false);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.className = "alert error";
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save assistant";
    }
  }

  async function deleteUser(id) {
    const user = users.find((item) => item.id === id);
    if (!user || !confirm(`Delete assistant ${user.name}? Their login will stop working immediately.`)) return;
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      await loadUsers();
      showAlert("Assistant deleted successfully.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("addButton").addEventListener("click", openCreate);
  document.getElementById("refreshButton").addEventListener("click", loadUsers);
  document.getElementById("closeDialogButton").addEventListener("click", () => dialog.close());
  document.getElementById("cancelButton").addEventListener("click", () => dialog.close());
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_customer_token");
    window.location.href = "/portal/login";
  });
  const payload = tokenPayload();
  const customerPortalUrl = payload?.portalLink
    ? `${window.location.origin}/portal/login?customer=${encodeURIComponent(payload.portalLink)}`
    : `${window.location.origin}/portal/login`;
  document.getElementById("customerPortalUrl").textContent = customerPortalUrl;
  document.getElementById("copyLinkButton").dataset.portalUrl = customerPortalUrl;
  document.getElementById("copyLinkButton").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("copyLinkButton").dataset.portalUrl);
    showAlert("Customer portal link copied.", false);
  });
  userList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openEdit(edit.dataset.edit);
    if (remove) deleteUser(remove.dataset.delete);
  });
  form.addEventListener("submit", saveUser);
  document.getElementById("rosterMachineSelect").addEventListener("change", (event) => {
    const machineId = event.target.value;
    document.getElementById("rosterAddRow").classList.toggle("hidden", !machineId);
    document.getElementById("rosterOperatorLinkRow").classList.toggle("hidden", !machineId);
    if (machineId) {
      document.getElementById("rosterOperatorLink").value = `${window.location.origin}/operator/?machine=${machineId}`;
    }
    loadRoster(machineId);
  });

  document.getElementById("technicianAddButton")?.addEventListener("click", async () => {
    const name = document.getElementById("technicianName").value.trim();
    const email = document.getElementById("technicianEmail").value.trim();
    const phone = document.getElementById("technicianPhone").value.trim();
    if (!name || !email) {
      showAlert("Enter both the Technician's name and email.", true);
      return;
    }
    const button = document.getElementById("technicianAddButton");
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const result = await api("/technicians", {
        method: "POST",
        body: JSON.stringify({ name, email, phone }),
      });
      document.getElementById("technicianName").value = "";
      document.getElementById("technicianEmail").value = "";
      document.getElementById("technicianPhone").value = "";
      await loadTechnicians();
      showAlert(
        `Technician added. Share these login details securely: ${result.loginUrl || "/tech"} · Password: ${result.temporaryPassword || "—"}`,
        false
      );
    } catch (error) {
      showAlert(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "+ Add Technician";
    }
  });

  document.getElementById("copyOperatorLinkButton")?.addEventListener("click", async () => {
    const input = document.getElementById("rosterOperatorLink");
    try {
      await navigator.clipboard.writeText(input.value);
      showAlert("Operator link copied — share it with your operators for this machine.", false);
    } catch (_) {
      input.select();
      showAlert("Could not copy automatically — the link is selected, copy it manually.", true);
    }
  });

  document.getElementById("rosterAddButton").addEventListener("click", async () => {
    const machineId = document.getElementById("rosterMachineSelect").value;
    const name = document.getElementById("rosterName").value.trim();
    const contact = document.getElementById("rosterContact").value.trim();
    const pin = document.getElementById("rosterPin").value.trim();
    if (!machineId) return;
    if (!name || !contact) {
      showAlert("Enter both the operator's name and contact number.", true);
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      showAlert("PIN must be 4–6 digits.", true);
      return;
    }
    try {
      await api(`/machine-operators/${encodeURIComponent(machineId)}`, {
        method: "POST",
        body: JSON.stringify({ name, contact, pin: pin || undefined }),
      });
      document.getElementById("rosterName").value = "";
      document.getElementById("rosterContact").value = "";
      document.getElementById("rosterPin").value = "";
      loadRoster(machineId);
      loadTeamAnalysis();
      loadActivityLog();
      showAlert("Operator added to the roster.", false);
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  document.getElementById("rosterList").addEventListener("click", async (event) => {
    const removeButton = event.target.closest("[data-remove-operator]");
    const pinButton = event.target.closest("[data-set-pin]");
    const machineId = document.getElementById("rosterMachineSelect").value;
    if (pinButton) {
      const newPin = prompt("Enter a 4–6 digit PIN for this operator:");
      if (newPin === null) return;
      if (!/^\d{4,6}$/.test(newPin.trim())) {
        showAlert("PIN must be 4–6 digits.", true);
        return;
      }
      try {
        await api(`/machine-operators/${encodeURIComponent(machineId)}/${pinButton.dataset.setPin}`, {
          method: "PUT",
          body: JSON.stringify({ pin: newPin.trim() }),
        });
        showAlert("Operator PIN saved.", false);
        loadRoster(machineId);
      } catch (error) {
        showAlert(error.message, true);
      }
      return;
    }
    if (!removeButton) return;
    try {
      await api(`/machine-operators/${encodeURIComponent(machineId)}/${removeButton.dataset.removeOperator}`, {
        method: "DELETE",
      });
      loadRoster(machineId);
      loadTeamAnalysis();
      loadActivityLog();
    } catch (error) {
      showAlert(error.message, true);
    }
  });

  loadUsers();
  loadPortalLink();
  loadTeamAnalysis();
  loadRosterMachines();
  loadActivityLog();
})();
