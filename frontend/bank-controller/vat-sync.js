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
    let inventoryFound = false;

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
      }

      if (name === 'INVENTORY VALUE') {
        label.textContent = 'Inventory Value';
        value.textContent = money.format(Number(summary.inventoryValue || 0));
        card.classList.remove('yellow', 'red');
        card.classList.add('blue');
        card.title = 'Live spare inventory value = current stock quantity × purchase price. In-stock items: ' + Number(summary.inventoryItems || 0) + '.';
        inventoryFound = true;
      }

      if (name.includes('VAT DEBT') || name.includes('VAT PAYABLE') || name.includes('INVOICE OUTPUT VAT')) {
        label.textContent = 'Invoice Output VAT (Not TRA Net)';
        value.textContent = money.format(Number(summary.vatPayable || 0));
        card.classList.remove('green');
        card.classList.add('yellow');
        card.title = 'Output VAT recorded on issued invoices. NOT final TRA net VAT: input VAT, credits, adjustments and TRA payments are not reconciled.';
        vatFound = true;
      }

      if (name === 'PROVISIONAL OPERATING MARGIN') value.textContent = money.format(Number(summary.belmProfit || 0));
      if (name === 'PROVISIONAL OPERATING LOSS') value.textContent = money.format(Number(summary.loss || 0));
    });

    if (!inventoryFound) {
      const card = document.createElement('article');
      card.className = 'metric-card blue';
      card.title = 'Live spare inventory value = current stock quantity × purchase price.';
      card.innerHTML = '<span>Inventory Value</span><strong>' + money.format(Number(summary.inventoryValue || 0)) + '</strong>';
      container.appendChild(card);
    }

    if (!vatFound) {
      const card = document.createElement('article');
      card.className = 'metric-card yellow';
      card.title = 'Output VAT recorded on issued invoices. NOT final TRA net VAT: input VAT, credits, adjustments and TRA payments are not reconciled.';
      card.innerHTML = '<span>Invoice Output VAT (Not TRA Net)</span><strong>' + money.format(Number(summary.vatPayable || 0)) + '</strong>';
      container.appendChild(card);
    }
  }

  async function syncTaxLedger() {
    const container = document.getElementById('companyMetrics');
    if (!container) return;
    const response = await fetch('/api/belm-vat-ledger', {cache:'no-store', headers:{Authorization:'Bearer '+token}});
    if (!response.ok) return; // Older deploys can lack phase 18 migration.
    const ledger = await response.json();
    let card = container.querySelector('[data-vat-ledger-card]');
    if (!card) {
      card = document.createElement('article');
      card.className = 'metric-card yellow';
      card.setAttribute('data-vat-ledger-card', '1');
      const label = document.createElement('span');
      label.textContent = 'Estimated VAT Balance (Unverified)';
      const value = document.createElement('strong');
      card.append(label, value);
      container.appendChild(card);
    }
    card.querySelector('strong').textContent = money.format(Number(ledger.estimatedCumulativeBalance || 0));
    card.title = ledger.warning || 'Provisional VAT estimate only';
  }

  async function sync() {
    try {
      const summary = await fetchVatSummary();
      applySummary(summary);
      await syncTaxLedger();
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
