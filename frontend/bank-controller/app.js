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
      window.location.href = "/login";
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

  // API responses are normalized to camelCase by helpers.php.  Keep legacy
  // snake_case fallbacks so older cached/API payloads cannot make saved bank
  // accounts appear as blank labels such as "— 0".
  const bankNameOf = (account) => account?.bankName ?? account?.bank_name ?? "";
  const accountNameOf = (account) => account?.accountName ?? account?.account_name ?? "";
  const accountNumberOf = (account) => account?.accountNumber ?? account?.account_number ?? "";
  const openingBalanceOf = (account) => Number(account?.openingBalance ?? account?.opening_balance ?? 0);
  const withdrawalBankNameOf = (item) => item?.bankName ?? item?.bank_name ?? "";
  const withdrawalAccountNameOf = (item) => item?.accountName ?? item?.account_name ?? "";
  const withdrawalChequeOf = (item) => item?.chequeNumber ?? item?.cheque_number ?? "";
  const withdrawalByOf = (item) => item?.withdrawnBy ?? item?.withdrawn_by ?? "";
  const isTestAccount = (account) => Number(account?.isTest ?? account?.is_test ?? 0) === 1;
  const signedInAdmin = (() => {
    try { return JSON.parse(localStorage.getItem("belm_admin_user") || "null") || {}; }
    catch (_) { return {}; }
  })();

  function setBankEditAuthorization(enabled) {
    const wrap = document.getElementById("bankEditAuthorization");
    const fields = ["bankEditAdminPassword", "bankEditPin", "bankEditReason"]
      .map(id => document.getElementById(id));
    wrap?.classList.toggle("hidden", !enabled);
    fields.forEach((field) => {
      if (!field) return;
      field.disabled = !enabled;
      field.required = enabled;
      field.value = "";
    });
    const actor = document.getElementById("bankEditActor");
    if (actor) {
      const identity = [signedInAdmin.name, signedInAdmin.email].filter(Boolean).join(" · ");
      actor.textContent = identity || "Signed-in BELM Admin";
    }
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
    if (s.bankTestMode) {
      document.getElementById("companyMetrics").innerHTML = [
        metricCard("TEST Bank Balance", money.format(s.allBankBalance || 0), "green"),
        metricCard("TEST Payments In", money.format(s.paymentsReceived || 0)),
        metricCard("TEST Expenses Out", money.format(s.companyExpenses || 0), "yellow"),
        metricCard("TEST Withdrawals", money.format(s.totalWithdrawals || 0), "yellow"),
      ].join("");
      return;
    }
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
        ? receipts.map((r) => `<span class="receipt-chip">${escapeHtml(r.receiptNo ?? r.receipt_no)}${(r.paymentReference ?? r.payment_reference) ? ` · ${escapeHtml(r.paymentReference ?? r.payment_reference)}` : ""}</span>`).join(" ")
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
          `<option value="${escapeHtml(account.id)}">${isTestAccount(account) ? '[TEST] ' : ''}${escapeHtml(bankNameOf(account))} — ${escapeHtml(accountNameOf(account))} (${escapeHtml(accountNumberOf(account))})</option>`
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
      metricCard("Opening Balance", money.format(openingBalanceOf(account))),
      metricCard("Payments In", money.format(account.payments || 0), "green"),
      metricCard("Expenses Out", money.format(account.expenses || 0), "yellow"),
      metricCard("Withdrawals Out", money.format(account.withdrawals || 0), "yellow"),
      metricCard("Current Balance", money.format(account.balance || 0), account.balance < 0 ? "red" : "green"),
    ].join("");
  }

  async function loadBankEditAudit() {
    const rows = document.getElementById("bankEditAuditRows");
    if (!rows) return;
    try {
      const result = await api("/bank-manager?action=edit-audit");
      const sender = document.getElementById("systemSenderEmail");
      if (sender && result.systemSenderEmail) sender.textContent = result.systemSenderEmail;
      const edits = Array.isArray(result.edits) ? result.edits : [];
      rows.innerHTML = edits.length ? edits.map((item) => {
        const admin = [item.adminName, item.adminEmail].filter(Boolean).join(" · ") || "BELM Admin";
        const account = [item.bankName, item.accountName, item.accountNumber].filter(Boolean).join(" · ") || "Bank account";
        const when = item.createdAt ? new Date(item.createdAt).toLocaleString("en-TZ") : "—";
        return `<tr>
          <td>${escapeHtml(when)}</td>
          <td><strong>${escapeHtml(admin)}</strong></td>
          <td>${escapeHtml(account)}</td>
          <td>${escapeHtml(item.reason || "—")}</td>
        </tr>`;
      }).join("") : '<tr><td colspan="4" class="empty">No bank account edits recorded yet.</td></tr>';
    } catch (error) {
      rows.innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(error.message || "Could not load bank edit history.")}</td></tr>`;
    }
  }

  function renderWithdrawals() {
    const rows = data.withdrawals || [];
    document.getElementById("withdrawalRows").innerHTML = rows.length
      ? rows.map(item => `<tr>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(withdrawalBankNameOf(item))} — ${escapeHtml(withdrawalAccountNameOf(item))}</td>
          <td>${escapeHtml(withdrawalChequeOf(item) || "—")}</td>
          <td>${escapeHtml(item.description)}</td>
          <td><strong>${money.format(Number(item.amount || 0))}</strong></td>
          <td>${escapeHtml(withdrawalByOf(item) || "—")}</td>
        </tr>`).join("")
      : '<tr><td colspan="6" class="empty">No withdrawals recorded yet.</td></tr>';
  }

  async function load(preferredAccountId = "") {
    if (!token) {
      window.location.href = "/login";
      return;
    }
    try {
      data = await api("/bank-manager");
      const storageStatus = document.getElementById("bankStorageStatus");
      if (storageStatus) {
        const count = Array.isArray(data.accounts) ? data.accounts.length : 0;
        const testCount = data.accounts.filter(isTestAccount).length;
        storageStatus.textContent = testCount
          ? `TEST MODE · ${testCount} clearable TEST BANK account${testCount === 1 ? "" : "s"} · saved in PostgreSQL`
          : `✓ ${count} bank account${count === 1 ? "" : "s"} loaded from PostgreSQL`;
      }
      const clearTestButton = document.getElementById("clearTestBankButton");
      if (clearTestButton) clearTestButton.classList.toggle("hidden", !data.accounts.some(isTestAccount));
      renderCompanyMetrics();
      populateAccountSelect();
      if (preferredAccountId && data.accounts.some(account => account.id === preferredAccountId)) {
        document.getElementById("accountSelect").value = preferredAccountId;
      }
      renderAccountDetail();
      renderWithdrawals();
      await loadBankEditAudit();
    } catch (error) {
      message(error.message, true);
    }
  }

  document.getElementById("accountSelect").addEventListener("change", renderAccountDetail);
  document.getElementById("refreshButton").addEventListener("click", load);
  document.getElementById("refreshBankEditAuditButton")?.addEventListener("click", loadBankEditAudit);

  document.getElementById("clearTestBankButton")?.addEventListener("click", async () => {
    const confirmed = window.confirm("Clear TEST BANK data now? This resets TEST BANK opening balance/withdrawals and removes only its bank allocations. Invoices, payments, receipts, expenses and Spare Stock are not deleted.");
    if (!confirmed) return;
    const button = document.getElementById("clearTestBankButton");
    button.disabled = true;
    try {
      await api("/bank-manager/test-reset", { method: "POST", body: JSON.stringify({ confirm: "CLEAR TEST BANK" }) });
      message("TEST BANK cleared to TZS 0. Spare Stock was not touched.");
      await load("35600000-0000-4000-8000-000000000001");
    } catch (error) {
      message(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("addAccountButton").addEventListener("click", () => {
    document.getElementById("accountForm").reset();
    document.getElementById("accountId").value = "";
    document.getElementById("accountDialogTitle").textContent = "Add bank account";
    document.getElementById("accountFormAlert").classList.add("hidden");
    setBankEditAuthorization(false);
    document.getElementById("accountDialog").showModal();
  });

  document.getElementById("editAccountButton").addEventListener("click", () => {
    const account = data.accounts.find(item => item.id === document.getElementById("accountSelect").value);
    if (!account) return;
    document.getElementById("accountId").value = account.id;
    document.getElementById("bankName").value = bankNameOf(account);
    document.getElementById("accountName").value = accountNameOf(account);
    document.getElementById("accountNumber").value = accountNumberOf(account);
    document.getElementById("openingBalance").value = openingBalanceOf(account);
    document.getElementById("accountDialogTitle").textContent = "Edit bank account";
    document.getElementById("accountFormAlert").classList.add("hidden");
    setBankEditAuthorization(true);
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
      let saved;
      if (id) {
        payload.adminPassword = document.getElementById("bankEditAdminPassword").value;
        payload.editPin = document.getElementById("bankEditPin").value.trim();
        payload.reason = document.getElementById("bankEditReason").value.trim();
        saved = await api(`/bank-manager/accounts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        saved = await api("/bank-manager/accounts", { method: "POST", body: JSON.stringify(payload) });
      }
      const savedId = saved?.id || id || "";
      document.getElementById("accountDialog").close();
      message(id
        ? (saved?.message || "Bank account updated and audit logged.")
        : "Bank account added and saved in PostgreSQL.");
      await load(savedId);
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
