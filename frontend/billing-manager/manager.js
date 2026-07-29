(function () {
  const token = localStorage.getItem("belm_admin_token");
  let customers = [];
  let invoices = [];
  let expenses = [];
  let proformas = [];
  let bankData = { accounts: [], withdrawals: [], summary: {} };

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

  function reviewHeading(title, description) {
    return `<div class="review-heading"><div><p class="eyebrow">Review</p><h2>${escapeHtml(title)}</h2><span>${escapeHtml(description)}</span></div></div>`;
  }

  function renderInvoices() {
    const panel = document.getElementById("invoicesPanel");
    if (!invoices.length) {
      panel.innerHTML = `${reviewHeading("Invoices", "Review invoice totals, balances, due dates and status.")}<div class="empty">No invoices yet. Select “New invoice” to create one.</div>`;
      return;
    }
    const statuses = ["UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"];
    panel.innerHTML = `${reviewHeading("Invoices", "Review invoice totals, balances, due dates and status.")}<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${invoices.map((invoice) => `
      <tr>
        <td><strong>${escapeHtml(invoice.invoiceNo)}</strong><div class="muted">${(invoice.items || []).length} item(s)</div></td>
        <td>${escapeHtml(invoice.customer?.name || "—")}</td>
        <td class="money">${money(invoice.total)}</td>
        <td class="money">${money(invoice.paidAmount)}</td>
        <td class="money">${money(invoice.balance)}</td>
        <td>${invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString() : "—"}</td>
        <td><select class="status-select" data-invoice-status="${escapeHtml(invoice.id)}">${statuses.map((status) => `<option value="${status}" ${status === invoice.status ? "selected" : ""} ${["PAID", "PARTIALLY_PAID"].includes(status) ? "disabled" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select></td>
        <td><div class="row-actions"><button class="edit" data-edit-invoice="${escapeHtml(invoice.id)}">Re-edit</button>${Number(invoice.balance) > 0 && invoice.status !== "CANCELLED" ? `<button class="pay" data-payment="${escapeHtml(invoice.id)}">Add payment</button>` : ""}<button class="delete" data-delete-invoice="${escapeHtml(invoice.id)}">Delete</button></div></td>
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
      panel.innerHTML = `${reviewHeading("Payments", "Review every customer payment and its invoice reference.")}<div class="empty">No customer payments recorded.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Payments", "Review every customer payment and its invoice reference.")}<div class="table-wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Method</th><th>Bank</th><th>Reference</th><th>Amount</th><th></th></tr></thead><tbody>${payments.map((payment) => `
      <tr>
        <td>${payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "—"}</td>
        <td><strong>${escapeHtml(payment.invoiceNo)}</strong></td>
        <td>${escapeHtml(payment.customerName)}</td>
        <td><span class="badge">${escapeHtml(payment.method || "—")}</span></td>
        <td>${escapeHtml(payment.bankName || "Unallocated")}</td>
        <td>${escapeHtml(payment.reference || "No reference")}</td>
        <td class="money">${money(payment.amount)}</td>
        <td><div class="row-actions"><button class="edit" data-edit-payment="${escapeHtml(payment.id)}" data-payment-invoice="${escapeHtml(payment.invoiceId)}">Re-edit</button></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function renderExpenses() {
    const panel = document.getElementById("expensesPanel");
    if (!expenses.length) {
      panel.innerHTML = `${reviewHeading("Expenses", "Review operating costs, dates and responsible staff.")}<div class="empty">No company expenses recorded.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Expenses", "Review operating costs, dates and responsible staff.")}<div class="table-wrap"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Bank</th><th>Recorded by</th><th>Amount</th><th></th></tr></thead><tbody>${expenses.map((expense) => `
      <tr><td>${new Date(`${expense.date}T00:00:00`).toLocaleDateString()}</td><td><span class="badge">${escapeHtml(expense.category)}</span></td><td>${escapeHtml(expense.description)}</td><td>${escapeHtml(expense.bankName || "Unallocated")}</td><td>${escapeHtml(expense.recordedBy || "—")}</td><td class="money">${money(expense.amount)}</td><td><div class="row-actions"><button class="edit" data-edit-expense="${escapeHtml(expense.id)}">Re-edit</button><button class="delete" data-delete-expense="${escapeHtml(expense.id)}">Delete</button></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function renderProformas() {
    const panel = document.getElementById("proformasPanel");
    if (!proformas.length) {
      panel.innerHTML = `${reviewHeading("Proforma", "Review quotations, VAT, discount and grand total.")}<div class="empty">No proforma invoices yet.</div>`;
      return;
    }
    panel.innerHTML = `${reviewHeading("Proforma", "Review quotations, VAT, discount and grand total.")}<div class="table-wrap"><table><thead><tr><th>Proforma</th><th>Customer</th><th>Date</th><th>VAT</th><th>Subtotal</th><th>Discount</th><th>Total</th><th></th></tr></thead><tbody>${proformas.map((proforma) => `
      <tr><td><strong>${escapeHtml(proforma.invoiceNo)}</strong></td><td>${escapeHtml(proforma.customer?.name || "—")}</td><td>${new Date(`${proforma.date}T00:00:00`).toLocaleDateString()}</td><td>${escapeHtml(proforma.vatMode)}</td><td class="money">${money(proforma.totals?.subtotal)}</td><td class="money">${money(proforma.totals?.discount)}</td><td class="money">${money(proforma.totals?.grandTotal)}</td><td><div class="row-actions"><button class="edit" data-edit-proforma="${escapeHtml(proforma.id)}">Re-edit</button><button class="delete" data-delete-proforma="${escapeHtml(proforma.id)}">Delete</button></div></td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function renderBankManager() {
    const panel = document.getElementById("bankPanel");
    const accounts = bankData.accounts || [];
    const withdrawals = bankData.withdrawals || [];
    const summary = bankData.summary || {};
    const bankEquation = accounts.map((account) =>
      `${account.bankName} · ${String(account.accountNumber || "").slice(-4)}`
    ).join(" + ");
    const bankRows = accounts.length ? `<div class="table-wrap"><table><thead><tr><th>Bank</th><th>Account name</th><th>Account number</th><th>Payments in</th><th>Expenses</th><th>Withdrawals</th><th>Balance</th><th></th></tr></thead><tbody>${accounts.map((account) => `
      <tr>
        <td><strong>${escapeHtml(account.bankName)}</strong></td>
        <td>${escapeHtml(account.accountName)}</td>
        <td>${escapeHtml(account.accountNumber)}</td>
        <td class="money positive">${money(account.payments)}</td>
        <td class="money">${money(account.expenses)}</td>
        <td class="money">${money(account.withdrawals)}</td>
        <td class="money ${Number(account.balance) < 0 ? "negative" : "positive"}">${money(account.balance)}</td>
        <td><div class="row-actions"><button class="edit" data-edit-bank="${escapeHtml(account.id)}">Re-edit</button></div></td>
      </tr>`).join("")}</tbody><tfoot><tr class="bank-total-row"><td colspan="6"><strong>${escapeHtml(bankEquation)} = All Bank Total</strong></td><td class="money positive">${money(summary.allBankBalance)}</td><td></td></tr></tfoot></table></div>` : '<div class="empty">No bank account yet. Select “Add bank account”.</div>';
    const withdrawalRows = withdrawals.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Bank</th><th>Cheque / Txn no.</th><th>Reason / Description</th><th>Withdrawn by</th><th>Amount</th><th></th></tr></thead><tbody>${withdrawals.map((withdrawal) => `
      <tr>
        <td>${new Date(`${withdrawal.date}T00:00:00`).toLocaleDateString()}</td>
        <td>${escapeHtml(withdrawal.bankName)}<div class="muted">${escapeHtml(withdrawal.accountNumber)}</div></td>
        <td><strong>${escapeHtml(withdrawal.chequeNumber || "—")}</strong></td>
        <td>${escapeHtml(withdrawal.description)}</td>
        <td>${escapeHtml(withdrawal.withdrawnBy || "—")}</td>
        <td class="money negative">${money(withdrawal.amount)}</td>
        <td><div class="row-actions"><button class="edit" data-edit-withdrawal="${escapeHtml(withdrawal.id)}">Re-edit</button></div></td>
      </tr>`).join("")}</tbody></table></div>` : '<div class="empty compact-empty">No bank withdrawals recorded.</div>';
    panel.innerHTML = `
      <div class="review-heading bank-review-heading">
        <div><p class="eyebrow">Finance sync</p><h2>Bank Manager</h2><span>Payments and expenses automatically update the selected bank balance.</span></div>
        <div class="review-actions"><button class="secondary" data-add-bank type="button">+ Add bank account</button><button class="primary" data-add-withdrawal type="button" ${accounts.length ? "" : "disabled"}>+ Record withdrawal</button></div>
      </div>
      <div class="bank-metrics">
        <article><span>All Bank Total (A + B + …)</span><strong>${money(summary.allBankBalance)}</strong></article>
        <article><span>Total Payments</span><strong>${money(summary.paymentsReceived)}</strong></article>
        <article><span>Total Expenses</span><strong>${money(summary.companyExpenses)}</strong></article>
        <article><span>Total Withdrawals</span><strong>${money(summary.totalWithdrawals)}</strong></article>
        <article><span>Customer Debt</span><strong>${money(summary.customerDebt)}</strong></article>
        <article><span>VAT Debt</span><strong>${money(summary.vatDebt)}</strong></article>
        <article class="loss-card"><span>Loss</span><strong>${money(summary.loss)}</strong></article>
        <article class="profit-card"><span>BELM Profit</span><strong>${money(summary.belmProfit)}</strong></article>
      </div>
      ${(Number(summary.unallocatedPayments) > 0 || Number(summary.unallocatedExpenses) > 0) ? `<div class="bank-warning"><strong>Unallocated finance:</strong> Payments ${money(summary.unallocatedPayments)} · Expenses ${money(summary.unallocatedExpenses)}. Re-edit these records and select the correct bank.</div>` : ""}
      <div class="bank-section-title"><div><p class="eyebrow">All banks</p><h3>Bank balances</h3></div></div>
      ${bankRows}
      <div class="bank-section-title"><div><p class="eyebrow">Money out</p><h3>Withdrawal history</h3></div></div>
      ${withdrawalRows}
      <div class="calculation-note">Bank balance = Opening balance + assigned payments − assigned expenses − withdrawals. BELM Profit = Payments received − Expenses − Withdrawals − VAT debt. VAT debt is calculated from VAT recorded on non-cancelled invoices. Do not record the same money as both an Expense and a Withdrawal.</div>`;
  }

  async function load() {
    if (!token) {
      document.getElementById("invoicesPanel").innerHTML = '<div class="locked">Administrator login required.<br><a href="/admin/login">Go to admin login</a></div>';
      return;
    }
    try {
      [invoices, expenses, proformas, customers, bankData] = await Promise.all([
        api("/billing/invoices"),
        api("/company-expenses"),
        api("/proforma-invoices"),
        api("/customers"),
        api("/bank-manager"),
      ]);
      try {
        const settings = await api("/settings");
        if (settings.displayTheme === "dark" || settings.displayTheme === "light") {
          applyTheme(settings.displayTheme);
        }
      } catch (_) {}
      renderInvoices();
      renderPayments();
      renderExpenses();
      renderProformas();
      renderBankManager();
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

  function openInvoice(id = "") {
    const invoice = invoices.find((item) => item.id === id);
    document.getElementById("invoiceForm").reset();
    document.getElementById("invoiceId").value = invoice?.id || "";
    document.getElementById("invoiceTitle").textContent = invoice ? `Re-edit · ${invoice.invoiceNo}` : "New invoice";
    document.getElementById("invoiceCustomer").innerHTML = customerOptions(invoice?.customer?.id || invoice?.customerId || "");
    document.getElementById("invoiceMachine").innerHTML = '<option value="">No machine / general</option>';
    document.getElementById("invoiceItems").replaceChildren();
    document.getElementById("invoiceDueDate").value = invoice?.dueDate || "";
    document.getElementById("invoiceTax").value = invoice?.tax || "0";
    document.getElementById("invoiceError").className = "alert error hidden";
    fillCustomerInformation("invoiceCustomer", "invoiceCustomerInfo");
    updateMachineOptions(invoice?.machineId || "");
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

  async function saveInvoice(event) {
    event.preventDefault();
    const id = document.getElementById("invoiceId").value;
    const items = [...document.querySelectorAll("#invoiceItems .item-row")].map((row) => ({
      description: row.querySelector('[data-field="description"]').value.trim(),
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      unitPrice: Number(row.querySelector('[data-field="unitPrice"]').value),
    }));
    const button = document.getElementById("saveInvoiceButton");
    button.disabled = true;
    try {
      await api(id ? `/billing/invoices/${id}` : "/billing/invoices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          action: id ? "edit" : undefined,
          customerId: document.getElementById("invoiceCustomer").value,
          machineId: document.getElementById("invoiceMachine").value || null,
          dueDate: document.getElementById("invoiceDueDate").value || null,
          tax: Number(document.getElementById("invoiceTax").value || 0),
          items,
        }),
      });
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
    const invoiceId = document.getElementById("paymentInvoiceId").value;
    const paymentId = document.getElementById("paymentId").value;
    const button = document.getElementById("savePaymentButton");
    button.disabled = true;
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
      document.getElementById("paymentDialog").close();
      await load();
      showAlert(paymentId ? "Payment changes saved and invoice balance recalculated." : "Payment recorded and invoice balance updated.");
    } catch (error) {
      formError("paymentError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openExpense(id = "") {
    const expense = expenses.find((item) => item.id === id);
    document.getElementById("expenseForm").reset();
    document.getElementById("expenseId").value = expense?.id || "";
    document.getElementById("expenseReceiptUrl").value = expense?.receiptUrl || "";
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
    const id = document.getElementById("expenseId").value;
    const button = document.getElementById("saveExpenseButton");
    button.disabled = true;
    try {
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
        }),
      });
      document.getElementById("expenseDialog").close();
      await load();
      showAlert(id ? "Expense changes saved successfully." : "Expense recorded successfully.");
    } catch (error) {
      formError("expenseError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function openBankAccount(id = "") {
    const account = (bankData.accounts || []).find((item) => item.id === id);
    document.getElementById("bankAccountForm").reset();
    document.getElementById("bankAccountId").value = account?.id || "";
    document.getElementById("bankAccountTitle").textContent = account ? "Re-edit bank account" : "Add bank account";
    document.getElementById("bankName").value = account?.bankName || "";
    document.getElementById("bankAccountName").value = account?.accountName || "";
    document.getElementById("bankAccountNumber").value = account?.accountNumber || "";
    document.getElementById("bankOpeningBalance").value = account?.openingBalance || 0;
    document.getElementById("saveBankAccountButton").textContent = account ? "Save changes" : "Save bank";
    document.getElementById("bankAccountError").className = "alert error hidden";
    document.getElementById("bankAccountDialog").showModal();
  }

  async function saveBankAccount(event) {
    event.preventDefault();
    const id = document.getElementById("bankAccountId").value;
    const button = document.getElementById("saveBankAccountButton");
    button.disabled = true;
    try {
      await api(`/bank-manager/accounts${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          bankName: document.getElementById("bankName").value.trim(),
          accountName: document.getElementById("bankAccountName").value.trim(),
          accountNumber: document.getElementById("bankAccountNumber").value.trim(),
          openingBalance: Number(document.getElementById("bankOpeningBalance").value || 0),
        }),
      });
      document.getElementById("bankAccountDialog").close();
      await load();
      showAlert(id ? "Bank account changes saved." : "Bank account added to Bank Manager.");
    } catch (error) {
      formError("bankAccountError", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function updateWithdrawalMax(withdrawal = null) {
    const accountId = document.getElementById("withdrawalBankAccount").value;
    const account = (bankData.accounts || []).find((item) => item.id === accountId);
    const existingAmount = withdrawal?.bankAccountId === accountId ? Number(withdrawal.amount || 0) : 0;
    const max = Math.max(0, Number(account?.balance || 0) + existingAmount);
    document.getElementById("withdrawalAmount").max = max;
  }

  function openWithdrawal(id = "") {
    if (!(bankData.accounts || []).length) {
      showAlert("Add at least one bank account before recording a withdrawal.", true);
      openBankAccount();
      return;
    }
    const withdrawal = (bankData.withdrawals || []).find((item) => item.id === id);
    document.getElementById("withdrawalForm").reset();
    document.getElementById("withdrawalId").value = withdrawal?.id || "";
    document.getElementById("withdrawalTitle").textContent = withdrawal ? "Re-edit withdrawal" : "Record withdrawal";
    document.getElementById("withdrawalBankAccount").innerHTML = bankAccountOptions(withdrawal?.bankAccountId || "", false);
    document.getElementById("withdrawalDate").value = withdrawal?.date || today();
    document.getElementById("withdrawalChequeNumber").value = withdrawal?.chequeNumber || "";
    document.getElementById("withdrawalDescription").value = withdrawal?.description || "";
    document.getElementById("withdrawalAmount").value = withdrawal?.amount || "";
    document.getElementById("withdrawalBy").value = withdrawal?.withdrawnBy || "";
    document.getElementById("saveWithdrawalButton").textContent = withdrawal ? "Save changes" : "Save withdrawal";
    document.getElementById("withdrawalError").className = "alert error hidden";
    updateWithdrawalMax(withdrawal);
    document.getElementById("withdrawalDialog").showModal();
  }

  async function saveWithdrawal(event) {
    event.preventDefault();
    const id = document.getElementById("withdrawalId").value;
    const button = document.getElementById("saveWithdrawalButton");
    button.disabled = true;
    try {
      await api(`/bank-manager/withdrawals${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          bankAccountId: document.getElementById("withdrawalBankAccount").value,
          date: document.getElementById("withdrawalDate").value,
          chequeNumber: document.getElementById("withdrawalChequeNumber").value.trim(),
          description: document.getElementById("withdrawalDescription").value.trim(),
          amount: Number(document.getElementById("withdrawalAmount").value),
          withdrawnBy: document.getElementById("withdrawalBy").value.trim(),
        }),
      });
      document.getElementById("withdrawalDialog").close();
      await load();
      showAlert(id ? "Withdrawal changes saved." : "Withdrawal recorded and bank balance updated.");
    } catch (error) {
      formError("withdrawalError", error.message);
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
    document.getElementById("proformaTitle").textContent = proforma ? `Re-edit ${proforma.invoiceNo}` : "New proforma";
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
  document.getElementById("expenseForm").addEventListener("submit", saveExpense);
  document.getElementById("bankAccountForm").addEventListener("submit", saveBankAccount);
  document.getElementById("withdrawalForm").addEventListener("submit", saveWithdrawal);
  document.getElementById("proformaForm").addEventListener("submit", saveProforma);
  document.getElementById("withdrawalBankAccount").addEventListener("change", () => {
    const withdrawal = (bankData.withdrawals || []).find((item) =>
      item.id === document.getElementById("withdrawalId").value);
    updateWithdrawalMax(withdrawal);
  });
  document.querySelectorAll(".item-list").forEach((list) => list.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-item");
    if (removeButton && list.children.length > 1) removeButton.closest(".item-row").remove();
  }));
  document.getElementById("invoicesPanel").addEventListener("click", (event) => {
    const pay = event.target.closest("[data-payment]");
    const edit = event.target.closest("[data-edit-invoice]");
    const removeButton = event.target.closest("[data-delete-invoice]");
    if (edit) openInvoice(edit.dataset.editInvoice);
    if (pay) openPayment(pay.dataset.payment);
    if (removeButton) remove(`/billing/invoices/${removeButton.dataset.deleteInvoice}`, "Delete this invoice? It will move to the Recycle Bin.");
  });
  document.getElementById("paymentsPanel").addEventListener("click", (event) => {
    const editPayment = event.target.closest("[data-edit-payment]");
    if (editPayment) openPayment(editPayment.dataset.paymentInvoice, editPayment.dataset.editPayment);
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
  document.getElementById("expensesPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-expense]");
    const removeButton = event.target.closest("[data-delete-expense]");
    if (edit) openExpense(edit.dataset.editExpense);
    if (removeButton) remove(`/company-expenses/${removeButton.dataset.deleteExpense}`, "Delete this expense? It will move to the Recycle Bin.");
  });
  document.getElementById("proformasPanel").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-proforma]");
    const removeButton = event.target.closest("[data-delete-proforma]");
    if (edit) openProforma(proformas.find((item) => item.id === edit.dataset.editProforma));
    if (removeButton) remove(`/proforma-invoices/${removeButton.dataset.deleteProforma}`, "Delete this proforma? It will move to the Recycle Bin.");
  });
  document.getElementById("bankPanel").addEventListener("click", (event) => {
    const addBank = event.target.closest("[data-add-bank]");
    const addWithdrawal = event.target.closest("[data-add-withdrawal]");
    const editBank = event.target.closest("[data-edit-bank]");
    const editWithdrawal = event.target.closest("[data-edit-withdrawal]");
    if (addBank) openBankAccount();
    if (addWithdrawal) openWithdrawal();
    if (editBank) openBankAccount(editBank.dataset.editBank);
    if (editWithdrawal) openWithdrawal(editWithdrawal.dataset.editWithdrawal);
  });
  document.getElementById("logoutButton").addEventListener("click", () => {
    localStorage.removeItem("belm_admin_token");
    localStorage.removeItem("belm_admin_user");
    window.location.href = "/admin/login";
  });

  load();
})();
