(function () {
  'use strict';

  const token = localStorage.getItem('belm_admin_token') || '';
  if (!token) return;

  const money = new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 2,
  });

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  async function fetchVatSummary() {
    const response = await fetch('/api/bank-vat-summary', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data && data.error || 'Could not sync Bank Controller finance summary.');
    return data || {};
  }

  function applySummary(summary) {
    const container = document.getElementById('companyMetrics');
    if (!container) return;

    let vatFound = false;
    container.querySelectorAll('.metric-card').forEach((card) => {
      const label = card.querySelector('span');
      const value = card.querySelector('strong');
      if (!label || !value) return;
      const name = normalize(label.textContent);

      if (name === 'COMPANY EXPENSES') {
        const breakdown = summary.companyExpenseBreakdown || {};
        value.textContent = money.format(Number(summary.companyExpenses || 0));
        card.classList.remove('green');
        card.classList.add('yellow');
        card.title = [
          'Synced company expenses',
          'Finance: ' + money.format(Number(breakdown.finance || 0)),
          'Procurement: ' + money.format(Number(breakdown.procurement || 0)),
          'Workshop Manager: ' + money.format(Number(breakdown.workshopManager || 0))
        ].join('\n');
        card.dataset.financeExpenses = String(Number(breakdown.finance || 0));
        card.dataset.procurementExpenses = String(Number(breakdown.procurement || 0));
        card.dataset.workshopExpenses = String(Number(breakdown.workshopManager || 0));
      }

      if (name.includes('VAT DEBT') || name.includes('VAT PAYABLE')) {
        label.textContent = 'VAT Payable to TRA (18%)';
        value.textContent = money.format(Number(summary.vatPayable || 0));
        card.classList.remove('green');
        card.classList.add('yellow');
        card.title = 'VAT collected from paid invoice amounts. This is TRA money and is deducted from BELM net funds.';
        vatFound = true;
      }

      if (name === 'BELM PROFIT') {
        value.textContent = money.format(Number(summary.belmProfit || 0));
      }
      if (name === 'LOSS') {
        value.textContent = money.format(Number(summary.loss || 0));
      }
    });

    if (!vatFound) {
      const card = document.createElement('article');
      card.className = 'metric-card yellow';
      card.title = 'VAT collected from paid invoice amounts. This is TRA money and is deducted from BELM net funds.';
      card.innerHTML = '<span>VAT Payable to TRA (18%)</span><strong>' + money.format(Number(summary.vatPayable || 0)) + '</strong>';
      container.appendChild(card);
    }
  }

  async function sync() {
    try {
      const summary = await fetchVatSummary();
      applySummary(summary);
    } catch (error) {
      console.warn('BELM Bank Controller summary sync:', error);
    }
  }

  window.addEventListener('load', function () {
    setTimeout(sync, 250);
    setInterval(sync, 60000);
  });

  document.addEventListener('click', function (event) {
    if (event.target.closest('#refreshButton')) setTimeout(sync, 500);
  });
})();
