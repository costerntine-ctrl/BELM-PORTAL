(function () {
  'use strict';

  const activeAccount = String(localStorage.getItem('belm_active_account_type') || '').toLowerCase();
  const operatorToken = localStorage.getItem('belm_operator_token') || '';
  const customerToken = localStorage.getItem('belm_customer_token') || '';
  const adminPreview = !!customerToken && activeAccount === 'customer';
  const token = adminPreview ? customerToken : operatorToken;

  if (!token) { location.replace('/login'); return; }

  async function operatorApi(action, opt = {}) {
    const res = await fetch(`/api/operator?action=${encodeURIComponent(action)}`, {
      ...opt,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operatorToken}`, ...(opt.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('belm_operator_token');
        if (localStorage.getItem('belm_active_account_type') === 'operator') localStorage.removeItem('belm_active_account_type');
        location.replace('/operator/');
      }
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function customerApi(path) {
    const res = await fetch('/api/customer-portal' + path, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem('belm_customer_token');
        if (localStorage.getItem('belm_active_account_type') === 'customer') localStorage.removeItem('belm_active_account_type');
        location.replace('/login');
      }
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

  function companyNameFromDashboard(dash) {
    return dash?.customer?.name || dash?.customerName || dash?.name || 'Customer';
  }

  function machineLabel(m) {
    return `${m?.brand || ''} ${m?.model || ''}`.trim() || m?.machineType || m?.machine_type || m?.fleetNumber || m?.fleet_number || 'Machine';
  }

  function latestChecklist(m) {
    return m?.latestChecklist || m?.latest_checklist || null;
  }

  function machineStatus(m) {
    return String(m?.status || m?.machineStatus || m?.machine_status || m?.operationalStatus || m?.operational_status || 'UNKNOWN').toUpperCase();
  }

  function machineAlerts(m) {
    const alerts = Array.isArray(m?.alertReasons) ? m.alertReasons : (Array.isArray(m?.alert_reasons) ? m.alert_reasons : []);
    if (alerts.length) return alerts;
    const status = machineStatus(m);
    if (/RED|CRITICAL/.test(status)) return ['Critical machine condition requires attention.'];
    if (/YELLOW|WARNING|ATTENTION/.test(status)) return ['Machine condition requires attention.'];
    return [];
  }

  function paintCommon(company, operatorName, m) {
    document.title = `${company} — MACHINE OPERATOR`;
    document.querySelectorAll('[data-operator-name]').forEach((el) => { el.textContent = String(operatorName || 'Operator').toUpperCase(); });
    document.querySelectorAll('[data-customer-name-upper]').forEach((el) => { el.textContent = String(company || 'Company').toUpperCase(); });
    document.getElementById('machineLabel').textContent = machineLabel(m);
    document.getElementById('statStatus').textContent = machineStatus(m);
    const check = latestChecklist(m);
    document.getElementById('statChecklist').textContent = check?.overallStatus || check?.overall_status || 'Not yet done';

    const alerts = machineAlerts(m);
    const alertList = document.getElementById('alertList');
    alertList.innerHTML = alerts.length
      ? alerts.map((a) => `
          <div class="belm-alert-row" style="cursor:default">
            <span class="belm-alert-row__icon belm-alert-row__icon--red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>
            <span class="belm-alert-row__label">${esc(a)}</span>
          </div>`).join('')
      : '<div class="belm-alert-row"><span class="belm-alert-row__label">No alerts on this machine right now.</span></div>';
  }

  async function loadAdminPreview() {
    const dash = await customerApi('/dashboard');
    const company = companyNameFromDashboard(dash);
    const machines = Array.isArray(dash?.machines) ? dash.machines : [];
    const requestedMachine = new URLSearchParams(location.search).get('machine') || '';
    const m = machines.find((row) => String(row?.id || '') === requestedMachine) || machines[0] || {};

    paintCommon(company, 'Admin Preview', m);
    document.getElementById('statHours').textContent = 'Admin view';
    document.getElementById('statContainers').textContent = '—';

    const msg = m?.latestOperatorMessage || m?.latest_operator_message || null;
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = msg
      ? `<div class="belm-alert-row" style="cursor:default"><span class="belm-alert-row__label">${esc(msg.message || '')}</span><span class="belm-alert-row__count" style="font-size:11px">${esc(fmtDateTime(msg.createdAt || msg.created_at))}</span></div>`
      : '<div class="belm-alert-row"><span class="belm-alert-row__label">Admin preview — no Operator PIN is required to view this dashboard. PIN is required only when an actual operator starts a machine shift.</span></div>';

    if (!machines.length) {
      document.getElementById('machineLabel').textContent = 'No registered machine';
      document.getElementById('statStatus').textContent = '—';
      document.getElementById('alertList').innerHTML = '<div class="belm-alert-row"><span class="belm-alert-row__label">Register a machine before opening an Operator work shift.</span></div>';
    }

    const logout = document.getElementById('logout');
    if (logout) {
      logout.href = '/customer-admin-dashboard/';
      const textNode = Array.from(logout.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Back to Admin';
    }
  }

  async function loadOperator() {
    const [dash, me] = await Promise.all([operatorApi('dashboard'), operatorApi('me')]);
    const m = dash.machine || {};
    paintCommon(dash.customerName || 'Company', dash.operator?.name || 'Operator', m);

    const shift = me.openShift;
    if (shift) {
      const hrs = hoursSince(shift.signedInAt);
      document.getElementById('statHours').textContent = hrs != null ? hrs.toFixed(1) + ' h' : '—';
      document.getElementById('statContainers').textContent = shift.containerCount ?? 0;
    } else {
      document.getElementById('statHours').textContent = 'Not signed in';
      document.getElementById('statContainers').textContent = '—';
    }

    const msg = m.latestOperatorMessage;
    const messageList = document.getElementById('messageList');
    messageList.innerHTML = msg
      ? `<div class="belm-alert-row" style="cursor:default"><span class="belm-alert-row__label">${esc(msg.message)}</span><span class="belm-alert-row__count" style="font-size:11px">${esc(fmtDateTime(msg.createdAt))}</span></div>`
      : '<div class="belm-alert-row"><span class="belm-alert-row__label">No messages logged yet.</span></div>';
  }

  async function load() {
    try {
      if (adminPreview) await loadAdminPreview();
      else await loadOperator();
    } catch (e) {
      document.getElementById('alertList').innerHTML = `<div class="belm-alert-row"><span class="belm-alert-row__label">Could not load: ${esc(e.message)}</span></div>`;
    }
  }

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('belmShell')?.classList.toggle('is-sidebar-open');
  });

  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (adminPreview) {
      location.replace('/customer-admin-dashboard/');
      return;
    }
    localStorage.removeItem('belm_operator_token');
    if (localStorage.getItem('belm_active_account_type') === 'operator') localStorage.removeItem('belm_active_account_type');
    location.replace('/operator/');
  });

  load();
})();