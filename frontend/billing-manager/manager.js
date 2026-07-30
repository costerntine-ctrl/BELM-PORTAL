(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let invoices = [];
  let expenses = [];
  let proformas = [];

  function applyTheme(theme) {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = safeTheme;
    localStorage.setItem("belm_theme", safeTheme);
  }
  applyTheme(localStorage.getItem("belm_theme") || "light");

  const money = (value) => `TZS ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
  const today = () => new Date().toISOString().slice(0, 10);

  function showAlert(message, error = false) {
    const box = document.getElementById("alertBox");
    box.textContent = message;
    box.className = `alert${error ? " error" : ""}`;
  }

  function formError(id, message) {
    const box = document.getElementById(id);
    box.textContent = message;
    box.className = "alert error";
  }

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
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || "Request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function customerOptions(selected = "") {
    return `<option value="">Select customer…</option>${customers.map((customer) =>
      `<option value="${escapeHtml(customer.id)}" ${customer.id === selected ? "selected" : ""}>${escapeHtml(customer.name)}</option>`
    ).join("")}`;
  }

  function customerInformation(customer) {
    if (!customer) return "Choose a customer to auto-fill company information.";
    const cells = [
      ["Company", customer.name],
      ["Email", customer.email],
      ["Phone", customer.phone],
      ["Address", customer.address],
      ["TIN", customer.tinNumber],
      ["VRN", customer.vrn],
    ];
    return cells.map(([label, value]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`
    ).join("");
  }

  function fillCustomerInformation(selectId, infoId) {
    const customer = customers.find((item) => item.id === document.getElementById(selectId).value);
    const box = document.getElementById(infoId);
    box.innerHTML = customerInformation(customer);
    box.classList.toggle("empty-info", !customer);
    return customer;
  }

  function updateMetrics() {
    document.getElementById("invoiceValue").textContent = money(invoices.reduce((sum, item) => sum + Number(item.total || 0), 0));
    document.getElementById("paidValue").textContent = money(invoices.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0));
    document.getElementById("outstandingValue").textContent = money(invoices
      .filter((item) => !["PAID", "CANCELLED"].includes(item.status))
      .reduce((sum, item) => sum + Number(item.balance || 0), 0));
    document.getElementById("expenseValue").textContent = money(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  }

  function renderInvoices() {
    const panel = document.getElementById("invoicesPanel");
    if (!invoices.length) {
      panel.innerHTML = '<div class="empty">No invoices yet. Select “New invoice” to create one.</div>';
      return;
    }
    const statuses = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
    panel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${invoices.map((invoice) => `
      <tr>
        <td><strong>${escapeHtml(invoice.invoiceNo)}</strong><div class="muted">${(invoice.items || []).length} item(s)</div></td>
        <td>${escapeHtml(invoice.customer?.name || "—")}</td>
        <td class="money">${money(invoice.total)}</td>
        <td class="money">${money(invoice.paidAmount)}</td>
        <td class="money">${money(invoice.balance)}</td>
        <td>${invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString() : "—"}</td>
        <td><select class="status-select" data-invoice-status="${escapeHtml(invoice.id)}">${statuses.map((status) => `<option value="${status}" ${status === invoice.status ? "selected" : ""} ${["PAID", "PARTIALLY_PAID"].includes(status) ? "disabled" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select></td>
        <td><div class="row-actions">${Number(invoice.balance) > 0 && invoice.status !== "CANCELLED" ? `<button class="pay" data-payment="${escapeHtml(invoice.id)}">Add payment</button>` : ""}<button class="delete" data-delete-invoice="${escapeHtml(invoice.id)}">Delete</button></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderExpenses() {
    const panel = document.getElementById("expensesPanel");
    if (!expenses.length) {
      panel.innerHTML = '<div class="empty">No company expenses recorded.</div>';
      return;
    }
    panel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Recorded by</th><th>Amount</th><th></th></tr></thead><tbody>${expenses.map((expense) => `
      <tr><td>${new Date(`${expense.date}T00:00:00`).toLocaleDateString()}</td><td><span class="badge">${escapeHtml(expense.category)}</span></td><td>${escapeHtml(expense.description)}</td><td>${escapeHtml(expense.recordedBy || "—")}</td><td class="money">${money(expense.amount)}</td><td><div class="row-actions"><button class="delete" data-delete-expense="${escapeHtml(expense.id)}">Delete</button></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function renderProformas() {
    const panel = document.getElementById("proformasPanel");
    if (!proformas.length) {
      panel.innerHTML = '<div class="empty">No proforma invoices yet.</div>';
      return;
    }
    panel.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Proforma</th><th>Customer</th><th>Date</th><th>VAT</th><th>Subtotal</th><th>Discount</th><th>Total</th><th></th></tr></thead><tbody>${proformas.map((proforma) => `
      <tr><td><strong>${escapeHtml(proforma.invoiceNo)}</strong></td><td>${escapeHtml(proforma.customer?.name || "—")}</td><td>${new Date(`${proforma.date}T00:00:00`).toLocaleDateString()}</td><td>${escapeHtml(proforma.vatMode)}</td><td class="money">${money(proforma.totals?.subtotal)}</td><td class="money">${money(proforma.totals?.discount)}</td><td class="money">${money(proforma.totals?.grandTotal)}</td><td><div class="row-actions"><button data-edit-proforma="${escapeHtml(proforma.id)}">Edit</button><button class="delete" data-delete-proforma="${escapeHtml(proforma.id)}">Delete</button></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  async function load() {
    if (!token) {
      document.getElementById("invoicesPanel").innerHTML = '<div class="locked">Administrator login required.<br><a href="/admin/login">Go to admin login</a></div>';
      return;
    }
    try {
      [invoices, expenses, proformas, customers] = await Promise.all([
        api("/billing/invoices"),
        api("/company-expenses"),
        api("/proforma-invoices"),
        api("/customers"),
      ]);
      try {
        const settings = await api("/settings");
        if (settings.displayTheme === "dark" || settings.displayTheme === "light") {
          applyTheme(settings.displayTheme);
        }
      } catch (_) {}
      renderInvoices();
      renderExpenses();
      renderProformas();
      updateMetrics();
    } catch (error) {
      document.getElementById("invoicesPanel").innerHTML = `<div class="locked">${escapeHtml(error.message)}<br><a href="/admin/login">Go to admin login</a></div>`;
      showAlert(error.message, true);
    }
  }

  function invoiceItemRow(item = {}) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <label>Description<input data-field="description" required value="${escapeHtml(item.description || "")}"></label>
      <label>Qty<input data-field="quantity" required type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}"></label>
      <label>Unit price<input data-field="unitPrice" required type="number" min="0" step="0.01" value="${escapeHtml(item.unitPrice || item.unit_price || 0)}"></label>
      <button class="remove-item" type="button" aria-label="Remove item">×</button>`;
    return row;
  }

  function addInvoiceItem(item) {
    document.getElementById("invoiceItems").appendChild(invoiceItemRow(item));
  }

  function openInvoice() {
    document.getElementById("invoiceForm").reset();
    document.getElementById("invoiceCustomer").innerHTML = customerOptions();
    document.getElementById("invoiceMachine").innerHTML = '<option value="">No machine / general</option>';
    document.getElementById("invoiceItems").replaceChildren();
    document.getElementById("invoiceTax").value = "0";
    document.getElementById("invoiceError").className = "alert error hidden";
    fillCustomerInformation("invoiceCustomer", "invoiceCustomerInfo");
    addInvoiceItem();
    document.getElementById("invoiceDialog").showModal();
  }

  function updateMachineOptions() {
    const customer = fillCustomerInformation("invoiceCustomer", "invoiceCustomerInfo");
    document.getElementById("invoiceMachine").innerHTML = '<option value="">No machine / general</option>' + (customer?.machines || []).map((machine) =>
      `<option value="${escapeHtml(machine.id)}">${escapeHtml(machine.model)} · ${escapeHtml(machine.regNumber || machine.serialNumber || "")}</option>`
    ).join("");
  }

  async function saveInvoice(event) {
    event.preventDefault();
    const items = [...document.querySelectorAll("#invoiceItems .item-row")].map((row) => ({
      description: row.querySelector('[data-field="description"]').value.trim(),
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value),
    }));
    const button = document.getElementById("saveInvoiceButton");
    button.disabled = true;
    try {
      await api("/billing/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId: document.getElementById("invoiceCustomer").value,
          machineId: document.getElementById("invoiceMachine").value || null,
          dueDate: document.getElementById("invoiceDueDate").value || null,
          tax: Number(document.getElementById("invoiceTax").value || 0),
          items,
        }),
      });
      document.getElementById("invoiceDialog").close();
      await load();
      showAlert("Invoice saved successfully.");
    } catch (error) {
      formError("invoiceError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openPayment(id) {
    const invoice = invoices.find((item) => item.id === id);
    if (!invoice) return;
    document.getElementById("paymentForm").reset();
    document.getElementById("paymentInvoiceId").value = id;
    document.getElementById("paymentTitle").textContent = `Payment · ${invoice.invoiceNo}`;
    document.getElementById("paymentAmount").max = invoice.balance;
    document.getElementById("paymentAmount").value = invoice.balance;
    document.getElementById("paymentError").className = "alert error hidden";
    document.getElementById("paymentDialog").showModal();
  }

  async function savePayment(event) {
    event.preventDefault();
    const button = document.getElementById("savePaymentButton");
    button.disabled = true;
    try {
      await api(`/billing/invoices/${document.getElementById("paymentInvoiceId").value}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(document.getElementById("paymentAmount").value),
          method: document.getElementById("paymentMethod").value,
          reference: document.getElementById("paymentReference").value.trim(),
        }),
      });
      document.getElementById("paymentDialog").close();
      await load();
      showAlert("Payment recorded and invoice balance updated.");
    } catch (error) {
      formError("paymentError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openExpense() {
    document.getElementById("expenseForm").reset();
    document.getElementById("expenseDate").value = today();
    document.getElementById("expenseError").className = "alert error hidden";
    document.getElementById("expenseDialog").showModal();
  }

  async function saveExpense(event) {
    event.preventDefault();
    const button = document.getElementById("saveExpenseButton");
    button.disabled = true;
    try {
      await api("/company-expenses", {
        method: "POST",
        body: JSON.stringify({
          date: document.getElementById("expenseDate").value,
          category: document.getElementById("expenseCategory").value,
          description: document.getElementById("expenseDescription").value.trim(),
          amount: Number(document.getElementById("expenseAmount").value),
          recordedBy: document.getElementById("expenseRecordedBy").value.trim(),
        }),
      });
      document.getElementById("expenseDialog").close();
      await load();
      showAlert("Expense recorded successfully.");
    } catch (error) {
      formError("expenseError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function proformaItemRow(item = {}) {
    const row = document.createElement("div");
    row.className = "item-row proforma-row";
    row.innerHTML = `
      <label>Part no.<input data-field="partNumber" value="${escapeHtml(item.partNumber || item.part_number || "")}"></label>
      <label>Description<input data-field="description" required value="${escapeHtml(item.description || "")}"></label>
      <label>Qty<input data-field="qty" required type="number" min="1" step="1" value="${escapeHtml(item.qty || 1)}"></label>
      <label>Unit<input data-field="unit" value="${escapeHtml(item.unit || "PC")}"></label>
      <label>Unit price<input data-field="unitPrice" required type="number" min="0" step="0.01" value="${escapeHtml(item.unitPrice || item.unit_price || 0)}"></label>
      <button class="remove-item" type="button" aria-label="Remove item">×</button>`;
    return row;
  }

  function addProformaItem(item) {
    document.getElementById("proformaItems").appendChild(proformaItemRow(item));
  }

  function openProforma(proforma = null) {
    document.getElementById("proformaForm").reset();
    document.getElementById("proformaId").value = proforma?.id || "";
    document.getElementById("proformaTitle").textContent = proforma ? `Edit ${proforma.invoiceNo}` : "New proforma";
    document.getElementById("proformaCustomer").innerHTML = customerOptions(proforma?.customer?.id || "");
    document.getElementById("proformaCustomer").disabled = Boolean(proforma);
    document.getElementById("proformaDate").value = proforma?.date || today();
    document.getElementById("proformaDate").disabled = Boolean(proforma);
    document.getElementById("proformaVatMode").value = proforma?.vatMode || "VAT";
    document.getElementById("proformaDiscount").value = proforma?.discount || 0;
    fillCustomerInformation("proformaCustomer", "proformaCustomerInfo");
    document.getElementById("proformaItems").replaceChildren();
    (proforma?.items?.length ? proforma.items : [{}]).forEach(addProformaItem);
    document.getElementById("proformaError").className = "alert error hidden";
    document.getElementById("proformaDialog").showModal();
  }

  async function saveProforma(event) {
    event.preventDefault();
    const id = document.getElementById("proformaId").value;
    const items = [...document.querySelectorAll("#proformaItems .item-row")].map((row) => ({
      partNumber: row.querySelector('[data-field="partNumber"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      qty: Number(row.querySelector('[data-field="qty"]').value),
      unit: row.querySelector('[data-field="unit"]').value.trim() || "PC",
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value),
    }));
    const button = document.getElementById("saveProformaButton");
    button.disabled = true;
    try {
      await api(id ? `/proforma-invoices/${id}` : "/proforma-invoices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          customerId: document.getElementById("proformaCustomer").value,
          date: document.getElementById("proformaDate").value,
          vatMode: document.getElementById("proformaVatMode").value,
          discount: Number(document.getElementById("proformaDiscount").value || 0),
          items,
        }),
      });
      document.getElementById("proformaDialog").close();
      await load();
      showAlert(id ? "Proforma updated successfully." : "Proforma saved successfully.");
    } catch (error) {
      formError("proformaError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  async function remove(path, message) {
    if (!confirm(message)) return;
    try {
      await api(path, { method: "DELETE" });
      await load();
      showAlert("Record moved to the Recycle Bin.");
    } catch (error) {
      showAlert(error.message, true);
    }
  }

  document.querySelector(".tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    document.querySelectorAll("[data-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    ["invoices", "expenses", "proformas"].forEach((name) => document.getElementById(`${name}Panel`).classList.toggle("hidden", name !== button.dataset.tab));
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
  document.getElementById("newInvoiceButton").addEventListener("click", openInvoice);
  document.getElementById("newExpenseButton").addEventListener("click", openExpense);
  document.getElementById("newProformaButton").addEventListener("click", () => openProforma());
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("addInvoiceItem").addEventListener("click", () => addInvoiceItem());
  document.getElementById("addProformaItem").addEventListener("click", () => addProformaItem());
  document.getElementById("invoiceCustomer").addEventListener("change", updateMachineOptions);
  document.getElementById("proformaCustomer").addEventListener("change", () =>
    fillCustomerInformation("proformaCustomer", "proformaCustomerInfo"));
  document.getElementById("invoiceForm").addEventListener("submit", saveInvoice);
  document.getElementById("paymentForm").addEventListener("submit", savePayment);
  document.getElementById("expenseForm").addEventListener("submit", saveExpense);
  document.getElementById("proformaForm").addEventListener("submit", saveProforma);
  document.querySelectorAll(".item-list").forEach((list) => list.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-item");
    if (removeButton && list.children.length > 1) removeButton.closest(".item-row").remove();
  }));
  document.getElementById("invoicesPanel").addEventListener("click", (event) => {
    const pay = event.target.closest("[data-payment]");
    const removeButton = event.target.closest("[data-delete-invoice]");
    if (pay) openPayment(pay.dataset.payment);
    if (removeButton) remove(`/billing/invoices/${removeButton.dataset.deleteInvoice}`, "Delete this invoice? It will move to the Recycle Bin.");
  });
  document.getElementById("invoicesPanel").addEventListener("change", async (event) => {
    if (!event.target.dataset.invoiceStatus) return;
    try {
      const invoice = invoices.find((item) => item.id === event.target.dataset.invoiceStatus);
      await api(`/billing/invoices/${event.target.dataset.invoiceStatus}`, {
        method: "PUT",
        body: JSON.stringify({ status: event.target.value, dueDate: invoice?.dueDate || null, machineId: invoice?.machineId || null }),
      });
      await load();
      showAlert("Invoice status updated.");
    } catch (error) {
      showAlert(error.message, true);
      await load();
    }
  });
  document.getElementById("expensesPanel").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-delete-expense]");
    if (removeButton) remove(`/company-expenses/${removeButton.dataset.deleteExpense}`, "Delete this expense? It will move to the Recycle Bin.");
  });
  document.getElementById("proformasPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-proforma]");
    const removeButton = event.target.closest("[data-delete-proforma]");
    if (edit) openProforma(proformas.find((item) => item.id === edit.dataset.editProforma));
    if (removeButton) remove(`/proforma-invoices/${removeButton.dataset.deleteProforma}`, "Delete this proforma? It will move to the Recycle Bin.");
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });

  load();
})();
