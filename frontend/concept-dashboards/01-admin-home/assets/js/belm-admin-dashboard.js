document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
  }

  if (themeToggle) {
    // Restore saved preference
    if (localStorage.getItem('belm-theme') === 'light') {
      document.body.classList.add('belm-light');
      themeToggle.lastChild.textContent = ' Dark mode';
    }

    themeToggle.addEventListener('click', function () {
      var isLight = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', isLight ? 'light' : 'dark');
      themeToggle.lastChild.textContent = isLight ? ' Dark mode' : ' Light mode';
    });
  }

  // Main Dashboard alert panel must be a read-only view of the live modules,
  // never a second place where alert numbers are entered manually.
  var adminToken = localStorage.getItem('belm_admin_token') || '';
  var alertRoutes = {
    'MACHINES DUE FOR SERVICE': '/concept-dashboards/11-workshop-manager/service-maintenance.html',
    'LOW STOCK ITEMS': '/spare-parts-manager/?view=low-stock&module=inventory',
    'FUEL REFILL DUE': '/belm-procurement/?view=records&module=procurement&filter=fuel',
    'EXPIRED DOCUMENTS': '/proforma-manager/?view=expired'
  };
  var sourceLabels = {
    'MACHINES DUE FOR SERVICE': 'Machines + Service Tracking',
    'LOW STOCK ITEMS': 'Spare Parts Inventory',
    'FUEL REFILL DUE': 'Operator Fuel + Procurement',
    'EXPIRED DOCUMENTS': 'Proforma Quote Validity'
  };

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function findAlertLabel(row) {
    var label = row.querySelector('.belm-alert-row__label');
    return normalize(label || row);
  }

  function bindAlertRoutes() {
    document.querySelectorAll('.belm-alert-row').forEach(function (row) {
      var label = findAlertLabel(row);
      var target = alertRoutes[label];
      if (!target) return;
      row.setAttribute('href', target);
      row.setAttribute('title', 'Live sync: ' + sourceLabels[label]);
      row.dataset.liveSource = sourceLabels[label];
    });
  }

  async function syncMachineStockAlerts() {
    if (!adminToken) return;
    try {
      var response = await fetch('/api/admin-dashboard-alerts?_sync=' + Date.now(), {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + adminToken }
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Alert sync failed.');

      var values = {
        'MACHINES DUE FOR SERVICE': Number(data.machinesDueForService || 0),
        'LOW STOCK ITEMS': Number(data.lowStockItems || 0),
        'FUEL REFILL DUE': Number(data.fuelRefillDue || 0),
        'EXPIRED DOCUMENTS': Number(data.expiredProformas || 0)
      };

      document.querySelectorAll('.belm-alert-row').forEach(function (row) {
        var label = findAlertLabel(row);
        if (!Object.prototype.hasOwnProperty.call(values, label)) return;
        var count = row.querySelector('.belm-alert-row__count');
        if (count) count.textContent = String(values[label]);
        row.setAttribute('data-live-synced', '1');
        row.setAttribute('title', 'Live sync: ' + sourceLabels[label]);
      });
      bindAlertRoutes();
    } catch (error) {
      console.warn('BELM Main Dashboard alert sync:', error);
    }
  }

  // The large lower-right promo card is now a live fleet-message display.
  // It rotates messages from ALL registered machines and inserts service
  // reminders/overdue notices generated from the same service tracking data.
  var promo = document.querySelector('.belm-promo');
  var promoTitle = promo ? promo.querySelector('.belm-promo__title') : null;
  var promoRule = promo ? promo.querySelector('.belm-promo__rule') : null;
  var promoStats = promo ? promo.querySelector('.belm-promo__stats') : null;
  var fleetMessages = [];
  var fleetIndex = 0;
  var fleetTimer = null;

  function installFleetMessageStyles() {
    if (document.getElementById('belmFleetMessageDarkStyles')) return;
    var style = document.createElement('style');
    style.id = 'belmFleetMessageDarkStyles';
    style.textContent = [
      '.belm-promo{cursor:pointer;min-height:320px!important;padding:26px!important;border:1px solid rgba(83,174,255,.30)!important;background:linear-gradient(150deg,#0d3155 0%,#08243f 48%,#041525 100%)!important;box-shadow:0 18px 44px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.05)!important;display:flex!important;flex-direction:column!important;justify-content:space-between!important;gap:20px!important}',
      '.belm-promo:hover{border-color:rgba(83,174,255,.58)!important;box-shadow:0 20px 48px rgba(0,0,0,.42),0 0 0 1px rgba(47,134,214,.12)!important}',
      '.belm-promo__title{max-width:none!important;width:100%!important;font-size:inherit!important;line-height:1.2!important;letter-spacing:0!important;color:#fff!important}',
      '.belm-fleet-message__kicker,.belm-fleet-message__machine,.belm-fleet-message__customer,.belm-fleet-message__body{display:block!important}',
      '.belm-fleet-message__kicker{width:max-content;max-width:100%;margin-bottom:12px;padding:6px 10px;border-radius:999px;background:rgba(245,197,24,.14);border:1px solid rgba(245,197,24,.38);color:#ffd84d!important;font-size:11px!important;font-weight:900!important;letter-spacing:1.5px!important;text-transform:uppercase}',
      '.belm-fleet-message__machine{color:#ffffff!important;font-size:27px!important;font-weight:900!important;line-height:1.08!important;letter-spacing:.1px!important;overflow-wrap:anywhere}',
      '.belm-fleet-message__customer{margin-top:10px;color:#8fd3ff!important;font-size:13px!important;font-weight:800!important;line-height:1.45!important;letter-spacing:.2px!important}',
      '.belm-fleet-message__body{margin-top:17px;padding:15px 16px;border-radius:12px;background:rgba(4,16,31,.58);border-left:4px solid #2f86d6;color:#eef7ff!important;font-size:16px!important;font-weight:650!important;line-height:1.55!important;overflow-wrap:anywhere}',
      '.belm-promo__rule{height:4px!important;margin-top:14px!important;background:#f5c518!important;box-shadow:0 0 16px rgba(245,197,24,.28)}',
      '.belm-promo__stats{width:100%!important;margin-top:auto!important;padding-top:18px!important;border-top:1px solid rgba(255,255,255,.10)!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}',
      '.belm-promo__stat{min-width:0;padding:10px 8px;border-radius:10px;background:rgba(255,255,255,.035);color:#a9c2d8!important}',
      '.belm-promo__stat strong{display:block;color:#ffffff!important;font-size:13px!important;font-weight:900!important;line-height:1.2!important;overflow-wrap:anywhere}',
      '.belm-promo__stat span{display:block;margin-top:4px;color:#91a8bd!important;font-size:9px!important;font-weight:800!important;letter-spacing:1.1px!important}',
      '.belm-promo.fleet-message-reminder{border-color:rgba(245,197,24,.52)!important;background:linear-gradient(150deg,#173653 0%,#10283d 48%,#071827 100%)!important}',
      '.belm-promo.fleet-message-reminder .belm-fleet-message__body{border-left-color:#f5c518;background:rgba(75,58,8,.22)}',
      '.belm-promo.fleet-message-due{border-color:rgba(255,180,44,.72)!important;box-shadow:0 18px 46px rgba(0,0,0,.42),0 0 24px rgba(240,185,11,.10)!important}',
      '.belm-promo.fleet-message-due .belm-fleet-message__kicker{background:rgba(240,185,11,.22);color:#ffe072!important}',
      '.belm-promo.fleet-message-due .belm-fleet-message__body{border-left-color:#f0b90b;color:#fff4c2!important}',
      '.belm-promo.fleet-message-overdue{border-color:rgba(239,94,76,.80)!important;background:linear-gradient(150deg,#3a1a24 0%,#241725 48%,#091624 100%)!important;box-shadow:0 18px 46px rgba(0,0,0,.44),0 0 28px rgba(224,80,58,.12)!important}',
      '.belm-promo.fleet-message-overdue .belm-fleet-message__kicker{background:rgba(224,80,58,.20);border-color:rgba(255,113,92,.48);color:#ff9d8e!important}',
      '.belm-promo.fleet-message-overdue .belm-fleet-message__body{border-left-color:#e0503a;background:rgba(91,28,31,.30);color:#fff0ed!important}',
      'body.belm-light .belm-promo{background:linear-gradient(145deg,#eaf5ff 0%,#dcecff 55%,#cfe3f8 100%)!important;border-color:#8ab9df!important;color:#0b2742!important;box-shadow:0 12px 28px rgba(36,78,118,.16)!important}',
      'body.belm-light .belm-fleet-message__machine,body.belm-light .belm-promo__stat strong{color:#09243e!important}',
      'body.belm-light .belm-fleet-message__customer{color:#135f95!important}',
      'body.belm-light .belm-fleet-message__body{background:rgba(255,255,255,.72);color:#16364f!important;border-left-color:#2f86d6}',
      'body.belm-light .belm-promo__stat{background:rgba(255,255,255,.50)}',
      'body.belm-light .belm-promo__stat span{color:#456782!important}',
      '@media(max-width:720px){.belm-promo{min-height:290px!important;padding:20px!important}.belm-fleet-message__machine{font-size:23px!important}.belm-fleet-message__body{font-size:14px!important}.belm-promo__stats{gap:6px!important}.belm-promo__stat{padding:8px 5px!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  installFleetMessageStyles();

  function fleetEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function shuffleMessages(messages) {
    var copy = messages.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    // Service reminders still get enough visibility: prepend one highest-priority
    // reminder when available, then keep the rest of the fleet randomized.
    var reminders = copy.filter(function (m) { return m.type === 'SERVICE_REMINDER'; })
      .sort(function (a, b) { return Number(b.priority || 0) - Number(a.priority || 0); });
    if (reminders.length) {
      var first = reminders[0];
      copy = copy.filter(function (m) { return m !== first; });
      copy.unshift(first);
    }
    return copy;
  }

  function renderFleetMessage(message) {
    if (!promo || !promoTitle || !message) return;
    promo.classList.remove('fleet-message-overdue','fleet-message-due','fleet-message-reminder');
    if (message.severity === 'OVERDUE') promo.classList.add('fleet-message-overdue');
    else if (message.severity === 'DUE') promo.classList.add('fleet-message-due');
    else if (message.type === 'SERVICE_REMINDER') promo.classList.add('fleet-message-reminder');

    var kicker = message.type === 'SERVICE_REMINDER' ? 'SERVICE REMINDER' : 'MACHINE UPDATE';
    promoTitle.innerHTML = '<span class="belm-fleet-message__kicker">' + fleetEscape(kicker) + '</span>' +
      '<span class="belm-fleet-message__machine">' + fleetEscape(message.title || message.machine || 'Machine') + '</span>' +
      '<span class="belm-fleet-message__customer">' + fleetEscape(message.customer || '') + ' · ' + fleetEscape(message.reference || '') + '</span>' +
      '<span class="belm-fleet-message__body">' + fleetEscape(message.message || '') + '</span>';

    if (promoRule) promoRule.style.width = message.type === 'SERVICE_REMINDER' ? '76px' : '40px';
    promo.setAttribute('role','link');
    promo.setAttribute('tabindex','0');
    promo.dataset.route = message.route || '/customers-manager/?view=all-machines';
    promo.title = 'Open this machine / service record';

    if (promoStats) {
      promoStats.innerHTML = '<div class="belm-promo__stat"><strong>' + (fleetIndex + 1) + '/' + fleetMessages.length + '</strong><span>MESSAGE</span></div>' +
        '<div class="belm-promo__stat"><strong>' + fleetEscape(message.type === 'SERVICE_REMINDER' ? (message.severity || 'REMINDER') : 'LIVE') + '</strong><span>STATUS</span></div>' +
        '<div class="belm-promo__stat"><strong>ALL FLEET</strong><span>SOURCE</span></div>';
    }
  }

  function showNextFleetMessage() {
    if (!fleetMessages.length) return;
    fleetIndex = (fleetIndex + 1) % fleetMessages.length;
    renderFleetMessage(fleetMessages[fleetIndex]);
  }

  async function syncFleetMessages() {
    if (!adminToken || !promo) return;
    try {
      var response = await fetch('/api/admin-machine-messages?_sync=' + Date.now(), {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + adminToken }
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Machine message sync failed.');
      var incoming = Array.isArray(data.messages) ? data.messages : [];
      if (!incoming.length) return;
      fleetMessages = shuffleMessages(incoming);
      fleetIndex = 0;
      renderFleetMessage(fleetMessages[0]);
      if (fleetTimer) clearInterval(fleetTimer);
      fleetTimer = setInterval(showNextFleetMessage, 9000);
    } catch (error) {
      console.warn('BELM Main Dashboard machine-message sync:', error);
    }
  }

  if (promo) {
    promo.addEventListener('click', function () {
      if (promo.dataset.route) window.location.href = promo.dataset.route;
    });
    promo.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' || event.key === ' ') && promo.dataset.route) {
        event.preventDefault();
        window.location.href = promo.dataset.route;
      }
    });
  }

  bindAlertRoutes();
  // dashboard-live-v710 also refreshes the page figures. Run this shortly
  // afterwards and then on the same cadence so placeholder values can never
  // replace the authoritative alert counts.
  setTimeout(syncMachineStockAlerts, 700);
  setInterval(syncMachineStockAlerts, 60000);

  setTimeout(syncFleetMessages, 900);
  setInterval(syncFleetMessages, 120000);
});
