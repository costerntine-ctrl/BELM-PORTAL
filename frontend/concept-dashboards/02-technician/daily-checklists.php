<?php
header('Cache-Control: no-store, no-cache, must-revalidate');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Daily Checklists — BELM Technician</title>
  <link rel="stylesheet" href="assets/css/belm-technician-dashboard.css">
  <link rel="stylesheet" href="assets/css/belm-technician-assigned-scope.css?v=2-daily-scroll-dedupe">
</head>
<body class="belm-admin belm-assigned-page" data-assigned-page="daily">
<div class="belm-shell" id="belmShell">
  <aside class="belm-sidebar">
    <div class="belm-brand"><div class="belm-brand__name">BELM<span class="belm-brand__slash">/</span></div><div class="belm-brand__tag">OPERATIONS PLATFORM</div></div>
    <nav class="belm-nav">
      <a href="index.html" class="belm-nav__item" data-nav="home">⌂ <span>Home</span></a>
      <a href="my-job-cards.php" class="belm-nav__item">▤ <span>My Job Cards</span></a>
      <a href="customer-machines.php" class="belm-nav__item" data-nav="machines">🚜 <span>Customer Machines</span></a>
      <a href="diagnosis-repair.php" class="belm-nav__item">🔧 <span>Diagnosis Report</span></a>
      <a href="spare-requests.php" class="belm-nav__item">⬡ <span>Spare Requests</span></a>
      <a href="testing-completion.php" class="belm-nav__item">✓ <span>Testing &amp; Completion</span></a>
      <a href="daily-checklists.php" class="belm-nav__item is-active" data-nav="daily">☑ <span>Daily Checklists</span></a>
      <a href="communication.php" class="belm-nav__item">✉ <span>Communication</span></a>
      <a href="my-reports.php" class="belm-nav__item">▥ <span>My Reports</span></a>
      <a href="my-profile.php" class="belm-nav__item">♙ <span>My Profile</span></a>
    </nav>
    <div class="belm-nav__divider"></div>
    <div class="belm-sidebar__foot"><a href="logout.php" class="belm-nav__item">↪ <span>Log out</span></a></div>
  </aside>
  <div class="belm-main">
    <header class="belm-topbar"><div class="belm-topbar__left"><button class="belm-topbar__menu" id="sidebarToggle" type="button">☰</button><span class="belm-topbar__kicker">DAILY MACHINE CHECKLISTS</span></div><div class="belm-user"><div><div class="belm-user__name">TECHNICIAN</div><div class="belm-user__role">TECHNICAL DEPARTMENT</div></div></div></header>
    <main class="belm-content">
      <section class="assigned-page-head"><div><small>TECHNICIAN · DAILY CHECK UP</small><h1>Assigned Customer Machines</h1><p>Daily Checklist shows only machine cards belonging to the customer assigned to this technician.</p></div><span class="scope-pill">CHECKLIST SYNC</span></section>
      <div id="dailyRoot" class="assigned-loading">Loading assigned machines and checklist status…</div>
    </main>
  </div>
