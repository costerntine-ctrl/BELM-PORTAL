(function () {
  'use strict';
  const token = localStorage.getItem('belm_customer_token') || '';
  if (!token) { location.replace('/login'); return; }

  async function api(path) {
    const res = await fetch('/api/customer-portal' + path, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('belm_customer_token'); location.replace('/login'); }
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  async function load() {
    try {
      const [dash, store] = await Promise.all([api('/dashboard'), api('/store')]);
      const companyName = dash?.customer?.name || 'Customer';
      document.querySelectorAll('[data-company-name]').forEach((el) => { el.textContent = companyName; });
      document.querySelectorAll('[data-company-name-upper]').forEach((el) => { el.textContent = companyName.toUpperCase(); });

      const items = Array.isArray(store?.items) ? store.items : [];
      const movements = Array.isArray(store?.recentMovements) ? store.recentMovements : [];
      const outOfStock = items.filter((i) => Number(i.qty_on_hand) <= 0);
      const totalIssued = items.reduce((sum, i) => sum + Number(i.total_issued || 0), 0);
      const now = new Date();
      const monthMovements = movements.filter((m) => {
        const d = new Date(m.created_at);
        return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      document.getElementById('statItems').textContent = items.length;
      document.getElementById('statLow').textContent = outOfStock.length;
      document.getElementById('statIssued').textContent = totalIssued;
      document.getElementById('statMovements').textContent = monthMovements.length;

      const alertList = document.getElementById('alertList');
      alertList.innerHTML = outOfStock.length
        ? outOfStock.slice(0, 8).map((i) => `
            <a href="/customer-store/" class="belm-alert-row">
              <span class="belm-alert-row__icon belm-alert-row__icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>
              <span class="belm-alert-row__label">${esc(i.description || i.part_number)}</span>
              <span class="belm-alert-row__count">0 ${esc(i.unit || '')}</span>
              <svg class="belm-alert-row__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
            </a>`).join('')
        : '<div class="belm-alert-row"><span class="belm-alert-row__label">Nothing is out of stock.</span></div>';

      const topItems = [...items].sort((a, b) => Number(b.qty_on_hand) - Number(a.qty_on_hand)).slice(0, 6);
      const topList = document.getElementById('topItemsList');
      topList.innerHTML = topItems.length
        ? topItems.map((i) => `
            <div class="belm-alert-row" style="cursor:default">
              <span class="belm-alert-row__icon belm-alert-row__icon--green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 8l-9-5-9 5 9 5 9-5z"/></svg></span>
              <span class="belm-alert-row__label">${esc(i.description || i.part_number)}</span>
              <span class="belm-alert-row__count">${esc(i.qty_on_hand)} ${esc(i.unit || '')}</span>
            </div>`).join('')
        : '<div class="belm-alert-row"><span class="belm-alert-row__label">No store items recorded yet.</span></div>';

      const body = document.getElementById('movementsBody');
      body.innerHTML = movements.length
        ? movements.slice(0, 12).map((m) => `
            <tr>
              <td>${esc(fmtDateTime(m.created_at))}</td>
              <td>${esc(m.movement_type)}</td>
              <td>${esc(m.description || m.part_number)}</td>
              <td>${esc(m.quantity)}</td>
              <td>${esc(m.actor_name || m.received_by || '—')}</td>
            </tr>`).join('')
        : '<tr><td colspan="5">No movements recorded yet.</td></tr>';
    } catch (e) {
      document.getElementById('movementsBody').innerHTML = `<tr><td colspan="5">Could not load store data: ${esc(e.message)}</td></tr>`;
    }
  }

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('belmShell')?.classList.toggle('is-sidebar-open');
  });
  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('belm_customer_token');
    location.replace('/login');
  });

  load();
})();
