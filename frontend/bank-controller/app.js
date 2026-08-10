(function () {
  const token = localStorage.getItem("belm_admin_token");
  let data = { accounts: [], withdrawals: [], summary: {} };

  const money = new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 2,
  });

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
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("belm_admin_token");
      localStorage.removeItem("belm_admin_user");
      window.location.href = "/admin/login";
      throw new Error("Your login session has expired.");
    }
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }

  function message(text, isError = false) {
    const box = document.getElementById("pageAlert");
    box.textContent = text;
    box.className = isError ? "alert" : "alert success";
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function metricCard(label, value, tone = "", clickable = false) {
    return `<article class="metric-card${tone ? " " + tone : ""}${clickable ? " clickable" : ""}" ${clickable ? `data-metric-click="${escapeHtml(label)}" role="button" tabindex="0"` : ""}><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
  }

  function renderCompanyMetrics() {
    const s = data.summary || {};
    document.getElementById("companyMetrics").innerHTML = [
      metricCard("All Bank Balance", money.format(s.allBankBalance || 0), "green"),
      metricCard("Payments Received", money.format(s.paymentsReceived || 0)),
      metricCard("Company Expenses", money.format(s.companyExpenses || 0), "yellow"),
      metricCard("Total Withdrawals", money.format(s.totalWithdrawals || 0), "yellow"),
      metricCard("Customer Debt", money.format(s.customerDebt || 0), "", true),
      metricCard("VAT Debt (18%)", money.format(s.vatDebt || 0)),
      s.costOfGoodsSold > 0 ? metricCard("Cost of Goods Sold", money.format(s.costOfGoodsSold || 0)) : "",
      s.belmProfit > 0 ? metricCard("BELM Profit", money.format(s.belmProfit || 0), "green") : "",
      s.loss > 0 ? metricCard("Loss", money.format(s.loss || 0), "red") : "",
    ].join("");
  }

  async function openCustomerDebtDrilldown() {
    const dialog = document.getElementById("customerDebtDialog");
    const body = document.getElementById("customerDebtBody");
    body.innerHTML = '<p class="muted">Loading…</p>';
    dialog.showModal();
    try {
      const result = await api("/bank-manager?action=customer-debt");
      const receiptBadge = (receipts) => receipts.length
        ? receipts.map((r) => `<span class="receipt-chip">${escapeHtml(r.receipt_no)}${r.payment_reference ? ` · ${escapeHtml(r.payment_reference)}` : ""}</span>`).join(" ")
        : '<span class="muted">No receipt on file</span>';
      const rowsHtml = (list) => list.length
        ? list.map((row) => `
          <tr>
            <td><strong>${escapeHtml(row.invoiceNo)}</strong></td>
            <td>${escapeHtml(row.customerName)}</td>
            <td class="money">${money.format(row.total)}</td>
            <td class="money">${money.format(row.paid)}</td>
            <td class="money">${money.format(row.balance)}</td>
            <td>${receiptBadge(row.receipts)}</td>
          </tr>`).join("")
        : '<tr><td colspan="6" class="muted">None</td></tr>';
      body.innerHTML = `
        <h3>Owing — ${money.format(result.totalOwing || 0)}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Receipt</th></tr></thead>
          <tbody>${rowsHtml(result.owing || [])}</tbody>
        </table></div>
        <h3 style="margin-top:18px">Settled (paid in full)</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Receipt</th></tr></thead>
          <tbody>${rowsHtml(result.settled || [])}</tbody>
        </table></div>`;
    } catch (error) {
      body.innerHTML = `<p class="alert">${escapeHtml(error.message)}</p>`;
    }
  }

  document.getElementById("companyMetrics")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-metric-click]");
    if (card && card.dataset.metricClick === "Customer Debt") openCustomerDebtDrilldown();
  });
  document.getElementById("closeCustomerDebtDialog")?.addEventListener("click", () =>
    document.getElementById("customerDebtDialog").close());


  function populateAccountSelect() {
    const select = document.getElementById("accountSelect");
    const current = select.value;
    select.innerHTML = data.accounts.length
      ? `<option value="">Select an account to view…</option>${data.accounts.map(account =>
          `<option value="${escapeHtml(account.id)}">${escapeHtml(account.bank_name)} — ${escapeHtml(account.account_name)} (${escapeHtml(account.account_number)})</option>`
        ).join("")}`
      : '<option value="">No bank accounts yet — add one</option>';
    if (current && data.accounts.some(account => account.id === current)) select.value = current;
  }

  function renderAccountDetail() {
    const id = document.getElementById("accountSelect").value;
    const detail = document.getElementById("accountDetail");
    const account = data.accounts.find(item => item.id === id);
    if (!account) {
      detail.classList.add("hidden");
      return;
    }
    detail.classList.remove("hidden");
    document.getElementById("accountMetrics").innerHTML = [
      metricCard("Opening Balance", money.format(account.opening_balance || 0)),
      metricCard("Payments In", money.format(account.payments || 0), "green"),
      metricCard("Expenses Out", money.format(account.expenses || 0), "yellow"),
      metricCard("Withdrawals Out", money.format(account.withdrawals || 0), "yellow"),
      metricCard("Current Balance", money.format(account.balance || 0), account.balance < 0 ? "red" : "green"),
    ].join("");
  }

  function renderWithdrawals() {
    const rows = data.withdrawals || [];
    document.getElementById("withdrawalRows").innerHTML = rows.length
      ? rows.map(item => `<tr>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(item.bank_name)} — ${escapeHtml(item.account_name)}</td>
          <td>${escapeHtml(item.cheque_number || "—")}</td>
          <td>${escapeHtml(item.description)}</td>
          <td><strong>${money.format(Number(item.amount || 0))}</strong></td>
          <td>${escapeHtml(item.withdrawn_by || "—")}</td>
        </tr>`).join("")
      : '<tr><td colspan="6" class="empty">No withdrawals recorded yet.</td></tr>';
  }

  async function load() {
    if (!token) {
      window.location.href = "/admin/login";
      return;
    }
    try {
      data = await api("/bank-manager");
      renderCompanyMetrics();
      populateAccountSelect();
      renderAccountDetail();
      renderWithdrawals();
    } catch (error) {
      message(error.message, true);
    }
  }

  document.getElementById("accountSelect").addEventListener("change", renderAccountDetail);
  document.getElementById("refreshButton").addEventListener("click", load);

  document.getElementById("addAccountButton").addEventListener("click", () => {
    document.getElementById("accountForm").reset();
    document.getElementById("accountId").value = "";
    document.getElementById("accountDialogTitle").textContent = "Add bank account";
    document.getElementById("accountFormAlert").classList.add("hidden");
    document.getElementById("accountDialog").showModal();
  });

  document.getElementById("editAccountButton").addEventListener("click", () => {
    const account = data.accounts.find(item => item.id === document.getElementById("accountSelect").value);
    if (!account) return;
    document.getElementById("accountId").value = account.id;
    document.getElementById("bankName").value = account.bank_name;
    document.getElementById("accountName").value = account.account_name;
    document.getElementById("accountNumber").value = account.account_number;
    document.getElementById("openingBalance").value = account.opening_balance;
    document.getElementById("accountDialogTitle").textContent = "Edit bank account";
    document.getElementById("accountFormAlert").classList.add("hidden");
    document.getElementById("accountDialog").showModal();
  });

  document.getElementById("accountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = document.getElementById("accountId").value;
    const button = document.getElementById("saveAccountButton");
    const alertBox = document.getElementById("accountFormAlert");
    button.disabled = true;
    try {
      const payload = {
        bankName: document.getElementById("bankName").value.trim(),
        accountName: document.getElementById("accountName").value.trim(),
        accountNumber: document.getElementById("accountNumber").value.trim(),
        openingBalance: Number(document.getElementById("openingBalance").value || 0),
      };
      if (id) {
        await api(`/bank-manager/accounts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/bank-manager/accounts", { method: "POST", body: JSON.stringify(payload) });
      }
      document.getElementById("accountDialog").close();
      message(id ? "Bank account updated successfully." : "Bank account added successfully.");
      await load();
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("addWithdrawalButton").addEventListener("click", () => {
    if (!document.getElementById("accountSelect").value) return;
    document.getElementById("withdrawalForm").reset();
    document.getElementById("withdrawalDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("withdrawalFormAlert").classList.add("hidden");
    document.getElementById("withdrawalDialog").showModal();
  });

  document.getElementById("withdrawalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.getElementById("saveWithdrawalButton");
    const alertBox = document.getElementById("withdrawalFormAlert");
    button.disabled = true;
    try {
      await api("/bank-manager/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          bankAccountId: document.getElementById("accountSelect").value,
          date: document.getElementById("withdrawalDate").value,
          chequeNumber: document.getElementById("chequeNumber").value.trim(),
          description: document.getElementById("withdrawalDescription").value.trim(),
          amount: Number(document.getElementById("withdrawalAmount").value || 0),
          withdrawnBy: document.getElementById("withdrawnBy").value.trim(),
        }),
      });
      document.getElementById("withdrawalDialog").close();
      message("Withdrawal recorded successfully.");
      await load();
    } catch (error) {
      alertBox.textContent = error.message;
      alertBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-close]").forEach((button) =>
    button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));

  load();
})();