</div>
<script>
(function(){
  'use strict';
  const token=localStorage.getItem('belm_tech_token')||'';
  const root=document.getElementById('dailyRoot');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const val=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='')return o[k];return''};
  async function api(url){const r=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load Daily Checklists.');return d}
  function eatDay(value){if(!value)return'';try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}catch(_){return String(value).slice(0,10)}}
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const machineStatus=m=>{const s=String(val(m,'status','machineStatus','machine_status')||'UNKNOWN').toUpperCase();if(s.includes('RED')||s.includes('CRITICAL'))return['red','RED'];if(s.includes('YELLOW')||s.includes('ATTENTION')||s.includes('WARNING'))return['yellow','ATTENTION'];if(s.includes('GREEN')||s.includes('NORMAL')||s.includes('OK'))return['green','NORMAL'];return['neutral','NOT CHECKED']};

  function machineKey(m,index){
    const id=String(val(m,'id')).trim();
    if(id)return'id:'+id;
    const serial=String(val(m,'serialNumber','serial_number')).trim().toUpperCase();
    if(serial&&serial!=='—')return'serial:'+serial;
    const reg=String(val(m,'regNumber','reg_number')).trim().toUpperCase();
    if(reg&&reg!=='—')return'reg:'+reg;
    const fleet=String(val(m,'fleetNumber','fleet_number')).trim().toUpperCase();
    if(fleet&&fleet!=='—')return'fleet:'+fleet;
    return'row:'+index+':'+String(val(m,'brand'))+':'+String(val(m,'model'));
  }

  function dedupeMachines(list){
    const seen=new Map();
    (Array.isArray(list)?list:[]).forEach((m,index)=>{
      if(!m||typeof m!=='object')return;
      const key=machineKey(m,index);
      if(!seen.has(key))seen.set(key,m);
      else seen.set(key,{...seen.get(key),...m});
    });
    return Array.from(seen.values());
  }

  function checklistTime(row){
    const raw=val(row,'createdAt','created_at','submittedAt','submitted_at','updatedAt','updated_at')||'';
    const ts=Date.parse(raw);
    return Number.isFinite(ts)?ts:0;
  }

  function card(m,latest){const s=machineStatus(m),id=val(m,'id'),label=val(m,'label')||[val(m,'brand'),val(m,'model')].filter(Boolean).join(' ')||val(m,'machineType','machine_type')||'Machine',fleet=val(m,'fleetNumber','fleet_number')||'—',serial=val(m,'serialNumber','serial_number')||'—',reg=val(m,'regNumber','reg_number')||'—';const checked=latest&&eatDay(latest.createdAt||latest.created_at||latest.submittedAt||latest.submitted_at)===today();const state=checked?`<div class="daily-state checked">✓ Checked today · ${esc(latest.templateName||latest.template_name||'Checklist')} · ${esc(latest.status||'GREEN')} · Hrs ${esc(latest.hourMeterReading??latest.hour_meter_reading??'—')}</div>`:`<div class="daily-state attention">! Daily check pending for today</div>`;return `<article class="assigned-machine-card status-${s[0]}" data-machine-id="${esc(id)}"><div class="machine-card-top"><div><small>DAILY CHECKLIST MACHINE</small><h3>${esc(label)}</h3><p>Fleet ${esc(fleet)}</p></div><span class="machine-status-pill">${esc(s[1])}</span></div><div class="machine-card-info"><div><span>Fleet No.</span><b>${esc(fleet)}</b></div><div><span>Serial No.</span><b>${esc(serial)}</b></div><div><span>Registration</span><b>${esc(reg)}</b></div></div>${state}<div class="machine-actions"><a class="gold" href="/tech?view=machines&machine=${encodeURIComponent(id)}">Open Machine Check Up</a><a href="/tech-report/?machineId=${encodeURIComponent(id)}&category=checklists">Checklist Reports</a><a href="/technician-job-cards/?machine=${encodeURIComponent(id)}">Job Cards</a></div></article>`}

  async function load(){
    if(!token){location.replace('/login');return}
    try{
      const report=await api('/api/checklist-reports/technician-general');
      let customer={id:report.customer?.id||'',name:report.customer?.name||'Assigned Customer'};
      const reportMachines=Array.isArray(report.machines)?report.machines:[];
      let richerMachines=[];
      try{
        const richer=await api('/api/customers/'+encodeURIComponent(customer.id));
        if(richer&&richer.id){customer={...customer,...richer};if(Array.isArray(richer.machines))richerMachines=richer.machines}
      }catch(_){}

      const machines=dedupeMachines([...reportMachines,...richerMachines]);
      const latest=new Map();
      (Array.isArray(report.checklists)?report.checklists:[]).forEach(r=>{
        const id=String(r.machineId||r.machine_id||'');
        if(!id)return;
        const current=latest.get(id);
        if(!current||checklistTime(r)>=checklistTime(current))latest.set(id,r);
      });

      root.className='';
      root.innerHTML=`<section class="assigned-customer-card"><div class="assigned-customer-top"><div><small>ASSIGNED CUSTOMER</small><h2>${esc(customer.name)}</h2></div><div class="assigned-customer-count"><b>${machines.length}</b><span>Checklist Machines</span></div></div><div class="assigned-customer-meta"><div><span>Scope</span><b>Assigned customer only</b></div><div><span>Checklist Date</span><b>${esc(today())}</b></div><div><span>Sync</span><b>Live machine records</b></div></div></section><div class="machine-section-head"><div><small>DAILY CHECKLIST</small><h2>Select Machine Card</h2></div><span>${machines.length} machine${machines.length===1?'':'s'} · swipe/scroll sideways</span></div><div class="daily-machine-scroll" aria-label="Assigned customer machine cards"><section class="assigned-machine-grid">${machines.length?machines.map(m=>card(m,latest.get(String(m.id)))).join(''):'<div class="assigned-empty">No registered machines found for this assigned customer.</div>'}</section></div>`;
    }catch(e){root.className='assigned-error';root.textContent=e.message}
  }

  document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('belmShell')?.classList.toggle('is-sidebar-open'));
  load();
})();
</script>
</body>
</html>