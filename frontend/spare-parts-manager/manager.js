(function () {
  const token = localStorage.getItem("belm_admin_token");
  let parts = [];

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]);
  const money = (value) => `TZS ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
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

  function formError(message) {
    const box = document.getElementById("formAlert");
    box.textContent = message;
    box.className = "alert error";
  }

  function updateMetrics() {
    document.getElementById("partCount").textContent = parts.length.toLocaleString();
    document.getElementById("unitCount").textContent = parts.reduce((sum, part) => sum + Number(part.stockQty || 0), 0).toLocaleString();
    document.getElementById("inventoryCost").textContent = money(parts.reduce((sum, part) =>
      sum + Number(part.stockQty || 0) * Number(part.purchasePrice || 0), 0));
    document.getElementById("lowStockCount").textContent = parts.filter((part) =>
      Number(part.stockQty) <= Number(part.reorderThreshold)).length.toLocaleString();
  }

  function renderParts() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = parts.filter((part) =>
      [part.partNumber, part.name, part.category].some((value) => String(value || "").toLowerCase().includes(query)));
    const panel = document.getElementById("partsPanel");
    if (!filtered.length) {
      panel.className = "empty";
      panel.textContent = query ? "No spare parts match this search." : "No spare parts saved yet. Select “Add spare part” to create the first record.";
      return;
    }

    panel.className = "table-wrap";
    panel.innerHTML = `<table>
      <thead><tr><th>Part number</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Purchase</th><th>Selling</th><th>Profit</th><th></th></tr></thead>
      <tbody>${filtered.map((part) => {
        const profit = Number(part.sellingPrice || 0) - Number(part.purchasePrice || 0);
        const low = Number(part.stockQty) <= Number(part.reorderThreshold);
        return `<tr>
          <td class="nowrap"><strong>${escapeHtml(part.partNumber)}</strong></td>
          <td>${escapeHtml(part.name)}</td>
          <td class="muted">${escapeHtml(part.category || "—")}</td>
          <td><span class="badge ${low ? "warn" : ""}">${escapeHtml(part.stockQty)}</span></td>
          <td>${escapeHtml(part.reorderThreshold)}</td>
          <td class="nowrap">${money(part.purchasePrice)}</td>
          <td class="nowrap">${money(part.sellingPrice)}</td>
          <td class="nowrap">${money(profit)}</td>
          <td><div class="row-actions"><button data-edit="${escapeHtml(part.id)}">Edit</button><button class="delete" data-delete="${escapeHtml(part.id)}">Delete</button></div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  async function loadParts() {
    if (!token) {
      window.location.href = "/login/";
      return;
    }
    try {
      parts = await api("/spare-parts");
      updateMetrics();
      renderParts();
      try {
        const settings = await api("/settings");
        if (["light", "dark"].includes(settings.displayTheme)) applyTheme(settings.displayTheme);
      } catch (_) {}
    } catch (error) {
      document.getElementById("partsPanel").className = "empty";
      document.getElementById("partsPanel").innerHTML = `${escapeHtml(error.message)}<br><a href="/login/">Go to portal login</a>`;
      showAlert(error.message, true);
    }
  }

  function openPart(part = null) {
    document.getElementById("partForm").reset();
    document.getElementById("partId").value = part?.id || "";
    document.getElementById("dialogTitle").textContent = part ? "Edit spare part" : "Add spare part";
    document.getElementById("partNumber").value = part?.partNumber || "";
    document.getElementById("partName").value = part?.name || "";
    document.getElementById("category").value = part?.category || "";
    document.getElementById("stockQty").value = part?.stockQty ?? 0;
    document.getElementById("reorderThreshold").value = part?.reorderThreshold ?? 5;
    document.getElementById("purchasePrice").value = part?.purchasePrice ?? 0;
    document.getElementById("sellingPrice").value = part?.sellingPrice ?? 0;
    document.getElementById("formAlert").className = "alert error hidden";
    document.getElementById("partDialog").showModal();
    document.getElementById("partNumber").focus();
  }

  async function savePart(event) {
    event.preventDefault();
    const id = document.getElementById("partId").value;
    const payload = {
      partNumber: document.getElementById("partNumber").value.trim(),
      name: document.getElementById("partName").value.trim(),
      category: document.getElementById("category").value.trim(),
      stockQty: Number(document.getElementById("stockQty").value),
      reorderThreshold: Number(document.getElementById("reorderThreshold").value),
      purchasePrice: Number(document.getElementById("purchasePrice").value),
      sellingPrice: Number(document.getElementById("sellingPrice").value),
    };
    const button = document.getElementById("saveButton");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await api(id ? `/spare-parts/${id}` : "/spare-parts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      document.getElementById("partDialog").close();
      await loadParts();
      showAlert(id ? "Spare part updated and saved." : "Spare part added and saved.");
    } catch (error) {
      formError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Save spare part";
    }
  }

  async function deletePart(id) {
    const part = parts.find((item) => item.id === id);
    if (!part || !confirm(`Delete ${part.partNumber} — ${part.name}? It will move to the Recycle Bin.`)) return;
    try {
      await api(`/spare-parts/${id}`, { method: "DELETE" });
      await loadParts();
      showAlert("Spare part moved to the Recycle Bin.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.getElementById("addButton").addEventListener("click", () => openPart());
  document.getElementById("refreshButton").addEventListener("click", loadParts);
  document.getElementById("searchInput").addEventListener("input", renderParts);
  document.getElementById("partForm").addEventListener("submit", savePart);
  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => document.getElementById("partDialog").close()));
  document.getElementById("partsPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    const remove = event.target.closest("[data-delete]");
    if (edit) openPart(parts.find((part) => part.id === edit.dataset.edit));
    if (remove) deletePart(remove.dataset.delete);
  });

  loadParts();
})();
