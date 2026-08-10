(function () {
  const token = localStorage.getItem("belm_admin_token");
  let suppliers = [];
  let pendingEditPin = null;

  async function confirmThenOpen(title, message, openFn) {
    const confirmation = await window.belmConfirmEdit({ title, message });
    if (!confirmation) return;
    pendingEditPin = confirmation.editPin;
    openFn();
  }

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);

  const googleSearchSuffixes = {
    "spare-parts": "spare parts OEM aftermarket supplier distributor",
    "parts-diagrams": "parts diagram exploded view parts catalogue",
    "service-manuals": "service workshop manual PDF",
    "wiring-diagrams": "electrical wiring diagram schematic",
    "hydraulic-diagrams": "hydraulic diagram schematic",
    "technical-specifications": "technical specifications datasheet",
    "fault-codes": "fault codes troubleshooting",
    suppliers: "authorized supplier distributor dealer",
    general: "",
  };

  function runGoogleSearch(event) {
    event.preventDefault();
    const input = document.getElementById("googleSearchInput");
    const type = document.getElementById("googleSearchType").value;
    const hint = document.getElementById("googleSearchHint");
    const searchDetails = input.value.trim();
    if (!searchDetails) {
      hint.textContent = "Enter a machine brand, model, serial number or part number first.";
      hint.classList.add("error");
      input.focus();
      return;
    }

    const query = [searchDetails, googleSearchSuffixes[type] || ""].filter(Boolean).join(" ");
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    hint.textContent = `Opening Google search for: ${query}`;
    hint.classList.remove("error");
    const googleTab = window.open(googleUrl, "_blank", "noopener,noreferrer");
    if (googleTab) googleTab.opener = null;
  }

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
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function showAlert(message, error = false) {
    const box = document.getElementById("pageAlert");
    box.textContent = message;
    box.className = `alert${error ? " error" : ""}`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function formError(message) {
    const box = document.getElementById("formAlert");
    box.textContent = message;
    box.className = "alert error";
  }

  function whatsappUrl(number, supplierName) {
    let digits = String(number || "").replace(/\D/g, "");
    if (digits.startsWith("0")) digits = `255${digits.slice(1)}`;
    const message = encodeURIComponent(`Hello ${supplierName}, this is BELM General Tech Service Limited. We would like information about your parts and services.`);
    return digits ? `https://wa.me/${digits}?text=${message}` : "";
  }

  function updateMetrics() {
    document.getElementById("supplierCount").textContent = suppliers.length.toLocaleString();
    document.getElementById("trustedCount").textContent = suppliers.filter((supplier) => supplier.trustStatus === "TRUSTED").length.toLocaleString();
    document.getElementById("reviewCount").textContent = suppliers.filter((supplier) => supplier.trustStatus !== "TRUSTED").length.toLocaleString();
    document.getElementById("whatsappCount").textContent = suppliers.filter((supplier) => supplier.whatsapp).length.toLocaleString();
  }

  function renderSuppliers() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filter = document.getElementById("trustFilter").value;
    const filtered = suppliers.filter((supplier) => {
      const matchesQuery = [supplier.name, supplier.specialty, supplier.location, supplier.email, supplier.phone]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return matchesQuery && (!filter || supplier.trustStatus === filter);
    });
    const grid = document.getElementById("supplierGrid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty">No supplier cards match this filter. Save a supplier to begin.</div>';
      return;
    }
    const labels = { TRUSTED: "Trusted candidate", REVIEW: "Needs review", VERIFY: "Verify first" };
    grid.innerHTML = filtered.map((supplier) => {
      const whatsapp = whatsappUrl(supplier.whatsapp || supplier.phone, supplier.name);
      return `<article class="supplier-card ${escapeHtml(supplier.trustStatus)}">
        <div class="supplier-head">
          <div><p class="eyebrow">Supplier</p><h2>${escapeHtml(supplier.name)}</h2><p>${escapeHtml(supplier.specialty || "General supplier")}</p></div>
          <div class="trust-score" title="Automated trust score">${escapeHtml(supplier.trustScore)}%</div>
        </div>
        <span class="trust-label ${escapeHtml(supplier.trustStatus)}">${escapeHtml(labels[supplier.trustStatus] || supplier.trustStatus)}</span>
        <div class="supplier-info">
          <span>📍 ${escapeHtml(supplier.location || "Location not recorded")}</span>
          <span>☎ ${escapeHtml(supplier.phone || "Phone not recorded")}</span>
          ${supplier.email ? `<a href="mailto:${escapeHtml(supplier.email)}">✉ ${escapeHtml(supplier.email)}</a>` : ""}
          ${supplier.website ? `<a href="${escapeHtml(supplier.website)}" target="_blank" rel="noopener">🌐 ${escapeHtml(supplier.website)}</a>` : ""}
        </div>
        <div class="trust-reasons">${(supplier.trustReasons || []).slice(0, 4).map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
        ${supplier.notes ? `<p class="supplier-notes">${escapeHtml(supplier.notes)}</p>` : ""}
        <div class="supplier-actions">
          ${whatsapp ? `<a class="whatsapp" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          <button data-edit="${escapeHtml(supplier.id)}">Edit</button>
          <button class="delete" data-delete="${escapeHtml(supplier.id)}">Delete</button>
        </div>
      </article>`;
    }).join("");
  }

  async function load() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      suppliers = await api("/suppliers");
      updateMetrics();
      renderSuppliers();
      try {
        const settings = await api("/settings");
        if (["light", "dark"].includes(settings.displayTheme)) applyTheme(settings.displayTheme);
      } catch (_) {}
    } catch (error) {
      document.getElementById("supplierGrid").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
      showAlert(error.message, true);
    }
  }

  function openSupplier(supplier = null) {
    document.getElementById("supplierForm").reset();
    document.getElementById("supplierId").value = supplier?.id || "";
    document.getElementById("dialogTitle").textContent = supplier ? `Edit ${supplier.name}` : "Save supplier";
    document.getElementById("supplierName").value = supplier?.name || "";
    document.getElementById("specialty").value = supplier?.specialty || "";
    document.getElementById("phone").value = supplier?.phone || "";
    document.getElementById("whatsapp").value = supplier?.whatsapp || "";
    document.getElementById("email").value = supplier?.email || "";
    document.getElementById("website").value = supplier?.website || "";
    document.getElementById("location").value = supplier?.location || "";
    document.getElementById("notes").value = supplier?.notes || "";
    document.getElementById("verified").checked = Boolean(supplier?.verified);
    document.getElementById("formAlert").className = "alert error hidden";
    document.getElementById("supplierDialog").showModal();
  }

  async function saveSupplier(event) {
    event.preventDefault();
    const id = document.getElementById("supplierId").value;
    const payload = {
      name: document.getElementById("supplierName").value.trim(),
      specialty: document.getElementById("specialty").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      whatsapp: document.getElementById("whatsapp").value.trim(),
      email: document.getElementById("email").value.trim(),
      website: document.getElementById("website").value.trim(),
      location: document.getElementById("location").value.trim(),
      notes: document.getElementById("notes").value.trim(),
      verified: document.getElementById("verified").checked,
    };
    const button = document.getElementById("saveButton");
    if (id) {
      if (!pendingEditPin) return;
      payload.editPin = pendingEditPin;
    }
    button.disabled = true;
    button.textContent = "Checking & saving…";
    try {
      const result = await api(id ? `/suppliers/${id}` : "/suppliers", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("supplierDialog").close();
      pendingEditPin = null;
      await load();
      showAlert(`Supplier saved. Smart trust status: ${result.trustStatus} (${result.trustScore}%).`);
    } catch (error) {
      formError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save supplier";
    }
  }

  async function deleteSupplier(id) {
    const supplier = suppliers.find((item) => item.id === id);
    if (!supplier) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Delete supplier?",
      message: `Delete supplier ${supplier.name}? It will move to the Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/suppliers/${id}`, { method: "DELETE", body: JSON.stringify(confirmation) });
      await load();
      showAlert("Supplier moved to the Recycle Bin.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("addButton").addEventListener("click", () => openSupplier());
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("googleSearchForm").addEventListener("submit", runGoogleSearch);
  document.getElementById("searchInput").addEventListener("input", renderSuppliers);
  document.getElementById("trustFilter").addEventListener("change", renderSuppliers);
  document.getElementById("supplierForm").addEventListener("submit", saveSupplier);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => { pendingEditPin = null; document.getElementById("supplierDialog").close(); }));
  document.getElementById("supplierGrid").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) {
      const supplier = suppliers.find((item) => item.id === edit.dataset.edit);
      confirmThenOpen("Edit supplier?", `Confirm you want to edit ${supplier?.name || "this supplier"}.`, () => openSupplier(supplier));
    }
    if (remove) deleteSupplier(remove.dataset.delete);
  });

  load();
})();
