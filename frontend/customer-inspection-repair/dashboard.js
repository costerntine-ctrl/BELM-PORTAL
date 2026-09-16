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

  const SLA_HOURS = {
    WORKSHOP_REVIEW: 4, TECHNICIAN_ASSIGNMENT: 4, JOB_CARD_ASSIGNED: 4,
    DIAGNOSIS: 8, BOSS_APPROVAL: 4, STORE_CHECK: 6, PROCUREMENT: 24,
    ACCOUNTS: 8, PARTS_READY: 4, REPAIR: 24, PENDING_APPROVAL: 8,
  };
  const IN_PROGRESS_STAGES = ['STORE_CHECK', 'PROCUREMENT', 'ACCOUNTS', 'PARTS_READY', 'REPAIR', 'PENDING_APPROVAL'];

  function isOverdue(c) {
    if (!c.stageStartedAt) return false;
    const started = new Date(c.stageStartedAt).getTime();
    if (isNaN(started)) return false;
    const sla = SLA_HOURS[c.stage] ?? 8;
    return (Date.now() - started) / 3600000 > sla;
  }

  const FILTERS = {
    in_progress: { title: 'In Progress', test: (c) => IN_PROGRESS_STAGES.includes(c.stage) },
    waiting_spare: { title: 'Waiting for Spare Approval', test: (c) => c.stage === 'BOSS_APPROVAL' },
    overdue: { title: 'Overdue (Past Stage SLA)', test: isOverdue },
  };

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

      let cases = Array.isArray(board?.cases) ? board.cases : [];

      const filterKey = new URLSearchParams(location.search).get('filter');
      const filter = filterKey && FILTERS[filterKey];
      const titleEl = document.getElementById('casesTitle');
      const clearLink = document.getElementById('clearFilterLink');
      if (filter) {
        cases = cases.filter(filter.test);
        titleEl.textContent = `Active Cases — ${filter.title}`;
        clearLink.hidden = false;
      } else {
        titleEl.textContent = 'Active Cases';
        clearLink.hidden = true;
      }

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
        : `<tr><td colspan="5">${filter ? 'No cases match this filter right now.' : 'No active breakdown cases right now.'}</td></tr>`;
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
