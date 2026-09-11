<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Assigned Customer Machines — BELM Technician</title>
  <link rel="stylesheet" href="assets/css/belm-technician-dashboard.css">
  <link rel="stylesheet" href="assets/css/belm-technician-assigned-scope.css?v=1">
</head>
<body class="belm-admin belm-assigned-page" data-assigned-page="machines">
<div class="belm-shell" id="belmShell">
  <aside class="belm-sidebar">
    <div class="belm-brand"><div class="belm-brand__name">BELM<span class="belm-brand__slash">/</span></div><div class="belm-brand__tag">OPERATIONS PLATFORM</div></div>
    <nav class="belm-nav">
      <a href="index.html" class="belm-nav__item" data-nav="home">⌂ <span>Home</span></a>
      <a href="my-job-cards.php" class="belm-nav__item">▤ <span>My Job Cards</span></a>
      <a href="customer-machines.php" class="belm-nav__item is-active" data-nav="machines">🚜 <span>Customer Machines</span></a>
      <a href="diagnosis-repair.php" class="belm-nav__item">🔧 <span>Diagnosis Report</span></a>
      <a href="spare-requests.php" class="belm-nav__item">⬡ <span>Spare Requests</span></a>
      <a href="testing-completion.php" class="belm-nav__item">✓ <span>Testing &amp; Completion</span></a>
      <a href="daily-checklists.php" class="belm-nav__item" data-nav="daily">☑ <span>Daily Checklists</span></a>
      <a href="communication.php" class="belm-nav__item">✉ <span>Communication</span></a>
      <a href="my-reports.php" class="belm-nav__item">▥ <span>My Reports</span></a>
      <a href="my-profile.php" class="belm-nav__item">♙ <span>My Profile</span></a>
    </nav>
    <div class="belm-nav__divider"></div>
    <div class="belm-sidebar__foot"><a href="logout.php" class="belm-nav__item">↪ <span>Log out</span></a></div>
  </aside>

  <div class="belm-main">
    <header class="belm-topbar"><div class="belm-topbar__left"><button class="belm-topbar__menu" id="sidebarToggle" type="button">☰</button><span class="belm-topbar__kicker">ASSIGNED CUSTOMER SCOPE</span></div><div class="belm-user"><div><div class="belm-user__name">TECHNICIAN</div><div class="belm-user__role">TECHNICAL DEPARTMENT</div></div></div></header>
    <main class="belm-content">
      <section class="assigned-page-head"><div><small>TECHNICIAN · CUSTOMER ASSIGNMENT</small><h1>My Assigned Customer</h1><p>Only the customer assigned to this technician and that customer's registered machines are shown here.</p></div><span class="scope-pill">LIVE ASSIGNMENT</span></section>
      <div id="assignedCustomerRoot" class="assigned-loading">Loading assigned customer and machines…</div>
    </main>
  </div>
</div>
<script>
(function(){
  'use strict';
  const token=localStorage.getItem('belm_tech_token')||'';
  const root=document.getElementById('assignedCustomerRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const val=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='')return o[k];return''};
  const status=m=>{const s=String(val(m,'status','machineStatus','machine_status')||'UNKNOWN').toUpperCase();if(s.includes('RED')||s.includes('CRITICAL'))return['red','RED'];if(s.includes('YELLOW')||s.includes('ATTENTION')||s.includes('WARNING'))return['yellow','ATTENTION'];if(s.includes('GREEN')||s.includes('NORMAL')||s.includes('OK'))return['green','NORMAL'];return['neutral','NOT CHECKED']};
  async function api(url){const r=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load assigned customer.');return d}
  function card(m){const s=status(m),id=val(m,'id'),label=val(m,'label')||[val(m,'brand'),val(m,'model')].filter(Boolean).join(' ')||val(m,'machineType','machine_type')||'Machine';const fleet=val(m,'fleetNumber','fleet_number')||'—',serial=val(m,'serialNumber','serial_number')||'—',reg=val(m,'regNumber','reg_number')||'—';return `<article class="assigned-machine-card status-${s[0]}"><div class="machine-card-top"><div><small>ASSIGNED CUSTOMER MACHINE</small><h3>${esc(label)}</h3><p>Fleet ${esc(fleet)}</p></div><span class="machine-status-pill">${esc(s[1])}</span></div><div class="machine-card-info"><div><span>Fleet No.</span><b>${esc(fleet)}</b></div><div><span>Serial No.</span><b>${esc(serial)}</b></div><div><span>Registration</span><b>${esc(reg)}</b></div></div><div class="machine-actions"><a class="primary" href="/tech?view=machines&machine=${encodeURIComponent(id)}">Open Machine</a><a href="/technician-job-cards/?machine=${encodeURIComponent(id)}">Job Cards</a><a href="/tech-report/?machineId=${encodeURIComponent(id)}&category=checklists">Reports</a></div></article>`}
  async function load(){if(!token){location.replace('/login');return}try{const report=await api('/api/checklist-reports/technician-general');let customer={id:report.customer?.id||'',name:report.customer?.name||'Assigned Customer'},machines=Array.isArray(report.machines)?report.machines:[];try{const richer=await api('/api/customers/'+encodeURIComponent(customer.id));if(richer&&richer.id){customer={...customer,...richer};if(Array.isArray(richer.machines))machines=richer.machines}}catch(_){}root.className='';root.innerHTML=`<section class="assigned-customer-card"><div class="assigned-customer-top"><div><small>ASSIGNED CUSTOMER</small><h2>${esc(customer.name)}</h2></div><div class="assigned-customer-count"><b>${machines.length}</b><span>Registered Machines</span></div></div><div class="assigned-customer-meta"><div><span>Address</span><b>${esc(val(customer,'address')||'Not recorded')}</b></div><div><span>Email</span><b>${esc(val(customer,'email')||'Not recorded')}</b></div><div><span>Phone</span><b>${esc(val(customer,'phone','contact')||'Not recorded')}</b></div></div></section><div class="machine-section-head"><div><small>AUTHORIZED MACHINE SCOPE</small><h2>Customer Machines</h2></div><span>${machines.length} machine${machines.length===1?'':'s'}</span></div><section class="assigned-machine-grid">${machines.length?machines.map(card).join(''):'<div class="assigned-empty">No registered machines found for this assigned customer.</div>'}</section>`}catch(e){root.className='assigned-error';root.textContent=e.message}}
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('belmShell')?.classList.toggle('is-sidebar-open'));
  load();
})();
</script>
</body>
</html>