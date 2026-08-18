(function () {
  const token = localStorage.getItem("belm_admin_token");
  const pageOptions = [
    ["customers", "Customers"],
    ["overview", "All Overview"],
    ["roles", "Roles & system users"],
    ["service-requests", "Service requests (inside Engineering)"],
    ["spare-parts", "Spare parts"],
    ["billing", "Billing"],
    ["bank-manager", "Bank Manager"],
    ["reports", "Reports & comparisons"],
    ["settings", "System settings"],
    ["checklist-templates", "Checklist templates"],
    ["suppliers", "Suppliers"],
    ["activity-log", "Activity log"],
  ];
  let rolesCache = [];
  let dispatchTechnicians = [];
  let dispatchCustomers = [];
  let dispatchMachines = [];
  let dispatchJobCards = [];
  let lastDispatchOptionsLoadedAt = 0;

  function currentAdminUser() {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "null"); } catch (_) { return null; }
  }
  function hasPageAccess(key) {
    const user = currentAdminUser();
    if (!user) return false;
    if (user.role === "Super Admin" || user.allowedPages === null) return true;
    return Array.isArray(user.allowedPages) && user.allowedPages.includes(key);
  }

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));

  const formatDateTime = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}, ${hours}:${minutes}`;
  };

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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

  function showAlert(message, isError = true) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = isError ? "alert error" : "alert";
    box.classList.remove("hidden");
  }

  const STATUS_LABELS = { GREEN: "Normal", YELLOW: "Attention", RED: "Don't operate", NOT_CHECKED: "Not checked" };

  function renderActivity(items) {
    document.getElementById("activityCount").textContent = items.length;
    document.getElementById("activityList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · Filled by ${escapeHtml(item.filledBy || "—")}</span>
            </div>
            <span class="eng-badge status-${escapeHtml(String(item.status || "GREEN").toLowerCase())}">${escapeHtml(item.status || "—")}</span>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No recent checklist activity.</p>';
  }

  function renderOperatorMessages(items) {
    document.getElementById("operatorCount").textContent = items.length;
    document.getElementById("operatorList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.operatorName || "Operator")}</span>
              <p class="eng-row-message">${escapeHtml(item.message)}</p>
            </div>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No open operator messages.</p>';
  }

  function renderStatusSummary(summary) {
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0) || 1;
    document.getElementById("statusSummary").innerHTML = Object.entries(summary).map(([key, count]) => `
      <div class="eng-status-bar-row">
        <span>${escapeHtml(STATUS_LABELS[key] || key)}</span>
        <div class="eng-status-bar-track"><div class="eng-status-bar-fill status-${escapeHtml(key.toLowerCase())}" style="width:${Math.round((count / total) * 100)}%"></div></div>
        <b>${count}</b>
      </div>`).join("");
  }

  function renderReminders(items) {
    document.getElementById("reminderCount").textContent = items.length;
    document.getElementById("reminderList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.machine)}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.machineType || "Machine")} · Due ${escapeHtml(item.dueHour || "—")} hrs · ${escapeHtml(item.serviceIntervalHours || item.intervalHours)}-Hour Service${item.draftProformaNo ? ` · ${escapeHtml(item.draftProformaNo)}` : ""}</span>
              <span class="eng-row-sub">Owner alert: Email ${escapeHtml(item.ownerEmailStatus || "NOT SENT")} · WhatsApp ${escapeHtml(item.ownerWhatsAppStatus || "NOT SENT")}</span>
            </div>
            <span class="eng-badge status-${escapeHtml(item.level.toLowerCase())}">${item.hoursRemaining <= 0 ? "Overdue" : `${item.hoursRemaining} hrs left`}</span>
          </div>`).join("")
      : '<p class="muted">Nothing due soon.</p>';
  }


  function renderServicePreparations(items) {
    document.getElementById("servicePrepCount").textContent = items.length;
    document.getElementById("servicePrepList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.draftProformaNo || "Service kit review")}</b>
              <span class="eng-row-sub">${escapeHtml(item.customer || "—")} · ${escapeHtml(item.machine)} · ${escapeHtml(item.machineType || "Machine")} · ${escapeHtml(item.serviceIntervalHours)}-Hour Service @ ${escapeHtml(item.dueHour)} hrs</span>
              <span class="eng-row-sub">Inventory: ${escapeHtml(item.inventoryStatus || "NOT CHECKED")} · Current hours: ${escapeHtml(item.currentHours)}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              ${item.draftProformaId ? '<a class="eng-badge" href="/billing-manager/">Review PI</a>' : '<span class="eng-badge status-yellow">Add service parts</span>'}
            </div>
          </div>`).join("")
      : '<p class="muted">No automatic service preparations waiting for review.</p>';
  }

  function renderSpareRequests(items) {
    document.getElementById("spareCount").textContent = items.length;
    document.getElementById("spareList").innerHTML = items.length
      ? items.map((item) => `
          <div class="eng-row">
            <div>
              <b>${escapeHtml(item.name)} <span class="eng-row-sub">× ${escapeHtml(item.quantity)}</span></b>
              <span class="eng-row-sub">${escapeHtml(item.machine || item.customer || "—")} · Requested by ${escapeHtml(item.requestedBy || "—")}</span>
            </div>
            <small>${formatDateTime(item.createdAt)}</small>
          </div>`).join("")
      : '<p class="muted">No pending spare-part requests.</p>';
  }

  function dispatchMode() {
    return document.querySelector('input[name="jobCardMode"]:checked')?.value || "existing";
  }

  function renderDispatchMachines() {
    const customerId=document.getElementById("dispatchCustomer")?.value||"";
    const select=document.getElementById("dispatchMachine");
    if(!select)return;
    const current=select.value||"";
    const rows=dispatchMachines.filter((m)=>!customerId||String(m.customer_id)===String(customerId));
    const placeholder = !customerId
      ? "Select Customer first..."
      : (rows.length ? "Select Machine..." : "No active machines for this customer");
    select.innerHTML=`<option value="">${escapeHtml(placeholder)}</option>`+rows.map((m)=>{
      const label=[m.brand,m.model].filter(Boolean).join(" ")||m.machine_type||"Machine";
      const serial=m.serial_number?` · ${m.serial_number}`:"";
      return `<option value="${escapeHtml(m.id)}">${escapeHtml(label+serial)}</option>`;
    }).join("");
    if(rows.some((machine)=>String(machine.id)===String(current))) select.value=current;
  }

  function renderReceivedJobCards() {
    const select=document.getElementById("dispatchJobCard"); if(!select)return;
    const customerId=document.getElementById("dispatchCustomer")?.value||"";
    const current=select.value||"";
    const rows=dispatchJobCards.filter((job)=>!customerId||String(job.customerId)===String(customerId));
    const placeholder = customerId && !rows.length
      ? "No received Job Cards for this customer"
      : (!rows.length ? "No received Job Cards waiting for dispatch" : "Select received Job Card...");
    select.innerHTML=`<option value="">${escapeHtml(placeholder)}</option>`+rows.map((job)=>{
      const source=String(job.sourceType||"")==="SERVICE_REQUEST"?"Service Request":"Customer Job Card";
      const serial=job.machineSerial?` · S/N ${job.machineSerial}`:"";
      return `<option value="${escapeHtml(job.id)}">${escapeHtml(`RECEIVED · ${job.jobCardNo} · ${job.customerName} · ${job.machineLabel}${serial} · ${job.title} · ${source}`)}</option>`;
    }).join("");
    if(rows.some((job)=>String(job.id)===String(current))) select.value=current;
    const help=document.getElementById("receivedJobCardHelp");
    if(help){
      help.textContent=rows.length
        ? `${rows.length} received Job Card${rows.length===1?"":"s"} waiting for Technician assignment${customerId?" for this customer":""}.`
        : (customerId
          ? "No unassigned received Job Card is waiting for this customer. Use Refresh Job Cards after a new Service Request arrives."
          : "No unassigned received Job Cards are waiting. New/legacy machine-linked Service Requests are synchronized automatically when this list refreshes.");
    }
  }

  function syncJobCardSource() {
    const mode=dispatchMode(); const existing=mode==="existing";
    document.getElementById("receivedJobCardField")?.classList.toggle("hidden",!existing);
    document.getElementById("dispatchMachineField")?.classList.toggle("hidden",existing);
    document.getElementById("dispatchTitleField")?.classList.toggle("hidden",existing);
    document.getElementById("dispatchDescriptionField")?.classList.toggle("hidden",existing);
    const customer=document.getElementById("dispatchCustomer");
    if(customer) customer.disabled=false;
    if(existing){
      const job=dispatchJobCards.find((x)=>String(x.id)===String(document.getElementById("dispatchJobCard")?.value||""));
      if(job){
        customer.value=job.customerId||"";
        document.getElementById("dispatchPriority").value=job.priority||"NORMAL";
        document.getElementById("dispatchDueDate").value=job.due_date||"";
      }
      renderReceivedJobCards();
    } else {
      renderDispatchMachines();
    }
    updateDispatchNote();
  }

  function updateDispatchNote() {
    const techId = document.getElementById("dispatchTechnician")?.value || "";
    const customerId = document.getElementById("dispatchCustomer")?.value || "";
    const tech = dispatchTechnicians.find((item) => String(item.id) === String(techId));
    const customer = dispatchCustomers.find((item) => String(item.id) === String(customerId));
    const note = document.getElementById("dispatchNote");
    if (!note) return;
    if (tech && customer && tech.assignedCustomerId && String(tech.assignedCustomerId) !== String(customer.id)) {
      note.innerHTML = `<b>TEMPORARY OVERRIDE:</b> ${escapeHtml(tech.name)} stays permanently attached to ${escapeHtml(tech.assignedCustomerName || "their home customer")}. Only this Job Card is for ${escapeHtml(customer.name)}.`;
      note.classList.add("override");
    } else if (tech && customer) {
      note.textContent = `${tech.name} is already attached to ${customer.name}; this Job Card is a normal assignment.`;
      note.classList.remove("override");
    } else {
      note.textContent = dispatchMode()==="existing" ? "Select a received Job Card and Technician." : "Select a Technician, customer and machine to create a Job Card.";
      note.classList.remove("override");
    }
  }

  async function loadDispatchOptions({ announce = false } = {}) {
    const panel = document.getElementById("dispatchPanel");
    const selected = {
      technicianId: document.getElementById("dispatchTechnician")?.value || "",
      customerId: document.getElementById("dispatchCustomer")?.value || "",
      machineId: document.getElementById("dispatchMachine")?.value || "",
      jobCardId: document.getElementById("dispatchJobCard")?.value || "",
    };
    try {
      const data = await api("/engineering?action=dispatch-options");
      dispatchTechnicians = data.technicians || [];
      dispatchCustomers = data.customers || [];
      dispatchMachines = data.machines || [];
      dispatchJobCards = data.receivedJobCards || [];
      const technicianSelect=document.getElementById("dispatchTechnician");
      const customerSelect=document.getElementById("dispatchCustomer");
      technicianSelect.innerHTML = '<option value="">Select Technician...</option>' + dispatchTechnicians.map((tech) => {
        const home = tech.assignedCustomerName ? ` · Home: ${tech.assignedCustomerName}` : " · No home customer";
        return `<option value="${escapeHtml(tech.id)}">${escapeHtml(tech.name + home)}</option>`;
      }).join("");
      customerSelect.innerHTML = '<option value="">Select Customer...</option>' + dispatchCustomers.map((customer) => `<option value="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</option>`).join("");
      if(dispatchTechnicians.some((tech)=>String(tech.id)===String(selected.technicianId))) technicianSelect.value=selected.technicianId;
      if(dispatchCustomers.some((customer)=>String(customer.id)===String(selected.customerId))) customerSelect.value=selected.customerId;
      renderReceivedJobCards();
      if(dispatchJobCards.some((job)=>String(job.id)===String(selected.jobCardId))) document.getElementById("dispatchJobCard").value=selected.jobCardId;
      renderDispatchMachines();
      if(dispatchMachines.some((machine)=>String(machine.id)===String(selected.machineId))) document.getElementById("dispatchMachine").value=selected.machineId;
      syncJobCardSource();
      lastDispatchOptionsLoadedAt=Date.now();
      panel?.classList.remove("hidden");
      if(announce){
        const received=Number(data.dispatchSync?.receivedJobCards ?? dispatchJobCards.length);
        showAlert(received
          ? `Technician Dispatch refreshed: ${received} received Job Card${received===1?"":"s"} waiting for assignment.`
          : "Technician Dispatch refreshed. No received Job Cards are currently waiting for assignment.", false);
      }
    } catch (error) {
      if (error.status !== 403) showAlert(error.message || "Could not load Technician Dispatch.");
      panel?.classList.add("hidden");
    }
  }

  async function dispatchTechnician(event) {
    event.preventDefault();
    const mode=dispatchMode();
    const technicianId = document.getElementById("dispatchTechnician").value;
    const jobCardId=document.getElementById("dispatchJobCard")?.value||"";
    const existingJob=dispatchJobCards.find((x)=>String(x.id)===String(jobCardId));
    let customerId = mode==="existing" ? (existingJob?.customerId||"") : document.getElementById("dispatchCustomer").value;
    const tech = dispatchTechnicians.find((item) => String(item.id) === String(technicianId));
    const customer = dispatchCustomers.find((item) => String(item.id) === String(customerId));
    if(!technicianId){showAlert("Select Technician.");return;}
    if(mode==="existing"&&!jobCardId){showAlert("Select a received Job Card.");return;}
    if(mode==="create"&&(!customerId||!document.getElementById("dispatchMachine").value||!document.getElementById("dispatchTitle").value.trim())){showAlert("Customer, machine and Job Card title are required.");return;}
    const temporary = Boolean(tech?.assignedCustomerId && customerId && String(tech.assignedCustomerId) !== String(customerId));
    if (temporary && !confirm(`${tech.name} is attached to ${tech.assignedCustomerName || "another customer"}. Assign this Job Card to ${customer?.name || "the selected customer"} as a Temporary Override?`)) return;
    try {
      const result = await api("/engineering?action=dispatch", {
        method: "POST",
        body: JSON.stringify({
          jobCardMode:mode, jobCardId, technicianId, customerId,
          machineId:document.getElementById("dispatchMachine")?.value||"",
          title: document.getElementById("dispatchTitle")?.value.trim()||"",
          description: document.getElementById("dispatchDescription")?.value.trim()||"",
          priority: document.getElementById("dispatchPriority").value,
          dueDate: document.getElementById("dispatchDueDate").value || null,
          temporaryOverride:temporary,
        }),
      });
      showAlert(`${result.jobCardNo || "Job Card"} assigned to Technician${result.temporaryOverride ? " as Temporary Override" : ""}.`, false);
      document.getElementById("dispatchTitle").value = "";
      document.getElementById("dispatchDescription").value = "";
      document.getElementById("dispatchDueDate").value = "";
      await loadDispatchOptions();
    } catch (error) { showAlert(error.message || "Could not assign the Job Card."); }
  }

  async function load() {
    try {
      const data = await api("/engineering?action=dashboard");
      renderActivity(data.activity || []);
      renderOperatorMessages(data.operatorMessages || []);
      renderStatusSummary(data.machineStatus || {});
      renderReminders(data.serviceReminders || []);
      renderServicePreparations(data.servicePreparations || []);
      renderSpareRequests(data.spareRequests || []);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showAlert(error.message);
        return;
      }
      showAlert("Could not load the Engineering dashboard.");
    }
  }

  async function loadEngineerRoleSummary() {
    try {
      rolesCache = await api("/users/roles");
      const engineer = rolesCache.find((role) => role.name === "Engineer");
      const technician = rolesCache.find((role) => role.name === "Technician");
      document.getElementById("engineerRoleAccess").textContent =
        engineer?.allowedPages?.length ? engineer.allowedPages.join(", ") : "No pages assigned yet.";
      if (technician) {
        document.getElementById("technicianRoleAccess").textContent =
          technician.allowedPages === null
            ? "Technician app only / no admin dashboard pages"
            : (technician.allowedPages?.length ? technician.allowedPages.join(", ") : "No pages assigned yet.");
      }
    } catch (_) {
      document.getElementById("engineerRoleAccess").textContent = "—";
    }
  }

  function renderAllowedPages(selected = []) {
    document.getElementById("allowedPages").innerHTML = pageOptions.map(([key, label]) =>
      `<label class="check-option"><input type="checkbox" value="${escapeHtml(key)}" ${selected.includes(key) ? "checked" : ""}> ${escapeHtml(label)}</label>`
    ).join("");
  }

  function openRoleDialog(roleName) {
    const role = rolesCache.find((item) => item.name === roleName);
    if (!role) return;
    document.getElementById("roleForm").reset();
    document.getElementById("roleId").value = role.id;
    document.getElementById("roleDialogTitle").textContent = `Edit role — ${role.name}`;
    document.getElementById("roleFormAlert").className = "alert error hidden";
    renderAllowedPages(role.allowedPages || []);
    document.getElementById("roleDialog").showModal();
  }

  async function saveRole(event) {
    event.preventDefault();
    const id = document.getElementById("roleId").value;
    const role = rolesCache.find((item) => item.id === id);
    const payload = {
      name: role?.name,
      allowedPages: [...document.querySelectorAll("#allowedPages input:checked")].map((input) => input.value),
      permissions: {},
    };
    const confirmation = await window.belmConfirmEdit({
      title: "Save role changes?",
      message: `Confirm changes to the "${payload.name}" role's access.`,
    });
    if (!confirmation) return;
    Object.assign(payload, confirmation);

    const button = document.getElementById("saveRoleButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(`/users/roles/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      document.getElementById("roleDialog").close();
      await loadEngineerRoleSummary();
      showAlert("Role access updated successfully.", false);
    } catch (error) {
      const box = document.getElementById("roleFormAlert");
      box.textContent = error.message;
      box.className = "alert error";
    } finally {
      button.disabled = false;
      button.textContent = "Save role";
    }
  }

  document.querySelectorAll("[data-edit-role]").forEach((button) => {
    button.addEventListener("click", () => openRoleDialog(button.dataset.editRole));
  });
  document.getElementById("roleForm").addEventListener("submit", saveRole);
  document.getElementById("closeRoleDialog").addEventListener("click", () => document.getElementById("roleDialog").close());
  document.getElementById("cancelRoleDialog").addEventListener("click", () => document.getElementById("roleDialog").close());

  document.getElementById("refreshButton").addEventListener("click", async () => {
    await Promise.all([load(), loadDispatchOptions({ announce: true }), loadEngineerRoleSummary()]);
  });

  function initEngineeringWorkspace() {
    const serviceFrame = document.getElementById("engineeringServiceRequestsFrame");
    const jobFrame = document.getElementById("engineeringJobCardsFrame");
    const servicePanel = document.getElementById("engineeringServiceRequestsPanel");
    const jobPanel = document.getElementById("engineeringJobCardsPanel");
    const locked = document.getElementById("engineeringServiceRequestsLocked");
    const tabs = [...document.querySelectorAll("[data-eng-workspace]")];
    if (!serviceFrame || !jobFrame) return;
    const allowed = hasPageAccess("service-requests");
    if (!allowed) {
      serviceFrame.removeAttribute("src");
      jobFrame.removeAttribute("src");
      servicePanel?.classList.add("hidden");
      jobPanel?.classList.add("hidden");
      document.getElementById("engineeringWorkspaceTabs")?.classList.add("hidden");
      locked?.classList.remove("hidden");
      return;
    }
    serviceFrame.src = serviceFrame.dataset.src || "/service-request-manager/?embed=1";

    const setWorkspace = (name, updateHash = true) => {
      const jobCards = name === "job-cards";
      servicePanel?.classList.toggle("hidden", jobCards);
      jobPanel?.classList.toggle("hidden", !jobCards);
      tabs.forEach((button) => {
        const active = button.dataset.engWorkspace === (jobCards ? "job-cards" : "service-requests");
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      if (jobCards && !jobFrame.src) jobFrame.src = jobFrame.dataset.src || "/breakdown-workflow/?embed=1&source=admin";
      if (updateHash) history.replaceState(null, "", jobCards ? "#job-cards" : "#service-requests");
      window.setTimeout(() => document.getElementById("service-requests")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    };

    tabs.forEach((button) => button.addEventListener("click", () => setWorkspace(button.dataset.engWorkspace)));
    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.source === serviceFrame.contentWindow) {
        if (event.data?.type === "belm-service-requests-height") {
          const height = Math.max(620, Math.min(1400, Number(event.data.height) || 0));
          serviceFrame.style.height = `${height}px`;
        }
        if (event.data?.type === "belm-engineering-open-job-cards") setWorkspace("job-cards");
      }
      if (event.source === jobFrame.contentWindow) {
        if (event.data?.type === "belm-breakdown-workflow-height") {
          const height = Math.max(760, Math.min(1800, Number(event.data.height) || 0));
          jobFrame.style.height = `${height}px`;
        }
        if (event.data?.type === "belm-engineering-open-service-requests") setWorkspace("service-requests");
      }
    });
    setWorkspace(window.location.hash === "#job-cards" ? "job-cards" : "service-requests", false);
  }

  initEngineeringWorkspace();

  if (!token) {
    showAlert("Administrator login required.");
  } else {
    const rolesAccess = hasPageAccess("roles");
    if (!rolesAccess) {
      document.getElementById("engineeringRolesStrip")?.classList.add("hidden");
      document.getElementById("engineeringOverviewGrid")?.classList.add("hidden");
      document.getElementById("dispatchPanel")?.classList.add("hidden");
      document.getElementById("refreshButton")?.classList.add("hidden");
    } else {
      document.getElementById("dispatchTechnician")?.addEventListener("change", updateDispatchNote);
      document.getElementById("dispatchCustomer")?.addEventListener("change", ()=>{
        if(dispatchMode()==="existing"){
          const jobSelect=document.getElementById("dispatchJobCard");
          if(jobSelect) jobSelect.value="";
          renderReceivedJobCards();
        } else {
          renderDispatchMachines();
        }
        updateDispatchNote();
      });
      document.getElementById("dispatchJobCard")?.addEventListener("change", syncJobCardSource);
      document.getElementById("refreshReceivedJobCards")?.addEventListener("click", ()=>loadDispatchOptions({ announce: true }));
      document.querySelectorAll('input[name="jobCardMode"]').forEach((input)=>input.addEventListener("change",syncJobCardSource));
      document.getElementById("dispatchForm")?.addEventListener("submit", dispatchTechnician);
      window.addEventListener("focus", ()=>{
        if(Date.now()-lastDispatchOptionsLoadedAt>15000) loadDispatchOptions();
      });
      loadDispatchOptions();
      load();
      loadEngineerRoleSummary();
    }
  }
})();
