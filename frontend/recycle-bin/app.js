(function () {
  const token = localStorage.getItem("belm_admin_token");
  let items = [];

  const TYPE_LABELS = {
    customer: "Customer",
    machine: "Machine",
    role: "Role",
    user: "System User",
    sparePart: "Spare Part",
    invoice: "Invoice",
    proformaInvoice: "Proforma Invoice",
    companyExpense: "Company Expense",
    template: "Checklist Template",
    supplier: "Supplier",
  };

  async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/admin/login";
      throw new Error("Your login session has expired.");
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function message(text, isError = false) {
    const box = document.getElementById("pageAlert");
    box.textContent = text;
    box.className = isError ? "alert error" : "alert success";
  }

  function render() {
    const query = document.getElementById("searchInput").value.trim().toLowerCase();
    const filtered = query
      ? items.filter((item) =>
          item.label.toLowerCase().includes(query) ||
          (TYPE_LABELS[item.entityType] || item.entityType).toLowerCase().includes(query))
      : items;

    document.getElementById("trashCount").textContent = items.length.toLocaleString();
    document.getElementById("trashRows").innerHTML = filtered.length
      ? filtered.map((item) => `
        <tr>
          <td><span class="badge">${escapeHtml(TYPE_LABELS[item.entityType] || item.entityType)}</span></td>
          <td><strong>${escapeHtml(item.label)}</strong></td>
          <td class="muted">${escapeHtml(item.deletedBy || "—")}</td>
          <td class="muted">${escapeHtml(item.reason || "—")}</td>
          <td class="muted nowrap">${new Date(item.deletedAt).toLocaleString()}</td>
          <td><div class="row-actions">
            <button data-restore="${escapeHtml(item.id)}">Restore</button>
            <button class="delete" data-forget="${escapeHtml(item.id)}">Forget</button>
          </div></td>
        </tr>`).join("")
      : '<tr><td colspan="6" class="empty">Recycle Bin is empty.</td></tr>';
  }

  async function load() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      items = await api("/trash");
      render();
    } catch (error) {
      message(error.message, true);
    }
  }

  async function restore(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    if (!confirm(`Restore "${item.label}"? It will go back to exactly how it was.`)) return;
    try {
      await api(`/trash/${encodeURIComponent(id)}`, { method: "POST" });
      message(`"${item.label}" restored successfully.`);
      await load();
    } catch (error) {
      message(error.message, true);
    }
  }

  async function forget(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    const confirmation = await window.belmConfirmDelete({
      title: "Forget this record permanently?",
      message: `Permanently remove "${item.label}" from the database? This cannot be undone — it will not be recoverable, not even from this Recycle Bin.`,
    });
    if (!confirmation) return;
    try {
      await api(`/trash/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify(confirmation),
      });
      message(`"${item.label}" permanently removed from the database.`);
      await load();
    } catch (error) {
      message(error.message, true);
    }
  }

  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("searchInput").addEventListener("input", render);
  document.getElementById("trashRows").addEventListener("click", (event) => {
    const restoreButton = event.target.closest("[data-restore]");
    const forgetButton = event.target.closest("[data-forget]");
    if (restoreButton) restore(restoreButton.dataset.restore);
    if (forgetButton) forget(forgetButton.dataset.forget);
  });

  load();
})();
