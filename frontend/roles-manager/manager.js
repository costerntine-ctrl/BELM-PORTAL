(function () {
  const token = localStorage.getItem("belm_admin_token");
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "{}"); } catch (_) { return {}; }
  })();
  let users = [];
  let roles = [];
  let customers = [];

  const pageOptions = [
    ["customers", "Customers"],
    ["overview", "All Overview"],
    ["roles", "Roles & system users"],
    ["job-cards", "Job Cards"],
    ["spare-parts", "Spare parts"],
    ["billing", "Billing"],
    ["reports", "Reports & comparisons"],
    ["settings", "System settings"],
    ["checklist-templates", "Checklist templates"],
    ["suppliers", "Suppliers"],
    ["activity-log", "Activity log"],
  ];

  // Dark/light mode is handled centrally by admin-sidebar.js (per-admin
  // localStorage preference) — this page no longer sets its own theme or
  // reads/writes a shared company-wide setting.

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

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

  function formError(id, message) {
    const box = document.getElementById(id);
    box.textContent = message;
    box.className = "alert error";
  }

  async function copyText(text, successMessage = "Copied.") {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showAlert(successMessage);
  }

  function roleName(roleId) {
    return roles.find((role) => role.id === roleId)?.name || "";
  }

  function displayRoleName(name) {
    return name === "Engineer" ? "Workshop Manager" : (name || "");
  }

  function isTechnicianRole(roleId) {
    return roleName(roleId) === "Technician";
  }

  function renderRoleOptions(selected = "") {
    return `<option value="">Select role…</option>${roles.map((role) =>
      `<option value="${escapeHtml(role.id)}" ${role.id === selected ? "selected" : ""}>${escapeHtml(displayRoleName(role.name))}</option>`
    ).join("")}`;
  }

  function renderUserRoleCheckboxes(selectedIds = []) {
    document.getElementById("userRoles").innerHTML = roles.map((role) =>
      `<label class="check-option"><input type="checkbox" value="${escapeHtml(role.id)}" ${selectedIds.includes(role.id) ? "checked" : ""}> ${escapeHtml(displayRoleName(role.name))}</label>`
    ).join("");
  }

  function selectedUserRoleIds() {
    return [...document.querySelectorAll("#userRoles input:checked")].map((input) => input.value);
  }

  function renderCustomerOptions(selected = "") {
    return `<option value="">Select customer…</option>${customers.map((customer) =>
      `<option value="${escapeHtml(customer.id)}" ${customer.id === selected ? "selected" : ""}>${escapeHtml(customer.name)}</option>`
    ).join("")}`;
  }

  function updateMetrics() {
    document.getElementById("roleCount").textContent = roles.length.toLocaleString();
    document.getElementById("userCount").textContent = users.length.toLocaleString();
    document.getElementById("technicianCount").textContent = users.filter((user) => user.role?.name === "Technician").length.toLocaleString();
    document.getElementById("activeCount").textContent = users.filter((user) => Number(user.isActive) === 1).length.toLocaleString();
  }

  function renderRoles() {
    const panel = document.getElementById("rolesPanel");
    if (!roles.length) {
      panel.innerHTML = '<div class="empty">No roles found.</div>';
      return;
    }
    panel.innerHTML = roles.map((role) => {
      const builtIn = ["Super Admin", "Technician"].includes(role.name);
      const pages = role.name === "Super Admin"
        ? "Full dashboard access"
        : (role.allowedPages || []).length
          ? (role.allowedPages || []).map((page) => {
            const normalized = page === "service-requests" ? "job-cards" : page;
            return pageOptions.find(([key]) => key === normalized)?.[1] || normalized;
          }).filter((value, index, list) => list.indexOf(value) === index).join(", ")
          : "Technician app only / no admin dashboard pages";
      return `<article class="role-card">
        <h3>${escapeHtml(displayRoleName(role.name))}</h3>
        <p>${escapeHtml(pages)}</p>
        ${builtIn
          ? '<span class="badge">Built-in role</span>'
          : `<button class="ghost" data-edit-role="${escapeHtml(role.id)}" type="button">Edit role access</button>`}
      </article>`;
    }).join("");
  }

  function renderUsers() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = users.filter((user) => {
      const rawRoles = user.roleNames || [user.role?.name];
      const roleAliases = rawRoles.flatMap((name) => name === "Engineer"
        ? ["Engineer", "Workshop Manager"]
        : (name === "Workshop Manager" ? ["Workshop Manager", "Engineer"] : [name]));
      return [user.name, user.email, ...rawRoles, ...roleAliases, user.assignedCustomer?.name]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
    const panel = document.getElementById("usersPanel");
    if (!filtered.length) {
      panel.className = "empty";
      panel.textContent = query ? "No system users match this search." : "No system users found.";
      return;
    }
    panel.className = "table-wrap";
    panel.innerHTML = `<table>
      <thead><tr><th>Name</th><th>Email / phone</th><th>Role(s)</th><th>Assigned customer</th><th>Status</th><th></th></tr></thead>
      <tbody>${filtered.map((user) => {
        const isSelf = user.id === currentUser.id;
        const roleLabel = (user.roleNames && user.roleNames.length ? user.roleNames : [user.role?.name || "—"]).map(displayRoleName).join(", ");
        return `<tr>
          <td><strong>${escapeHtml(user.name)}</strong>${isSelf ? ' <span class="badge">You</span>' : ""}</td>
          <td><div>${escapeHtml(user.email)}</div><div class="muted">${escapeHtml(user.phone || "—")}</div></td>
          <td><strong>${escapeHtml(roleLabel)}</strong></td>
          <td>${escapeHtml(user.assignedCustomer?.name || (user.role?.name === "Technician" ? "Not assigned" : "All customers"))}</td>
          <td><span class="badge ${Number(user.isActive) === 1 ? "" : "off"}">${Number(user.isActive) === 1 ? "Active" : "Inactive"}</span></td>
          <td><div class="row-actions">
            <button data-edit-user="${escapeHtml(user.id)}">Change role</button>
            <button data-reset-password="${escapeHtml(user.id)}">Reset password</button>
            ${isSelf ? "" : `<button class="delete" data-delete-user="${escapeHtml(user.id)}">Delete</button>`}
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  async function load() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      [users, roles, customers] = await Promise.all([
        api("/users"),
        api("/users/roles"),
        api("/customers"),
      ]);
      updateMetrics();
      const pageParams = new URLSearchParams(window.location.search);
      const roleParam = pageParams.get("role");
      const technicianFocus = pageParams.get("technical") === "1" && roleParam === "Technician";
      if (!technicianFocus) renderRoles();
      if (roleParam) {
        document.getElementById("searchInput").value = roleParam;
        const heading = document.querySelector("h1, .page-title h1, header h1");
        if (heading && roleParam === "Technician") heading.textContent = "TECHNICAL DEP — Technicians";
        if (heading && roleParam === "Engineer") heading.textContent = "TECHNICAL DEP — Workshop Managers";
      }
      renderUsers();
      const openParam = new URLSearchParams(window.location.search).get("open");
      if (openParam === "addRole") openRole();
      if (openParam === "addUser") openUser();
    } catch (error) {
      document.getElementById("usersPanel").className = "empty";
      document.getElementById("usersPanel").innerHTML = `${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a>`;
      showAlert(error.message, true);
    }
  }

  function updateCustomerField() {
    const technician = selectedUserRoleIds().some(isTechnicianRole);
    document.getElementById("customerField").classList.toggle("hidden", !technician);
    document.getElementById("assignedCustomer").required = technician;
    if (!technician) document.getElementById("assignedCustomer").value = "";
  }

  function openUser(user = null) {
    document.getElementById("userForm").reset();
    document.getElementById("userId").value = user?.id || "";
    document.getElementById("userDialogTitle").textContent = user ? `Change role — ${user.name}` : "Add system user";
    document.getElementById("userName").value = user?.name || "";
    document.getElementById("userPhone").value = user?.phone || "";
    document.getElementById("userEmail").value = user?.email || "";
    document.getElementById("userRoles").innerHTML = "";
    renderUserRoleCheckboxes(user?.roleIds || (user?.role?.id ? [user.role.id] : []));
    document.getElementById("assignedCustomer").innerHTML = renderCustomerOptions(user?.assignedCustomer?.id || "");
    document.getElementById("userActive").checked = user ? Number(user.isActive) === 1 : true;
    document.getElementById("emailField").classList.toggle("hidden", Boolean(user));
    document.getElementById("passwordField").classList.toggle("hidden", Boolean(user));
    document.getElementById("userEmail").required = !user;
    document.getElementById("userPassword").required = !user;
    document.getElementById("userFormAlert").className = "alert error hidden";
    updateCustomerField();
    if (!user) generatePassword();
    document.getElementById("userDialog").showModal();
  }

  function generatePassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    const values = crypto.getRandomValues(new Uint32Array(12));
    document.getElementById("userPassword").value = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  }

  function showUserCredentials(user, credentials) {
    const loginUrl = credentials.loginUrl || `${window.location.origin}/login`;
    document.getElementById("credentialsTitle").textContent = `Copy login — ${user.name}`;
    document.getElementById("systemCredentialEmail").value = user.email;
    document.getElementById("systemCredentialPassword").value = credentials.temporaryPassword || credentials.newPassword || "";
    document.getElementById("systemCredentialRecovery").value = credentials.recoveryCode || "";
    document.getElementById("systemCredentialLink").value = loginUrl;
    document.getElementById("openSystemLogin").href = loginUrl;
    document.getElementById("userCredentialsDialog").showModal();
  }

  async function saveUser(event) {
    event.preventDefault();
    const id = document.getElementById("userId").value;
    const payload = {
      name: document.getElementById("userName").value.trim(),
      phone: document.getElementById("userPhone").value.trim(),
      roleIds: selectedUserRoleIds(),
      assignedCustomerId: document.getElementById("assignedCustomer").value || null,
      isActive: document.getElementById("userActive").checked,
    };
    if (payload.roleIds.length === 0) {
      formError("userFormAlert", "Select at least one role.");
      return;
    }
    if (!id) {
      payload.email = document.getElementById("userEmail").value.trim();
      payload.password = document.getElementById("userPassword").value;
    } else {
      const confirmation = await window.belmConfirmEdit({
        title: "Save user changes?",
        message: `Confirm changes to ${payload.name}.`,
      });
      if (!confirmation) return;
      Object.assign(payload, confirmation);
    }
    const button = document.getElementById("saveUserButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const result = await api(id ? `/users/${id}` : "/users", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("userDialog").close();
      await load();
      if (id) {
        showAlert("User role and access changed successfully.");
      } else {
        showUserCredentials(
          { name: payload.name, email: payload.email },
          {
            ...result,
            temporaryPassword: result.temporaryPassword || payload.password,
          }
        );
        showAlert("System user added with role-limited access.");
      }
    } catch (error) {
      formError("userFormAlert", error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save user";
    }
  }

  function renderAllowedPages(selected = []) {
    document.getElementById("allowedPages").innerHTML = pageOptions.map(([key, label]) =>
      `<label class="check-option"><input type="checkbox" value="${escapeHtml(key)}" ${(selected.includes(key) || (key === "job-cards" && selected.includes("service-requests"))) ? "checked" : ""}> ${escapeHtml(label)}</label>`
    ).join("");
  }

  function openRole(role = null) {
    document.getElementById("roleForm").reset();
    document.getElementById("roleId").value = role?.id || "";
    document.getElementById("roleDialogTitle").textContent = role ? `Edit role — ${role.name}` : "Add role";
    document.getElementById("roleName").value = role?.name || "";
    document.getElementById("roleFormAlert").className = "alert error hidden";
    renderAllowedPages(role?.allowedPages || []);
    document.getElementById("roleDialog").showModal();
  }

  async function saveRole(event) {
    event.preventDefault();
    const id = document.getElementById("roleId").value;
    const payload = {
      name: document.getElementById("roleName").value.trim(),
      allowedPages: [...document.querySelectorAll("#allowedPages input:checked")].map((input) => input.value),
      permissions: {},
    };
    if (id) {
      const confirmation = await window.belmConfirmEdit({
        title: "Save role changes?",
        message: `Confirm changes to the "${payload.name}" role's access.`,
      });
      if (!confirmation) return;
      Object.assign(payload, confirmation);
    }
    const button = document.getElementById("saveRoleButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/users/roles/${id}` : "/users/roles", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("roleDialog").close();
      await load();
      showAlert(id ? "Role access updated successfully." : "New role added successfully.");
    } catch (error) {
      formError("roleFormAlert", error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save role";
    }
  }

  async function resetPassword(id) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const confirmation = await window.belmConfirmEdit({
      title: "Reset password?",
      message: `Generate a new password for ${user.name}? The old password will stop working.`,
    });
    if (!confirmation) return;
    try {
      const result = await api(`/users/${id}/reset-password`, { method: "PUT", body: JSON.stringify(confirmation) });
      showUserCredentials(user, result);
      showAlert("New login credentials generated. Copy them before closing the window.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  async function deleteUser(id) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete system user?",
      message: `Delete system user ${user.name}? The record will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/users/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await load();
      showAlert("System user moved to the Recycle Bin.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("addUserButton").addEventListener("click", () => openUser());
  document.getElementById("addRoleButton").addEventListener("click", () => openRole());
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("searchInput").addEventListener("input", renderUsers);
  document.getElementById("userRoles").addEventListener("change", updateCustomerField);
  document.getElementById("generatePassword").addEventListener("click", generatePassword);
  document.getElementById("copySystemCredentials").addEventListener("click", () => {
    copyText(
      `Email: ${document.getElementById("systemCredentialEmail").value}\nTemporary password: ${document.getElementById("systemCredentialPassword").value}\nRecovery code: ${document.getElementById("systemCredentialRecovery").value}\nLogin: ${document.getElementById("systemCredentialLink").value}`,
      "System-user login credentials copied."
    );
  });
  document.getElementById("copySystemPassword").addEventListener("click", () => {
    copyText(document.getElementById("systemCredentialPassword").value, "Temporary password copied.");
  });
  document.getElementById("userForm").addEventListener("submit", saveUser);
  document.getElementById("roleForm").addEventListener("submit", saveRole);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
  document.getElementById("rolesPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-role]");
    if (edit) openRole(roles.find((role) => role.id === edit.dataset.editRole));
  });
  document.getElementById("usersPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-user]");
    const reset = event.target.closest("[data-reset-password]");
    const remove = event.target.closest("[data-delete-user]");
    if (edit) openUser(users.find((user) => user.id === edit.dataset.editUser));
    if (reset) resetPassword(reset.dataset.resetPassword);
    if (remove) deleteUser(remove.dataset.deleteUser);
  });

  load();
})();
