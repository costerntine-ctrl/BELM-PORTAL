document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var searchInput = document.querySelector('.belm-search input');
  var token = localStorage.getItem('belm_admin_token') || '';
  var customers = [];

  if (sidebarToggle) sidebarToggle.addEventListener('click', function () { shell.classList.toggle('is-sidebar-open'); });
  if (themeToggle) {
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

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
  }
  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    var response = await fetch(path, Object.assign({}, options, {cache:'no-store', headers:headers}));
    var text = await response.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error((data && data.error) || 'Request failed.');
    return data;
  }
  function stat(label, value) {
    document.querySelectorAll('.belm-stat-card').forEach(function (card) {
      var l = card.querySelector('.belm-stat-card__label');
      var v = card.querySelector('.belm-stat-card__value');
      if (l && v && l.textContent.trim() === label) v.textContent = String(value);
    });
  }
  function statusHtml(active) {
    return '<span class="belm-status-dot ' + (active ? 'belm-status-dot--active' : 'belm-status-dot--pending') + '">' + (active ? 'Active' : 'Pending') + '</span>';
  }
  function providerLabel(c) {
    return c && c.belmServiceProviderActive ? 'BELM Managed' : 'Self Managed';
  }
  function limitLabel(c) {
    var used = Number(c && c.portalUserCount || 0);
    var limit = c && c.userLimit != null ? Number(c.userLimit) : 3;
    return used + ' / ' + (limit >= 9999 ? 'Unlimited' : (limit > 0 ? limit : 3));
  }
  function actionButtons() {
    return '<div class="belm-action-group">' +
      '<a href="#" class="belm-btn-xs belm-btn-xs--view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>View</a>' +
      '<a href="#" class="belm-btn-xs belm-btn-xs--edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>Edit</a>' +
      '<a href="#" class="belm-btn-xs belm-btn-xs--reset"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.5 9A7 7 0 0119 8.5M18.5 15A7 7 0 015 15.5"/></svg>Reset Access</a>' +
      '<a href="#" class="belm-btn-xs belm-btn-xs--manage"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9M4.6 9a1.7 1.7 0 00-.3-1.9"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>Manage</a>' +
      '</div>';
  }
  function renderRows(list) {
    var tbody = document.querySelector('.belm-table tbody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px">No registered customers yet.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (c) {
      var machines = Array.isArray(c.machines) ? c.machines.length : Number(c.machineCount || 0);
      return '<tr data-customer-id="' + esc(c.id) + '">' +
        '<td>' + esc(c.name || 'Customer') + '</td>' +
        '<td>' + esc(c.address || '—') + '</td>' +
        '<td>' + statusHtml(c.is_active !== 0 && c.isActive !== false) + '</td>' +
        '<td>' + esc(limitLabel(c)) + '</td>' +
        '<td>' + esc(providerLabel(c)) + '</td>' +
        '<td>' + esc(machines) + '</td>' +
        '<td>' + actionButtons() + '</td>' +
      '</tr>';
    }).join('');
  }
  async function loadDashboard() {
    if (!token) return;
    try {
      var results = await Promise.allSettled([
        api('/api/customers'),
        api('/api/applications?status=PENDING'),
        api('/api/contracts?action=summary')
      ]);
      customers = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
      var pendingData = results[1].status === 'fulfilled' ? results[1].value : null;
      var pending = Array.isArray(pendingData) ? pendingData.length : (pendingData && Array.isArray(pendingData.applications) ? pendingData.applications.length : 0);
      var contracts = results[2].status === 'fulfilled' ? Number(results[2].value.activeContracts || results[2].value.active_contracts || 0) : 0;
      var machines = customers.reduce(function (n, c) { return n + (Array.isArray(c.machines) ? c.machines.length : 0); }, 0);
      stat('Active Customers', customers.filter(function (c) { return c.is_active !== 0 && c.isActive !== false; }).length);
      stat('Pending Approval', pending);
      stat('Active Contracts', contracts);
      stat('Registered Machines', machines);
      renderRows(customers);
      if (searchInput) searchInput.dispatchEvent(new Event('input'));
    } catch (error) {
      console.error('Registration dashboard load failed:', error);
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('.belm-table tbody tr').forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().indexOf(q) === -1 ? 'none' : '';
      });
    });
  }

  var form = document.getElementById('registerForm');
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!token) { alert('Login as BELM Workshop Manager before registering a customer.'); return; }
      var companyName = document.getElementById('companyName').value.trim();
      var locationValue = document.getElementById('location').value.trim();
      var email = document.getElementById('email').value.trim();
      var phone = document.getElementById('phone').value.trim();
      if (!companyName || !locationValue || !email || !phone) {
        alert('Company Name, Location, Email and Phone are required.');
        return;
      }
      var serviceProvider = document.getElementById('serviceProvider').value;
      var registrationMode = /self/i.test(serviceProvider) ? 'PORTAL_CWM' : 'TECHNICAL_DEP';
      var userLimitText = document.getElementById('userLimit').value || '3 Users';
      var userLimit = /unlimited/i.test(userLimitText) ? 9999 : (parseInt(userLimitText, 10) || 3);
      var contractStart = document.getElementById('contractStart').value || '';
      var contractEnd = document.getElementById('contractEnd').value || '';
      if ((contractStart && !contractEnd) || (!contractStart && contractEnd)) {
        alert('Enter both Contract Start and Contract End, or leave both empty.');
        return;
      }
      var submit = form.querySelector('button[type="submit"]');
      var oldText = submit.textContent;
      submit.disabled = true;
      submit.lastChild.textContent = ' Saving...';
      try {
        var result = await api('/api/customers', {
          method:'POST',
          body:JSON.stringify({
            name:companyName,
            address:locationValue,
            tinNumber:document.getElementById('tin').value.trim(),
            vrn:document.getElementById('vrn').value.trim(),
            email:email,
            phone:phone,
            registrationMode:registrationMode,
            userLimit:userLimit
          })
        });
        var contractNote = '';
        if (contractStart && contractEnd && result && result.id) {
          var contractNumber = 'BELM-' + new Date().getFullYear() + '-' + String(result.id).replace(/-/g, '').slice(0, 8).toUpperCase();
          try {
            await api('/api/contracts', {
              method:'POST',
              body:JSON.stringify({
                customerId:result.id,
                contractNumber:contractNumber,
                title:'Service & Maintenance Contract',
                startDate:contractStart,
                endDate:contractEnd,
                slaResponseHours:24,
                preventiveMaintenanceIncluded:true,
                labourIncluded:true,
                partsIncluded:false
              })
            });
            contractNote = '\nContract: ' + contractNumber + ' (' + contractStart + ' to ' + contractEnd + ')';
          } catch (contractError) {
            contractNote = '\nIMPORTANT: Customer was created, but contract creation needs attention: ' + (contractError.message || 'contract could not be saved');
          }
        }
        var info = result.portalLoginInfo || {};
        var modeLabel = registrationMode === 'PORTAL_CWM' ? 'Customer Workshop Portal' : 'BELM Managed';
        var message = 'CUSTOMER REGISTERED SUCCESSFULLY\n\n' +
          'Company: ' + companyName + '\n' +
          'Service Mode: ' + modeLabel + '\n' +
          'Portal ID: ' + (info.portalId || '—') + '\n' +
          'Temporary Password: ' + (info.temporaryPassword || '—') + '\n' +
          'Recovery Code: ' + (info.recoveryCode || '—') + '\n' +
          'Portal URL: ' + (info.portalUrl || info.portalLink || '—') + contractNote;
        try { await navigator.clipboard.writeText(message); } catch (_) {}
        alert(message + '\n\nCredentials were also copied where browser permission allows.');
        form.reset();
        await loadDashboard();
      } catch (error) {
        alert(error.message || 'Could not register customer.');
      } finally {
        submit.disabled = false;
        submit.lastChild.textContent = oldText.replace(/^\s*/, ' ');
      }
    });
  }

  loadDashboard();
});
