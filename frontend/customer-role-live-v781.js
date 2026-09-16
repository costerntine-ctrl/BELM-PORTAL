(function(){
  'use strict';
  if (window.__belmCustomerRoleLiveV781) return;
  window.__belmCustomerRoleLiveV781 = true;

  const role = document.body.dataset.customerMirrorRole || '';
  const qs = (s,root=document)=>root.querySelector(s);
  const qsa = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const esc = (v)=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=(v)=>{ if(!v)return '—'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); };
  const fmtDateTime=(v)=>{ if(!v)return '—'; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); };

  function decodeToken(token){
    try{ let raw=(token.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/'); raw+='='.repeat((4-raw.length%4)%4); return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''))); }catch(_){ return {}; }
  }
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const techToken=localStorage.getItem('belm_tech_token')||'';
  const operatorToken=localStorage.getItem('belm_operator_token')||'';
  const active=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
  let token='';
  let tokenType='customer';
  if(role==='operator' && operatorToken){ token=operatorToken; tokenType='operator'; }
  else if(role==='technician' && (active==='technician'||(!customerToken&&techToken))){ token=techToken; tokenType='technician'; }
  else { token=customerToken || techToken; tokenType=token===techToken?'technician':'customer'; }
  if(!token){ location.replace(role==='operator'?'/operator/':'/login'); return; }
  const session=decodeToken(token);

  async function customerApi(path){
    const res=await fetch('/api/customer-portal'+path,{cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});
    const text=await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch(_){}
    if(!res.ok){ if(res.status===401){clearSession(); location.replace('/login');} throw new Error(data.error||('Request failed ('+res.status+')')); }
    return data;
  }
  async function operatorApi(action){
    const res=await fetch('/api/operator?action='+encodeURIComponent(action),{cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+operatorToken}});
    const text=await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch(_){}
    if(!res.ok){ if(res.status===401){localStorage.removeItem('belm_operator_token'); location.replace('/operator/');} throw new Error(data.error||('Request failed ('+res.status+')')); }
    return data;
  }
  function clearSession(){
    ['belm_customer_token','belm_tech_token','belm_tech_user','belm_operator_token','belm_active_account_type'].forEach(k=>localStorage.removeItem(k));
  }

  function findStat(label){
    return qsa('.belm-stat-card').find(card=>String(qs('.belm-stat-card__label',card)?.textContent||'').trim().toLowerCase()===label.toLowerCase())||null;
  }
  function setStat(label,value,hint){
    const card=findStat(label); if(!card)return;
    const v=qs('.belm-stat-card__value',card); if(v)v.textContent=value==null?'—':String(value);
    const h=qs('.belm-stat-card__hint,.belm-stat-card__delta',card); if(h&&hint!=null)h.textContent=String(hint);
  }
  function findPanel(title){
    const t=qsa('.belm-panel__title').find(x=>String(x.textContent||'').replace(/\s+/g,' ').trim().toLowerCase()===title.toLowerCase());
    return t?t.closest('.belm-panel'):null;
  }
  function companyName(dash){ return dash?.customer?.name || dash?.customerName || session.name || 'Customer'; }
  function actorName(){ return session.actorName || session.name || 'User'; }
  function setCompany(dash){
    const name=companyName(dash);
    qsa('[data-company-name],[data-company-name-upper]').forEach(el=>{el.textContent=el.hasAttribute('data-company-name-upper')?name.toUpperCase():name;});
    const heroSub=qs('.belm-hero__subtitle'); if(heroSub && !heroSub.dataset.fixed) heroSub.textContent=name;
    return name;
  }
  function setActor(name){
    qsa('[data-actor-name],[data-operator-name]').forEach(el=>el.textContent=String(name||'User').toUpperCase());
    const userName=qs('.belm-user__name'); if(userName && role!=='admin') userName.textContent=String(name||role).toUpperCase();
  }
  function statusText(s){ return String(s||'OPEN').replace(/_/g,' '); }
  function pill(s){
    const x=String(s||'').toUpperCase();
    let cls='belm-pill';
    if(x.includes('COMPLETE')||x.includes('READY')||x.includes('PAID'))cls+=' belm-pill--completed';
    else if(x.includes('WAIT')||x.includes('PENDING')||x.includes('OVERDUE'))cls+=' belm-pill--testing';
    else cls+=' belm-pill--approved';
    return '<span class="'+cls+'">'+esc(statusText(s))+'</span>';
  }
  function machineLabel(m){ return [m?.brand,m?.model].filter(Boolean).join(' ') || m?.machineType || m?.machine_type || m?.fleetNumber || m?.fleet_number || 'Machine'; }
  function machineStatus(m){ return String(m?.status||m?.machineStatus||m?.machine_status||'UNKNOWN').toUpperCase(); }
  function isAttention(m){ const s=machineStatus(m); return /RED|CRITICAL|YELLOW|WARNING|ATTENTION/.test(s); }
  function isRed(m){ return /RED|CRITICAL/.test(machineStatus(m)); }

  function initShell(){
    const shell=qs('#belmShell'); const toggle=qs('#sidebarToggle');
    if(toggle&&shell) toggle.addEventListener('click',()=>shell.classList.toggle('is-sidebar-open'));
    const theme=qs('#themeToggle');
    if(localStorage.getItem('belm-theme')==='light') document.body.classList.add('belm-light');
    if(theme){
      theme.addEventListener('click',()=>{ const light=document.body.classList.toggle('belm-light'); localStorage.setItem('belm-theme',light?'light':'dark'); });
    }
    const logout=qs('#logout');
    if(logout) logout.addEventListener('click',e=>{e.preventDefault(); clearSession(); location.replace('/login');});
  }

  async function loadAdmin(){
    const [dash,stats]=await Promise.all([customerApi('/dashboard'),customerApi('/dashboard-stats').catch(()=>({}))]);
    const name=setCompany(dash); const machines=Array.isArray(dash?.machines)?dash.machines:[];
    setStat('Registered Machines',machines.length,'Live company fleet');
    setStat('Machines Needing Attention',machines.filter(isAttention).length,'Red + yellow conditions');
    setStat('Open Job Cards',stats?.openJobCards??0,'Active maintenance work');
    setStat('Pending Approvals',stats?.pendingApprovals??0,'Waiting for company action');

    const fleet=qs('#fleetStatusBars');
    if(fleet){
      const counts={green:0,yellow:0,red:0,unknown:0};
      machines.forEach(m=>{const s=machineStatus(m); if(/RED|CRITICAL/.test(s))counts.red++; else if(/YELLOW|WARNING|ATTENTION/.test(s))counts.yellow++; else if(/GREEN|NORMAL|OK/.test(s))counts.green++; else counts.unknown++;});
      fleet.innerHTML=[['Normal / Green',counts.green,'green'],['Warning / Yellow',counts.yellow,'amber'],['Critical / Red',counts.red,'red'],['Not Checked',counts.unknown,'amber']].map(([label,count,c])=>'<div class="belm-alert-row" style="cursor:default"><span class="belm-alert-row__icon belm-alert-row__icon--'+c+'"></span><span class="belm-alert-row__label">'+label+'</span><span class="belm-alert-row__count">'+count+'</span></div>').join('');
    }
    const alerts=qs('#alertList');
    if(alerts){
      const rows=machines.filter(isAttention).sort((a,b)=>(isRed(b)?1:0)-(isRed(a)?1:0)).slice(0,6);
      alerts.innerHTML=rows.length?rows.map(m=>'<a class="belm-alert-row" href="/portal/dashboard?view=machines&machine='+encodeURIComponent(m.id||'')+'"><span class="belm-alert-row__icon belm-alert-row__icon--'+(isRed(m)?'red':'amber')+'"></span><span class="belm-alert-row__label">'+esc(machineLabel(m))+'</span><span class="belm-alert-row__count">'+esc(machineStatus(m))+'</span></a>').join(''):'<div class="belm-alert-row"><span class="belm-alert-row__label">No active machine alerts.</span></div>';
    }
    const body=qs('#activityBody');
    if(body){ const rows=Array.isArray(stats?.recentActivity)?stats.recentActivity:[]; body.innerHTML=rows.length?rows.slice(0,10).map(r=>'<tr><td>'+esc(fmtDateTime(r.at||r.createdAt))+'</td><td>'+esc(r.label||r.action||'Activity')+'</td><td>'+esc(r.reference||r.referenceNo||'—')+'</td><td>'+esc(r.user||r.actorName||name)+'</td><td>'+pill(r.status||'RECORDED')+'</td></tr>').join(''):'<tr><td colspan="5">No recent activity yet.</td></tr>'; }
  }

  async function loadTechnician(){
    const [dash,jobs]=await Promise.all([customerApi('/dashboard'),customerApi('/service-requests?mine=1')]);
    const name=setCompany(dash); setActor(actorName());
    const list=Array.isArray(jobs)?jobs:[];
    const st=x=>String(x?.status||'').toUpperCase();
    const assigned=list.filter(j=>['OPEN','ASSIGNED','RECEIVED'].includes(st(j)));
    const progress=list.filter(j=>['IN_PROGRESS','DIAGNOSIS','REPAIR'].includes(st(j)));
    const waiting=list.filter(j=>/WAIT|SPARE|PROCUREMENT/.test(st(j)));
    const testing=list.filter(j=>st(j)==='TESTING');
    setStat('Assigned Jobs',assigned.length,'Jobs allocated to me');
    setStat('In Progress',progress.length,'Currently working');
    setStat('Waiting for Spares',waiting.length,'Awaiting parts');
    setStat('Ready for Testing',testing.length,'Ready to test');
    const comm=qs('#communicationList');
    if(comm) comm.innerHTML='<a href="/role-communications/" class="belm-comm-item"><span class="belm-comm-item__content"><strong>Company Communication</strong><span>Open messages for '+esc(name)+' workshop team.</span></span></a>';
    const body=qs('#jobsBody');
    if(body){
      const activeJobs=list.filter(j=>!['COMPLETED','CANCELLED'].includes(st(j)));
      body.innerHTML=activeJobs.length?activeJobs.slice(0,15).map(j=>{
        const id=j.id||''; const jc=j.jobCardNo||j.job_card_no||('JC-'+String(id).slice(0,8).toUpperCase());
        return '<tr><td>'+esc(machineLabel(j.machine))+'</td><td>'+esc(name)+'</td><td>'+esc(jc||'Job Card')+'</td><td>'+pill(j.status)+'</td><td><a href="/technician-job-cards/?job='+encodeURIComponent(id)+'" class="belm-btn-sm belm-btn-sm--solid-green">Open Job</a></td></tr>';
      }).join(''):'<tr><td colspan="5">No active job cards assigned.</td></tr>';
    }
  }

  async function loadProcurement(){
    const [dash,summary]=await Promise.all([customerApi('/dashboard'),customerApi('/procurement-summary')]);
    const name=setCompany(dash); setActor(actorName()||'Procurement');
    const items=Array.isArray(summary?.items)?summary.items:[]; const c=summary?.counts||{};
    setStat('Purchase Requests',items.length,'Total live requests');
    setStat('Pending Proforma',(c.pending||0)+(c.purchaseRequired||0),'Awaiting sourcing / comparison');
    setStat('Approved Orders',(c.ordered||0)+(c.partsReady||0),'Ordered or ready');
    setStat('Awaiting Delivery',c.ordered||0,'Ordered items in progress');
    const body=qs('#requestsBody');
    if(body) body.innerHTML=items.length?items.slice(0,20).map(r=>'<tr><td>'+esc(r.description||r.part_number||'Spare')+'</td><td>'+esc([r.machine_brand,r.machine_model].filter(Boolean).join(' ')||r.fleet_number||'—')+'</td><td>'+esc(name)+'</td><td>'+esc(r.quantity||0)+' '+esc(r.unit||'')+'</td><td>'+esc(fmtDate(r.required_date||r.requested_at))+'</td><td>'+pill(r.status)+'</td><td><a class="belm-btn-view-details" href="/customer-procurement-workspace/?view=queue">Open</a></td></tr>').join(''):'<tr><td colspan="7">No purchase requests yet.</td></tr>';
    const pro=qs('#proformaLive'); if(pro) pro.innerHTML='<div class="belm-proforma-card"><strong>'+(c.pending||0)+'</strong><span>Pending Procurement</span></div><div class="belm-proforma-card"><strong>'+(c.purchaseRequired||0)+'</strong><span>Purchase Required</span></div><div class="belm-proforma-card"><strong>'+(c.partsReady||0)+'</strong><span>Parts Ready</span></div>';
    qsa('[data-live-delivery]').forEach((el,i)=>{ if(i===0) el.innerHTML='<div class="belm-tracker__step is-active"><strong>'+(c.ordered||0)+'</strong><span>Orders currently awaiting delivery</span></div>'; else el.innerHTML='<div class="belm-tracking-box__text"><strong>Customer Procurement</strong><br>'+esc(name)+'<br><a href="/customer-procurement-workspace/?view=delivery">Open Delivery Tracking</a></div>'; });
  }

  async function loadStore(){
    const [dash,store]=await Promise.all([customerApi('/dashboard'),customerApi('/store')]);
    setCompany(dash); setActor(actorName()||'Store Keeper');
    const items=Array.isArray(store?.items)?store.items:[]; const moves=Array.isArray(store?.recentMovements)?store.recentMovements:[];
    const low=items.filter(i=>Number(i.qty_on_hand||0)<=Number(i.reorder_level||0));
    const issued=items.reduce((s,i)=>s+Number(i.total_issued||0),0);
    const now=new Date(); const monthMoves=moves.filter(m=>{const d=new Date(m.created_at);return !Number.isNaN(d.getTime())&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    setStat('Stock Items',items.length,'Live store items'); setStat('Low Stock',low.length,'At or below reorder level'); setStat('Issued Quantity',issued,'Total quantity issued'); setStat('Movements This Month',monthMoves.length,'Stock movements');
    const inv=qs('#inventoryBody');
    if(inv){ const rows=(low.length?low:items).slice(0,15); inv.innerHTML=rows.length?rows.map(i=>'<tr><td>'+esc(i.part_number||'—')+'</td><td>'+esc(i.description||'Spare')+'</td><td>'+esc(i.category||'—')+'</td><td>'+esc(i.qty_on_hand||0)+' '+esc(i.unit||'')+'</td><td>'+esc(i.reorder_level||0)+'</td><td>'+esc(i.location||'—')+'</td><td>'+pill(Number(i.qty_on_hand||0)<=0?'OUT OF STOCK':(Number(i.qty_on_hand||0)<=Number(i.reorder_level||0)?'LOW STOCK':'AVAILABLE'))+'</td><td><a href="/customer-store/">Open</a></td></tr>').join(''):'<tr><td colspan="8">No store items recorded yet.</td></tr>'; }
    const req=qs('#storeRequestsBody'); if(req) req.innerHTML='<tr><td colspan="7"><a href="/customer-store/#requestRows">Open Store Spare Requests</a> to review machine/job-card issue requests.</td></tr>';
    const mb=qs('#movementsBody'); if(mb) mb.innerHTML=moves.length?moves.slice(0,15).map(m=>'<tr><td>'+esc(fmtDateTime(m.created_at))+'</td><td>'+esc(m.movement_type||'—')+'</td><td>'+esc(m.description||m.part_number||'—')+'</td><td>'+esc(m.quantity||0)+'</td><td>'+esc(m.actor_name||m.received_by||'—')+'</td></tr>').join(''):'<tr><td colspan="5">No stock movements yet.</td></tr>';
  }

  function setMachineDetail(label,value){ qsa('.belm-detail-row').forEach(row=>{ const l=qs('.belm-detail-row__label',row); if(l&&String(l.textContent).trim().toLowerCase()===label.toLowerCase()){ const v=qs('.belm-detail-row__value,.belm-status-active',row); if(v)v.textContent=value==null?'—':String(value); } }); }
  function renderOperatorMachine(machine,company,operator,shift){
    setActor(operator||'Operator');
    qsa('[data-customer-name-upper]').forEach(el=>el.textContent=String(company||'Company').toUpperCase());
    setStat('Assigned Machine',machineLabel(machine),'Current machine');
    const hours=shift?.signedInAt?Math.max(0,(Date.now()-new Date(shift.signedInAt).getTime())/3600000):null;
    setStat('Operating Hours Today',hours!=null&&Number.isFinite(hours)?hours.toFixed(1)+' h':'Not signed in','Current shift');
    setStat('Fuel Used Today','—','Use Fuel Consumption log');
    setStat('Checklist Status',machine?.latestChecklist?.overallStatus||'Not yet done','Latest daily check');
    setMachineDetail('Fleet No.',machine?.fleetNumber||machine?.fleet_number||machine?.regNumber||'—');
    setMachineDetail('Machine Model',machineLabel(machine));
    setMachineDetail('Location',company||'—');
    setMachineDetail('Engine Hours',machine?.latestChecklist?.hourMeterReading!=null?machine.latestChecklist.hourMeterReading+' h':'—');
    setMachineDetail('Status',machine?.status||machine?.operationalStatus||'UNKNOWN');
    const checklist=qs('#checklistSummary'); if(checklist) checklist.innerHTML='<div class="belm-checklist-row"><span class="belm-checklist-row__label">Latest Checklist</span><span class="'+((machine?.latestChecklist?.overallStatus||'').toUpperCase().includes('RED')?'belm-check-warn':'belm-check-ok')+'">'+esc(machine?.latestChecklist?.overallStatus||'Not yet completed')+'</span></div>';
    const alerts=qs('#alertList'); if(alerts){ const arr=Array.isArray(machine?.alertReasons)?machine.alertReasons:[]; alerts.innerHTML=arr.length?arr.map(a=>'<div class="belm-alert-item"><span class="belm-alert-item__icon belm-alert-item__icon--red"></span><span class="belm-alert-item__text">'+esc(a)+'</span><span class="belm-alert-item__tag">Attention</span></div>').join(''):'<div class="belm-alert-item"><span class="belm-alert-item__text">No active machine alerts.</span></div>'; }
    const body=qs('#operationBody'); if(body){ if(shift){ body.innerHTML='<tr><td>'+esc(fmtDateTime(shift.signedInAt))+'</td><td>'+esc(machine?.latestChecklist?.hourMeterReading??'—')+'</td><td>—</td><td>'+(hours!=null&&Number.isFinite(hours)?hours.toFixed(1)+' h':'—')+'</td><td>—</td><td>Containers handled: '+esc(shift.containerCount??0)+'</td></tr>'; } else body.innerHTML='<tr><td colspan="6">No open operator shift. Open the Operation Card to sign in.</td></tr>'; }
  }
  async function loadOperator(){
    if(tokenType==='operator'){
      const [dash,me]=await Promise.all([operatorApi('dashboard'),operatorApi('me')]);
      renderOperatorMachine(dash?.machine||{},dash?.customerName||'Company',dash?.operator?.name||session.name||'Operator',me?.openShift||null);
      return;
    }
    const dash=await customerApi('/dashboard'); const name=setCompany(dash); const machines=Array.isArray(dash?.machines)?dash.machines:[]; const m=machines[0]||{};
    renderOperatorMachine(m,name,session.actorName||session.name||'Operator',null);
    const body=qs('#operationBody'); if(body) body.innerHTML='<tr><td colspan="6">Open the machine Operation Card / Operator PIN workspace to start a shift and record operation data.</td></tr>';
  }

  async function boot(){
    try{
      if(role==='admin')await loadAdmin();
      else if(role==='technician')await loadTechnician();
      else if(role==='procurement')await loadProcurement();
      else if(role==='store')await loadStore();
      else if(role==='operator')await loadOperator();
    }catch(err){ console.warn('BELM customer mirror '+role+':',err); const main=qs('.belm-content'); if(main){ const note=document.createElement('div'); note.style.cssText='padding:12px 16px;border:1px solid rgba(224,80,58,.35);border-radius:10px;margin-bottom:14px'; note.textContent='Live data could not be loaded: '+err.message; main.prepend(note); } }
  }

  initShell(); boot();
  setInterval(()=>{ if(!document.hidden) boot(); },60000);
})();
