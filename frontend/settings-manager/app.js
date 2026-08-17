(function () {
  const token = localStorage.getItem("belm_admin_token");

  // V198: one personal theme follows this exact login throughout the portal.
  function syncThemeControls() {
    const theme = window.BELMTheme?.get?.() || (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === theme);
    });
  }
  window.addEventListener("belm-theme-change", syncThemeControls);


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
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/login";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Could not save settings.");
    return data;
  }

  function message(text, isError = false) {
    const alert = document.getElementById("pageAlert");
    alert.textContent = text;
    alert.className = isError ? "alert" : "alert success";
    alert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function saveSettings(values) {
    await Promise.all(Object.entries(values).map(([key, value]) =>
      api(`/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      })
    ));
  }

  async function load() {
    if (!token) {
      window.location.href = "/login";
      return;
    }
    try {
      const settings = await api("/settings");
      const fields = {
        companyName: "companyName",
        companyEmail: "companyEmail",
        companyPhone: "companyPhone",
        companyAddress: "companyAddress",
        companyTin: "companyTin",
        companyVrn: "companyVrn",
        companyWebsite: "companyWebsite",
        bankAccountName: "bankAccountName",
        bankNmbNumber: "bankNmbNumber",
        bankCrdbNumber: "bankCrdbNumber",
        defaultVatRate: "defaultVatRate",
        defaultPaymentTerms: "defaultPaymentTerms",
        defaultDeliveryTime: "defaultDeliveryTime",
        defaultQuoteValidity: "defaultQuoteValidity",
        footerMessage: "footerMessage",
        currency: "currency",
        timezone: "timezone",
        invoicePrefix: "invoicePrefix",
        proformaPrefix: "proformaPrefix",
        defaultVat: "defaultVat",
      };
      Object.entries(fields).forEach(([key, id]) => {
        if (settings[key] !== undefined && settings[key] !== null) {
          document.getElementById(id).value = settings[key];
        }
      });
      if (Array.isArray(settings.whyChooseUs)) {
        document.getElementById("whyChooseUsText").value = settings.whyChooseUs.join("\n");
      }
      document.getElementById("adminAlertsToggle").checked = settings.adminAlertsEnabled !== false;
      document.getElementById("technicianAlertsToggle").checked = settings.technicianAlertsEnabled !== false;
      document.getElementById("whatsappAlertsToggle").checked = settings.whatsappAlertsEnabled !== false;
      syncThemeControls();
      await loadAnnouncements();
    } catch (error) {
      message(error.message, true);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  async function loadAnnouncements() {
    const list = document.getElementById("announcementList");
    try {
      const announcements = await api("/announcements?all=1");
      list.innerHTML = announcements.length
        ? announcements.map(item => `
          <article class="announcement-item${item.is_active ? "" : " inactive"}">
            <div>
              <p>${escapeHtml(item.message)}</p>
              <small>${escapeHtml(item.created_by_name || "Admin")} · ${new Date(item.created_at).toLocaleString()}${item.is_active ? "" : " · Removed"}</small>
            </div>
            ${item.is_active ? `<button type="button" data-remove-announcement="${escapeHtml(item.id)}">Remove</button>` : ""}
          </article>`).join("")
        : '<p class="empty">No messages posted yet.</p>';
    } catch (error) {
      list.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    }
  }

  document.getElementById("companyForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveCompanyButton");
    button.disabled = true;
    try {
      await saveSettings({
        companyName: document.getElementById("companyName").value.trim(),
        companyEmail: document.getElementById("companyEmail").value.trim(),
        companyPhone: document.getElementById("companyPhone").value.trim(),
        companyAddress: document.getElementById("companyAddress").value.trim(),
        companyTin: document.getElementById("companyTin").value.trim(),
        companyVrn: document.getElementById("companyVrn").value.trim(),
      });
      message("Company settings saved successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("documentBrandingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveDocumentBrandingButton");
    button.disabled = true;
    try {
      await saveSettings({
        companyWebsite: document.getElementById("companyWebsite").value.trim(),
        bankAccountName: document.getElementById("bankAccountName").value.trim(),
        bankNmbNumber: document.getElementById("bankNmbNumber").value.trim(),
        bankCrdbNumber: document.getElementById("bankCrdbNumber").value.trim(),
        defaultVatRate: parseFloat(document.getElementById("defaultVatRate").value) || 0,
        defaultPaymentTerms: document.getElementById("defaultPaymentTerms").value.trim(),
        defaultDeliveryTime: document.getElementById("defaultDeliveryTime").value.trim(),
        defaultQuoteValidity: document.getElementById("defaultQuoteValidity").value.trim(),
        whyChooseUs: document.getElementById("whyChooseUsText").value.split("\n").map((line) => line.trim()).filter(Boolean),
        footerMessage: document.getElementById("footerMessage").value.trim(),
      });
      message("Document branding saved successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("businessForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveBusinessButton");
    button.disabled = true;
    try {
      await saveSettings({
        currency: document.getElementById("currency").value,
        timezone: document.getElementById("timezone").value.trim(),
        invoicePrefix: document.getElementById("invoicePrefix").value.trim(),
        proformaPrefix: document.getElementById("proformaPrefix").value.trim(),
        defaultVat: Number(document.getElementById("defaultVat").value || 0),
      });
      message("Business defaults saved successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", async () => {
      const theme = button.dataset.themeChoice === "dark" ? "dark" : "light";
      if (window.BELMTheme) await window.BELMTheme.set(theme);
      else {
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
      }
      syncThemeControls();
      message(`${theme === "dark" ? "Dark" : "Light"} mode saved for your account across the whole portal.`);
    });
  });

  document.getElementById("pinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPin = document.getElementById("currentPin").value;
    const newPin = document.getElementById("newPin").value;
    const confirmPin = document.getElementById("confirmPin").value;
    if (newPin !== confirmPin) {
      message("New PIN and confirmation do not match.", true);
      return;
    }
    const button = document.getElementById("changePinButton");
    button.disabled = true;
    try {
      await api("/settings/admin-pin/change", {
        method: "PUT",
        body: JSON.stringify({ currentPin, newPin }),
      });
      form.reset();
      message("Protected delete PIN changed successfully.");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  syncThemeControls();
  load();

  document.getElementById("adminAlertsToggle").addEventListener("change", async (event) => {
    try {
      await saveSettings({ adminAlertsEnabled: event.target.checked });
      message(`Admin alerts ${event.target.checked ? "enabled" : "disabled"}.`);
    } catch (error) {
      message(error.message, true);
    }
  });
  document.getElementById("technicianAlertsToggle").addEventListener("change", async (event) => {
    try {
      await saveSettings({ technicianAlertsEnabled: event.target.checked });
      message(`Technician alerts ${event.target.checked ? "enabled" : "disabled"}.`);
    } catch (error) {
      message(error.message, true);
    }
  });
  document.getElementById("whatsappAlertsToggle").addEventListener("change", async (event) => {
    try {
      await saveSettings({ whatsappAlertsEnabled: event.target.checked });
      message(`WhatsApp service alerts ${event.target.checked ? "enabled" : "disabled"}.`);
    } catch (error) {
      message(error.message, true);
    }
  });

  document.getElementById("announcementForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.getElementById("postAnnouncementButton");
    button.disabled = true;
    try {
      await api("/announcements", {
        method: "POST",
        body: JSON.stringify({ message: document.getElementById("announcementMessage").value.trim() }),
      });
      form.reset();
      message("Message posted to customer dashboards.");
      await loadAnnouncements();
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("announcementList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-announcement]");
    if (!button) return;
    if (!confirm("Remove this message from customer dashboards?")) return;
    try {
      await api(`/announcements/${encodeURIComponent(button.dataset.removeAnnouncement)}`, { method: "DELETE" });
      await loadAnnouncements();
    } catch (error) {
      message(error.message, true);
    }
  });

  let customersForResetCache = null;
  let machinesForResetCache = null;
  let usersForResetCache = null;
  let rolesForResetCache = null;

  function resetHideAllPickers() {
    ["resetCustomerPickerWrap", "resetMachineScopeWrap", "resetMachinePickerWrap", "resetUserScopeWrap", "resetUserPickerWrap", "resetRolePickerWrap"]
      .forEach((id) => document.getElementById(id).classList.add("hidden"));
  }

  async function populateCustomerPicker(force) {
    const picker = document.getElementById("resetCustomerPicker");
    if (force) customersForResetCache = null;
    if (!customersForResetCache) customersForResetCache = await api("/customers");
    picker.innerHTML = '<option value="">Select a customer…</option>' +
      customersForResetCache.map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`).join("");
  }

  async function populateMachinePicker(force) {
    const picker = document.getElementById("resetMachinePicker");
    if (force) { machinesForResetCache = null; customersForResetCache = null; }
    if (!customersForResetCache) customersForResetCache = await api("/customers");
    if (!machinesForResetCache) {
      machinesForResetCache = customersForResetCache.flatMap((customer) =>
        (customer.machines || []).map((machine) => ({ ...machine, customerName: customer.name })));
    }
    picker.innerHTML = '<option value="">Select a machine…</option>' +
      machinesForResetCache.map((machine) =>
        `<option value="${machine.id}">${escapeHtml(machine.customerName)} — ${escapeHtml(machine.model)}${machine.fleetNumber ? ` (#${escapeHtml(machine.fleetNumber)})` : ""}</option>`).join("");
  }

  async function populateUserPicker(force) {
    const picker = document.getElementById("resetUserPicker");
    if (force) usersForResetCache = null;
    if (!usersForResetCache) usersForResetCache = await api("/users");
    picker.innerHTML = '<option value="">Select a user…</option>' +
      usersForResetCache
        .filter((u) => u.role?.name !== "Super Admin")
        .map((u) => `<option value="${u.id}">${escapeHtml(u.name)}${u.role?.name ? ` — ${escapeHtml(u.role.name)}` : ""}</option>`).join("");
  }

  async function populateRolePicker(force) {
    const picker = document.getElementById("resetRolePicker");
    if (force) rolesForResetCache = null;
    if (!rolesForResetCache) rolesForResetCache = await api("/users/roles");
    picker.innerHTML = '<option value="">Select a role…</option>' +
      rolesForResetCache
        .filter((r) => !["Super Admin", "Technician"].includes(r.name))
        .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  }

  async function handleResetCategoryChange(value) {
    resetHideAllPickers();
    try {
      if (value === "customers") {
        document.getElementById("resetCustomerPickerWrap").classList.remove("hidden");
        await populateCustomerPicker(false);
        return;
      }

      if (value === "machines") {
        document.getElementById("resetMachineScopeWrap").classList.remove("hidden");
        document.getElementById("resetMachinePickerWrap").classList.remove("hidden");
        await populateMachinePicker(false);
        return;
      }

      if (value === "machine-log") {
        document.getElementById("resetMachinePickerWrap").classList.remove("hidden");
        await populateMachinePicker(false);
        return;
      }

      if (value === "users") {
        document.getElementById("resetUserScopeWrap").classList.remove("hidden");
        document.getElementById("resetUserPickerWrap").classList.remove("hidden");
        await populateUserPicker(false);
        return;
      }

      if (value === "roles") {
        document.getElementById("resetRolePickerWrap").classList.remove("hidden");
        await populateRolePicker(false);
      }
    } catch (_) {}
  }

  document.getElementById("resetDbCategory").addEventListener("change", (event) => handleResetCategoryChange(event.target.value));
  // The category dropdown defaults to "Customers" (its first option), so
  // the native 'change' event never fires on page load — the browser only
  // fires 'change' when the selection actually moves to a different
  // option. Without this, the customer picker stayed hidden until the
  // person picked a different category and came back. Run the same logic
  // once immediately for whatever is selected by default.
  handleResetCategoryChange(document.getElementById("resetDbCategory").value);

  document.getElementById("resetMachineScope").addEventListener("change", (event) => {
    document.getElementById("resetMachinePickerWrap").classList.toggle("hidden", event.target.value === "all");
  });

  document.getElementById("resetUserScope").addEventListener("change", (event) => {
    document.getElementById("resetUserPickerWrap").classList.toggle("hidden", event.target.value === "all");
  });

  document.getElementById("editPinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("newEditPin");
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/settings?action=change-pin", {
        method: "PUT",
        body: JSON.stringify({ pinKey: "adminEditPin", newPin: input.value }),
      });
      showAlert(result.message || "Edit PIN updated successfully.", false);
      input.value = "";
    } catch (error) {
      showAlert(error.message || "Could not update the Edit PIN.", true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("deletePinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("newDeletePin");
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/settings?action=change-pin", {
        method: "PUT",
        body: JSON.stringify({ pinKey: "adminDeletePin", newPin: input.value }),
      });
      showAlert(result.message || "Delete/Clear PIN updated successfully.", false);
      input.value = "";
    } catch (error) {
      showAlert(error.message || "Could not update the Delete/Clear PIN.", true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("resetDbForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = document.getElementById("resetDbCategory");
    const categoryLabel = category.options[category.selectedIndex].text;
    const customerPicker = document.getElementById("resetCustomerPicker");
    const machinePicker = document.getElementById("resetMachinePicker");
    const machineScope = document.getElementById("resetMachineScope");
    const userPicker = document.getElementById("resetUserPicker");
    const userScope = document.getElementById("resetUserScope");
    const rolePicker = document.getElementById("resetRolePicker");

    const isCustomers = category.value === "customers";
    const isMachines = category.value === "machines";
    const isMachineLog = category.value === "machine-log";
    const isUsers = category.value === "users";
    const isRoles = category.value === "roles";
    const machinesAll = isMachines && machineScope.value === "all";
    const usersAll = isUsers && userScope.value === "all";

    if (isCustomers && !customerPicker.value) {
      message("Select a customer to delete.", true);
      return;
    }
    if ((isMachines && !machinesAll && !machinePicker.value) || (isMachineLog && !machinePicker.value)) {
      message("Select a machine.", true);
      return;
    }
    if (isUsers && !usersAll && !userPicker.value) {
      message("Select a user to delete.", true);
      return;
    }
    if (isRoles && !rolePicker.value) {
      message("Select a role to delete.", true);
      return;
    }

    const customerLabel = isCustomers ? customerPicker.options[customerPicker.selectedIndex].text : "";
    const machineLabel = (isMachines && !machinesAll) || isMachineLog
      ? machinePicker.options[machinePicker.selectedIndex].text
      : "";
    const userLabel = isUsers && !usersAll ? userPicker.options[userPicker.selectedIndex].text : "";
    const roleLabel = isRoles ? rolePicker.options[rolePicker.selectedIndex].text : "";

    const confirmMessage = isCustomers
      ? `This will permanently delete customer "${customerLabel}" and everything tied to them (their own machines, invoices, checklist reports, service requests). This cannot be undone. Continue?`
      : isMachineLog
        ? `This will permanently clear the hour meter readings, checklist logs and expense entries for "${machineLabel}". The machine record and customer stay untouched. This cannot be undone. Continue?`
        : isMachines
          ? machinesAll
            ? "This will permanently delete EVERY machine and its checklist/usage history. Customers and users stay untouched. This cannot be undone. Continue?"
            : `This will permanently delete machine "${machineLabel}" and its checklist/usage history. The customer stays untouched. This cannot be undone. Continue?`
          : isUsers
            ? usersAll
              ? "This will permanently delete every non-Super-Admin user account. Customers and machines stay untouched, and your own login is protected. This cannot be undone. Continue?"
              : `This will permanently delete the user "${userLabel}". Customers and machines stay untouched. This cannot be undone. Continue?`
            : isRoles
              ? `This will permanently delete the role "${roleLabel}". This only works if no user currently has it as their primary role. This cannot be undone. Continue?`
              : category.value === "all"
                ? "This will permanently delete EVERY customer, machine, invoice and report, then reset to a fresh empty database. This cannot be undone. Continue?"
                : `This will permanently delete all data under "${categoryLabel}" only. Everything else stays untouched. This cannot be undone. Continue?`;
    if (!confirm(confirmMessage)) return;
    const button = document.getElementById("resetDbButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Resetting…";
    try {
      const token = localStorage.getItem("belm_admin_token");
      const response = await fetch("/api/reset-database", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pin: document.getElementById("resetDbPin").value,
          adminPassword: document.getElementById("resetDbPassword").value,
          reason: document.getElementById("resetDbReason").value,
          category: category.value,
          customerId: isCustomers ? customerPicker.value : undefined,
          machineId: (isMachines && !machinesAll) || isMachineLog ? machinePicker.value : undefined,
          machineScope: isMachines ? machineScope.value : undefined,
          userId: isUsers && !usersAll ? userPicker.value : undefined,
          userScope: isUsers ? userScope.value : undefined,
          roleId: isRoles ? rolePicker.value : undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Reset failed.");
      if (category.value === "all") {
        alert(result.message || "Database reset successfully. You will be logged out now.");
        localStorage.removeItem("belm_admin_token");
        localStorage.removeItem("belm_admin_user");
        window.location.href = "/login";
        return;
      }
      message(result.message || `${categoryLabel} cleared successfully.`);
      document.getElementById("resetDbPin").value = "";
      document.getElementById("resetDbPassword").value = "";
      document.getElementById("resetDbReason").value = "";
      try {
        if (isCustomers) await populateCustomerPicker(true);
        else if (isMachines || isMachineLog) await populateMachinePicker(true);
        else if (isUsers) await populateUserPicker(true);
        else if (isRoles) await populateRolePicker(true);
      } catch (_) {}
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  document.getElementById("downloadBackupButton").addEventListener("click", async () => {
    const button = document.getElementById("downloadBackupButton");
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing backup…";
    try {
      const token = localStorage.getItem("belm_admin_token");
      const response = await fetch("/api/backup", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Could not download backup.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const matchedName = disposition.match(/filename="([^"]+)"/i);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = matchedName?.[1] || "belm-portal-backup.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      message("Backup downloaded. Save this file somewhere safe (Google Drive, your computer).");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
})();
