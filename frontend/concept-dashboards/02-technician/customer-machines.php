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
  <link rel="stylesheet" href="assets/css/belm-technician-assigned-scope.css?v=6">
  <style>
    @keyframes belmJobCardAlertBlink{
      0%,100%{background:rgba(255,255,255,.07);box-shadow:0 0 0 rgba(255,193,7,0);filter:brightness(1)}
      50%{background:linear-gradient(135deg,#f6c51e,#ff9f1a);color:#14243a;box-shadow:0 0 0 2px rgba(255,255,255,.18),0 0 24px rgba(246,197,30,.85);filter:brightness(1.15)}
    }
    .belm-nav__item.job-card-alert-blink{animation:belmJobCardAlertBlink 1s ease-in-out infinite;border:1px solid rgba(246,197,30,.85)}
    .belm-nav__item.job-card-alert-blink span{font-weight:950}
    .technician-customer-card{min-height:0!important}
    .technician-customer-feed{flex:0 0 auto!important;min-height:0!important;margin-top:12px!important;margin-bottom:12px!important;padding:14px!important}
    .technician-customer-feed-head{margin-bottom:10px!important}
    .technician-customer-feed-body{display:block!important;min-height:0!important;overflow:hidden!important}
    .technician-customer-feed-row{min-height:118px;max-height:145px;overflow:hidden;padding:12px 13px!important}
    .technician-customer-feed-row p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;margin:6px 0!important;line-height:1.35!important}
    .technician-customer-feed-row small{display:block;margin-top:4px}
    .selected-machine-shell{width:min(860px,100%);margin:8px auto 0}
    .selected-machine-shell .assigned-machine-card{width:100%;margin:0}
    .selected-machine-shell .machine-actions{grid-template-columns:repeat(3,minmax(0,1fr))}
    .selected-machine-customer{margin:0;color:#8eb2cf;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .selected-machine-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:10px 12px;border:1px solid rgba(82,157,217,.35);border-radius:12px;background:rgba(5,33,61,.75)}
    .selected-machine-toolbar__left{display:flex;align-items:center;gap:10px;min-width:0}
    .selected-machine-toolbar__back,.selected-machine-pager button{border:1px solid #2b87ca;border-radius:9px;background:#0b4d80;color:#fff;padding:9px 12px;font-weight:900;cursor:pointer}
    .selected-machine-pager{display:flex;align-items:center;gap:8px}
    .selected-machine-pager span{color:#c6d8e8;font-size:11px;font-weight:900;white-space:nowrap}
    .selected-machine-pager button:disabled{opacity:.35;cursor:not-allowed}
    .selected-machine-empty{padding:28px;border:1px solid rgba(82,157,217,.35);border-radius:14px;background:#071d34;color:#bfd1e2;text-align:center;font-weight:800}
    @media(max-width:620px){.selected-machine-shell .machine-actions{grid-template-columns:1fr}.selected-machine-toolbar{align-items:stretch;flex-direction:column}.selected-machine-pager{justify-content:space-between}.selected-machine-pager button{flex:1}}
    @media(prefers-reduced-motion:reduce){.belm-nav__item.job-card-alert-blink{animation:none;background:#f6c51e;color:#14243a;box-shadow:0 0 0 2px rgba(246,197,30,.3)}}
  </style>
</head>
<body class="belm-admin belm-assigned-page" data-assigned-page="machines">
<div class="belm-shell" id="belmShell">
  <aside class="belm-sidebar">
    <div class="belm-brand"><div class="belm-brand__name">BELM<span class="belm-brand__slash">/</span></div><div class="belm-brand__tag">OPERATIONS PLATFORM</div></div>
    <nav class="belm-nav">
      <a href="index.html" class="belm-nav__item" data-nav="home">⌂ <span>Home</span></a>
      <a href="my-job-cards.php" class="belm-nav__item" id="myJobCardsNav">▤ <span>My Job Cards</span></a>
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
      <section class="assigned-page-head"><div><small>TECHNICIAN · CUSTOMER ASSIGNMENT</small><h1>My Assigned Customer</h1><p>The approved customer card is shown exactly for the company assigned to this technician. Access switches are view-only here.</p></div><span class="scope-pill">LIVE ASSIGNMENT</span></section>
      <div id="assignedCustomerRoot" class="assigned-loading">Loading assigned customer…</div>
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
  const bool=v=>v===true||v===1||v==='1'||String(v||'').toLowerCase()==='true';
  const status=m=>{const s=String(val(m,'status','machineStatus','machine_status')||'UNKNOWN').toUpperCase();if(s.includes('RED')||s.includes('CRITICAL'))return['red','RED'];if(s.includes('YELLOW')||s.includes('ATTENTION')||s.includes('WARNING'))return['yellow','ATTENTION'];if(s.includes('GREEN')||s.includes('NORMAL')||s.includes('OK'))return['green','NORMAL'];return['neutral','NOT CHECKED']};
  const fmt=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})};
  async function api(url){const r=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load assigned customer.');return d}

  function selectedMachineCard(m,customer,index,total){
    const s=status(m),id=val(m,'id'),label=val(m,'label')||[val(m,'brand'),val(m,'model')].filter(Boolean).join(' ')||val(m,'machineType','machine_type')||'Machine';
    const type=val(m,'machineType','machine_type')||'Machine',brand=val(m,'brand')||'—',model=val(m,'model')||'—',fleet=val(m,'fleetNumber','fleet_number')||'—',serial=val(m,'serialNumber','serial_number')||'—',reg=val(m,'regNumber','reg_number')||'—';
    const pager=total>1?`<div class="selected-machine-pager"><button type="button" data-machine-prev ${index===0?'disabled':''}>← Previous</button><span>Machine ${index+1} of ${total}</span><button type="button" data-machine-next ${index===total-1?'disabled':''}>Next →</button></div>`:`<div class="selected-machine-pager"><span>1 Machine</span></div>`;
    return `<section class="selected-machine-shell"><div class="selected-machine-toolbar"><div class="selected-machine-toolbar__left"><button type="button" class="selected-machine-toolbar__back" data-back-customer>← Back to Customer</button><p class="selected-machine-customer">${esc(customer.name)} · Technician Machine Card</p></div>${pager}</div><article class="assigned-machine-card status-${s[0]}"><div class="machine-card-top"><div><small>${esc(type)}</small><h3>${esc(label)}</h3><p>${esc(brand)} ${esc(model)}</p></div><span class="machine-status-pill">${esc(s[1])}</span></div><div class="machine-card-info"><div><span>Fleet No.</span><b>${esc(fleet)}</b></div><div><span>Serial No.</span><b>${esc(serial)}</b></div><div><span>Registration</span><b>${esc(reg)}</b></div></div><div class="machine-actions"><a class="primary" href="daily-checklists.php?machine=${encodeURIComponent(id)}">Check Up</a><a href="/technician-job-cards/?machine=${encodeURIComponent(id)}">Job Card</a><a href="/tech-report/?machineId=${encodeURIComponent(id)}&category=checklists">Checked Report</a></div></article></section>`;
  }

  function readonlyToggle(label,on,stateOn,stateOff){return `<div class="tech-readonly-toggle ${on?'on':'off'}"><span class="toggle-label">${esc(label)}</span><span class="tech-toggle-track" aria-hidden="true"></span><span class="toggle-state">${esc(on?stateOn:stateOff)}</span></div>`}

  const communicationSlots=[
    {key:'service',title:'Service Reminder',empty:'No new service reminder.',match:/service reminder|service due|maintenance due|service overdue|next service|scheduled service/i},
    {key:'operator',title:'Operator Report',empty:'No new operator report.',match:/operator report|operator|operation report|daily check|daily checklist/i},
    {key:'job',title:'Job Card Alert',empty:'No new job card alert.',match:/job card|jobcard|technician dispatch|assigned job|diagnosis report|waiting for spare|testing|completed/i}
  ];
  const communicationText=item=>[item?.subject,item?.title,item?.message,item?.body,item?.description,item?.type,item?.category].filter(Boolean).join(' ');
  const randomItem=items=>items[Math.floor(Math.random()*items.length)];
  function communicationCard(slot,items){const matches=(Array.isArray(items)?items:[]).filter(item=>slot.match.test(communicationText(item)));const item=matches.length?randomItem(matches):null;if(!item)return `<article class="technician-customer-feed-row is-placeholder feed-${slot.key}"><b>${esc(slot.title)}</b><p>${esc(slot.empty)}</p><small>Standing alert slot</small></article>`;return `<article class="technician-customer-feed-row feed-${slot.key}"><b>${esc(slot.title)}</b><p>${esc(item.message||item.body||item.description||item.subject||item.title||'New message available.')}</p><small>${esc(fmt(item.createdAt||item.created_at||item.updatedAt||item.updated_at))}</small></article>`}
  let communicationOrder=[],communicationIndex=0;
  function nextCommunicationSlot(){if(communicationIndex>=communicationOrder.length){communicationOrder=[...communicationSlots];for(let i=communicationOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[communicationOrder[i],communicationOrder[j]]=[communicationOrder[j],communicationOrder[i]]}communicationIndex=0}return communicationOrder[communicationIndex++]}
  function startCommunicationRotation(items){const body=document.getElementById('communicationFeedBody');if(!body)return;const render=()=>{body.innerHTML=communicationCard(nextCommunicationSlot(),items)};render();window.setInterval(render,9000)}

  function jobNeedsAttention(job){const s=String(job?.status||'').toUpperCase();const stage=String(job?.current_stage||job?.currentStage||'').toUpperCase();if(['COMPLETED','CANCELLED'].includes(s)||stage==='COMPLETED')return false;const explicitNew=['ASSIGNED','OPEN','OPENED','NEW','DISPATCHED','PENDING_RECEIVE'].includes(s)||['ASSIGNED','OPENED','DISPATCHED','PENDING_RECEIVE'].includes(stage);if(explicitNew)return true;const started=Boolean(job?.started_at||job?.startedAt);const hasProgress=Boolean(String(job?.diagnosis||'').trim()||String(job?.work_done||job?.workDone||'').trim()||String(job?.test_result||job?.testResult||'').trim());return !started&&!hasProgress&&s!=='RECEIVED'&&stage!=='RECEIVED'}
  async function syncJobCardAlert(){const nav=document.getElementById('myJobCardsNav');if(!nav||!token)return;try{const jobs=await api('/api/breakdown-workflow/technician-jobs');const count=Array.isArray(jobs)?jobs.filter(jobNeedsAttention).length:0;nav.classList.toggle('job-card-alert-blink',count>0);if(count>0){nav.setAttribute('title',`${count} new Job Card alert${count===1?'':'s'}`);nav.setAttribute('aria-label',`My Job Cards: ${count} new alert${count===1?'':'s'}`)}else{nav.removeAttribute('title');nav.removeAttribute('aria-label')}}catch(_){nav.classList.remove('job-card-alert-blink')}}
  function startJobCardAlertWatch(){syncJobCardAlert();window.setInterval(syncJobCardAlert,15000)}

  function bindMachineView(machines,customer){
    const view=document.getElementById('viewAssignedMachines');
    const panel=document.getElementById('customerMachinePanel');
    const selected=document.getElementById('selectedMachinePanel');
    const customerCard=document.querySelector('.technician-customer-card');
    if(!view||!panel||!selected||!customerCard)return;
    let current=0;
    const requested=new URLSearchParams(location.search).get('machine')||'';
    if(requested){const i=machines.findIndex(m=>String(val(m,'id'))===String(requested));if(i>=0)current=i}
    const renderSelected=()=>{
      if(!machines.length){selected.innerHTML='<div class="selected-machine-empty">No registered machines found for this assigned customer.</div>';return}
      selected.innerHTML=selectedMachineCard(machines[current],customer,current,machines.length);
    };
    const openViewer=()=>{
      renderSelected();
      customerCard.hidden=true;
      panel.hidden=false;
      panel.scrollIntoView({behavior:'smooth',block:'start'});
    };
    const closeViewer=()=>{
      panel.hidden=true;
      selected.innerHTML='';
      customerCard.hidden=false;
      customerCard.scrollIntoView({behavior:'smooth',block:'start'});
    };
    view.addEventListener('click',e=>{e.preventDefault();openViewer()});
    panel.addEventListener('click',e=>{
      const back=e.target.closest('[data-back-customer]');
      if(back){e.preventDefault();closeViewer();return}
      const prev=e.target.closest('[data-machine-prev]');
      if(prev&&current>0){e.preventDefault();current-=1;renderSelected();return}
      const next=e.target.closest('[data-machine-next]');
      if(next&&current<machines.length-1){e.preventDefault();current+=1;renderSelected();return}
    });
    if(requested&&machines.length)openViewer();
  }

  async function load(){
    if(!token){location.replace('/login');return}
    try{
      const report=await api('/api/checklist-reports/technician-general');
      let customer={id:report.customer?.id||'',name:report.customer?.name||'Assigned Customer'},machines=Array.isArray(report.machines)?report.machines:[];
      try{const richer=await api('/api/customers/'+encodeURIComponent(customer.id));if(richer&&richer.id){customer={...customer,...richer};if(Array.isArray(richer.machines))machines=richer.machines}}catch(_){}
      let comm=[];try{comm=await api('/api/customers/'+encodeURIComponent(customer.id)+'/communications')}catch(_){}
      const active=Number(val(customer,'isActive','is_active')||1)===1;
      const belmProvider=bool(val(customer,'belmServiceProviderActive','belm_service_provider_active'))||!bool(val(customer,'isMachineryAdmin','is_machinery_admin'));
      root.className='';root.innerHTML=`
        <section class="technician-customer-card">
          <div class="technician-customer-head">
            <div class="technician-customer-title">
              <p class="technician-customer-eyebrow">Customer</p><h2>${esc(customer.name)}</h2>
              <div class="technician-customer-contact">
                <div><span>Phone</span><b title="${esc(val(customer,'phone','contact')||'Not recorded')}">${esc(val(customer,'phone','contact')||'Not recorded')}</b></div>
                <div><span>Email</span><b title="${esc(val(customer,'email')||'Not recorded')}">${esc(val(customer,'email')||'Not recorded')}</b></div>
                <div><span>Address</span><b title="${esc(val(customer,'address')||'Not recorded')}">${esc(val(customer,'address')||'Not recorded')}</b></div>
              </div>
            </div>
            <div class="technician-customer-controls"><span class="technician-customer-badge ${active?'':'off'}">${active?'Active':'Inactive'}</span>${readonlyToggle(customer.name,belmProvider,'BELM ON','CUSTOMER ON')}${readonlyToggle('Non-payment',active,'PORTAL ON','PORTAL OFF')}</div>
          </div>
          <section class="technician-customer-feed"><div class="technician-customer-feed-head"><strong>Communication<br>history</strong><a href="communication.php">View all</a></div><div class="technician-customer-feed-body" id="communicationFeedBody" aria-live="polite"></div></section>
          <div class="technician-customer-note">Customer management switches are read-only for Technician.</div>
          <nav class="technician-customer-actions"><a href="#customerMachinePanel" id="viewAssignedMachines">View Machine</a></nav>
        </section>
        <div id="customerMachinePanel" hidden><div id="selectedMachinePanel"></div></div>`;
      bindMachineView(machines,customer);
      startCommunicationRotation(comm);
      startJobCardAlertWatch();
    }catch(e){root.className='assigned-error';root.textContent=e.message}
  }
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('belmShell')?.classList.toggle('is-sidebar-open'));
  load();
})();
</script>
</body>
</html>