document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var token = localStorage.getItem('belm_customer_token') || '';
  if (!token) { location.replace('/login'); return; }

  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var searchInput = document.getElementById('inventorySearch');
  var messageBox = document.getElementById('storeMessage');
  var items = [];
  var movements = [];
  var pendingRequests = [];
  var toolIssues = [];
  var companyName = 'Customer';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c];
    });
  }

  function number(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function fmtDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function normal(value) {
    return String(value || '').replace(/[_-]+/g, ' ').trim();
  }

  function flash(message, error) {
    if (!messageBox) return;
    messageBox.textContent = message || '';
    messageBox.hidden = !message;
    messageBox.classList.toggle('is-error', Boolean(error));
    if (message) setTimeout(function () { messageBox.hidden = true; }, 6500);
  }

  async function api(path, options) {
    options = options || {};
    var response = await fetch('/api/customer-portal' + path, {
      method: options.method || 'GET',
      cache: 'no-store',
      body: options.body,
      headers: Object.assign({ Authorization: 'Bearer ' + token }, options.body ? { 'Content-Type':'application/json' } : {}, options.headers || {})
    });
    var text = await response.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('belm_customer_token');
        location.replace('/login');
      }
      throw new Error(data && data.error ? data.error : 'Request failed (' + response.status + ').');
    }
    return data;
  }

  function updateClock() {
    var now = new Date();
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }

  function setCompany(name) {
    companyName = name || 'Customer';
    document.querySelectorAll('[data-company-name]').forEach(function (el) { el.textContent = companyName; });
    document.querySelectorAll('[data-company-name-upper]').forEach(function (el) { el.textContent = companyName.toUpperCase(); });
  }

  function qtyOnHand(item) {
    return number(item.qty_on_hand != null ? item.qty_on_hand : item.qtyOnHand);
  }

  function reorderLevel(item) {
    var raw = item.reorder_level;
    if (raw == null) raw = item.reorderLevel;
    if (raw == null) raw = item.reorder_threshold;
    if (raw == null) raw = item.reorderThreshold;
    if (raw == null) raw = item.minimum_stock;
    if (raw == null) raw = item.minimumStock;
    return raw == null ? 2 : Math.max(0, number(raw));
  }

  function inventoryStatus(item) {
    var qty = qtyOnHand(item);
    var reorder = reorderLevel(item);
    if (qty <= 0) return { label:'Out of Stock', cls:'belm-badge--out', rank:0 };
    if (qty < reorder) return { label:'Low Stock', cls:'belm-badge--low', rank:1 };
    if (reorder > 0 && qty === reorder) return { label:'Reorder', cls:'belm-badge--reorder', rank:2 };
    return { label:'Available', cls:'belm-badge--available', rank:3 };
  }

  function statusIcon(status) {
    if (status.cls === 'belm-badge--available') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>';
    if (status.cls === 'belm-badge--out') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    if (status.cls === 'belm-badge--reorder') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.5 9A7 7 0 0119 8.5M18.5 15A7 7 0 015 15.5"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>';
  }

  function renderStats() {
    var low = items.filter(function (item) { return inventoryStatus(item).rank < 3; }).length;
    var toolsOut = toolIssues.filter(function (issue) { return !issue.returnedAt; }).length;
    document.getElementById('statItems').textContent = items.length.toLocaleString('en-TZ');
    document.getElementById('statLow').textContent = low.toLocaleString('en-TZ');
    document.getElementById('statRequests').textContent = pendingRequests.length.toLocaleString('en-TZ');
    document.getElementById('statTools').textContent = toolsOut.toLocaleString('en-TZ');
  }

  function renderInventory() {
    var body = document.getElementById('inventoryBody');
    if (!body) return;
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var rows = items.filter(function (item) {
      if (!q) return true;
      return [item.part_number, item.partNumber, item.description, item.category, item.unit, item.location, item.bin_location, item.binLocation]
        .some(function (value) { return String(value || '').toLowerCase().indexOf(q) >= 0; });
    }).sort(function (a, b) {
      var sa = inventoryStatus(a), sb = inventoryStatus(b);
      if (sa.rank !== sb.rank) return sa.rank - sb.rank;
      return String(a.description || a.part_number || '').localeCompare(String(b.description || b.part_number || ''));
    });

    body.innerHTML = rows.length ? rows.map(function (item) {
      var status = inventoryStatus(item);
      var qty = qtyOnHand(item);
      var partNo = item.part_number || item.partNumber || '—';
      var description = item.description || 'Spare Part';
      var category = item.category || item.unit || 'Store Item';
      var locationText = item.location || item.bin_location || item.binLocation || 'Customer Store';
      return '<tr>' +
        '<td><strong>' + esc(partNo) + '</strong></td>' +
        '<td>' + esc(description) + '</td>' +
        '<td>' + esc(normal(category)) + '</td>' +
        '<td>' + (qty <= 0 ? '<span class="belm-text-red">0</span>' : esc(qty)) + '</td>' +
        '<td>' + esc(reorderLevel(item)) + '</td>' +
        '<td>' + esc(locationText) + '</td>' +
        '<td><span class="belm-badge ' + status.cls + '">' + statusIcon(status) + esc(status.label) + '</span></td>' +
        '<td><div class="belm-action-group">' +
          '<button type="button" class="belm-btn-xs belm-btn-xs--view" data-view-part="' + esc(item.id || partNo) + '">View</button>' +
          '<a class="belm-btn-xs belm-btn-xs--procure" href="/customer-procurement-dashboard/?source=store&part=' + encodeURIComponent(partNo) + '">Request Procurement</a>' +
          '<a class="belm-btn-xs belm-btn-xs--adjust" href="/customer-store-audit/">Adjust</a>' +
        '</div></td></tr>';
    }).join('') : '<tr><td colspan="8" style="text-align:center;padding:28px">No store item matches this view.</td></tr>';
  }

  function requestStatus(request) {
    var available = number(request.available);
    var needed = number(request.quantity || 1);
    if (available >= needed && available > 0) return { label:'In Store', cls:'belm-badge--approved' };
    if (available > 0) return { label:'Partial Stock', cls:'belm-badge--low' };
    return { label:'Pending', cls:'belm-badge--pending' };
  }

  function renderRequests() {
    var body = document.getElementById('requestBody');
    if (!body) return;
    body.innerHTML = pendingRequests.length ? pendingRequests.slice(0, 8).map(function (request, index) {
      var status = requestStatus(request);
      var canIssue = number(request.available) >= number(request.quantity || 1) && number(request.available) > 0;
      return '<tr>' +
        '<td>' + esc(request.jobCardNo || '—') + '</td>' +
        '<td>' + esc(request.machineLabel || 'Machine') + '</td>' +
        '<td>' + esc(request.createdBy || 'Technician') + '</td>' +
        '<td>' + esc(request.description || request.referenceNumber || 'Spare Part') + '</td>' +
        '<td>' + esc(request.quantity || 1) + '</td>' +
        '<td><span class="belm-badge ' + status.cls + '">' + esc(status.label) + '</span></td>' +
        '<td><div class="belm-action-group"><a class="belm-btn-xs belm-btn-xs--review" href="/customer-store/#requestRows">Review</a>' +
        '<button type="button" class="belm-btn-xs belm-btn-xs--issue" data-issue-request="' + index + '"' + (canIssue ? '' : ' disabled title="Not enough stock"') + '>Issue Part</button></div></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:28px">No pending spare requests.</td></tr>';
  }

  function movementType(raw) {
    var value = String(raw || '').toUpperCase();
    if (value.indexOf('IN') >= 0 && value.indexOf('OUT') < 0 && value.indexOf('ISSUE') < 0) return { label:normal(raw || 'Stock In'), cls:'belm-move-type--in' };
    if (value.indexOf('OUT') >= 0 || value.indexOf('ISSUE') >= 0) return { label:normal(raw || 'Stock Out'), cls:'belm-move-type--out' };
    if (value.indexOf('AUDIT') >= 0 || value.indexOf('ADJUST') >= 0) return { label:normal(raw || 'Audit Adjustment'), cls:'belm-move-type--audit' };
    return { label:normal(raw || 'Store Activity'), cls:'belm-move-type--return' };
  }

  function renderMovements() {
    var body = document.getElementById('movementsBody');
    if (!body) return;
    body.innerHTML = movements.length ? movements.slice(0, 8).map(function (movement) {
      var type = movementType(movement.movement_type || movement.movementType || movement.type);
      var qty = number(movement.quantity);
      var sign = type.cls === 'belm-move-type--out' ? '-' : '+';
      return '<tr>' +
        '<td>' + esc(fmtDate(movement.created_at || movement.createdAt || movement.eventDate)) + '</td>' +
        '<td><span class="belm-move-type ' + type.cls + '">' + esc(type.label) + '</span></td>' +
        '<td>' + esc(movement.description || movement.part_name || movement.partName || 'Store Item') + '<span class="belm-move-item-name">(' + esc(movement.part_number || movement.partNumber || '—') + ')</span></td>' +
        '<td><span class="' + (sign === '-' ? 'belm-qty-neg' : 'belm-qty-pos') + '">' + sign + esc(qty) + '</span></td>' +
        '<td>' + esc(movement.actor_name || movement.actorName || movement.received_by || movement.receivedBy || '—') + '</td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;padding:28px">No stock movements recorded yet.</td></tr>';
  }

  function machineLabel(machine) {
    return [machine.fleetNumber || machine.fleet_number, machine.brand, machine.model, machine.machineType || machine.machine_type].filter(Boolean).join(' · ') || 'Machine';
  }

  async function loadPendingRequests(machines) {
    var rows = [];
    await Promise.all((machines || []).map(async function (machine) {
      try {
        var workspace = await api('/spare-workspace/' + encodeURIComponent(machine.id));
        var procurement = Array.isArray(workspace.procurementRequests) ? workspace.procurementRequests : [];
        var checks = Array.isArray(workspace.storeChecks) ? workspace.storeChecks : [];
        (workspace.items || []).forEach(function (item) {
          if (!number(item.selected == null ? 1 : item.selected)) return;
          var ref = item.reference_number || item.referenceNumber || '';
          var desc = item.description || '';
          var alreadyProcurement = procurement.some(function (p) {
            var same = String(p.description || '').toLowerCase() === String(desc).toLowerCase() && String(p.reference_number || p.referenceNumber || '').toLowerCase() === String(ref).toLowerCase();
            var closed = ['COMPLETED','CANCELLED','REJECTED'].includes(String(p.status || '').toUpperCase());
            return same && !closed;
          });
          if (alreadyProcurement) return;
          var check = checks.find(function (c) { return String(c.referenceNumber || '').toLowerCase() === String(ref).toLowerCase() && String(c.description || '').toLowerCase() === String(desc).toLowerCase(); }) || checks.find(function (c) { return String(c.description || '').toLowerCase() === String(desc).toLowerCase(); }) || {};
          rows.push({
            machineId: machine.id,
            machineLabel: machineLabel(machine),
            jobCardNo: item.job_card_no || item.jobCardNo || item.job_card || '—',
            referenceNumber: ref,
            description: desc,
            quantity: number(item.quantity || 1),
            createdBy: item.created_by_name || item.createdByName || 'Technician',
            available: number(check.available || 0)
          });
        });
      } catch (_) {}
    }));
    pendingRequests = rows;
  }

  function showPart(item) {
    var status = inventoryStatus(item);
    var dialog = document.getElementById('partDialog');
    if (!dialog) return;
    document.getElementById('partDialogTitle').textContent = (item.part_number || item.partNumber || 'Spare Part') + ' — ' + (item.description || '');
    document.getElementById('partDialogBody').innerHTML =
      '<div><span>Status</span><b>' + esc(status.label) + '</b></div>' +
      '<div><span>Stock</span><b>' + esc(qtyOnHand(item)) + ' ' + esc(item.unit || '') + '</b></div>' +
      '<div><span>Received</span><b>' + esc(number(item.total_received != null ? item.total_received : item.totalReceived)) + '</b></div>' +
      '<div><span>Issued</span><b>' + esc(number(item.total_issued != null ? item.total_issued : item.totalIssued)) + '</b></div>' +
      '<div><span>Average Cost</span><b>TZS ' + number(item.average_unit_cost != null ? item.average_unit_cost : item.averageUnitCost).toLocaleString('en-TZ') + '</b></div>' +
      '<div><span>Location</span><b>' + esc(item.location || item.bin_location || 'Customer Store') + '</b></div>';
    dialog.showModal();
  }

  function openReceiveDialog() {
    var dialog = document.getElementById('receiveDialog');
    if (dialog) dialog.showModal();
  }

  async function receiveStock(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await api('/store', { method:'POST', body:JSON.stringify({
        partNumber: document.getElementById('receivePartNumber').value.trim(),
        description: document.getElementById('receiveDescription').value.trim(),
        unit: document.getElementById('receiveUnit').value,
        quantity: number(document.getElementById('receiveQuantity').value),
        unitCost: number(document.getElementById('receiveUnitCost').value),
        note: document.getElementById('receiveNote').value.trim()
      }) });
      document.getElementById('receiveDialog').close();
      form.reset();
      document.getElementById('receiveUnit').value = 'PC';
      flash('Stock received successfully.');
      await loadLive();
    } catch (error) { flash(error.message, true); }
    finally { button.disabled = false; button.textContent = 'Receive into Store'; }
  }

  async function issuePending(index) {
    var request = pendingRequests[index];
    if (!request) return;
    try {
      await api('/store-issue-requests/' + encodeURIComponent(request.machineId), {
        method:'POST',
        body:JSON.stringify({ items:[{ referenceNumber:request.referenceNumber, description:request.description, quantity:request.quantity }] })
      });
      flash('Store issue sent for approval. Stock remains protected until approval.');
      await loadLive();
    } catch (error) { flash(error.message, true); }
  }

  function exportCsv() {
    var rows = [['Part Number','Description','Unit','Received','Issued','Balance','Reorder Level','Status']];
    items.forEach(function (item) {
      rows.push([
        item.part_number || item.partNumber || '',
        item.description || '',
        item.unit || 'PC',
        number(item.total_received != null ? item.total_received : item.totalReceived),
        number(item.total_issued != null ? item.total_issued : item.totalIssued),
        qtyOnHand(item),
        reorderLevel(item),
        inventoryStatus(item).label
      ]);
    });
    var csv = rows.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = companyName.replace(/[^A-Za-z0-9_-]+/g, '-') + '-Store-Inventory-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function loadLive() {
    var inventoryBody = document.getElementById('inventoryBody');
    var requestBody = document.getElementById('requestBody');
    var movementBody = document.getElementById('movementsBody');
    if (inventoryBody) inventoryBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px">Loading live inventory…</td></tr>';
    if (requestBody) requestBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px">Loading spare requests…</td></tr>';
    if (movementBody) movementBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px">Loading stock movements…</td></tr>';

    try {
      var result = await Promise.allSettled([api('/dashboard'), api('/store'), api('/tool-issues')]);
      var dashboard = result[0].status === 'fulfilled' ? result[0].value : {};
      var store = result[1].status === 'fulfilled' ? result[1].value : {};
      var tools = result[2].status === 'fulfilled' ? result[2].value : {};
      setCompany(dashboard && dashboard.customer && dashboard.customer.name ? dashboard.customer.name : 'Customer');
      items = Array.isArray(store.items) ? store.items : [];
      movements = Array.isArray(store.recentMovements) ? store.recentMovements : [];
      toolIssues = Array.isArray(tools.items) ? tools.items : (Array.isArray(tools) ? tools : []);
      await loadPendingRequests(Array.isArray(dashboard.machines) ? dashboard.machines : []);
      renderStats();
      renderInventory();
      renderRequests();
      renderMovements();
    } catch (error) {
      flash(error.message, true);
      if (inventoryBody) inventoryBody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px">Could not load store data.</td></tr>';
    }
  }

  if (sidebarToggle) sidebarToggle.addEventListener('click', function () { shell.classList.toggle('is-sidebar-open'); });
  if (themeToggle) {
    if (localStorage.getItem('belm-theme') === 'light') document.body.classList.add('belm-light');
    function updateThemeLabel() { var text = document.getElementById('themeLabel'); if (text) text.textContent = document.body.classList.contains('belm-light') ? 'Dark mode' : 'Light mode'; }
    updateThemeLabel();
    themeToggle.addEventListener('click', function () {
      var light = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', light ? 'light' : 'dark');
      updateThemeLabel();
    });
  }
  if (searchInput) searchInput.addEventListener('input', renderInventory);

  document.getElementById('inventoryBody').addEventListener('click', function (event) {
    var button = event.target.closest('[data-view-part]');
    if (!button) return;
    var item = items.find(function (row) { return String(row.id || row.part_number || row.partNumber) === String(button.dataset.viewPart); });
    if (item) showPart(item);
  });

  document.getElementById('requestBody').addEventListener('click', function (event) {
    var button = event.target.closest('[data-issue-request]');
    if (!button || button.disabled) return;
    issuePending(Number(button.dataset.issueRequest));
  });

  document.getElementById('recordStockIn').addEventListener('click', function (event) { event.preventDefault(); openReceiveDialog(); });
  document.getElementById('issueItem').addEventListener('click', function (event) {
    event.preventDefault();
    var panel = document.getElementById('pendingRequestsPanel');
    if (panel) panel.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  document.getElementById('scanItem').addEventListener('click', function (event) {
    event.preventDefault();
    if (searchInput) { searchInput.focus(); searchInput.scrollIntoView({ behavior:'smooth', block:'center' }); }
  });
  document.getElementById('printIssueNote').addEventListener('click', function (event) { event.preventDefault(); window.print(); });
  document.getElementById('exportCsv').addEventListener('click', function (event) { event.preventDefault(); exportCsv(); });
  document.getElementById('receiveForm').addEventListener('submit', receiveStock);
  document.getElementById('cancelReceive').addEventListener('click', function () { document.getElementById('receiveDialog').close(); });
  document.getElementById('closePartDialog').addEventListener('click', function () { document.getElementById('partDialog').close(); });
  document.getElementById('logout').addEventListener('click', function (event) {
    event.preventDefault();
    localStorage.removeItem('belm_customer_token');
    localStorage.removeItem('belm_active_account_type');
    location.replace('/login');
  });

  updateClock();
  setInterval(updateClock, 30000);
  loadLive();
  setInterval(function () { if (!document.hidden) loadLive(); }, 60000);
});