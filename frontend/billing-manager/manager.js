(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let invoices = [];
  let expenses = [];
  let proformas = [];
  let receipts = [];
  let bankData = { accounts: [], withdrawals: [], summary: {} };

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  }

  // Dark/light mode is handled centrally by admin-sidebar.js (per-admin
  // localStorage preference) — this page no longer sets its own theme or
  // reads/writes a shared company-wide setting.

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

  function customerOptions(selected = "") {
    return `<option value="">Select customer…</option>${customers.map((customer) =>
      `<option value="${escapeHtml(customer.id)}" ${customer.id === selected ? "selected" : ""}>${escapeHtml(customer.name)}</option>`
    ).join("")}`;
  }

  function bankAccountOptions(selected = "", includeUnallocated = true) {
    const first = includeUnallocated
      ? '<option value="">Unallocated / cash account</option>'
      : '<option value="">Select bank account…</option>';
    return first + (bankData.accounts || []).map((account) =>
      `<option value="${escapeHtml(account.id)}" ${account.id === selected ? "selected" : ""}>${escapeHtml(account.bankName)} · ${escapeHtml(account.accountNumber)} · ${money(account.balance)}</option>`
    ).join("");
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

  function reviewHeading(title, description, exportUrl) {
    return `<div class="review-heading"><div><p class="eyebrow">Review</p><h2>${escapeHtml(title)}</h2><span>${escapeHtml(description)}</span></div>${exportUrl ? `<a class="export-pdf-button" href="${exportUrl}" target="_blank" rel="noopener">Export PDF</a>` : ""}</div>`;
  }

  function renderInvoices() {
    const panel = document.getElementById("invoicesPanel");
    if (!invoices.length) {
      panel.innerHTML = `${reviewHeading("Invoices", "Review invoice totals, balances, due dates and status.", `/api/billing?action=export-invoices&token=${encodeURIComponent(token)}`)}<div class="empty">No invoices yet. Select “New invoice” to create one.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Invoices", "Review invoice totals, balances, due dates and status.", `/api/billing?action=export-invoices&token=${encodeURIComponent(token)}`)}<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${invoices.map((invoice) => `
      <tr>
        <td><strong>${escapeHtml(invoice.invoiceNo)}</strong> <span class="invoice-sync-badge ${invoice.status === "PAID" ? "paid" : invoice.status === "CANCELLED" ? "cancelled" : "outstanding"}">${invoice.status === "PAID" ? "PAID" : invoice.status === "CANCELLED" ? "CANCELLED" : "OUTSTANDING"}</span><div class="muted">${(invoice.items || []).length} item(s)</div></td>
        <td>${escapeHtml(invoice.customer?.name || "—")}</td>
        <td class="money">${money(invoice.total)}</td>
        <td class="money">${money(invoice.paidAmount)}</td>
        <td class="money">${money(invoice.balance)}</td>
        <td>${invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</td>
        <td><select class="status-select" data-invoice-status="${escapeHtml(invoice.id)}" ${invoice.status === "CANCELLED" ? "disabled" : ""}><option value="${escapeHtml(invoice.status)}" selected>${escapeHtml(invoice.status.replaceAll("_", " "))}</option>${invoice.status !== "CANCELLED" ? '<option value="CANCELLED">CANCEL INVOICE</option>' : ""}</select></td>
        <td><div class="row-actions"><div class="row-actions-line"><button class="edit" data-edit-invoice="${escapeHtml(invoice.id)}">Re-edit</button>${Number(invoice.balance) > 0 && invoice.status !== "CANCELLED" ? `<button class="pay" data-payment="${escapeHtml(invoice.id)}">Add payment</button><button class="pay" data-receipt="${escapeHtml(invoice.id)}" data-receipt-customer="${escapeHtml(invoice.customer?.id || "")}">Create receipt</button>` : ""}</div><div class="row-actions-line"><button class="export-row-button" data-review-invoice="${escapeHtml(invoice.id)}">Review &amp; Export</button><button class="delete" data-delete-invoice="${escapeHtml(invoice.id)}">Delete</button></div></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderPayments() {
    const panel = document.getElementById("paymentsPanel");
    const payments = invoices.flatMap((invoice) => (invoice.payments || []).map((payment) => ({
      ...payment,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customer?.name || "—",
    })));
    if (!payments.length) {
      panel.innerHTML = `${reviewHeading("Payments", "Review every customer payment and its invoice reference.", `/api/billing?action=export-payments&token=${encodeURIComponent(token)}`)}<div class="empty">No customer payments recorded.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Payments", "Review every customer payment and its invoice reference.", `/api/billing?action=export-payments&token=${encodeURIComponent(token)}`)}<div class="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Bank</th><th>Reference</th><th>Amount</th><th></th></tr></thead><tbody>${payments.map((payment) => `
      <tr>
        <td>${payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "—"}</td>
        <td><strong>${escapeHtml(payment.invoiceNo)}</strong></td>
        <td>${escapeHtml(payment.customerName)}</td>
        <td><span class="badge">${escapeHtml(payment.method || "—")}</span></td>
        <td>${escapeHtml(payment.bankName || "Unallocated")}</td>
        <td>${escapeHtml(payment.reference || "No reference")}</td>
        <td class="money">${money(payment.amount)}</td>
        <td><div class="row-actions"><button class="edit" data-edit-payment="${escapeHtml(payment.id)}" data-payment-invoice="${escapeHtml(payment.invoiceId)}">Re-edit</button>${payment.receipt_id ? '<span class="muted">Receipt linked</span>' : `<button class="delete" data-delete-payment="${escapeHtml(payment.id)}" data-payment-invoice="${escapeHtml(payment.invoiceId)}">Reverse</button>`}</div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderExpenses() {
    const panel = document.getElementById("expensesPanel");
    if (!expenses.length) {
      panel.innerHTML = `${reviewHeading("Expenses", "Review operating costs, dates and responsible staff.", `/api/company-expenses?action=export&token=${encodeURIComponent(token)}`)}<div class="empty">No company expenses recorded.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Expenses", "Review operating costs, dates and responsible staff.", `/api/company-expenses?action=export&token=${encodeURIComponent(token)}`)}<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Bank</th><th>Recorded by</th><th>Amount</th><th></th></tr></thead><tbody>${expenses.map((expense) => `
      <tr><td>${formatDate(expense.date)}</td><td><span class="badge">${escapeHtml(expense.category)}</span></td><td>${escapeHtml(expense.description)}</td><td>${escapeHtml(expense.bankName || "Unallocated")}</td><td>${escapeHtml(expense.recordedBy || "—")}</td><td class="money">${money(expense.amount)}</td><td><div class="row-actions">${expense.hasReceipt ? `<button type="button" data-view-expense-receipt="${escapeHtml(expense.id)}">Receipt</button>` : ""}<button class="edit" data-edit-expense="${escapeHtml(expense.id)}">Re-edit</button><button class="delete" data-delete-expense="${escapeHtml(expense.id)}">Delete</button></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function renderProformas() {
    const panel = document.getElementById("proformasPanel");
    if (!proformas.length) {
      panel.innerHTML = `${reviewHeading("Proforma", "Review quotations, VAT, discount and grand total.", `/api/proforma-invoices?action=export&token=${encodeURIComponent(token)}`)}<div class="empty">No proforma invoices yet.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Proforma", "Review quotations, VAT, discount and grand total.", `/api/proforma-invoices?action=export&token=${encodeURIComponent(token)}`)}<div class="table-wrap"><table><thead><tr><th>Proforma</th><th>Customer</th><th>Date</th><th>VAT</th><th>Subtotal</th><th>Discount</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${proformas.map((proforma) => `
      <tr><td><strong>${escapeHtml(proforma.invoiceNo)}</strong>${proforma.autoPrepared ? ' <span class="badge on">AUTO SERVICE</span>' : ''}</td><td>${escapeHtml(proforma.customer?.name || "—")}</td><td>${formatDate(proforma.date)}</td><td>${escapeHtml(proforma.vatMode)}</td><td class="money">${money(proforma.totals?.subtotal)}</td><td class="money">${money(proforma.totals?.discount)}</td><td class="money">${money(proforma.totals?.grandTotal)}</td><td><strong>${escapeHtml(proforma.customerResponse || proforma.deliveryStatus || 'DRAFT')}</strong></td><td><div class="row-actions"><div class="row-actions-line"><button class="edit" data-edit-proforma="${escapeHtml(proforma.id)}">Re-edit</button></div><div class="row-actions-line"><button class="export-row-button" data-review-proforma="${escapeHtml(proforma.id)}">Review &amp; Export</button><button class="edit" data-send-proforma="${escapeHtml(proforma.id)}">${proforma.deliveryStatus === "SENT" || proforma.deliveryStatus === "RESPONDED" ? "Resend" : "Send to Customer"}</button><button class="delete" data-delete-proforma="${escapeHtml(proforma.id)}">Delete</button></div></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function openReviewExport(type, record) {
    const isInvoice = type === "invoice";
    const totals = isInvoice
      ? { subtotal: record.subtotal, tax: record.tax, grandTotal: record.total }
      : { subtotal: record.totals?.subtotal, discount: record.totals?.discount, vat: record.totals?.vat, grandTotal: record.totals?.grandTotal };
    const items = record.items || [];
    document.getElementById("reviewExportTitle").textContent =
      `Review ${isInvoice ? "Invoice" : "Proforma"} ${record.invoiceNo || ""}`;
    document.getElementById("reviewExportBody").innerHTML = `
      <div class="customer-info">
        <div><span>Customer</span><strong>${escapeHtml(record.customer?.name || "—")}</strong></div>
        <div><span>Date</span><strong>${formatDate(record.date || record.createdAt)}</strong></div>
        ${isInvoice ? `<div><span>Due date</span><strong>${formatDate(record.dueDate)}</strong></div><div><span>Status</span><strong>${escapeHtml(record.status)}</strong></div>` : `<div><span>VAT mode</span><strong>${escapeHtml(record.vatMode)}</strong></div><div><span>Discount type</span><strong>${escapeHtml(record.discountType || "FIXED")}</strong></div>`}
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
        <tbody>${items.length ? items.map((item) => `
          <tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.qty || item.quantity || 1)}</td><td class="money">${money(item.unitPrice ?? item.unit_price)}</td><td class="money">${money((item.unitPrice ?? item.unit_price ?? 0) * (item.qty ?? item.quantity ?? 1))}</td></tr>
        `).join("") : '<tr><td colspan="4" class="muted">No items</td></tr>'}</tbody></table>
      </div>
      <div class="review-export-totals">
        <div><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
        ${totals.discount ? `<div><span>Discount</span><strong>${money(totals.discount)}</strong></div>` : ""}
        <div><span>${isInvoice ? "Tax" : "VAT"}</span><strong>${money(totals.tax ?? totals.vat)}</strong></div>
        <div class="grand"><span>Grand Total</span><strong>${money(totals.grandTotal)}</strong></div>
      </div>
      <p class="muted">Check the customer, items and totals above are correct before exporting.</p>
    `;
    const url = isInvoice
      ? `/api/billing?action=export-invoice&id=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}`
      : `/api/proforma-invoices?action=export-one&proformaId=${encodeURIComponent(record.id)}&token=${encodeURIComponent(token)}`;
    document.getElementById("reviewExportDownload").href = url;
    document.getElementById("reviewExportDialog").showModal();
  }

  function renderReceipts() {
    const panel = document.getElementById("receiptsPanel");
    if (!receipts.length) {
      panel.innerHTML = `${reviewHeading("Receipts", "Every official receipt issued, linked to its invoice where applicable.", "")}<div class="empty">No receipts issued yet. Create one from an invoice's balance.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Receipts", "Every official receipt issued, linked to its invoice where applicable.", "")}<div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Customer</th><th>Invoice</th><th>Date</th><th>Method</th><th>Amount</th><th></th></tr></thead><tbody>${receipts.map((receipt) => `
      <tr><td><strong>${escapeHtml(receipt.receiptNo)}</strong></td><td>${escapeHtml(receipt.customer?.name || "—")}</td><td>${escapeHtml(receipt.invoiceNo || "—")}</td><td>${formatDate(receipt.paidAt)}</td><td>${escapeHtml(receipt.paymentMethod)}</td><td class="money">${money(receipt.amount)}</td><td><div class="row-actions"><div class="row-actions-line"><a class="export-row-button" href="/api/receipts?action=export-one&receiptId=${escapeHtml(receipt.id)}&token=${encodeURIComponent(token)}" target="_blank" rel="noopener">Export</a><button class="delete" data-delete-receipt="${escapeHtml(receipt.id)}">Delete</button></div></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  async function load() {
    if (!token) {
      document.getElementById("invoicesPanel").innerHTML = '<div class="locked">Administrator login required.<br><a href="/login">Go to admin login</a></div>';
      return;
    }
    try {
      [invoices, expenses, proformas] = await Promise.all([
        api("/billing/invoices"),
        api("/company-expenses"),
        api("/proforma-invoices"),
      ]);
      // Customer lookup is part of Billing itself. Billing staff should not
      // need the separate Customers Manager permission just to issue an invoice.
      try {
        customers = await api("/billing?action=customer-lookup");
      } catch (lookupError) {
        customers = [];
        showAlert(`Customer list could not load: ${lookupError.message}`, true);
      }
      try {
        receipts = await api("/receipts");
      } catch (_) {
        receipts = [];
      }
      // Bank account options are a convenience for tagging which bank a
      // payment/expense went into. Bank Manager itself (adding accounts,
      // withdrawals) lives only in /bank-controller/ under its own
      // permission, so this must never block the rest of Billing loading
      // for staff who don't have that separate access.
      try {
        bankData = await api("/bank-manager");
      } catch (_) {
        bankData = { accounts: [], withdrawals: [], summary: {} };
      }
      renderInvoices();
      renderPayments();
      renderExpenses();
      renderProformas();
      renderReceipts();
      updateMetrics();
    } catch (error) {
      document.getElementById("invoicesPanel").innerHTML = `<div class="locked">${escapeHtml(error.message)}<br><a href="/login">Go to admin login</a></div>`;
      showAlert(error.message, true);
    }
  }

  function invoiceItemRow(item = {}) {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <label class="full">Pick from Spare Parts Inventory <small>(auto-fills description &amp; price, links cost-of-goods for profit tracking — optional)</small>
        <select data-field="sparePartId">${sparePartOptionsHtml()}</select>
      </label>
      <label>Description<input data-field="description" required value="${escapeHtml(item.description || "")}"></label>
      <label>Qty<input data-field="quantity" required type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}"></label>
      <label>Unit price<input data-field="unitPrice" required type="number" min="0" step="0.01" value="${escapeHtml(item.unitPrice || item.unit_price || 0)}"></label>
      <button class="remove-item" type="button" aria-label="Remove item">×</button>`;
    if (item.sparePartId) row.querySelector('[data-field="sparePartId"]').value = item.sparePartId;
    row.querySelector('[data-field="sparePartId"]').addEventListener("change", (event) => {
      const partId = event.target.value;
      if (!partId) return;
      const part = (sparePartsCache || []).find((p) => p.id === partId);
      if (!part) return;
      row.querySelector('[data-field="description"]').value = part.name || "";
      row.querySelector('[data-field="unitPrice"]').value = part.sellingPrice || 0;
    });
    return row;
  }

  function addInvoiceItem(item) {
    document.getElementById("invoiceItems").appendChild(invoiceItemRow(item));
  }

  async function ensureCustomersLoaded() {
    // V257 - mirrors ensureSparePartsLoaded(), but also RETRIES if the
    // list came back empty (not just "never fetched"). Customers were
    // previously only fetched once, at page load() time - if that single
    // attempt failed (or simply ran before a brand-new customer existed
    // yet), the New Invoice dropdown stayed empty for the rest of the
    // session with no way to recover short of a full page reload. Now
    // every time the invoice dialog opens, it tries again if the cached
    // list is still empty.
    if (!Array.isArray(customers) || customers.length === 0) {
      try {
        customers = await api("/billing?action=customer-lookup");
      } catch (error) {
        customers = [];
        showAlert(`Customer list could not load: ${error.message}`, true);
      }
    }
    return customers;
  }

  async function openInvoice(id = "") {
    const invoice = invoices.find((item) => item.id === id);
    document.getElementById("invoiceForm").reset();
    document.getElementById("invoiceId").value = invoice?.id || "";
    document.getElementById("invoiceSourceJobCardId").value = invoice?.sourceJobCardId || invoice?.source_job_card_id || "";
    document.getElementById("invoiceTitle").textContent = invoice ? `Re-edit · ${invoice.invoiceNo}` : "New invoice";
    await ensureCustomersLoaded();
    document.getElementById("invoiceCustomer").innerHTML = customerOptions(invoice?.customer?.id || invoice?.customerId || "");
    document.getElementById("invoiceMachine").innerHTML = '<option value="">No machine / general</option>';
    document.getElementById("invoiceItems").replaceChildren();
    document.getElementById("invoiceDueDate").value = invoice?.dueDate || "";
    document.getElementById("invoiceTax").value = invoice?.tax || "0";
    document.getElementById("invoiceError").className = "alert error hidden";
    fillCustomerInformation("invoiceCustomer", "invoiceCustomerInfo");
    updateMachineOptions(invoice?.machineId || "");
    await ensureSparePartsLoaded();
    (invoice?.items?.length ? invoice.items : [{}]).forEach(addInvoiceItem);
    document.getElementById("saveInvoiceButton").textContent = invoice ? "Save changes" : "Save invoice";
    document.getElementById("invoiceDialog").showModal();
  }

  function updateMachineOptions(selectedMachineId = "") {
    const customer = fillCustomerInformation("invoiceCustomer", "invoiceCustomerInfo");
    document.getElementById("invoiceMachine").innerHTML = '<option value="">No machine / general</option>' + (customer?.machines || []).map((machine) =>
      `<option value="${escapeHtml(machine.id)}" ${machine.id === selectedMachineId ? "selected" : ""}>${escapeHtml(machine.model)} · ${escapeHtml(machine.regNumber || machine.serialNumber || "")}</option>`
    ).join("");
  }

  function showButtonSuccess(button, text = "✓ Saved") {
    button.classList.add("success");
    const original = button.dataset.originalText || button.textContent;
    button.textContent = text;
    return new Promise((resolve) => setTimeout(() => {
      button.classList.remove("success");
      button.textContent = original;
      resolve();
    }, 900));
  }

  async function saveInvoice(event) {
    event.preventDefault();
    const button = document.getElementById("saveInvoiceButton");
    if (button.disabled) return;
    const id = document.getElementById("invoiceId").value;
    const items = [...document.querySelectorAll("#invoiceItems .item-row")].map((row) => ({
      description: row.querySelector('[data-field="description"]').value.trim(),
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value),
      sparePartId: row.querySelector('[data-field="sparePartId"]').value || undefined,
    }));
    let editConfirmation = {};
    if (id) {
      const confirmation = await window.belmConfirmEdit({
        title: "Save invoice changes?",
        message: "Confirm changes to this invoice's items and totals.",
      });
      if (!confirmation) return;
      editConfirmation = confirmation;
    }
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      await api(id ? `/billing/invoices/${id}` : "/billing/invoices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          action: id ? "edit" : undefined,
          customerId: document.getElementById("invoiceCustomer").value,
          machineId: document.getElementById("invoiceMachine").value || null,
          sourceJobCardId: document.getElementById("invoiceSourceJobCardId").value || null,
          dueDate: document.getElementById("invoiceDueDate").value || null,
          tax: Number(document.getElementById("invoiceTax").value || 0),
          items,
          ...editConfirmation,
        }),
      });
      await showButtonSuccess(button);
      document.getElementById("invoiceDialog").close();
      await load();
      showAlert(id ? "Invoice changes saved and totals recalculated." : "Invoice saved successfully.");
    } catch (error) {
      formError("invoiceError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openPayment(invoiceId, paymentId = "") {
    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const payment = (invoice.payments || []).find((item) => item.id === paymentId);
    document.getElementById("paymentForm").reset();
    document.getElementById("paymentInvoiceId").value = invoiceId;
    document.getElementById("paymentId").value = payment?.id || "";
    document.getElementById("paymentTitle").textContent = `${payment ? "Re-edit payment" : "Payment"} · ${invoice.invoiceNo}`;
    document.getElementById("paymentAmount").max = Number(invoice.balance || 0) + Number(payment?.amount || 0);
    document.getElementById("paymentAmount").value = payment?.amount || invoice.balance;
    document.getElementById("paymentMethod").value = payment?.method || "Bank";
    document.getElementById("paymentBankAccount").innerHTML = bankAccountOptions(payment?.bankAccountId || "");
    document.getElementById("paymentReference").value = payment?.reference || "";
    document.getElementById("savePaymentButton").textContent = payment ? "Save changes" : "Record payment";
    document.getElementById("paymentError").className = "alert error hidden";
    document.getElementById("paymentDialog").showModal();
  }

  async function savePayment(event) {
    event.preventDefault();
    const button = document.getElementById("savePaymentButton");
    if (button.disabled) return;
    const invoiceId = document.getElementById("paymentInvoiceId").value;
    const paymentId = document.getElementById("paymentId").value;
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      await api(`/billing/invoices/${invoiceId}/payments${paymentId ? `/${paymentId}` : ""}`, {
        method: paymentId ? "PUT" : "POST",
        body: JSON.stringify({
          amount: Number(document.getElementById("paymentAmount").value),
          method: document.getElementById("paymentMethod").value,
          bankAccountId: document.getElementById("paymentBankAccount").value || null,
          reference: document.getElementById("paymentReference").value.trim(),
        }),
      });
      await showButtonSuccess(button);
      document.getElementById("paymentDialog").close();
      await load();
      showAlert(paymentId ? "Payment changes saved and invoice balance recalculated." : "Payment recorded and invoice balance updated.");
    } catch (error) {
      formError("paymentError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openReceipt(invoiceId, customerId) {
    const invoice = invoices.find((item) => item.id === invoiceId);
    document.getElementById("receiptForm").reset();
    document.getElementById("receiptInvoiceId").value = invoiceId || "";
    document.getElementById("receiptCustomerId").value = customerId || invoice?.customer?.id || "";
    document.getElementById("receiptPaidAt").value = today();
    document.getElementById("receiptBankAccount").innerHTML = bankAccountOptions("");
    document.getElementById("receiptError").className = "alert error hidden";
    if (invoice) {
      document.getElementById("receiptAmount").value = invoice.balance || "";
      document.getElementById("receiptAmount").max = invoice.balance || "";
      document.getElementById("receiptInvoiceSummary").className = "customer-info";
      document.getElementById("receiptInvoiceSummary").innerHTML =
        `<strong>${escapeHtml(invoice.invoiceNo)}</strong> — Total: ${money(invoice.total)} · Paid: ${money(invoice.paidAmount)} · Balance: ${money(invoice.balance)}`;
    } else {
      document.getElementById("receiptInvoiceSummary").className = "customer-info empty-info";
      document.getElementById("receiptInvoiceSummary").textContent = "Standalone receipt (not linked to a specific invoice).";
    }
    document.getElementById("receiptDialog").showModal();
  }

  async function saveReceipt(event) {
    event.preventDefault();
    const invoiceId = document.getElementById("receiptInvoiceId").value;
    const customerId = document.getElementById("receiptCustomerId").value;
    const button = document.getElementById("saveReceiptButton");
    if (button.disabled) return;
    const errorBox = document.getElementById("receiptError");
    errorBox.className = "alert error hidden";
    if (!customerId) {
      errorBox.textContent = "This receipt needs a customer — open it from an invoice row.";
      errorBox.className = "alert error";
      return;
    }
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      const result = await api("/receipts", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          invoiceId: invoiceId || undefined,
          amount: Number(document.getElementById("receiptAmount").value || 0),
          paidAt: document.getElementById("receiptPaidAt").value,
          paymentMethod: document.getElementById("receiptMethod").value,
          bankAccountId: document.getElementById("receiptBankAccount").value || undefined,
          paymentReference: document.getElementById("receiptReference").value.trim(),
          notes: document.getElementById("receiptNotes").value.trim(),
        }),
      });
      await showButtonSuccess(button);
      document.getElementById("receiptDialog").close();
      await load();
      showAlert(`Receipt ${result.receiptNo} created.`);
      window.open(`/api/receipts?action=export-one&receiptId=${encodeURIComponent(result.id)}&token=${encodeURIComponent(token)}`, "_blank");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.className = "alert error";
    } finally {
      button.disabled = false;
    }
  }

  function readReceiptFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(null); return; }
      const isPdf = file.type === "application/pdf";
      if (!isPdf && !file.type.startsWith("image/")) {
        reject(new Error("Receipt must be a JPG, PNG, WebP image, or a PDF."));
        return;
      }
      if (isPdf) {
        if (file.size > 4 * 1024 * 1024) { reject(new Error("Receipt PDF must be 4 MB or smaller.")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, name: file.name });
        reader.onerror = () => reject(new Error("Could not read that file."));
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), name: file.name });
        };
        image.onerror = () => reject(new Error("Could not read that image."));
        image.src = reader.result;
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  function openExpense(id = "") {
    const expense = expenses.find((item) => item.id === id);
    document.getElementById("expenseForm").reset();
    document.getElementById("expenseId").value = expense?.id || "";
    document.getElementById("expenseReceiptUrl").value = expense?.receiptUrl || "";
    document.getElementById("expenseReceiptStatus").textContent = expense?.hasReceipt ? "A receipt is already attached — choosing a new file will replace it." : "";
    document.getElementById("expenseTitle").textContent = expense ? "Re-edit expense" : "Record expense";
    document.getElementById("expenseDate").value = expense?.date || today();
    document.getElementById("expenseCategory").value = expense?.category || "OTHER";
    document.getElementById("expenseDescription").value = expense?.description || "";
    document.getElementById("expenseAmount").value = expense?.amount || "";
    document.getElementById("expenseBankAccount").innerHTML = bankAccountOptions(expense?.bankAccountId || "");
    document.getElementById("expenseRecordedBy").value = expense?.recordedBy || "";
    document.getElementById("saveExpenseButton").textContent = expense ? "Save changes" : "Save expense";
    document.getElementById("expenseError").className = "alert error hidden";
    document.getElementById("expenseDialog").showModal();
  }

  async function saveExpense(event) {
    event.preventDefault();
    const button = document.getElementById("saveExpenseButton");
    if (button.disabled) return;
    const id = document.getElementById("expenseId").value;
    let editConfirmation = {};
    if (id) {
      const confirmation = await window.belmConfirmEdit({
        title: "Save expense changes?",
        message: "Confirm changes to this expense record.",
      });
      if (!confirmation) return;
      editConfirmation = confirmation;
    }
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      const receiptFile = document.getElementById("expenseReceiptFile").files[0];
      let receiptPhoto = null, receiptName = null;
      if (receiptFile) {
        const read = await readReceiptFile(receiptFile);
        receiptPhoto = read.dataUrl;
        receiptName = read.name;
      }
      await api(id ? `/company-expenses/${id}` : "/company-expenses", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          date: document.getElementById("expenseDate").value,
          category: document.getElementById("expenseCategory").value,
          description: document.getElementById("expenseDescription").value.trim(),
          amount: Number(document.getElementById("expenseAmount").value),
          bankAccountId: document.getElementById("expenseBankAccount").value || null,
          recordedBy: document.getElementById("expenseRecordedBy").value.trim(),
          receiptUrl: document.getElementById("expenseReceiptUrl").value || null,
          receiptPhoto,
          receiptName,
          ...editConfirmation,
        }),
      });
      await showButtonSuccess(button);
      document.getElementById("expenseDialog").close();
      await load();
      showAlert(id ? "Expense changes saved successfully." : "Expense recorded successfully.");
    } catch (error) {
      formError("expenseError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  let sparePartsCache = null;
  async function ensureSparePartsLoaded() {
    if (!sparePartsCache) {
      try {
        sparePartsCache = await api("/billing?action=spare-lookup");
      } catch (_) {
        sparePartsCache = [];
      }
    }
    return sparePartsCache;
  }

  function sparePartOptionsHtml() {
    return '<option value="">— Custom item (not in inventory) —</option>' +
      (sparePartsCache || []).map((part) =>
        `<option value="${escapeHtml(part.id)}">${escapeHtml(part.partNumber || part.referenceNumber || "")} — ${escapeHtml(part.name)} (${money(part.sellingPrice)})</option>`
      ).join("");
  }

  function proformaItemRow(item = {}) {
    const row = document.createElement("div");
    row.className = "item-row proforma-row";
    row.innerHTML = `
      <label class="full">Pick from Spare Parts Inventory <small>(auto-fills part no., description &amp; selling price — optional)</small>
        <select data-field="sparePartId">${sparePartOptionsHtml()}</select>
      </label>
      <label>Part no.<input data-field="partNumber" value="${escapeHtml(item.partNumber || item.part_number || "")}"></label>
      <label>Description<input data-field="description" required value="${escapeHtml(item.description || "")}"></label>
      <label>Qty<input data-field="qty" required type="number" min="0.01" step="0.01" value="${escapeHtml(item.qty || 1)}"></label>
      <label>Unit<input data-field="unit" value="${escapeHtml(item.unit || "PC")}"></label>
      <label>Unit price<input data-field="unitPrice" required type="number" min="0" step="0.01" value="${escapeHtml(item.unitPrice || item.unit_price || 0)}"></label>
      <button class="remove-item" type="button" aria-label="Remove item">×</button>`;
    row.querySelector('[data-field="sparePartId"]').addEventListener("change", (event) => {
      const partId = event.target.value;
      if (!partId) return;
      const part = (sparePartsCache || []).find((p) => p.id === partId);
      if (!part) return;
      row.querySelector('[data-field="partNumber"]').value = part.partNumber || part.referenceNumber || "";
      row.querySelector('[data-field="description"]').value = part.name || "";
      row.querySelector('[data-field="unitPrice"]').value = part.sellingPrice || 0;
    });
    return row;
  }

  function addProformaItem(item) {
    document.getElementById("proformaItems").appendChild(proformaItemRow(item));
  }

  async function openProforma(proforma = null) {
    document.getElementById("proformaForm").reset();
    document.getElementById("proformaId").value = proforma?.id || "";
    document.getElementById("proformaMachineId").value = proforma?.machineId || "";
    document.getElementById("proformaSourceSpareRequestId").value = proforma?.sourceSpareRequestId || proforma?.source_spare_request_id || "";
    document.getElementById("proformaSourceJobCardId").value = proforma?.sourceJobCardId || proforma?.source_job_card_id || "";
    document.getElementById("proformaTitle").textContent = proforma ? `Re-edit ${proforma.invoiceNo}` : "New proforma";
    await ensureCustomersLoaded();
    document.getElementById("proformaCustomer").innerHTML = customerOptions(proforma?.customer?.id || "");
    document.getElementById("proformaCustomer").disabled = Boolean(proforma);
    document.getElementById("proformaDate").value = proforma?.date || today();
    document.getElementById("proformaDate").disabled = Boolean(proforma);
    document.getElementById("proformaVatMode").value = proforma?.vatMode || "VAT";
    document.getElementById("proformaVatRate").value = proforma?.vatRate ?? 18;
    document.getElementById("proformaDiscountType").value = proforma?.discountType || "FIXED";
    document.getElementById("proformaDiscount").value = proforma?.discount || 0;
    document.getElementById("proformaPaymentTerms").value = proforma?.paymentTerms || "";
    document.getElementById("proformaDeliveryTime").value = proforma?.deliveryTime || "";
    document.getElementById("proformaQuoteValidity").value = proforma?.quoteValidity || "";
    document.getElementById("proformaNotice").value = proforma?.notice || "";
    fillCustomerInformation("proformaCustomer", "proformaCustomerInfo");
    await ensureSparePartsLoaded();
    document.getElementById("proformaItems").replaceChildren();
    (proforma?.items?.length ? proforma.items : [{}]).forEach(addProformaItem);
    document.getElementById("proformaError").className = "alert error hidden";
    document.getElementById("proformaDialog").showModal();
  }

  async function saveProforma(event) {
    event.preventDefault();
    const button = document.getElementById("saveProformaButton");
    if (button.disabled) return;
    const id = document.getElementById("proformaId").value;
    const items = [...document.querySelectorAll("#proformaItems .item-row")].map((row) => ({
      partNumber: row.querySelector('[data-field="partNumber"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      qty: Number(row.querySelector('[data-field="qty"]').value),
      unit: row.querySelector('[data-field="unit"]').value.trim() || "PC",
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value),
    }));
    let editConfirmation = {};
    if (id) {
      const confirmation = await window.belmConfirmEdit({
        title: "Save proforma changes?",
        message: "Confirm changes to this proforma invoice.",
      });
      if (!confirmation) return;
      editConfirmation = confirmation;
    }
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    try {
      await api(id ? `/proforma-invoices/${id}` : "/proforma-invoices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          customerId: document.getElementById("proformaCustomer").value,
          date: document.getElementById("proformaDate").value,
          vatMode: document.getElementById("proformaVatMode").value,
          vatRate: Number(document.getElementById("proformaVatRate").value || 18),
          discountType: document.getElementById("proformaDiscountType").value,
          discount: Number(document.getElementById("proformaDiscount").value || 0),
          paymentTerms: document.getElementById("proformaPaymentTerms").value.trim(),
          deliveryTime: document.getElementById("proformaDeliveryTime").value.trim(),
          quoteValidity: document.getElementById("proformaQuoteValidity").value.trim(),
          notice: document.getElementById("proformaNotice").value.trim(),
          machineId: document.getElementById("proformaMachineId").value,
          sourceSpareRequestId: document.getElementById("proformaSourceSpareRequestId").value,
          sourceJobCardId: document.getElementById("proformaSourceJobCardId").value,
          items,
          ...editConfirmation,
        }),
      });
      await showButtonSuccess(button);
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
    const confirmation = await window.belmConfirmDelete({
      title: "Delete this record?",
      message: message,
    });
    if (!confirmation) return;
    try {
      await api(path, { method: "DELETE", body: JSON.stringify(confirmation) });
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
    document.querySelectorAll("[data-billing-panel]").forEach((panel) =>
      panel.classList.toggle("hidden", panel.dataset.billingPanel !== button.dataset.tab));
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
  document.getElementById("receiptForm").addEventListener("submit", saveReceipt);

  // ------------------------------------------------------------------
  // QR SCAN for payment reference — uses the camera directly via the
  // browser's native BarcodeDetector (Chrome/Edge; no external library,
  // no big file upload). Falls back to a single lightweight photo
  // capture + decode attempt on browsers without BarcodeDetector.
  // ------------------------------------------------------------------
  let qrScanStream = null;
  let qrScanRAF = null;

  function stopQrScan() {
    if (qrScanRAF) cancelAnimationFrame(qrScanRAF);
    qrScanRAF = null;
    if (qrScanStream) qrScanStream.getTracks().forEach((track) => track.stop());
    qrScanStream = null;
    document.getElementById("qrScanOverlay").classList.add("hidden");
    document.getElementById("paymentScanHint").classList.add("hidden");
  }

  async function scanQrFromFilePhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!("BarcodeDetector" in window)) {
        showAlert("This browser can't scan QR codes automatically. Please type the reference manually.", true);
        return;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        const results = await detector.detect(bitmap);
        if (results.length) {
          document.getElementById("paymentReference").value = results[0].rawValue;
          showAlert("QR code captured.");
        } else {
          showAlert("No QR code found in that photo. Try again or type the reference manually.", true);
        }
      } catch (_) {
        showAlert("Could not read a QR code from that photo. Type the reference manually.", true);
      }
    });
    input.click();
  }

  async function startQrScan() {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      await scanQrFromFilePhoto();
      return;
    }
    const overlay = document.getElementById("qrScanOverlay");
    const video = document.getElementById("qrScanVideo");
    try {
      qrScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (_) {
      showAlert("Camera access was denied or unavailable. Type the reference manually.", true);
      return;
    }
    video.srcObject = qrScanStream;
    overlay.classList.remove("hidden");
    document.getElementById("paymentScanHint").classList.remove("hidden");
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const scanFrame = async () => {
      if (!qrScanStream) return;
      try {
        const results = await detector.detect(video);
        if (results.length) {
          document.getElementById("paymentReference").value = results[0].rawValue;
          stopQrScan();
          showAlert("QR code captured.");
          return;
        }
      } catch (_) { /* keep trying */ }
      qrScanRAF = requestAnimationFrame(scanFrame);
    };
    qrScanRAF = requestAnimationFrame(scanFrame);
  }

  document.getElementById("paymentScanQrButton").addEventListener("click", startQrScan);
  document.getElementById("qrScanCancelButton").addEventListener("click", stopQrScan);
  document.getElementById("paymentDialog").addEventListener("close", stopQrScan);

  document.getElementById("expenseForm").addEventListener("submit", saveExpense);
  document.getElementById("proformaForm").addEventListener("submit", saveProforma);
  document.querySelectorAll(".item-list").forEach((list) => list.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-item");
    if (removeButton && list.children.length > 1) removeButton.closest(".item-row").remove();
  }));
  document.getElementById("invoicesPanel").addEventListener("click", (event) => {
    const pay = event.target.closest("[data-payment]");
    const receiptButton = event.target.closest("[data-receipt]");
    const edit = event.target.closest("[data-edit-invoice]");
    const reviewButton = event.target.closest("[data-review-invoice]");
    const removeButton = event.target.closest("[data-delete-invoice]");
    if (edit) openInvoice(edit.dataset.editInvoice);
    if (pay) openPayment(pay.dataset.payment);
    if (receiptButton) openReceipt(receiptButton.dataset.receipt, receiptButton.dataset.receiptCustomer);
    if (reviewButton) {
      const invoice = invoices.find((item) => item.id === reviewButton.dataset.reviewInvoice);
      if (invoice) openReviewExport("invoice", invoice);
    }
    if (removeButton) remove(`/billing/invoices/${removeButton.dataset.deleteInvoice}`, "Delete this invoice? It will move to the Recycle Bin.");
  });
  document.getElementById("paymentsPanel").addEventListener("click", async (event) => {
    const editPayment = event.target.closest("[data-edit-payment]");
    const deletePayment = event.target.closest("[data-delete-payment]");
    if (editPayment) openPayment(editPayment.dataset.paymentInvoice, editPayment.dataset.editPayment);
    if (deletePayment) {
      const confirmation = await window.belmConfirmDelete({
        title: "Reverse this payment?",
        message: "This removes the mistaken manual payment and recalculates the invoice balance. Receipt-linked payments must be reversed from Receipts instead.",
      });
      if (!confirmation) return;
      try {
        await api(`/billing/invoices/${deletePayment.dataset.paymentInvoice}/payments/${deletePayment.dataset.deletePayment}`, {
          method: "DELETE",
          body: JSON.stringify(confirmation),
        });
        await load();
        showAlert("Payment reversed and invoice balance recalculated.");
      } catch (error) { showAlert(error.message, true); }
    }
  });
  document.getElementById("receiptsPanel").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-delete-receipt]");
    if (removeButton) remove(`/receipts/${removeButton.dataset.deleteReceipt}`, "Delete this receipt? It will move to the Recycle Bin.");
  });
  document.getElementById("invoicesPanel").addEventListener("change", async (event) => {
    if (!event.target.dataset.invoiceStatus) return;
    try {
      const invoice = invoices.find((item) => item.id === event.target.dataset.invoiceStatus);
      await api(`/billing/invoices/${event.target.dataset.invoiceStatus}`, {
        method: "PUT",
        body: JSON.stringify({ action: "status", status: event.target.value, dueDate: invoice?.dueDate || null, machineId: invoice?.machineId || null }),
      });
      await load();
      showAlert("Invoice status updated.");
    } catch (error) {
      showAlert(error.message, true);
      await load();
    }
  });
  document.getElementById("expensesPanel").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-expense]");
    const removeButton = event.target.closest("[data-delete-expense]");
    const receiptButton = event.target.closest("[data-view-expense-receipt]");
    if (edit) openExpense(edit.dataset.editExpense);
    if (removeButton) remove(`/company-expenses/${removeButton.dataset.deleteExpense}`, "Delete this expense? It will move to the Recycle Bin.");
    if (receiptButton) {
      try {
        const response = await fetch(`/api/company-expenses/${receiptButton.dataset.viewExpenseReceipt}?action=receipt`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Could not load receipt.");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      } catch (error) {
        showAlert(error.message, true);
      }
    }
  });
  document.getElementById("proformasPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-proforma]");
    const reviewButton = event.target.closest("[data-review-proforma]");
    const removeButton = event.target.closest("[data-delete-proforma]");
    const sendButton = event.target.closest("[data-send-proforma]");
    if (edit) openProforma(proformas.find((item) => item.id === edit.dataset.editProforma));
    if (reviewButton) {
      const proforma = proformas.find((item) => item.id === reviewButton.dataset.reviewProforma);
      if (proforma) openReviewExport("proforma", proforma);
    }
    if (sendButton) {
      const id = sendButton.dataset.sendProforma;
      sendButton.disabled = true;
      api(`/proforma-invoices/${id}?action=send`, { method: "PUT" }).then(async (result) => { await load(); showAlert(result.message || "Proforma sent to customer."); }).catch((error) => showAlert(error.message, true)).finally(() => { sendButton.disabled = false; });
    }
    if (removeButton) remove(`/proforma-invoices/${removeButton.dataset.deleteProforma}`, "Delete this proforma? It will move to the Recycle Bin.");
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/login";
  });

  async function applyProformaPrefillFromSparePartRequest() {
    const raw = sessionStorage.getItem("belm_prefill_proforma");
    if (!raw) return;
    sessionStorage.removeItem("belm_prefill_proforma");
    let prefill;
    try {
      prefill = JSON.parse(raw);
    } catch (_) {
      return;
    }
    await ensureSparePartsLoaded();
    await openProforma();
    if (prefill.customerId) document.getElementById("proformaCustomer").value = prefill.customerId;
    document.getElementById("proformaMachineId").value = prefill.machineId || "";
    document.getElementById("proformaSourceSpareRequestId").value = prefill.sourceSpareRequestId || "";
    document.getElementById("proformaSourceJobCardId").value = prefill.sourceJobCardId || "";
    fillCustomerInformation("proformaCustomer", "proformaCustomerInfo");
    const firstRow = document.querySelector("#proformaItems .item-row");
    if (firstRow) {
      firstRow.querySelector('[data-field="partNumber"]').value = prefill.partNumber || "";
      firstRow.querySelector('[data-field="description"]').value = prefill.description || "";
      firstRow.querySelector('[data-field="qty"]').value = prefill.qty || 1;
      firstRow.querySelector('[data-field="unitPrice"]').value = prefill.unitPrice || 0;
    }
    showAlert(`Proforma pre-filled from the spare-part request — check the customer and pricing, then Save.`);
  }

  async function applyInvoicePrefillFromJobCard() {
    const raw=sessionStorage.getItem("belm_prefill_invoice");if(!raw)return;
    sessionStorage.removeItem("belm_prefill_invoice");let prefill;try{prefill=JSON.parse(raw)}catch(_){return}
    await openInvoice();
    if(prefill.customerId) document.getElementById("invoiceCustomer").value=prefill.customerId;
    updateMachineOptions(prefill.machineId||"");
    document.getElementById("invoiceSourceJobCardId").value=prefill.sourceJobCardId||"";
    fillCustomerInformation("invoiceCustomer","invoiceCustomerInfo");
    const firstRow=document.querySelector("#invoiceItems .item-row");
    if(firstRow){firstRow.querySelector('[data-field="description"]').value=prefill.description||"BELM service work";firstRow.querySelector('[data-field="quantity"]').value=prefill.qty||1;firstRow.querySelector('[data-field="unitPrice"]').value=prefill.unitPrice||0;}
    showAlert("Invoice pre-filled from the customer-signed Job Card — enter the agreed price/tax, then Save.");
  }

  load().then(async()=>{await applyProformaPrefillFromSparePartRequest();await applyInvoicePrefillFromJobCard();});
})();
