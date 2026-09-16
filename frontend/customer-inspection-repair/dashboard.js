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
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  async function load() {
    try {
      const [dash, board] = await Promise.all([api('/dashboard'), api('/inspection-repair')]);
      const companyName = dash?.customer?.name || 'Customer';
      document.querySelectorAll('[data-company-name]').forEach((el) => { el.textContent = companyName; });
      document.querySelectorAll('[data-company-name-upper]').forEach((el) => { el.textContent = companyName.toUpperCase(); });

      const counts = board?.counts || {};
      document.getElementById('statPending').textContent = counts.PENDING_INSPECTION || 0;
      document.getElementById('statDiagnosis').textContent = counts.UNDER_DIAGNOSIS || 0;
      document.getElementById('statRepair').textContent = counts.REPAIR_IN_PROGRESS || 0;

      const cases = Array.isArray(board?.cases) ? board.cases : [];
      const body = document.getElementById('casesBody');
      body.innerHTML = cases.length
        ? cases.map((c) => `
            <tr>
              <td>${esc(c.machine)}</td>
              <td>${esc(String(c.stage || '').replace(/_/g, ' '))}</td>
              <td>${esc(c.technician || 'Not yet assigned')}</td>
              <td>${esc(c.nextAction || '—')}</td>
              <td>${esc(fmtDate(c.stageStartedAt))}</td>
            </tr>`).join('')
        : '<tr><td colspan="5">No active breakdown cases right now.</td></tr>';
    } catch (e) {
      document.getElementById('casesBody').innerHTML = `<tr><td colspan="5">Could not load: ${esc(e.message)}</td></tr>`;
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
