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

  function render() {
    document.getElementById("totalCount").textContent = users.length;
    document.getElementById("activeCount").textContent = users.filter((user) => user.isActive).length;
    if (users.length === 0) {
      userList.innerHTML = '<div class="empty">No assistants yet. Use “Add assistant” to create the first login.</div>';
      return;
    }
    userList.innerHTML = users.map((user) => `
      <article class="user-card">
        <div class="identity"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.phone || "No phone number")}</span></div>
        <div class="email">${escapeHtml(user.email)}</div>
        <span class="badge ${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>
        <span class="badge ${user.isActive ? "operator" : "inactive"}">${user.isActive ? "Active" : "Inactive"}</span>
        <div class="actions">
          <button class="edit" type="button" data-edit="${escapeHtml(user.id)}">Edit</button>
          <button class="delete" type="button" data-delete="${escapeHtml(user.id)}">Delete</button>
        </div>
      </article>
    `).join("");
  }

  async function loadUsers() {
    clearAlert();
    userList.innerHTML = '<div class="loading">Loading assistants…</div>';
    if (!token) {
      userList.innerHTML = '<div class="locked"><strong>Customer login required</strong>Please log in using the main customer account.<br><a href="/login/">Go to portal login</a></div>';
      return;
    }
    try {
      users = await api("/users");
      render();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        userList.innerHTML = `<div class="locked"><strong>Owner access required</strong>${escapeHtml(error.message)}<br><a href="/login/">Log in as main customer</a></div>`;
        document.getElementById("addButton").disabled = true;
      } else {
        userList.innerHTML = '<div class="empty">Could not load assistant accounts.</div>';
        showAlert(error.message, true);
      }
    }
  }

  async function loadPortalLink() {
    try {
      const dashboard = await api("/dashboard");
      if (dashboard?.customer?.portalUrl) {
        document.getElementById("customerPortalUrl").textContent = dashboard.customer.portalUrl;
        document.getElementById("copyLinkButton").dataset.portalUrl = dashboard.customer.portalUrl;
      }
    } catch {
      // The user list already shows the actionable authentication error.
    }
  }

  function openCreate() {
    form.reset();
    document.getElementById("userId").value = "";
    document.getElementById("dialogTitle").textContent = "Add assistant";
    document.getElementById("password").required = true;
    document.getElementById("confirmPassword").required = true;
    document.getElementById("passwordHint").textContent = "Required · at least 8 characters";
    document.getElementById("statusWrap").classList.add("hidden");
    document.getElementById("formError").className = "alert error hidden";
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
    dialog.showModal();
  }

  async function saveUser(event) {
    event.preventDefault();
    const id = document.getElementById("userId").value;
    const password = document.getElementById("password").value;
    const confirmation = document.getElementById("confirmPassword").value;
    const errorBox = document.getElementById("formError");
    if (password !== confirmation) {
      errorBox.textContent = "Passwords do not match.";
      errorBox.className = "alert error";
      return;
    }
    const payload = {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      role: document.getElementById("role").value,
      password,
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
    window.location.href = "/login/";
  });
  const payload = tokenPayload();
  const customerPortalUrl = payload?.portalLink
    ? `${window.location.origin}/login/?customer=${encodeURIComponent(payload.portalLink)}`
    : `${window.location.origin}/login/`;
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
  loadUsers();
  loadPortalLink();
})();
