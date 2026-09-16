(function () {
  'use strict';
  const token = localStorage.getItem('belm_customer_token') || '';
  if (!token) { location.replace('/login'); return; }

  function decodeToken(value) {
    try {
      var raw = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return {}; }
  }

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
    if (s === 'COMPLETED') return 'belm-pill--completed';
    return 'belm-pill--approved';
  }

  async function load() {
    const session = decodeToken(token);
    const actorName = session.actorName || session.name || 'Technician';
    document.querySelectorAll('[data-actor-name]').forEach((el) => { el.textContent = actorName.toUpperCase(); });
    document.querySelectorAll('[data-actor-greeting]').forEach((el) => { el.textContent = `Welcome, ${actorName}`; });

    try {
      const [dash, jobs] = await Promise.all([api('/dashboard'), api('/service-requests?mine=1')]);
      const companyName = dash?.customer?.name || 'Customer';
      document.querySelectorAll('[data-company-name]').forEach((el) => { el.textContent = companyName; });

      const list = Array.isArray(jobs) ? jobs : [];
      const now = new Date();
      const assigned = list.filter((j) => ['OPEN', 'ASSIGNED'].includes(String(j.status).toUpperCase()));
      const inProgress = list.filter((j) => String(j.status).toUpperCase() === 'IN_PROGRESS');
      const completedThisMonth = list.filter((j) => {
        if (String(j.status).toUpperCase() !== 'COMPLETED' || !j.completedAt) return false;
        const d = new Date(j.completedAt);
        return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });

      document.getElementById('statAssigned').textContent = assigned.length;
      document.getElementById('statProgress').textContent = inProgress.length;
      document.getElementById('statCompleted').textContent = completedThisMonth.length;

      const active = list.filter((j) => !['COMPLETED', 'CANCELLED'].includes(String(j.status).toUpperCase()));
      const body = document.getElementById('jobsBody');
      body.innerHTML = active.length
        ? active.slice(0, 15).map((j) => `
            <tr>
              <td>${esc(j.machine ? `${j.machine.model || ''}`.trim() || j.machine.machineType || '—' : '—')}</td>
              <td>${esc(j.serviceType || j.description || 'Job Card')}</td>
              <td><span class="belm-pill ${pillClass(j.status)}">${esc(String(j.status || '').replace(/_/g, ' '))}</span></td>
              <td>${esc(fmtDate(j.updatedAt))}</td>
            </tr>`).join('')
        : '<tr><td colspan="4">You have no active job cards right now.</td></tr>';
    } catch (e) {
      document.getElementById('jobsBody').innerHTML = `<tr><td colspan="4">Could not load job cards: ${esc(e.message)}</td></tr>`;
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
