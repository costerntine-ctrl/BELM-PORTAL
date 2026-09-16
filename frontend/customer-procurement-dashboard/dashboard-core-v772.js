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
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function pillClass(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'ORDERED' || s === 'PARTS_READY') return 'belm-pill--completed';
    if (s === 'PENDING_PROCUREMENT' || s === 'PURCHASE_REQUIRED') return 'belm-pill--approved';
    return 'belm-pill--approved';
  }
  function machineLabel(r) {
    return `${r.machine_brand || ''} ${r.machine_model || ''}`.trim() || r.fleet_number || '—';
  }

  async function load() {
    try {
      const [dash, summary] = await Promise.all([api('/dashboard'), api('/procurement-summary')]);
      const companyName = dash?.customer?.name || 'Customer';
      document.querySelectorAll('[data-company-name]').forEach((el) => { el.textContent = companyName; });
      document.querySelectorAll('[data-company-name-upper]').forEach((el) => { el.textContent = companyName.toUpperCase(); });

      const items = Array.isArray(summary?.items) ? summary.items : [];
      const counts = summary?.counts || {};
      document.getElementById('statTotal').textContent = items.length;
      document.getElementById('statPending').textContent = (counts.pending || 0) + (counts.purchaseRequired || 0);
      document.getElementById('statOrdered').textContent = counts.ordered || 0;
      document.getElementById('statReady').textContent = counts.partsReady || 0;

      const body = document.getElementById('requestsBody');
      body.innerHTML = items.length
        ? items.slice(0, 15).map((r) => `
            <tr>
              <td>${esc(r.description || r.part_number || 'Spare')}</td>
              <td>${esc(machineLabel(r))}</td>
              <td>${esc(r.quantity)} ${esc(r.unit || '')}</td>
              <td>${esc(fmtDate(r.requested_at))}</td>
              <td><span class="belm-pill ${pillClass(r.status)}">${esc(String(r.status || '').replace(/_/g, ' '))}</span></td>
            </tr>`).join('')
        : '<tr><td colspan="5">No purchase requests yet.</td></tr>';
    } catch (e) {
      document.getElementById('requestsBody').innerHTML = `<tr><td colspan="5">Could not load procurement data: ${esc(e.message)}</td></tr>`;
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
