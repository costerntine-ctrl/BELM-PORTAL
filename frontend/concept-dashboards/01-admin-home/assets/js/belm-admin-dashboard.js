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
