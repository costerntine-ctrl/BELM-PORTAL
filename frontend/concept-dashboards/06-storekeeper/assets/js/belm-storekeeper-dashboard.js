document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var searchInput = document.querySelector('.belm-search input');
  var params = new URLSearchParams(location.search);
  var inventoryMode = params.get('inventory') === '1';
  var token = localStorage.getItem('belm_admin_token') || '';
  var parts = [];
  var requests = [];
  var auditRows = [];

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
  }

  if (themeToggle) {
    if (localStorage.getItem('belm-theme') === 'light') {
      document.body.classList.add('belm-light');
      if (themeToggle.lastChild) themeToggle.lastChild.textContent = ' Dark mode';
    }
    themeToggle.addEventListener('click', function () {
      var isLight = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', isLight ? 'light' : 'dark');
      if (themeToggle.lastChild) themeToggle.lastChild.textContent = isLight ? ' Dark mode' : ' Light mode';
    });
  }

  function updateClock() {
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (!dateEl || !timeEl) return;
    var now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  if (inventoryMode) {
    var heroTitle = document.querySelector('.belm-hero__title');
    var heroSub = document.querySelector('.belm-hero__subtitle');
    if (heroTitle) heroTitle.textContent = 'Spare Parts Inventory';
    if (heroSub) heroSub.textContent = 'Live stock, spare requests and inventory movements';
    document.title = 'BELM Operations Platform — Spare Parts Inventory';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c];
    });
  }

  function normal(value) {
    return String(value == null ? '' : value).replace(/[_-]+/g, ' ').trim();
  }

  function fmtDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  async function api(path, options) {
    options = options || {};
    var response = await fetch(path.indexOf('/api/') === 0 ? path : '/api' + path, {
      method: options.method || 'GET',
      cache: 'no-store',
      body: options.body,
      headers: Object.assign({
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      }, options.headers || {})
    });
    var text = await response.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data && data.error ? data.error : 'Request failed (' + response.status + ').');
    return data;
  }

  function panelByTitle(title) {
    var wanted = title.toUpperCase();
    return Array.from(document.querySelectorAll('.belm-panel')).find(function (panel) {
      var el = panel.querySelector('.belm-panel__title');
      return el && String(el.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase().indexOf(wanted) >= 0;
    }) || null;
  }

  function setStat(label, value) {
    Array.from(document.querySelectorAll('.belm-stat-card')).forEach(function (card) {
      var l = card.querySelector('.belm-stat-card__label');
      var v = card.querySelector('.belm-stat-card__value');
      if (!l || !v) return;
      if (String(l.textContent || '').trim().toUpperCase() === label.toUpperCase()) v.textContent = String(value);
    });
  }

  function statusFor(part) {
    var stock = Number(part.stockQty != null ? part.stockQty : part.stock_qty || 0);
    var reorder = Number(part.reorderThreshold != null ? part.reorderThreshold : part.reorder_threshold || 0);
    if (stock <= 0) return { label:'Out of Stock', cls:'belm-badge--out', rank:0 };
    if (stock < reorder) return { label:'Low Stock', cls:'belm-badge--low', rank:1 };
    if (stock === reorder && reorder > 0) return { label:'Reorder', cls:'belm-badge--reorder', rank:2 };
    return { label:'Available', cls:'belm-badge--available', rank:3 };
  }

  function statusIcon(status) {
    if (status.cls === 'belm-badge--available') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5"/></svg>';
    if (status.cls === 'belm-badge--out') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    if (status.cls === 'belm-badge--reorder') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.5 9A7 7 0 0119 8.5M18.5 15A7 7 0 015 15.5"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>';
  }

  function renderInventory() {
    var panel = panelByTitle('Inventory Alerts');
    var body = panel && panel.querySelector('tbody');
    if (!body) return;
    var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var lowOnly = params.get('filter') === 'low-stock';
    var rows = parts.filter(function (part) {
      var status = statusFor(part);
      if (lowOnly && status.rank >= 3) return false;
      if (!q) return true;
      return [part.partNumber, part.part_number, part.referenceNumber, part.reference_number, part.name, part.category, part.machineBrand, part.machine_brand, part.machineType, part.machine_type, part.location, part.binLocation]
        .some(function (value) { return String(value || '').toLowerCase().indexOf(q) >= 0; });
    }).sort(function (a, b) {
      var sa = statusFor(a), sb = statusFor(b);
      if (sa.rank !== sb.rank) return sa.rank - sb.rank;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    body.innerHTML = rows.length ? rows.map(function (part) {
      var stock = Number(part.stockQty != null ? part.stockQty : part.stock_qty || 0);
      var reorder = Number(part.reorderThreshold != null ? part.reorderThreshold : part.reorder_threshold || 0);
      var s = statusFor(part);
      var partNo = part.partNumber || part.part_number || '—';
      var locationText = part.location || part.binLocation || part.storeLocation || 'BELM Store';
      return '<tr data-live-part="' + esc(part.id) + '">' +
        '<td><strong>' + esc(partNo) + '</strong></td>' +
        '<td>' + esc(part.name || 'Spare Part') + '</td>' +
        '<td>' + esc(normal(part.category || '—')) + '</td>' +
        '<td>' + (stock <= 0 ? '<span class="belm-text-red">0</span>' : esc(stock)) + '</td>' +
        '<td>' + esc(reorder) + '</td>' +
        '<td>' + esc(locationText) + '</td>' +
        '<td><span class="belm-badge ' + s.cls + '">' + statusIcon(s) + esc(s.label) + '</span></td>' +
        '<td><div class="belm-action-group">' +
          '<a href="#" data-part-view="' + esc(part.id) + '" class="belm-btn-xs belm-btn-xs--view">View</a>' +
          '<a href="/concept-dashboards/03-procurement/?source=inventory&part=' + encodeURIComponent(part.id || '') + '&partNumber=' + encodeURIComponent(partNo) + '" class="belm-btn-xs belm-btn-xs--procure">Request Procurement</a>' +
          '<a href="#" data-stock-adjust="' + esc(part.id) + '" class="belm-btn-xs belm-btn-xs--adjust">Adjust</a>' +
        '</div></td></tr>';
    }).join('') : '<tr><td colspan="8" style="text-align:center;padding:28px">' + (q ? 'No spare part matches this search.' : 'No spare parts have been registered yet.') + '</td></tr>';
  }

  function requestStatus(request) {
    var raw = String(request.status || 'PENDING').toUpperCase();
    if (raw.indexOf('APPROV') >= 0 || raw === 'PARTS_READY') return { label:normal(raw), cls:'belm-badge--approved' };
    if (raw.indexOf('PURCHASE') >= 0 || raw.indexOf('ORDER') >= 0) return { label:normal(raw), cls:'belm-badge--low' };
    return { label:normal(raw || 'PENDING'), cls:'belm-badge--pending' };
  }

  function renderRequests() {
    var panel = panelByTitle('Pending Spare Requests');
    var body = panel && panel.querySelector('tbody');
    if (!body) return;
    body.innerHTML = requests.length ? requests.slice(0, 8).map(function (request) {
      var status = requestStatus(request);
      var machine = [request.machineBrand, request.machineModel].filter(Boolean).join(' ') || request.machineType || 'Machine';
      var part = request.partName || request.description || request.referenceNumber || request.partNumber || 'Spare Part';
      var jc = request.jobCardNo || request.job_card_no || request.proformaCode || '—';
      var qty = Number(request.quantity || 1);
      var selectedPart = parts.find(function (p) { return String(p.id) === String(request.sparePartId || request.spare_part_id || ''); });
      var enough = selectedPart && Number(selectedPart.stockQty != null ? selectedPart.stockQty : selectedPart.stock_qty || 0) >= qty;
      return '<tr data-live-request="' + esc(request.id) + '">' +
        '<td>' + esc(jc) + '</td><td>' + esc(machine) + '</td><td>' + esc(request.requestedByName || request.technicianName || '—') + '</td><td>' + esc(part) + '</td><td>' + esc(qty) + '</td>' +
        '<td><span class="belm-badge ' + status.cls + '">' + esc(status.label) + '</span></td>' +
        '<td><div class="belm-action-group"><a href="#" data-request-review="' + esc(request.id) + '" class="belm-btn-xs belm-btn-xs--review">Review</a>' +
        '<a href="#" data-request-issue="' + esc(request.id) + '" class="belm-btn-xs belm-btn-xs--issue"' + (enough ? '' : ' aria-disabled="true" title="Selected spare is not available in sufficient stock"') + '>Issue Part</a></div></td></tr>';
    }).join('') : '<tr><td colspan="7" style="text-align:center;padding:28px">No pending spare requests.</td></tr>';
  }

  function movementClass(type) {
    var t = String(type || '').toUpperCase();
    if (t === 'STOCK IN') return 'belm-move-type--in';
    if (t === 'STOCK OUT') return 'belm-move-type--out';
    if (t.indexOf('AUDIT') >= 0 || t === 'EDIT') return 'belm-move-type--audit';
    return 'belm-move-type--return';
  }

  function renderMovements() {
    var panel = panelByTitle('Recent Stock Movements');
    var body = panel && panel.querySelector('tbody');
    if (!body) return;
    body.innerHTML = auditRows.length ? auditRows.slice(0, 8).map(function (row) {
      var delta = row.quantityChange;
      var cls = Number(delta || 0) < 0 ? 'belm-qty-neg' : 'belm-qty-pos';
      var qty = delta == null ? '—' : (Number(delta) > 0 ? '+' + delta : String(delta));
      return '<tr><td>' + esc(fmtDate(row.eventDate)) + '</td>' +
        '<td><span class="belm-move-type ' + movementClass(row.type) + '">' + esc(normal(row.type || 'Activity')) + '</span></td>' +
        '<td>' + esc(row.partName || 'Spare Part') + '<span class="belm-move-item-name">(' + esc(row.partNumber || '—') + ')</span></td>' +
        '<td><span class="' + cls + '">' + esc(qty) + '</span></td><td>' + esc(row.actor || '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="5" style="text-align:center;padding:28px">No stock movements recorded yet.</td></tr>';
  }

  function updateStats() {
    var low = parts.filter(function (p) { return statusFor(p).rank < 3; }).length;
    setStat('Stock Items', parts.length.toLocaleString('en-TZ'));
    setStat('Low Stock', low.toLocaleString('en-TZ'));
    setStat('Pending Requests', requests.length.toLocaleString('en-TZ'));
  }

  function injectModalStyles() {
    if (document.getElementById('belm-live-inventory-style')) return;
    var style = document.createElement('style');
    style.id = 'belm-live-inventory-style';
    style.textContent = '.belm-live-modal{border:1px solid rgba(84,176,255,.45);border-radius:16px;width:min(620px,calc(100% - 24px));padding:0;background:#0b2340;color:#fff;box-shadow:0 24px 80px #0009}.belm-live-modal::backdrop{background:rgba(2,10,22,.75)}.belm-live-modal-card{padding:20px}.belm-live-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:12px;margin-bottom:14px}.belm-live-modal-head h2{margin:0;font-size:20px}.belm-live-modal-close{border:1px solid rgba(255,255,255,.22);background:transparent;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer}.belm-live-detail{display:grid;grid-template-columns:1fr 1fr;gap:9px}.belm-live-detail>div{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px;background:rgba(255,255,255,.04)}.belm-live-detail span{display:block;font-size:10px;opacity:.68;text-transform:uppercase;font-weight:800}.belm-live-detail b{display:block;margin-top:4px}.belm-live-form label{display:block;margin:10px 0;font-weight:700}.belm-live-form select,.belm-live-form input{width:100%;margin-top:5px;padding:10px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:#07192f;color:#fff}.belm-live-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.belm-live-form-actions button{border:0;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.belm-live-primary{background:#21b06b;color:#fff}.belm-live-secondary{background:#2f86d6;color:#fff}@media(max-width:620px){.belm-live-detail{grid-template-columns:1fr}}body.belm-light .belm-live-modal{background:#fff;color:#142033}body.belm-light .belm-live-form select,body.belm-light .belm-live-form input{background:#fff;color:#142033;border-color:#ccd5e0}body.belm-light .belm-live-modal-head{border-bottom-color:#dce3ec}body.belm-light .belm-live-detail>div{border-color:#dce3ec;background:#f6f8fb}';
    document.head.appendChild(style);
  }

  function ensureDialog(id) {
    var dialog = document.getElementById(id);
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'belm-live-modal';
    document.body.appendChild(dialog);
    return dialog;
  }

  function showPart(part) {
    if (!part) return;
    injectModalStyles();
    var s = statusFor(part);
    var dialog = ensureDialog('belmPartLiveDialog');
    dialog.innerHTML = '<div class="belm-live-modal-card"><div class="belm-live-modal-head"><div><small>SPARE PART RECORD</small><h2>' + esc(part.partNumber || part.part_number || 'Spare Part') + ' — ' + esc(part.name || '') + '</h2></div><button class="belm-live-modal-close" type="button">×</button></div>' +
      '<div class="belm-live-detail"><div><span>Category</span><b>' + esc(normal(part.category || '—')) + '</b></div><div><span>Status</span><b>' + esc(s.label) + '</b></div><div><span>Current Stock</span><b>' + esc(part.stockQty != null ? part.stockQty : part.stock_qty || 0) + '</b></div><div><span>Reorder Level</span><b>' + esc(part.reorderThreshold != null ? part.reorderThreshold : part.reorder_threshold || 0) + '</b></div><div><span>Reference No.</span><b>' + esc(part.referenceNumber || part.reference_number || '—') + '</b></div><div><span>Machine</span><b>' + esc([part.machineBrand || part.machine_brand, part.machineType || part.machine_type].filter(Boolean).join(' ') || '—') + '</b></div><div><span>Purchase Price</span><b>TZS ' + Number(part.purchasePrice || part.purchase_price || 0).toLocaleString('en-TZ') + '</b></div><div><span>Selling Price</span><b>TZS ' + Number(part.sellingPrice || part.selling_price || 0).toLocaleString('en-TZ') + '</b></div></div></div>';
    dialog.querySelector('.belm-live-modal-close').onclick = function () { dialog.close(); };
    dialog.showModal();
  }

  function showRequest(request) {
    if (!request) return;
    injectModalStyles();
    var dialog = ensureDialog('belmRequestLiveDialog');
    var linked = parts.find(function (p) { return String(p.id) === String(request.sparePartId || request.spare_part_id || ''); });
    dialog.innerHTML = '<div class="belm-live-modal-card"><div class="belm-live-modal-head"><div><small>SPARE REQUEST</small><h2>' + esc(request.jobCardNo || request.job_card_no || request.proformaCode || 'Job Card') + '</h2></div><button class="belm-live-modal-close" type="button">×</button></div>' +
      '<div class="belm-live-detail"><div><span>Customer</span><b>' + esc(request.customerName || '—') + '</b></div><div><span>Machine</span><b>' + esc([request.machineBrand, request.machineModel].filter(Boolean).join(' ') || request.machineType || '—') + '</b></div><div><span>Requested By</span><b>' + esc(request.requestedByName || request.technicianName || '—') + '</b></div><div><span>Quantity</span><b>' + esc(request.quantity || 1) + '</b></div><div><span>Requested Part</span><b>' + esc(request.partName || request.description || request.referenceNumber || '—') + '</b></div><div><span>Selected Inventory Part</span><b>' + esc(linked ? (linked.partNumber || linked.part_number) + ' — ' + linked.name : 'Not selected') + '</b></div><div><span>Status</span><b>' + esc(normal(request.status || 'PENDING')) + '</b></div><div><span>Available Stock</span><b>' + esc(linked ? (linked.stockQty != null ? linked.stockQty : linked.stock_qty || 0) : '—') + '</b></div></div></div>';
    dialog.querySelector('.belm-live-modal-close').onclick = function () { dialog.close(); };
    dialog.showModal();
  }

  function ensureEditConfirm() {
    if (typeof window.belmConfirmEdit === 'function') return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-belm-edit-confirm]');
      if (existing) {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      var script = document.createElement('script');
      script.src = '/edit-confirm.js';
      script.dataset.belmEditConfirm = '1';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function partPayload(part, stockQty, editPin) {
    return {
      partNumber: part.partNumber || part.part_number || '',
      referenceNumber: part.referenceNumber || part.reference_number || '',
      name: part.name || '',
      category: part.category || '',
      stockQty: stockQty,
      reorderThreshold: Number(part.reorderThreshold != null ? part.reorderThreshold : part.reorder_threshold || 0),
      purchasePrice: Number(part.purchasePrice != null ? part.purchasePrice : part.purchase_price || 0),
      sellingPrice: Number(part.sellingPrice != null ? part.sellingPrice : part.selling_price || 0),
      machineBrand: part.machineBrand || part.machine_brand || '',
      machineType: part.machineType || part.machine_type || '',
      heightMm: part.heightMm != null ? part.heightMm : part.height_mm || '',
      lengthMm: part.lengthMm != null ? part.lengthMm : part.length_mm || '',
      outerDiameterMm: part.outerDiameterMm != null ? part.outerDiameterMm : part.outer_diameter_mm || '',
      innerDiameterMm: part.innerDiameterMm != null ? part.innerDiameterMm : part.inner_diameter_mm || '',
      threadSize: part.threadSize || part.thread_size || '',
      editPin: editPin
    };
  }

  async function confirmStockChange(part, newStock, label) {
    await ensureEditConfirm();
    if (typeof window.belmConfirmEdit !== 'function') throw new Error('Secure stock confirmation is unavailable.');
    var confirmation = await window.belmConfirmEdit({
      title: label + '?',
      message: (part.partNumber || part.part_number || 'Spare') + ' — ' + part.name + ': ' + (part.stockQty != null ? part.stockQty : part.stock_qty || 0) + ' → ' + newStock
    });
    if (!confirmation) return false;
    await api('/spare-parts/' + encodeURIComponent(part.id), { method:'PUT', body:JSON.stringify(partPayload(part, newStock, confirmation.editPin)) });
    return true;
  }

  function openStockDialog(mode, fixedPart) {
    injectModalStyles();
    var isOut = mode === 'out';
    var dialog = ensureDialog('belmStockLiveDialog');
    dialog.innerHTML = '<form class="belm-live-modal-card belm-live-form"><div class="belm-live-modal-head"><div><small>STORE CONTROL</small><h2>' + (isOut ? 'Issue Stock' : 'Record Stock In') + '</h2></div><button class="belm-live-modal-close" type="button">×</button></div>' +
      '<label>Spare Part<select id="belmLiveStockPart" required>' + parts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (fixedPart && String(fixedPart.id) === String(p.id) ? ' selected' : '') + '>' + esc((p.partNumber || p.part_number || '') + ' — ' + p.name + ' · Stock ' + (p.stockQty != null ? p.stockQty : p.stock_qty || 0)) + '</option>'; }).join('') + '</select></label>' +
      '<label>Quantity<input id="belmLiveStockQty" type="number" min="1" step="1" value="1" required></label>' +
      '<div class="belm-live-form-actions"><button type="button" class="belm-live-secondary belm-live-cancel">Cancel</button><button type="submit" class="belm-live-primary">' + (isOut ? 'Issue Part' : 'Save Stock In') + '</button></div></form>';
    dialog.querySelector('.belm-live-modal-close').onclick = function () { dialog.close(); };
    dialog.querySelector('.belm-live-cancel').onclick = function () { dialog.close(); };
    dialog.querySelector('form').onsubmit = async function (event) {
      event.preventDefault();
      var part = parts.find(function (p) { return String(p.id) === String(dialog.querySelector('#belmLiveStockPart').value); });
      var qty = Number(dialog.querySelector('#belmLiveStockQty').value || 0);
      if (!part || !Number.isInteger(qty) || qty <= 0) return;
      var current = Number(part.stockQty != null ? part.stockQty : part.stock_qty || 0);
      var next = isOut ? current - qty : current + qty;
      if (next < 0) { alert('Insufficient stock. Available: ' + current); return; }
      try {
        var saved = await confirmStockChange(part, next, isOut ? 'Issue stock' : 'Record stock in');
        if (!saved) return;
        dialog.close();
        await loadLive();
      } catch (error) { alert(error.message); }
    };
    dialog.showModal();
  }

  async function issueRequest(request) {
    if (!request) return;
    var part = parts.find(function (p) { return String(p.id) === String(request.sparePartId || request.spare_part_id || ''); });
    if (!part) { showRequest(request); return; }
    var qty = Number(request.quantity || 1);
    var current = Number(part.stockQty != null ? part.stockQty : part.stock_qty || 0);
    if (current < qty) { alert('Insufficient stock. Available: ' + current + ', requested: ' + qty); return; }
    try {
      var saved = await confirmStockChange(part, current - qty, 'Issue spare to ' + (request.jobCardNo || request.job_card_no || 'Job Card'));
      if (!saved) return;
      await api('/spare-parts/requests/' + encodeURIComponent(request.id), { method:'PUT', body:JSON.stringify({ action:'resolve' }) });
      await loadLive();
    } catch (error) { alert(error.message); }
  }

  function exportInventoryCsv() {
    var headers = ['Part Number','Spare Part','Category','In Stock','Reorder Level','Status'];
    var rows = parts.map(function (p) {
      var s = statusFor(p);
      return [p.partNumber || p.part_number || '', p.name || '', normal(p.category || ''), p.stockQty != null ? p.stockQty : p.stock_qty || 0, p.reorderThreshold != null ? p.reorderThreshold : p.reorder_threshold || 0, s.label];
    });
    var csv = [headers].concat(rows).map(function (row) { return row.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'BELM-Spare-Parts-Inventory-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function loadLive() {
    if (!token) {
      if (!/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) && params.get('preview') !== '1') location.replace('/login');
      return;
    }
    var inventoryPanel = panelByTitle('Inventory Alerts');
    var requestPanel = panelByTitle('Pending Spare Requests');
    var movementPanel = panelByTitle('Recent Stock Movements');
    if (inventoryPanel && inventoryPanel.querySelector('tbody')) inventoryPanel.querySelector('tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px">Loading live inventory…</td></tr>';
    if (requestPanel && requestPanel.querySelector('tbody')) requestPanel.querySelector('tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px">Loading spare requests…</td></tr>';
    if (movementPanel && movementPanel.querySelector('tbody')) movementPanel.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:28px">Loading stock movements…</td></tr>';
    try {
      var result = await Promise.allSettled([
        api('/spare-parts'),
        api('/spare-parts/requests'),
        api('/spare-parts?action=audit')
      ]);
      parts = result[0].status === 'fulfilled' && Array.isArray(result[0].value) ? result[0].value : [];
      requests = result[1].status === 'fulfilled' && Array.isArray(result[1].value) ? result[1].value : [];
      auditRows = result[2].status === 'fulfilled' && result[2].value && Array.isArray(result[2].value.rows) ? result[2].value.rows : [];
      updateStats();
      renderInventory();
      renderRequests();
      renderMovements();
    } catch (error) {
      if (inventoryPanel && inventoryPanel.querySelector('tbody')) inventoryPanel.querySelector('tbody').innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px">' + esc(error.message) + '</td></tr>';
    }
  }

  if (searchInput) searchInput.addEventListener('input', renderInventory);

  var pendingPanel = panelByTitle('Pending Spare Requests');
  var pendingViewAll = pendingPanel && pendingPanel.querySelector('.belm-panel__link');
  if (pendingViewAll) pendingViewAll.href = 'spare-requests.php';
  var movementPanel = panelByTitle('Recent Stock Movements');
  var movementViewAll = movementPanel && movementPanel.querySelector('.belm-panel__link');
  if (movementViewAll) movementViewAll.href = 'stock-audit.php';

  document.addEventListener('click', function (event) {
    var partView = event.target.closest('[data-part-view]');
    if (partView) {
      event.preventDefault();
      showPart(parts.find(function (p) { return String(p.id) === String(partView.dataset.partView); }));
      return;
    }
    var adjust = event.target.closest('[data-stock-adjust]');
    if (adjust) {
      event.preventDefault();
      var part = parts.find(function (p) { return String(p.id) === String(adjust.dataset.stockAdjust); });
      openStockDialog('in', part);
      return;
    }
    var review = event.target.closest('[data-request-review]');
    if (review) {
      event.preventDefault();
      showRequest(requests.find(function (r) { return String(r.id) === String(review.dataset.requestReview); }));
      return;
    }
    var issue = event.target.closest('[data-request-issue]');
    if (issue) {
      event.preventDefault();
      if (issue.getAttribute('aria-disabled') === 'true') {
        showRequest(requests.find(function (r) { return String(r.id) === String(issue.dataset.requestIssue); }));
        return;
      }
      issueRequest(requests.find(function (r) { return String(r.id) === String(issue.dataset.requestIssue); }));
      return;
    }

    var link = event.target.closest('a,button');
    if (!link) return;
    var text = String(link.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (text === 'RECORD STOCK IN') {
      event.preventDefault(); openStockDialog('in'); return;
    }
    if (text === 'ISSUE ITEM') {
      event.preventDefault(); openStockDialog('out'); return;
    }
    if (text === 'SCAN ITEM') {
      event.preventDefault();
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      return;
    }
    if (text === 'PRINT ISSUE NOTE') {
      event.preventDefault(); window.print(); return;
    }
    if (text === 'START AUDIT') {
      event.preventDefault();
      if (movementPanel) movementPanel.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    if (text === 'EXPORT CSV') {
      event.preventDefault(); exportInventoryCsv(); return;
    }
  }, true);

  loadLive().then(function () {
    var action = String(params.get('action') || '').toLowerCase();
    if (action === 'stock-in') openStockDialog('in');
    else if (action === 'stock-out') openStockDialog('out');
    var section = String(params.get('section') || '').toLowerCase();
    if (section === 'requests' && pendingPanel) pendingPanel.scrollIntoView({ behavior:'smooth', block:'start' });
    if (section === 'audit' && movementPanel) movementPanel.scrollIntoView({ behavior:'smooth', block:'start' });
  });
  setInterval(loadLive, 60000);
});
