document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  function decodeToken(value) {
    try {
      var raw = String(value || '').split('.')[1] || '';
      raw = raw.replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return {}; }
  }

  var techToken = localStorage.getItem('belm_tech_token') || '';
  var customerToken = localStorage.getItem('belm_customer_token') || '';
  var techPayload = decodeToken(techToken);
  var customerPayload = decodeToken(customerToken);
  var techIsTechnician = String(techPayload.roleName || techPayload.role || '').toLowerCase() === 'technician';
  var customerIsTechnician = String(customerPayload.customerRole || customerPayload.roleName || customerPayload.role || '').toLowerCase() === 'technician';
  var token = techIsTechnician ? techToken : (customerIsTechnician ? customerToken : '');
  var payload = techIsTechnician ? techPayload : customerPayload;
  if (!token) { location.replace('/login'); return; }

  var shell = document.getElementById('belmShell');
  var jobs = [];
  var companyName = 'Customer';
  var actorName = String(payload.actorName || payload.name || 'Technician').trim() || 'Technician';

  try {
    if (techIsTechnician) {
      var stored = JSON.parse(localStorage.getItem('belm_tech_user') || 'null');
      if (stored && stored.name) actorName = stored.name;
      if (stored && stored.assignedCustomerName) companyName = stored.assignedCustomerName;
    }
  } catch (_) {}

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c];
    });
  }

  function human(value) {
    return String(value || '').replace(/[_-]+/g, ' ').trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function fmt(value) {
    if (!value) return '—';
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  async function api(url, options) {
    options = options || {};
    var response = await fetch(url, {
      method: options.method || 'GET',
      cache: 'no-store',
      body: options.body,
      headers: Object.assign({ Authorization:'Bearer ' + token }, options.body ? { 'Content-Type':'application/json' } : {}, options.headers || {})
    });
    var text = await response.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) {
        if (techIsTechnician) localStorage.removeItem('belm_tech_token');
        else localStorage.removeItem('belm_customer_token');
        location.replace('/login');
      }
      throw new Error(data && data.error ? data.error : 'Request failed (' + response.status + ').');
    }
    return data;
  }

  function customerApi(path) { return api('/api/customer-portal' + path); }
  function jobsApi(path) { return api('/api/breakdown-workflow' + path); }

  function updateClock() {
    var now = new Date();
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function setIdentity() {
    document.querySelectorAll('[data-actor-name]').forEach(function (el) { el.textContent = actorName.toUpperCase(); });
    document.querySelectorAll('[data-company-name]').forEach(function (el) { el.textContent = companyName; });
    document.querySelectorAll('[data-company-name-upper]').forEach(function (el) { el.textContent = companyName.toUpperCase(); });
  }

  function statusInfo(job) {
    var status = String(job.status || '').toUpperCase();
    var stage = String(job.current_stage || job.currentStage || '').toUpperCase();
    var openSpare = Number(job.openSpareRequests || job.open_spare_requests || 0);
    if (status === 'COMPLETED' || stage === 'COMPLETED') return { label:'Completed', cls:'belm-pill--completed', kind:'completed' };
    if (status === 'CANCELLED') return { label:'Cancelled', cls:'belm-pill--waiting', kind:'cancelled' };
    if (status === 'TESTING' || stage === 'TESTING' || stage === 'READY_FOR_TESTING') return { label:'Testing', cls:'belm-pill--testing', kind:'testing' };
    if (status === 'WAITING_FOR_PARTS' || openSpare > 0 || ['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS'].includes(stage)) return { label:'Waiting for Spares', cls:'belm-pill--waiting', kind:'waiting' };
    if (status === 'PENDING_APPROVAL' || stage === 'PENDING_APPROVAL') return { label:'Pending Approval', cls:'belm-pill--testing', kind:'approval' };
    if (job.diagnosis || job.started_at || ['RECEIVED','IN_PROGRESS','PROGRESS','REPAIR'].includes(status)) return { label:'Diagnosis / Repair', cls:'belm-pill--diagnosis', kind:'progress' };
    return { label:'Assigned', cls:'belm-pill--diagnosis', kind:'assigned' };
  }

  function machineLabel(job) {
    if (job.machineLabel) return job.machineLabel;
    if (job.machine && typeof job.machine === 'object') return [job.machine.brand, job.machine.model, job.machine.machineType].filter(Boolean).join(' ') || 'Machine';
    return [job.machine_brand, job.machine_model, job.machine_type].filter(Boolean).join(' ') || job.title || 'Machine';
  }

  function machineId(job) {
    return job.machine_id || job.machineId || (job.machine && job.machine.id) || '';
  }

  function jobNumber(job) {
    return job.job_card_no || job.jobCardNo || job.proformaCode || ('JC-' + String(job.id || '').slice(0, 8).toUpperCase());
  }

  function jobLink(job) {
    var id = machineId(job);
    return '/technician-job-cards/' + (id ? '?machine=' + encodeURIComponent(id) : '');
  }

  function renderStats() {
    var active = jobs.filter(function (job) { return !['completed','cancelled'].includes(statusInfo(job).kind); });
    var assigned = active.filter(function (job) { return statusInfo(job).kind === 'assigned'; }).length;
    var progress = active.filter(function (job) { return statusInfo(job).kind === 'progress'; }).length;
    var waiting = active.filter(function (job) { return statusInfo(job).kind === 'waiting'; }).length;
    var testing = active.filter(function (job) { return ['testing','approval'].includes(statusInfo(job).kind); }).length;
    document.getElementById('statAssigned').textContent = assigned;
    document.getElementById('statProgress').textContent = progress;
    document.getElementById('statWaiting').textContent = waiting;
    document.getElementById('statTesting').textContent = testing;
  }

  function renderJobs() {
    var body = document.getElementById('jobsBody');
    var active = jobs.filter(function (job) { return !['completed','cancelled'].includes(statusInfo(job).kind); });
    body.innerHTML = active.length ? active.slice(0, 8).map(function (job) {
      var info = statusInfo(job);
      var link = jobLink(job);
      var nextLabel = info.kind === 'waiting' ? 'Review Spare' : (info.kind === 'testing' || info.kind === 'approval' ? 'Open Testing' : 'Update Diagnosis');
      var nextClass = info.kind === 'waiting' ? 'belm-btn-sm--outline-gold' : (info.kind === 'testing' || info.kind === 'approval' ? 'belm-btn-sm--outline-green' : 'belm-btn-sm--outline-blue');
      return '<tr>' +
        '<td><div class="belm-machine-cell"><span class="belm-machine-cell__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l3-7h5l2 4h6l2 3"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg></span><span class="belm-machine-cell__name">' + esc(machineLabel(job)) + '</span></div></td>' +
        '<td>' + esc(job.customer_name || job.customerName || companyName) + '</td>' +
        '<td>' + esc(jobNumber(job)) + '</td>' +
        '<td><span class="belm-pill ' + info.cls + '">' + esc(info.label) + '</span></td>' +
        '<td><div class="belm-action-cell"><a href="' + esc(link) + '" class="belm-btn-sm belm-btn-sm--solid-green">Open Job</a><a href="' + esc(link) + '" class="belm-btn-sm ' + nextClass + '">' + esc(nextLabel) + '</a></div></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;padding:28px">No active Job Cards assigned to ' + esc(actorName) + '.</td></tr>';
  }

  function renderCommunications(data) {
    var list = document.getElementById('communicationList');
    var messages = Array.isArray(data && data.messages) ? data.messages : [];
    messages.sort(function (a, b) { return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0); });
    var unread = messages.filter(function (m) { return !m.isSent && !m.isRead; }).length;
    var dot = document.getElementById('notificationDot');
    if (dot) dot.style.display = unread ? '' : 'none';
    list.innerHTML = messages.length ? messages.slice(0, 5).map(function (m) {
      var priority = String(m.priority || '').toUpperCase();
      var iconClass = priority === 'URGENT' ? 'belm-comm-row__icon--gold' : (m.isSent ? 'belm-comm-row__icon--blue' : 'belm-comm-row__icon--green');
      var label = m.isSent ? (m.recipientLabel || 'Sent message') : (m.senderName || m.customerName || 'Workshop Team');
      return '<div class="belm-comm-row"><span class="belm-comm-row__icon ' + iconClass + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 4h16v12H8l-4 4V4z"/></svg></span><div class="belm-comm-row__body"><div class="belm-comm-row__top"><span class="belm-comm-row__name">' + esc(label) + '</span><span class="belm-comm-row__time">' + esc(fmt(m.createdAt || m.created_at)) + '</span></div><div class="belm-comm-row__msg">' + esc(m.message || m.subject || 'Operational message') + '</div></div></div>';
    }).join('') : '<div class="belm-comm-row"><div class="belm-comm-row__body"><div class="belm-comm-row__msg">No communication history yet.</div></div></div>';
  }

  async function load() {
    var jobsBody = document.getElementById('jobsBody');
    if (jobsBody) jobsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px">Loading assigned Job Cards…</td></tr>';
    try {
      var result = await Promise.allSettled([
        customerApi('/dashboard'),
        jobsApi('/technician-jobs'),
        api('/api/role-communications')
      ]);
      if (result[0].status === 'fulfilled') {
        var dash = result[0].value || {};
        if (dash.customer && dash.customer.name) companyName = dash.customer.name;
      }
      if (result[1].status === 'fulfilled') jobs = Array.isArray(result[1].value) ? result[1].value : [];
      else jobs = [];
      setIdentity();
      renderStats();
      renderJobs();
      renderCommunications(result[2].status === 'fulfilled' ? result[2].value : { messages:[] });
    } catch (error) {
      if (jobsBody) jobsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px">' + esc(error.message) + '</td></tr>';
    }
  }

  document.getElementById('sidebarToggle')?.addEventListener('click', function () { shell && shell.classList.toggle('is-sidebar-open'); });

  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    if (localStorage.getItem('belm-theme') === 'light') document.body.classList.add('belm-light');
    function themeLabel() {
      var text = document.getElementById('themeLabel');
      if (text) text.textContent = document.body.classList.contains('belm-light') ? 'Dark mode' : 'Light mode';
    }
    themeLabel();
    themeToggle.addEventListener('click', function () {
      var light = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', light ? 'light' : 'dark');
      themeLabel();
    });
  }

  document.getElementById('logout')?.addEventListener('click', function (event) {
    event.preventDefault();
    ['belm_customer_token','belm_tech_token','belm_tech_user','belm_active_account_type'].forEach(function (key) { localStorage.removeItem(key); });
    location.replace('/login');
  });

  updateClock();
  setIdentity();
  setInterval(updateClock, 30000);
  window.addEventListener('pageshow', function () { load(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  setInterval(function () { if (!document.hidden) load(); }, 45000);
  load();
});