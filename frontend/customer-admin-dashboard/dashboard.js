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

  function statusVal(m) {
    return String(m.status || m.machineStatus || m.machine_status || '').toUpperCase();
  }
  function isAttention(m) {
    const s = statusVal(m);
    return s.includes('RED') || s.includes('CRITICAL') || s.includes('YELLOW') || s.includes('ATTENTION') || s.includes('WARNING');
  }
  function isRed(m) {
    const s = statusVal(m);
    return s.includes('RED') || s.includes('CRITICAL');
  }

  function machineLabel(m) {
    return m.brand || m.model ? `${m.brand || ''} ${m.model || ''}`.trim() : (m.fleetNumber || m.regNumber || 'Machine');
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function pillClass(status) {
    const s = String(status || '').toUpperCase();
    if (s.includes('COMPLETE')) return 'belm-pill--completed';
    if (s.includes('APPROV')) return 'belm-pill--approved';
    return 'belm-pill--completed';
  }

  function renderFleetBars(machines) {
    const el = document.getElementById('fleetStatusBars');
    if (!machines.length) { el.innerHTML = '<div class="belm-alert-row"><span class="belm-alert-row__label">No machines registered yet.</span></div>'; return; }
    const counts = { GREEN: 0, YELLOW: 0, RED: 0, OTHER: 0 };
    machines.forEach((m) => {
      const s = statusVal(m);
      if (s.includes('RED') || s.includes('CRITICAL')) counts.RED++;
      else if (s.includes('YELLOW') || s.includes('WARNING') || s.includes('ATTENTION')) counts.YELLOW++;
      else if (s.includes('GREEN') || s.includes('NORMAL') || s.includes('OK')) counts.GREEN++;
      else counts.OTHER++;
    });
    const rows = [
      ['GREEN', 'Running Well', 'belm-alert-row__icon--green', counts.GREEN],
      ['YELLOW', 'Needs Checking Soon', 'belm-alert-row__icon--amber', counts.YELLOW],
      ['RED', 'Needs Attention Now', 'belm-alert-row__icon--red', counts.RED],
      ['OTHER', 'Not Yet Checked', 'belm-alert-row__icon--amber', counts.OTHER],
    ];
    el.innerHTML = rows.map(([, label, iconCls, count]) => `
      <div class="belm-alert-row" style="cursor:default">
        <span class="belm-alert-row__icon ${iconCls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="8"/></svg></span>
        <span class="belm-alert-row__label">${esc(label)}</span>
        <span class="belm-alert-row__count">${count}</span>
      </div>`).join('');
  }

  function renderAlerts(machines) {
    const el = document.getElementById('alertList');
    const attention = machines.filter(isAttention).sort((a, b) => (isRed(b) ? 1 : 0) - (isRed(a) ? 1 : 0)).slice(0, 6);
    if (!attention.length) {
      el.innerHTML = '<div class="belm-alert-row"><span class="belm-alert-row__label">No machines currently need attention.</span></div>';
      return;
    }
    el.innerHTML = attention.map((m) => `
      <a href="/portal/dashboard?view=machines&machine=${encodeURIComponent(m.id)}" class="belm-alert-row">
        <span class="belm-alert-row__icon ${isRed(m) ? 'belm-alert-row__icon--red' : 'belm-alert-row__icon--amber'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
        </span>
        <span class="belm-alert-row__label">${esc(machineLabel(m))}</span>
        <span class="belm-alert-row__count">${esc(statusVal(m) || 'CHECK')}</span>
        <svg class="belm-alert-row__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
      </a>`).join('');
  }

  function renderActivity(rows) {
    const body = document.getElementById('activityBody');
    if (!rows || !rows.length) {
      body.innerHTML = '<tr><td colspan="3">No recent activity yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(fmtDateTime(r.at))}</td>
        <td>${esc(r.label)}</td>
        <td><span class="belm-pill ${pillClass(r.status)}">${esc(r.status || '—')}</span></td>
      </tr>`).join('');
  }

  async function load() {
    try {
      const [dash, stats] = await Promise.all([
        api('/dashboard'),
        api('/dashboard-stats').catch(() => null),
      ]);
      const customer = dash?.customer || {};
      const machines = Array.isArray(dash?.machines) ? dash.machines : [];

      const companyName = customer.name || 'Customer';
      document.querySelectorAll('[data-company-name]').forEach((el) => { el.textContent = companyName; });
      document.querySelectorAll('[data-company-name-upper]').forEach((el) => { el.textContent = companyName.toUpperCase(); });

      document.getElementById('statMachines').textContent = machines.length;
      document.getElementById('statAttention').textContent = machines.filter(isAttention).length;

      if (stats) {
        document.getElementById('statJobCards').textContent = stats.openJobCards ?? '—';
        document.getElementById('statApprovals').textContent = stats.pendingApprovals ?? '—';
        renderActivity(stats.recentActivity);
      } else {
        document.getElementById('statJobCards').textContent = '—';
        document.getElementById('statApprovals').textContent = '—';
        renderActivity([]);
      }

      renderFleetBars(machines);
      renderAlerts(machines);

      // Same role-lock behaviour as the rest of the customer portal: hide
      // sidebar links the logged-in account isn't permitted to use.
      const role = customer.actorRole || '';
      const perms = customer.actorPermissions;
      if (Array.isArray(perms)) {
        document.querySelectorAll('[data-customer-role]').forEach((el) => {
          if (!perms.includes(el.getAttribute('data-customer-role'))) el.remove();
        });
      }
    } catch (e) {
      document.getElementById('activityBody').innerHTML = `<tr><td colspan="3">Could not load dashboard: ${esc(e.message)}</td></tr>`;
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
