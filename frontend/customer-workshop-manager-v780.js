(function () {
  'use strict';

  const customerToken = localStorage.getItem('belm_customer_token') || '';
  const techToken = localStorage.getItem('belm_tech_token') || '';
  const activeType = String(localStorage.getItem('belm_active_account_type') || '').toLowerCase();
  const token = activeType === 'technician' ? (techToken || customerToken) : (customerToken || techToken);
  if (!token) { location.replace('/login'); return; }

  function decodeToken(value) {
    try {
      let raw = (value.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return {}; }
  }

  const session = decodeToken(token);

  async function api(path) {
    const response = await fetch('/api/customer-portal' + path, {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) {
        ['belm_customer_token', 'belm_tech_token', 'belm_active_account_type'].forEach(function (key) { localStorage.removeItem(key); });
        location.replace('/login');
      }
      throw new Error((data && data.error) || ('Request failed (' + response.status + ')'));
    }
    return data;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(value) {
    return String(value || 'WM').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join('') || 'WM';
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function actorName() {
    return String(session.actorName || session.name || 'Workshop Manager').trim() || 'Workshop Manager';
  }

  function statusClass(status) {
    const s = String(status || 'OPEN').toUpperCase();
    if (s === 'IN_PROGRESS' || s === 'PROGRESS' || s === 'REPAIR') return 'progress';
    if (s.includes('WAIT') || s.includes('SPARE') || s === 'PROCUREMENT') return 'waiting';
    if (s === 'TESTING') return 'testing';
    if (s === 'COMPLETED' || s === 'CLOSED') return 'completed';
    if (s === 'OVERDUE') return 'overdue';
    return 'open';
  }

  function statusLabel(status) {
    const s = String(status || 'OPEN').toUpperCase();
    if (s === 'IN_PROGRESS' || s === 'PROGRESS' || s === 'REPAIR') return 'In Progress';
    if (s.includes('WAIT') || s.includes('SPARE') || s === 'PROCUREMENT') return 'Waiting Spare';
    if (s === 'TESTING') return 'Testing';
    if (s === 'COMPLETED' || s === 'CLOSED') return 'Completed';
    if (s === 'CANCELLED') return 'Cancelled';
    return String(status || 'Open').replace(/_/g, ' ');
  }

  function setStat(label, value) {
    document.querySelectorAll('.wm-stat-card').forEach(function (card) {
      const l = card.querySelector('.wm-stat-label');
      const v = card.querySelector('.wm-stat-value');
      if (l && v && l.textContent.trim().toLowerCase() === label.toLowerCase()) v.textContent = String(value == null ? 0 : value);
    });
  }

  function updateIdentity(dashboard) {
    const companyName = (dashboard && dashboard.customer && dashboard.customer.name) || session.name || 'Customer';
    document.querySelectorAll('[data-company-name-upper]').forEach(function (el) { el.textContent = String(companyName).toUpperCase(); });
    const name = actorName();
    document.querySelectorAll('[data-actor-name]').forEach(function (el) { el.textContent = name; });
    document.querySelectorAll('[data-actor-first-name]').forEach(function (el) { el.textContent = name.split(/\s+/)[0] || 'Workshop Manager'; });
    const avatar = document.querySelector('.user-chip .user-avatar');
    if (avatar) avatar.textContent = initials(name);
  }

  function updateClock() {
    const now = new Date();
    const date = document.getElementById('liveDate');
    const time = document.getElementById('liveTime');
    if (date) date.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (time) time.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function updateStatus(stats) {
    const attention = Number(stats && stats.overdue || 0) + Number(stats && stats.waitingForSpare || 0);
    const box = document.querySelector('.status-box');
    if (box) {
      const strong = box.querySelector('strong');
      const spans = box.querySelectorAll('span');
      if (strong) strong.textContent = attention ? 'Workshop Attention' : 'Workshop Running';
      if (spans.length) spans[spans.length - 1].textContent = attention ? (attention + ' item' + (attention === 1 ? '' : 's') + ' need attention') : 'Live customer workflow synchronized';
    }
    const badge = document.querySelector('.header-right .icon-btn[aria-label="Notifications"] .icon-badge');
    if (badge) badge.textContent = String(attention);
  }

  function renderDonut(stats, requests) {
    const open = Number(stats && stats.openJobCards || 0);
    const progress = Number(stats && stats.inProgress || 0);
    const waiting = Number(stats && stats.waitingForSpare || 0);
    const completed = Number(stats && stats.completedThisMonth || 0);
    const overdue = Number(stats && stats.overdue || 0);
    const testing = (requests || []).filter(function (r) { return String(r.status || '').toUpperCase() === 'TESTING'; }).length;
    const values = [open, progress, waiting, testing, completed, overdue];
    const labels = document.querySelectorAll('.wm-donut-legend-row');
    const total = Math.max(0, open + completed);
    labels.forEach(function (row, i) {
      const strong = row.querySelector('strong');
      if (!strong) return;
      if (i < 4) strong.textContent = values[i] + ' (' + (open ? Math.round(values[i] / Math.max(1, open) * 100) : 0) + '%)';
      else strong.textContent = String(values[i]);
    });
    const totalText = document.querySelector('.wm-donut-wrap svg text');
    if (totalText) totalText.textContent = String(total);
  }

  function machineLabel(request) {
    const m = request && request.machine;
    if (!m) return 'General Workshop';
    return String(m.model || m.machineType || 'Machine');
  }

  function renderRecentJobs(requests, companyName) {
    const tbody = document.querySelector('.wm-bottom-grid1 .data-table tbody');
    if (!tbody) return;
    const active = (Array.isArray(requests) ? requests : []).filter(function (r) {
      return !['COMPLETED', 'CANCELLED'].includes(String(r.status || '').toUpperCase());
    });
    const rows = (active.length ? active : requests || []).slice(0, 8);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9">No Job Cards found for this company.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      const id = String(r.id || '');
      const jobNo = r.jobCardNo || r.job_card_no || ('JC-' + (id ? id.slice(0, 8).toUpperCase() : String(i + 1).padStart(4, '0')));
      const assigned = r.assignedTo && r.assignedTo.name ? r.assignedTo.name : 'Unassigned';
      const issue = r.description || r.serviceType || 'Job Card';
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><a href="/breakdown-workflow/?actor=customer" class="cell-link">' + esc(jobNo) + '</a></td>' +
        '<td>' + esc(machineLabel(r)) + '</td>' +
        '<td>' + esc(companyName || 'Company') + '</td>' +
        '<td>' + esc(issue) + '</td>' +
        '<td><span class="jc-pill jc-pill--' + statusClass(r.status) + '">' + esc(statusLabel(r.status)) + '</span></td>' +
        '<td>' + esc(assigned) + '</td>' +
        '<td>' + esc(fmtDate(r.updatedAt || r.createdAt)) + '</td>' +
        '<td class="row-action">···</td></tr>';
    }).join('');
  }

  function renderTechnicians(dashboardStats) {
    const holder = document.querySelector('.wm-bottom-grid2 .tech-row');
    if (!holder) return;
    const count = Number(dashboardStats && dashboardStats.activeTechnicians || 0);
    holder.innerHTML = '<div class="tech-chip"><span class="tech-avatar">' + count + '</span><span class="tech-name">Active Customer Technicians</span><span class="tech-status ' + (count ? 'on' : 'off') + '">' + (count ? 'Workshop team available' : 'No active technician account') + '</span></div>';
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderWorkload(requests) {
    const chart = document.querySelector('.wl-chart');
    const legend = document.querySelector('.chart-legend');
    if (!chart || !legend) return;
    const list = Array.isArray(requests) ? requests : [];
    const days = [];
    const now = startOfDay(new Date());
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      const assigned = list.filter(function (r) { const x = r.createdAt ? new Date(r.createdAt) : null; return x && !Number.isNaN(x.getTime()) && sameDay(x, d); }).length;
      const completed = list.filter(function (r) { const x = r.completedAt ? new Date(r.completedAt) : null; return x && !Number.isNaN(x.getTime()) && sameDay(x, d); }).length;
      days.push({ day: d.toLocaleDateString('en-GB', { weekday: 'short' }), assigned: assigned, completed: completed });
    }
    const max = Math.max(1, ...days.map(function (d) { return Math.max(d.assigned, d.completed); }));
    const h = function (v) { return Math.max(v ? 6 : 0, Math.round(v / max * 162)); };
    chart.innerHTML = '<div class="wl-yaxis"><span>' + max + '</span><span>' + Math.round(max * .8) + '</span><span>' + Math.round(max * .6) + '</span><span>' + Math.round(max * .4) + '</span><span>' + Math.round(max * .2) + '</span><span>0</span></div>' +
      days.map(function (d) {
        return '<div class="wl-group"><div class="wl-pair"><div class="wl-bar wl-bar--assigned" title="Jobs Assigned: ' + d.assigned + '" style="height:' + h(d.assigned) + 'px"></div><div class="wl-bar wl-bar--completed" title="Jobs Completed: ' + d.completed + '" style="height:' + h(d.completed) + 'px"></div></div><span class="wl-day-label">' + esc(d.day) + '</span></div>';
      }).join('');
    legend.innerHTML = '<span><i style="background:#2f6fd6"></i>Jobs Assigned</span><span><i style="background:#1ea45a"></i>Jobs Completed</span>';
  }

  function makePanelsClickable() {
    document.querySelectorAll('.tools-grid .tool-mini-card').forEach(function (card) {
      card.style.cursor = 'pointer';
      card.setAttribute('role', 'link');
      card.addEventListener('click', function () { location.href = '/customer-tools-register/'; });
    });
  }

  function configureTheme() {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    button.addEventListener('click', function () {
      if (window.BELMTheme && typeof window.BELMTheme.toggle === 'function') window.BELMTheme.toggle();
      else {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
      }
    });
  }

  async function load() {
    const results = await Promise.allSettled([
      api('/dashboard'),
      api('/workshop-manager-stats'),
      api('/service-requests'),
      api('/dashboard-stats'),
    ]);
    const dashboard = results[0].status === 'fulfilled' ? results[0].value : null;
    const stats = results[1].status === 'fulfilled' ? results[1].value : {};
    const requests = results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [];
    const dashboardStats = results[3].status === 'fulfilled' ? results[3].value : {};

    updateIdentity(dashboard);
    setStat('Open Job Cards', Number(stats.openJobCards || 0));
    setStat('In Progress', Number(stats.inProgress || 0));
    setStat('Waiting for Spare', Number(stats.waitingForSpare || 0));
    setStat('Completed (This Month)', Number(stats.completedThisMonth || 0));
    setStat('Overdue', Number(stats.overdue || 0));
    updateStatus(stats);
    renderDonut(stats, requests);
    renderRecentJobs(requests, dashboard && dashboard.customer && dashboard.customer.name);
    renderTechnicians(dashboardStats);
    renderWorkload(requests);
  }

  const logout = document.getElementById('logout');
  if (logout) logout.addEventListener('click', function (event) {
    event.preventDefault();
    ['belm_customer_token', 'belm_tech_token', 'belm_active_account_type', 'belm_session_refreshed_belm_customer_token'].forEach(function (key) { localStorage.removeItem(key); });
    location.replace('/login');
  });

  configureTheme();
  makePanelsClickable();
  updateClock();
  setInterval(updateClock, 30000);
  load().catch(function (error) { console.warn('Customer Workshop Manager live sync:', error); });
  setInterval(function () { if (!document.hidden) load().catch(function () {}); }, 60000);
})();