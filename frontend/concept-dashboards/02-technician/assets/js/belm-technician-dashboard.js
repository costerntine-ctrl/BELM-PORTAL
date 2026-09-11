document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');

  if (sidebarToggle && shell) {
    sidebarToggle.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
  }

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

  function parseToken(token) {
    if (!token) return null;
    try {
      var raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return null; }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'})[c];
    });
  }

  var techToken = localStorage.getItem('belm_tech_token');
  var customerToken = localStorage.getItem('belm_customer_token');
  var techPayload = parseToken(techToken);
  var customerPayload = parseToken(customerToken);
  var customerRole = String(customerPayload && (customerPayload.roleName || customerPayload.customerRole || customerPayload.role) || '').toLowerCase();
  var token = techPayload && String(techPayload.roleName || techPayload.role || '').toLowerCase().includes('technician')
    ? techToken
    : customerRole.includes('technician') ? customerToken : '';

  function stageFor(job) {
    var stage = String(job.current_stage || '').toUpperCase();
    var status = String(job.status || '').toUpperCase();
    var caseStatus = String(job.case_status || '').toUpperCase();
    var waiting = status === 'WAITING_FOR_PARTS' || Number(job.openSpareRequests || 0) > 0 || ['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS'].includes(stage);
    if (caseStatus === 'COMPLETED' || stage === 'COMPLETED' || status === 'COMPLETED') return 'Completed';
    if (stage === 'PENDING_APPROVAL' || status === 'PENDING_APPROVAL') return 'Completion Report';
    if (String(job.test_result || '').trim()) return 'Testing';
    if (String(job.work_done || '').trim()) return 'Repair';
    if (waiting) return 'Waiting for Spare';
    if (String(job.diagnosis || '').trim()) return 'Diagnosis Report';
    if (job.started_at || status === 'RECEIVED') return 'Inspection / Diagnosis';
    return 'Assigned / Receive';
  }

  function nextAction(stage) {
    if (stage === 'Assigned / Receive') return ['Receive Job Card', '/technician-job-cards/'];
    if (stage === 'Inspection / Diagnosis') return ['Save Diagnosis Report', '/technician-job-cards/'];
    if (stage === 'Diagnosis Report') return ['Continue to Repair', '/technician-job-cards/'];
    if (stage === 'Waiting for Spare') return ['View Spare Status', '/spare-parts-manager/?view=requests&source=technician'];
    if (stage === 'Repair') return ['Update Repair', '/technician-job-cards/'];
    if (stage === 'Testing') return ['Complete Test Report', '/technician-job-cards/?view=testing'];
    if (stage === 'Completion Report') return ['Awaiting Approval', '/technician-job-cards/'];
    return ['View Report', '/technician-job-cards/?view=reports'];
  }

  function ensureWorkflowPanel() {
    if (document.getElementById('technicianServiceWorkflow')) return;
    var stats = document.querySelector('.belm-stats');
    if (!stats) return;
    var section = document.createElement('section');
    section.id = 'technicianServiceWorkflow';
    section.className = 'belm-tech-workflow';
    section.innerHTML = [
      '<div class="belm-tech-workflow__head"><div><small>TECHNICIAN SERVICE WORKFLOW</small><h2>Job Card Process</h2><p>Inspection / diagnosis must produce a report before repair continues.</p></div><a href="/tech-report/" class="belm-tech-workflow__checklist">Open Daily Checklist</a></div>',
      '<div class="belm-tech-workflow__steps">',
      ['Received','Inspection / Diagnosis','Diagnosis Report','Waiting for Spare','Repair','Testing','Completion Report','Completed'].map(function (label, index) {
        var optional = label === 'Waiting for Spare' ? '<em>IF REQUIRED</em>' : '';
        return '<div class="belm-tech-workflow__step" data-workflow-step="' + label + '"><span>' + (index + 1) + '</span><b>' + label + '</b>' + optional + '</div>';
      }).join(''),
      '</div>'
    ].join('');
    stats.insertAdjacentElement('afterend', section);

    var style = document.createElement('style');
    style.textContent = '.belm-tech-workflow{margin:18px 0 24px;padding:20px;border:1px solid rgba(61,140,230,.45);border-radius:16px;background:linear-gradient(135deg,rgba(8,34,67,.96),rgba(13,53,94,.9));box-shadow:0 12px 30px rgba(0,0,0,.16)}.belm-tech-workflow__head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.belm-tech-workflow__head small{color:#f4c51c;font-size:10px;font-weight:900;letter-spacing:.1em}.belm-tech-workflow__head h2{margin:4px 0 3px;color:#fff;font-size:20px}.belm-tech-workflow__head p{margin:0;color:#afc7e1;font-size:12px}.belm-tech-workflow__checklist{flex:0 0 auto;padding:10px 14px;border-radius:9px;background:#f4c51c;color:#17263b;text-decoration:none;font-size:11px;font-weight:900}.belm-tech-workflow__steps{display:grid;grid-template-columns:repeat(8,minmax(90px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px}.belm-tech-workflow__step{position:relative;min-width:108px;padding:12px 8px;border:1px solid rgba(109,173,236,.35);border-radius:11px;background:rgba(5,20,39,.5);text-align:center}.belm-tech-workflow__step span{display:grid;place-items:center;width:28px;height:28px;margin:0 auto 8px;border:2px solid #29a5f5;border-radius:50%;color:#fff;font-size:11px;font-weight:900}.belm-tech-workflow__step b{display:block;color:#fff;font-size:10px;line-height:1.25}.belm-tech-workflow__step em{display:block;margin-top:5px;color:#f4c51c;font-size:8px;font-style:normal;font-weight:900;letter-spacing:.05em}.belm-live-blink{animation:belmLiveSyncBlink 1.15s ease-in-out infinite;will-change:filter,box-shadow,transform}.belm-tech-workflow__step.belm-live-blink{z-index:2;border-color:rgba(70,195,255,.95)}@keyframes belmLiveSyncBlink{0%,100%{filter:brightness(1);box-shadow:0 0 0 rgba(39,169,255,0);transform:translateY(0)}50%{filter:brightness(1.34);box-shadow:0 0 0 2px rgba(255,255,255,.18),0 0 22px rgba(39,169,255,.72);transform:translateY(-2px)}}@media(prefers-reduced-motion:reduce){.belm-live-blink{animation:none!important;filter:brightness(1.18);box-shadow:0 0 0 2px rgba(39,169,255,.35)}}@media(max-width:760px){.belm-tech-workflow__head{align-items:stretch;flex-direction:column}.belm-tech-workflow__checklist{text-align:center}.belm-tech-workflow__steps{grid-template-columns:repeat(8,118px)}}';
    document.head.appendChild(style);
  }

  function updateStaticNavigation() {
    document.querySelectorAll('.belm-nav__item').forEach(function (link) {
      var text = String(link.textContent || '').replace(/\s+/g, ' ').trim();
      if (text === 'Diagnosis & Repair') {
        var nodes = Array.from(link.childNodes).filter(function (node) { return node.nodeType === Node.TEXT_NODE; });
        if (nodes.length) nodes[nodes.length - 1].textContent = ' Inspection / Diagnosis & Report';
      }
    });
  }

  function syncBlinkIndicators(stages, cardValues) {
    var blinkLabels = ['In Progress', 'Waiting for Spares', 'Ready for Testing'];
    document.querySelectorAll('.belm-stat-card').forEach(function (card) {
      var labelEl = card.querySelector('.belm-stat-card__label');
      var label = labelEl ? labelEl.textContent.trim() : '';
      var shouldBlink = blinkLabels.includes(label) && Number(cardValues[label] || 0) > 0;
      card.classList.toggle('belm-live-blink', shouldBlink);
      if (shouldBlink) card.setAttribute('aria-label', label + ': live active status');
      else card.removeAttribute('aria-label');
    });

    var counts = {
      'Received': stages.filter(function (s) { return s === 'Assigned / Receive'; }).length,
      'Inspection / Diagnosis': stages.filter(function (s) { return s === 'Inspection / Diagnosis'; }).length,
      'Diagnosis Report': stages.filter(function (s) { return s === 'Diagnosis Report'; }).length,
      'Waiting for Spare': stages.filter(function (s) { return s === 'Waiting for Spare'; }).length,
      'Repair': stages.filter(function (s) { return s === 'Repair'; }).length,
      'Testing': stages.filter(function (s) { return s === 'Testing'; }).length,
      'Completion Report': stages.filter(function (s) { return s === 'Completion Report'; }).length,
      'Completed': 0
    };

    document.querySelectorAll('.belm-tech-workflow__step').forEach(function (step) {
      var label = step.getAttribute('data-workflow-step') || '';
      var count = Number(counts[label] || 0);
      step.classList.toggle('belm-live-blink', count > 0);
      if (count > 0) step.setAttribute('aria-label', label + ': ' + count + ' active job' + (count === 1 ? '' : 's'));
      else step.removeAttribute('aria-label');
    });
  }

  async function loadTechnicianJobs() {
    if (!token) return;
    var response = await fetch('/api/breakdown-workflow/technician-jobs', {
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!response.ok) return;
    var jobs = await response.json();
    if (!Array.isArray(jobs)) return;

    var active = jobs.filter(function (j) { return !['COMPLETED','CANCELLED'].includes(String(j.status || '').toUpperCase()); });
    var stages = active.map(stageFor);
    var cardValues = {
      'Assigned Jobs': active.length,
      'In Progress': stages.filter(function (s) { return ['Inspection / Diagnosis','Diagnosis Report','Repair','Testing'].includes(s); }).length,
      'Waiting for Spares': stages.filter(function (s) { return s === 'Waiting for Spare'; }).length,
      'Ready for Testing': stages.filter(function (s) { return s === 'Testing' || s === 'Completion Report'; }).length
    };
    document.querySelectorAll('.belm-stat-card').forEach(function (card) {
      var labelEl = card.querySelector('.belm-stat-card__label');
      var valueEl = card.querySelector('.belm-stat-card__value');
      var label = labelEl ? labelEl.textContent.trim() : '';
      if (valueEl && Object.prototype.hasOwnProperty.call(cardValues, label)) valueEl.textContent = String(cardValues[label]);
    });

    syncBlinkIndicators(stages, cardValues);

    var body = document.querySelector('.belm-table tbody');
    if (!body) return;
    body.innerHTML = active.length ? active.slice(0, 5).map(function (job) {
      var stage = stageFor(job);
      var action = nextAction(stage);
      var machine = job.machineLabel || job.machine_model || job.machine || 'Machine';
      var customer = job.customer_name || job.customerName || 'Customer';
      var jobNo = job.job_card_no || job.jobCardNo || 'Job Card';
      return '<tr>' +
        '<td><div class="belm-machine-cell"><span class="belm-machine-cell__name">' + esc(machine) + '</span></div></td>' +
        '<td>' + esc(customer) + '</td>' +
        '<td>' + esc(jobNo) + '</td>' +
        '<td><span class="belm-pill belm-pill--diagnosis">' + esc(stage) + '</span></td>' +
        '<td><div class="belm-action-cell"><a href="/technician-job-cards/" class="belm-btn-sm belm-btn-sm--solid-green">Open Job</a><a href="' + esc(action[1]) + '" class="belm-btn-sm belm-btn-sm--outline-blue">' + esc(action[0]) + '</a></div></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="5">No active Job Cards assigned to this technician.</td></tr>';
  }

  ensureWorkflowPanel();
  updateStaticNavigation();
  loadTechnicianJobs().catch(function (error) { console.warn('BELM technician dashboard live sync:', error); });
  window.setInterval(function () { if (!document.hidden) loadTechnicianJobs().catch(function () {}); }, 30000);
});
