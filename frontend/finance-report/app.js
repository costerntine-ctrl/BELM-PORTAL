(() => {
  'use strict';

  const token = localStorage.getItem('belm_admin_token') || '';
  if (!token) {
    location.replace('/login');
    return;
  }

  const state = {
    transactions: [],
    activity: [],
    invoices: [],
    proformas: [],
    errors: [],
  };

  const $ = (id) => document.getElementById(id);
  const moneyFmt = new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
  const numberFmt = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 });
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => moneyFmt.format(Number(value) || 0);
  const number = (value) => numberFmt.format(Number(value) || 0);

  async function api(path) {
    const response = await fetch(`/api${path}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (response.status === 401) {
      localStorage.removeItem('belm_admin_token');
      localStorage.removeItem('belm_admin_user');
      location.replace('/login');
      throw new Error('Your session has expired.');
    }
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isoDate(value) {
    const d = parseDate(value);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function displayDate(value) {
    const d = parseDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function parseMetadata(value) {
    if (value && typeof value === 'object') return value;
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return { raw: String(value) };
    }
  }

  function statusTone(status) {
    const s = String(status || '').toUpperCase();
    if (/PAID|RECEIVED|POSTED|COMPLETED|APPROVED|GENERATED/.test(s)) return 'green';
    if (/OVERDUE|REVERSED|CANCELLED|REJECTED|FAILED/.test(s)) return 'red';
    if (/OUTSTANDING|UNPAID|PARTIAL|PENDING|DRAFT/.test(s)) return 'yellow';
    return '';
  }

  function transaction({ id, entity, entityId, type, date, customer, source, reference, method, status, amount, impact = 'NONE', metadata = {} }) {
    return {
      id: String(id || `${type}-${Math.random()}`),
      entity: String(entity || ''),
      entityId: String(entityId || ''),
      type: String(type || 'OTHER').toUpperCase(),
      date,
      customer: String(customer || ''),
      source: String(source || ''),
      reference: String(reference || ''),
      method: String(method || ''),
      status: String(status || ''),
      amount: Number(amount) || 0,
      impact,
      metadata,
    };
  }

  function normalize(invoices, expenses, petty, proformas, bank) {
    const rows = [];

    invoices.forEach((invoice) => {
      const customer = invoice.customer?.name || invoice.customer_name || 'Customer';
      rows.push(transaction({
        id: `invoice-${invoice.id}`,
        entity: 'invoice', entityId: invoice.id, type: 'INVOICE',
        date: invoice.issueDate || invoice.issue_date || invoice.createdAt || invoice.created_at,
        customer, source: customer,
        reference: invoice.invoiceNo || invoice.invoice_no || invoice.id,
        method: 'Billing', status: invoice.status || 'UNPAID', amount: invoice.total, impact: 'NONE',
        metadata: { documentId: invoice.id },
      }));

      (Array.isArray(invoice.payments) ? invoice.payments : []).forEach((payment) => {
        rows.push(transaction({
          id: payment.id || `payment-${invoice.id}-${payment.paid_at || payment.paidAt}`,
          entity: 'invoice', entityId: invoice.id, type: 'PAYMENT',
          date: payment.paid_at || payment.paidAt,
          customer, source: customer,
          reference: payment.reference || payment.referenceNo || invoice.invoiceNo || invoice.invoice_no || '',
          method: [payment.method || payment.paymentMethod, payment.bank_name || payment.bankName, payment.account_name || payment.accountName].filter(Boolean).join(' · '),
          status: 'RECEIVED', amount: payment.amount, impact: 'INCOME',
          metadata: { paymentId: payment.id || null, invoiceNo: invoice.invoiceNo || invoice.invoice_no || '' },
        }));
      });
    });

    expenses.forEach((expense) => {
      rows.push(transaction({
        id: expense.id,
        entity: 'companyExpense', entityId: expense.id, type: 'EXPENSE',
        date: expense.date || expense.created_at || expense.createdAt,
        customer: '', source: expense.description || expense.category || 'Company Expense',
        reference: expense.reference || expense.id,
        method: [expense.payment_method || expense.paymentMethod, expense.bank_name || expense.bankName, expense.account_name || expense.accountName].filter(Boolean).join(' · '),
        status: 'POSTED', amount: expense.amount, impact: 'EXPENSE',
        metadata: { category: expense.category || '', recordedBy: expense.recorded_by || expense.recordedBy || '' },
      }));
    });

    (petty?.entries || []).forEach((entry) => {
      const isExpense = String(entry.entry_type || '').toUpperCase() === 'EXPENSE';
      rows.push(transaction({
        id: entry.id,
        entity: 'belmWorkshopPettyCash', entityId: entry.id,
        type: isExpense ? 'PETTY_EXPENSE' : 'PETTY_FUND',
        date: entry.transaction_date || entry.created_at,
        customer: '', source: entry.description || 'BELM Workshop Petty Cash',
        reference: entry.reference || entry.id,
        method: 'Petty Cash', status: 'POSTED', amount: entry.amount,
        impact: isExpense ? 'EXPENSE' : 'NONE',
        metadata: { category: entry.category || '', createdBy: entry.created_by_name || '' },
      }));
    });

    proformas.forEach((p) => {
      const customer = p.customer?.name || p.customer_name || 'Customer';
      const generated = p.generated_invoice_no || p.generatedInvoiceNo;
      const response = p.customer_response || p.customerResponse || '';
      const status = generated ? 'GENERATED' : (response || 'PENDING');
      rows.push(transaction({
        id: `proforma-${p.id}`,
        entity: 'proformaInvoice', entityId: p.id, type: 'PROFORMA',
        date: p.date || p.created_at || p.createdAt,
        customer, source: customer,
        reference: p.invoice_no || p.invoiceNo || p.id,
        method: 'Commercial Document', status,
        amount: p.totals?.grandTotal ?? p.total ?? 0, impact: 'NONE',
        metadata: { generatedInvoiceNo: generated || null },
      }));
    });

    if (bank && Array.isArray(bank.withdrawals)) {
      bank.withdrawals.forEach((w) => {
        rows.push(transaction({
          id: w.id,
          entity: 'bankWithdrawal', entityId: w.id, type: 'BANK_WITHDRAWAL',
          date: w.date || w.created_at || w.createdAt,
          customer: '', source: w.reason || w.description || w.bank_name || 'Bank Withdrawal',
          reference: w.reference || w.id,
          method: [w.bank_name, w.account_name].filter(Boolean).join(' · ') || 'Bank',
          status: 'POSTED', amount: w.amount, impact: 'NONE',
          metadata: { bankAccountId: w.bank_account_id || null },
        }));
      });
    }

    rows.sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0));
    return rows;
  }

  function periodBounds() {
    const period = $('periodFilter').value;
    const now = new Date();
    let from = null;
    let to = null;

    if (period === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'previous-month') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === 'year') {
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (period === 'custom') {
      const f = $('dateFrom').value;
      const t = $('dateTo').value;
      if (f) from = new Date(`${f}T00:00:00`);
      if (t) to = new Date(`${t}T23:59:59.999`);
    }
    return { from, to };
  }

  function inPeriod(row, bounds) {
    if (!bounds.from && !bounds.to) return true;
    const d = parseDate(row.date);
    if (!d) return false;
    if (bounds.from && d < bounds.from) return false;
    if (bounds.to && d > bounds.to) return false;
    return true;
  }

  function baseFilteredRows() {
    const bounds = periodBounds();
    const customer = $('customerFilter').value;
    return state.transactions.filter((row) => inPeriod(row, bounds) && (!customer || row.customer === customer));
  }

  function filteredRows() {
    const type = $('typeFilter').value;
    const status = $('statusFilter').value;
    const method = $('methodFilter').value;
    return baseFilteredRows().filter((row) =>
      (!type || row.type === type) &&
      (!status || row.status === status) &&
      (!method || row.method === method)
    );
  }

  function rebuildSelect(id, values, firstLabel) {
    const select = $(id);
    const current = select.value;
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    select.innerHTML = `<option value="">${esc(firstLabel)}</option>` + unique.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (unique.includes(current)) select.value = current;
  }

  function refreshFilterOptions() {
    rebuildSelect('customerFilter', state.transactions.map((row) => row.customer), 'All customers');
    rebuildSelect('statusFilter', state.transactions.map((row) => row.status), 'All statuses');
    rebuildSelect('methodFilter', state.transactions.map((row) => row.method), 'All methods');
  }

  function renderMetrics(rows) {
    const income = rows.filter((r) => r.impact === 'INCOME').reduce((sum, r) => sum + r.amount, 0);
    const expenses = rows.filter((r) => r.impact === 'EXPENSE').reduce((sum, r) => sum + r.amount, 0);
    $('totalIncome').textContent = money(income);
    $('totalExpenses').textContent = money(expenses);
    $('netBalance').textContent = money(income - expenses);
    $('transactionCount').textContent = number(rows.length);
    $('filterCount').textContent = `${number(rows.length)} record${rows.length === 1 ? '' : 's'}`;
  }

  function renderDocumentStatus() {
    const base = baseFilteredRows();
    const invoices = base.filter((r) => r.type === 'INVOICE');
    const proformas = base.filter((r) => r.type === 'PROFORMA');
    $('paidInvoices').textContent = number(invoices.filter((r) => String(r.status).toUpperCase() === 'PAID').length);
    $('outstandingInvoices').textContent = number(invoices.filter((r) => /UNPAID|PARTIALLY_PAID|OUTSTANDING/.test(String(r.status).toUpperCase())).length);
    $('overdueInvoices').textContent = number(invoices.filter((r) => String(r.status).toUpperCase() === 'OVERDUE').length);
    $('proformaCount').textContent = number(proformas.length);
  }

  function renderTable(rows) {
    const target = $('transactionRows');
    if (!rows.length) {
      target.innerHTML = '<tr><td colspan="8" class="empty">No finance records match these filters.</td></tr>';
      return;
    }
    target.innerHTML = rows.map((row) => {
      const source = row.customer || row.source || 'BELM';
      const amountPrefix = row.impact === 'EXPENSE' ? '− ' : (row.impact === 'INCOME' ? '+ ' : '');
      return `<tr>
        <td>${esc(displayDate(row.date))}</td>
        <td><span class="pill">${esc(row.type.replaceAll('_', ' '))}</span></td>
        <td><strong>${esc(source)}</strong>${row.customer && row.source && row.source !== row.customer ? `<br><span class="muted">${esc(row.source)}</span>` : ''}</td>
        <td>${esc(row.reference || '—')}</td>
        <td>${esc(row.method || '—')}</td>
        <td><span class="pill ${statusTone(row.status)}">${esc(row.status || '—')}</span></td>
        <td class="amount-col">${esc(amountPrefix)}${esc(number(row.amount))}</td>
        <td><button class="audit-btn" type="button" data-audit-id="${esc(row.id)}">View Audit Log</button></td>
      </tr>`;
    }).join('');
  }

  function render() {
    const rows = filteredRows();
    renderMetrics(rows);
    renderDocumentStatus();
    renderTable(rows);
  }

  function financeActivity(log) {
    const action = String(log.action || '').toLowerCase();
    const entity = String(log.entity || '').toLowerCase();
    return ['invoice','companyexpense','belmworkshoppettycash','bankaccount','bankwithdrawal','proformainvoice','receipt'].includes(entity)
      || /invoice|payment|expense|bank|petty|proforma|receipt/.test(action);
  }

  function relatedActivity(row) {
    return state.activity.filter((log) => {
      const entityMatch = String(log.entity || '').toLowerCase() === row.entity.toLowerCase();
      const idMatch = String(log.entity_id || '') === row.entityId;
      if (entityMatch && idMatch) return true;
      if (row.type === 'PAYMENT' && String(log.entity || '').toLowerCase() === 'invoice' && String(log.entity_id || '') === row.entityId) return true;
      const meta = parseMetadata(log.metadata);
      if (row.metadata?.paymentId && String(meta.paymentId || '') === String(row.metadata.paymentId)) return true;
      return false;
    }).sort((a, b) => (parseDate(b.created_at)?.getTime() || 0) - (parseDate(a.created_at)?.getTime() || 0));
  }

  function auditEventHtml(log) {
    const metadata = parseMetadata(log.metadata);
    const actor = log.user_name || log.user_email || 'System / unknown actor';
    return `<article class="audit-event">
      <div class="audit-event-head"><strong>${esc(String(log.action || 'activity').replaceAll('-', ' '))}</strong><span>${esc(new Date(log.created_at || Date.now()).toLocaleString())}</span></div>
      <div class="audit-meta">
        <span><b>User:</b> ${esc(actor)}</span>
        <span><b>Email:</b> ${esc(log.user_email || '—')}</span>
        <span><b>Module / Entity:</b> ${esc(log.entity || '—')}</span>
        <span><b>Record ID:</b> ${esc(log.entity_id || '—')}</span>
      </div>
      <div class="json-block">${esc(JSON.stringify(metadata, null, 2))}</div>
    </article>`;
  }

  function openAudit(row) {
    const events = relatedActivity(row);
    $('auditTitle').textContent = `${row.type.replaceAll('_', ' ')} Audit Log`;
    $('auditSubtitle').textContent = row.reference || row.entityId || 'Transaction history';
    $('auditSummary').innerHTML = `
      <div><small>Date</small><strong>${esc(displayDate(row.date))}</strong></div>
      <div><small>Customer / Source</small><strong>${esc(row.customer || row.source || 'BELM')}</strong></div>
      <div><small>Amount</small><strong>${esc(money(row.amount))}</strong></div>
      <div><small>Status</small><strong>${esc(row.status || '—')}</strong></div>
      <div><small>Reference</small><strong>${esc(row.reference || '—')}</strong></div>
      <div><small>Method / Account</small><strong>${esc(row.method || '—')}</strong></div>
      <div><small>Entity</small><strong>${esc(row.entity || '—')}</strong></div>
      <div><small>Record ID</small><strong>${esc(row.entityId || '—')}</strong></div>`;
    $('auditEvents').innerHTML = events.length
      ? events.map(auditEventHtml).join('')
      : '<div class="empty">No matching audit event is present in the latest audit-log window for this transaction.</div>';
    $('auditModal').classList.remove('hidden');
  }

  function openFullAudit() {
    const events = state.activity.filter(financeActivity).sort((a, b) => (parseDate(b.created_at)?.getTime() || 0) - (parseDate(a.created_at)?.getTime() || 0));
    $('auditTitle').textContent = 'Full Finance Audit Logs';
    $('auditSubtitle').textContent = 'Read-only recent finance activity';
    $('auditSummary').innerHTML = `<div><small>Finance events</small><strong>${number(events.length)}</strong></div><div><small>Audit window</small><strong>Latest ${number(state.activity.length)} portal events</strong></div>`;
    $('auditEvents').innerHTML = events.length ? events.map(auditEventHtml).join('') : '<div class="empty">No finance audit events found.</div>';
    $('auditModal').classList.remove('hidden');
  }

  function closeAudit() { $('auditModal').classList.add('hidden'); }

  function showErrors(errors) {
    const box = $('pageAlert');
    if (!errors.length) {
      box.classList.add('hidden');
      return;
    }
    box.textContent = `Some finance sources could not synchronize: ${errors.join(', ')}. Available sources are still shown.`;
    box.classList.remove('hidden');
  }

  async function load() {
    $('refreshButton').disabled = true;
    $('refreshButton').textContent = 'Syncing…';
    $('syncStatus').textContent = 'Synchronizing finance records…';
    $('syncDot').className = 'sync-dot';
    const results = await Promise.allSettled([
      api('/billing'),
      api('/company-expenses'),
      api('/belm-workshop-home?section=petty-cash'),
      api('/proforma-invoices'),
      api('/activity-log?limit=500'),
      api('/bank-manager'),
    ]);

    const labels = ['Billing', 'Company Expenses', 'Petty Cash', 'Proforma', 'Audit Log', 'Bank'];
    const values = results.map((result) => result.status === 'fulfilled' ? result.value : null);
    const errors = results.map((result, i) => result.status === 'rejected' ? labels[i] : null).filter(Boolean);

    state.invoices = Array.isArray(values[0]) ? values[0] : [];
    const expenses = Array.isArray(values[1]) ? values[1] : [];
    const petty = values[2] && typeof values[2] === 'object' ? values[2] : { entries: [] };
    state.proformas = Array.isArray(values[3]) ? values[3] : [];
    state.activity = Array.isArray(values[4]) ? values[4] : [];
    const bank = values[5] && typeof values[5] === 'object' ? values[5] : null;
    state.transactions = normalize(state.invoices, expenses, petty, state.proformas, bank);
    state.errors = errors;

    $('bankAccess').textContent = bank ? 'Synchronized' : 'Restricted';
    refreshFilterOptions();
    render();
    showErrors(errors.filter((name) => name !== 'Bank'));

    const criticalMissing = results[0].status === 'rejected' || results[1].status === 'rejected';
    $('syncDot').className = `sync-dot ${criticalMissing ? 'error' : 'ok'}`;
    $('syncStatus').textContent = criticalMissing ? 'Partial finance sync' : 'Finance records synchronized';
    $('syncTime').textContent = new Date().toLocaleString();
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻ Sync Report';
  }

  const now = new Date();
  $('dateTo').value = isoDate(now);
  $('dateFrom').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

  $('periodFilter').addEventListener('change', () => {
    const custom = $('periodFilter').value === 'custom';
    $('fromLabel').classList.toggle('hidden', !custom);
    $('toLabel').classList.toggle('hidden', !custom);
    render();
  });
  ['dateFrom','dateTo','customerFilter','typeFilter','statusFilter','methodFilter'].forEach((id) => $(id).addEventListener('change', render));
  $('clearFilters').addEventListener('click', () => {
    $('periodFilter').value = 'month';
    $('customerFilter').value = '';
    $('typeFilter').value = '';
    $('statusFilter').value = '';
    $('methodFilter').value = '';
    $('fromLabel').classList.add('hidden');
    $('toLabel').classList.add('hidden');
    render();
  });
  $('refreshButton').addEventListener('click', () => load().catch((error) => {
    $('pageAlert').textContent = error.message || 'Finance synchronization failed.';
    $('pageAlert').classList.remove('hidden');
    $('syncDot').className = 'sync-dot error';
    $('syncStatus').textContent = 'Finance sync failed';
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻ Sync Report';
  }));
  $('transactionRows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-audit-id]');
    if (!button) return;
    const row = state.transactions.find((item) => item.id === button.dataset.auditId);
    if (row) openAudit(row);
  });
  $('openFinanceAudit').addEventListener('click', openFullAudit);
  $('closeAudit').addEventListener('click', closeAudit);
  $('auditModal').addEventListener('click', (event) => { if (event.target === $('auditModal')) closeAudit(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAudit(); });

  load().catch((error) => {
    $('pageAlert').textContent = error.message || 'Finance synchronization failed.';
    $('pageAlert').classList.remove('hidden');
    $('syncDot').className = 'sync-dot error';
    $('syncStatus').textContent = 'Finance sync failed';
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻ Sync Report';
  });
  setInterval(() => load().catch(() => {}), 60000);
})();
