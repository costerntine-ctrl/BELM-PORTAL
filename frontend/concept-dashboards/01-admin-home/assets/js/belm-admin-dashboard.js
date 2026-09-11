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

  bindAlertRoutes();
  // dashboard-live-v710 also refreshes the page figures. Run this shortly
  // afterwards and then on the same cadence so placeholder values can never
  // replace the authoritative alert counts.
  setTimeout(syncMachineStockAlerts, 700);
  setInterval(syncMachineStockAlerts, 60000);
});
