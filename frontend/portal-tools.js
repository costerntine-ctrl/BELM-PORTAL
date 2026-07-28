(function () {
  const buttonId = "belm-applications-shortcut";
  const pathname = window.location.pathname;
  document.body.dataset.belmArea = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/tech")
      ? "tech"
      : pathname.startsWith("/portal")
        ? "portal"
        : "public";

  function tokenPayload(storageKey) {
    const token = localStorage.getItem(storageKey);
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

  async function pendingCount(token) {
    try {
      const response = await fetch("/api/applications?status=PENDING", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return Array.isArray(data.applications) ? data.applications.length : null;
    } catch {
      return null;
    }
  }

  async function refreshShortcut() {
    const old = document.getElementById(buttonId);
    const token = localStorage.getItem("belm_admin_token");
    const onAdminPage = window.location.pathname.startsWith("/admin");
    if (!token || !onAdminPage) {
      if (old) old.remove();
      return;
    }
    if (old) return;

    const link = document.createElement("a");
    link.id = buttonId;
    link.href = "/admin-applications/";
    link.textContent = "Customer Applications";
    Object.assign(link.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "9999",
      background: "#00a651",
      color: "#fff",
      padding: "12px 16px",
      border: "2px solid #ffd400",
      borderRadius: "999px",
      boxShadow: "0 10px 28px rgba(21, 29, 49, .25)",
      font: "700 13px Inter, system-ui, sans-serif",
      textDecoration: "none",
    });
    document.body.appendChild(link);

    const count = await pendingCount(token);
    if (count !== null) {
      link.textContent = count > 0
        ? `Customer Applications (${count})`
        : "Customer Applications";
      if (count > 0) {
        link.style.background = "#ffd400";
        link.style.color = "#151d31";
        link.style.borderColor = "#00a651";
      }
    }
  }

  async function syncTechnicianCustomerName() {
    if (!window.location.pathname.startsWith("/tech")) return;
    const techToken = localStorage.getItem("belm_tech_token");
    const rawUser = localStorage.getItem("belm_tech_user");
    if (!techToken || !rawUser) return;

    let techUser;
    try {
      techUser = JSON.parse(rawUser);
    } catch {
      return;
    }
    if (!techUser.assignedCustomerId || techUser.assignedCustomerName) return;
    const syncKey = `belm-tech-customer-${techUser.assignedCustomerId}`;
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, "running");

    try {
      const response = await fetch(`/api/customers/${techUser.assignedCustomerId}`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      if (!response.ok) {
        sessionStorage.removeItem(syncKey);
        return;
      }
      const customer = await response.json();
      techUser.assignedCustomerName = customer.name;
      localStorage.setItem("belm_tech_user", JSON.stringify(techUser));
      sessionStorage.setItem(syncKey, "done");
      window.location.reload();
    } catch {
      sessionStorage.removeItem(syncKey);
    }
  }

  function clarifyTechnicianAssignment() {
    if (!window.location.pathname.startsWith("/admin")) return;
    for (const item of document.querySelectorAll("option")) {
      if (item.textContent.trim() === "None — see all customers") {
        item.textContent = "Select customer — required for Technician";
      }
    }
  }

  function enhanceCustomerLogin() {
    if (window.location.pathname !== "/portal/login") return;
    for (const label of document.querySelectorAll("label")) {
      if (label.textContent.trim() === "Portal link / ID") {
        label.textContent = "Email address / Portal ID";
      }
    }
    const loginInput = document.querySelector('form input:not([type="password"])');
    if (loginInput) loginInput.placeholder = "customer@email.com or customer-name";
    const customerSlug = new URLSearchParams(window.location.search).get("customer");
    const form = document.querySelector("form");
    if (customerSlug && form && !document.getElementById("belm-customer-link-note")) {
      const note = document.createElement("div");
      note.id = "belm-customer-link-note";
      note.textContent = `Customer portal: ${customerSlug.replace(/-/g, " ")}`;
      Object.assign(note.style, {
        marginBottom: "14px",
        padding: "9px 11px",
        border: "1px solid #efd65d",
        borderRadius: "8px",
        background: "#fff9cf",
        color: "#151d31",
        font: "700 12px Inter, system-ui, sans-serif",
        textTransform: "capitalize",
      });
      const labels = form.querySelectorAll("label");
      if (labels.length > 0) form.insertBefore(note, labels[0]);
    }
  }

  function enhanceCustomerAssistants() {
    if (!window.location.pathname.startsWith("/portal/dashboard")) return;
    const payload = tokenPayload("belm_customer_token");
    for (const button of document.querySelectorAll("button")) {
      if (!["+ Add user", "+ Manage assistants"].includes(button.textContent.trim())) continue;
      if (payload?.actorType === "assistant") {
        button.style.display = "none";
        continue;
      }
      button.textContent = "+ Manage assistants";
      if (button.dataset.belmAssistantsReady === "1") continue;
      button.dataset.belmAssistantsReady = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = "/customer-users/";
      });
    }
  }

  function redirectChecklistManager() {
    if (window.location.pathname === "/admin/checklist-templates") {
      window.location.replace("/checklist-manager/");
    }
  }

  function redirectServiceRequestManager() {
    if (window.location.pathname === "/admin/service-requests") {
      window.location.replace("/service-request-manager/");
    }
  }

  function redirectBillingManager() {
    if (window.location.pathname === "/admin/billing") {
      window.location.replace("/billing-manager/");
    }
  }

  function removeLegacyOwnerRole() {
    document.querySelectorAll('select option[value="owner"]').forEach((option) => {
      option.remove();
    });
  }

  function improvePhotoInputs() {
    document.querySelectorAll('input[placeholder="Photo upload — wire up file input for production"]').forEach((input) => {
      input.placeholder = "Paste photo link or photo reference";
    });
  }

  function enforceViewerInterface() {
    const payload = tokenPayload("belm_customer_token");
    if (!payload || String(payload.customerRole || "").toLowerCase() !== "viewer") return;

    document.querySelectorAll("button").forEach((button) => {
      const text = (button.textContent || "").trim().toLowerCase();
      if (text.includes("request service") || (text === "cancel" && button.classList.contains("text-red-600"))) {
        button.hidden = true;
        button.disabled = true;
      }
    });
  }

  function correctLegacyCopy() {
    if (window.location.pathname === "/admin/activity-log") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("needs a dedicated /api/activity-log")) {
          paragraph.textContent = "Shows the latest checklist submissions recorded by BELM Technicians.";
        }
      });
    }

    if (window.location.pathname === "/admin/suppliers") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("static-hosted frontend")) {
          paragraph.textContent = "Use these shortcuts to search public supplier, datasheet and parts-diagram sources, then save verified supplier details below.";
        }
      });
    }

    if (window.location.pathname === "/admin/roles/recycle-bin") {
      document.querySelectorAll("p").forEach((paragraph) => {
        if ((paragraph.textContent || "").includes("purged automatically")) {
          paragraph.textContent = "Deleted items remain here until a Super Admin restores or permanently deletes them.";
        }
      });
      document.querySelectorAll("th").forEach((heading) => {
        if ((heading.textContent || "").trim() === "Days left") heading.textContent = "Retention";
      });
      document.querySelectorAll("tbody td").forEach((cell) => {
        if (/^\d+\s+day\(s\)$/.test((cell.textContent || "").trim())) cell.textContent = "Manual";
      });

      let adminRole = "";
      try {
        adminRole = JSON.parse(localStorage.getItem("belm_admin_user") || "{}").role || "";
      } catch (_) {}
      if (adminRole !== "Super Admin") {
        document.querySelectorAll("tbody button").forEach((button) => {
          button.hidden = true;
          button.disabled = true;
        });
      }
    }
  }

  function installAuthenticatedReportDownloads() {
    if (document.documentElement.dataset.belmReportDownload === "ready") return;
    document.documentElement.dataset.belmReportDownload = "ready";

    document.addEventListener("click", async (event) => {
      const link = event.target.closest('a[href^="/api/customer-portal/reports/"][href$="/download"]');
      if (!link) return;
      event.preventDefault();

      const token = localStorage.getItem("belm_customer_token");
      if (!token) {
        window.location.href = "/portal/login";
        return;
      }

      const originalText = link.textContent;
      link.textContent = "Downloading...";
      link.style.pointerEvents = "none";

      try {
        const response = await fetch(link.getAttribute("href"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          let message = "Could not download this report.";
          try {
            const error = await response.json();
            message = error.error || message;
          } catch (_) {}
          throw new Error(message);
        }

        const blob = await response.blob();
        const reportId = (link.getAttribute("href").match(/reports\/([^/]+)\/download/) || [])[1] || "report";
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = `BELM-checklist-${reportId}.json`;
        document.body.appendChild(download);
        download.click();
        download.remove();
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        alert(error.message || "Could not download this report.");
      } finally {
        link.textContent = originalText;
        link.style.pointerEvents = "";
      }
    }, true);
  }

  async function addTechnicianTasksShortcut() {
    if (window.location.pathname !== "/tech") return;
    if (document.getElementById("belm-tech-tasks-shortcut")) return;

    const payload = tokenPayload("belm_tech_token");
    const token = localStorage.getItem("belm_tech_token");
    if (!payload || !token || String(payload.roleName || "").toLowerCase() !== "technician") return;

    const link = document.createElement("a");
    link.id = "belm-tech-tasks-shortcut";
    link.href = "/technician-tasks/";
    link.textContent = "My Tasks";
    Object.assign(link.style, {
      position: "fixed",
      right: "20px",
      bottom: "82px",
      zIndex: "1000",
      padding: "12px 18px",
      borderRadius: "999px",
      background: "#00aa5b",
      color: "#fff",
      fontWeight: "800",
      textDecoration: "none",
      boxShadow: "0 12px 30px rgba(0, 170, 91, .30)",
      border: "2px solid #f4cf00",
    });
    document.body.appendChild(link);

    try {
      const response = await fetch(`/api/tasks/user/${encodeURIComponent(payload.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const tasks = await response.json();
      const pending = Array.isArray(tasks)
        ? tasks.filter((task) => task.status !== "DONE").length
        : 0;
      if (pending > 0) link.textContent = `My Tasks (${pending})`;
    } catch (_) {}
  }

  installAuthenticatedReportDownloads();
  refreshShortcut();
  addTechnicianTasksShortcut();
  syncTechnicianCustomerName();
  clarifyTechnicianAssignment();
  enhanceCustomerLogin();
  enhanceCustomerAssistants();
  redirectChecklistManager();
  redirectServiceRequestManager();
  redirectBillingManager();
  removeLegacyOwnerRole();
  improvePhotoInputs();
  enforceViewerInterface();
  correctLegacyCopy();
  setInterval(() => {
    refreshShortcut();
    addTechnicianTasksShortcut();
    syncTechnicianCustomerName();
    clarifyTechnicianAssignment();
    enhanceCustomerLogin();
    enhanceCustomerAssistants();
    redirectChecklistManager();
    redirectServiceRequestManager();
    redirectBillingManager();
    removeLegacyOwnerRole();
    improvePhotoInputs();
    enforceViewerInterface();
    correctLegacyCopy();
  }, 1500);
})();
