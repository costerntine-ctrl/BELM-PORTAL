(function () {
  'use strict';
  const token = localStorage.getItem('belm_operator_token') || '';
  if (!token) { location.replace('/operator/'); return; }

  async function api(action, opt = {}) {
    const res = await fetch(`/api/operator?action=${encodeURIComponent(action)}`, {
      ...opt,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opt.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('belm_operator_token'); location.replace('/operator/'); }
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hoursSince(iso) {
    if (!iso) return null;
    const start = new Date(iso).getTime();
    if (isNaN(start)) return null;
    return (Date.now() - start) / 3600000;
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  async function load() {
    try {
      const [dash, me] = await Promise.all([api('dashboard'), api('me')]);

      document.querySelectorAll('[data-operator-name]').forEach((el) => { el.textContent = (dash.operator?.name || 'Operator').toUpperCase(); });
      document.querySelectorAll('[data-customer-name-upper]').forEach((el) => { el.textContent = (dash.customerName || 'Company').toUpperCase(); });
      const m = dash.machine || {};
      document.getElementById('machineLabel').textContent = `${m.brand || ''} ${m.model || ''}`.trim() || m.fleetNumber || 'Your Machine';
      document.getElementById('statStatus').textContent = m.status || 'UNKNOWN';

      const shift = me.openShift;
      if (shift) {
        const hrs = hoursSince(shift.signedInAt);
        document.getElementById('statHours').textContent = hrs != null ? hrs.toFixed(1) + ' h' : '—';
        document.getElementById('statContainers').textContent = shift.containerCount ?? 0;
      } else {
        document.getElementById('statHours').textContent = 'Not signed in';
        document.getElementById('statContainers').textContent = '—';
      }

      document.getElementById('statChecklist').textContent = m.latestChecklist?.overallStatus || 'Not yet done';

      const alerts = Array.isArray(m.alertReasons) ? m.alertReasons : [];
      const alertList = document.getElementById('alertList');
      alertList.innerHTML = alerts.length
        ? alerts.map((a) => `
            <div class="belm-alert-row" style="cursor:default">
              <span class="belm-alert-row__icon belm-alert-row__icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>
              <span class="belm-alert-row__label">${esc(a)}</span>
            </div>`).join('')
        : '<div class="belm-alert-row"><span class="belm-alert-row__label">No alerts on your machine right now.</span></div>';

      const msg = m.latestOperatorMessage;
      const messageList = document.getElementById('messageList');
      messageList.innerHTML = msg
        ? `<div class="belm-alert-row" style="cursor:default">
             <span class="belm-alert-row__label">${esc(msg.message)}</span>
             <span class="belm-alert-row__count" style="font-size:11px">${esc(fmtDateTime(msg.createdAt))}</span>
           </div>`
        : '<div class="belm-alert-row"><span class="belm-alert-row__label">No messages logged yet.</span></div>';
    } catch (e) {
      document.getElementById('alertList').innerHTML = `<div class="belm-alert-row"><span class="belm-alert-row__label">Could not load: ${esc(e.message)}</span></div>`;
    }
  }

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('belmShell')?.classList.toggle('is-sidebar-open');
  });
  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('belm_operator_token');
  });

  load();
})();
