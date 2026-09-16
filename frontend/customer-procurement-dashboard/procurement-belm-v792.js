(function(){
  'use strict';

  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token){location.replace('/login');return;}

  const $=id=>document.getElementById(id);
  let companyName='Customer';
  let items=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});};
  const machine=r=>[r.machine_brand,r.machine_model].filter(Boolean).join(' ')||r.machine_type||r.fleet_number||'Machine';
  const status=r=>String(r.status||'').toUpperCase();

  async function api(path){
    const res=await fetch('/api/customer-portal'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
    const text=await res.text();let data={};try{data=text?JSON.parse(text):{}}catch(_){data={}};
    if(!res.ok){if(res.status===401){localStorage.removeItem('belm_customer_token');location.replace('/login');}throw new Error(data.error||'Request failed ('+res.status+').');}
    return data;
  }

  function setCompany(name){
    companyName=name||'Customer';
    document.querySelectorAll('[data-company-name]').forEach(el=>el.textContent=companyName);
    document.querySelectorAll('[data-company-name-upper]').forEach(el=>el.textContent=companyName.toUpperCase());
  }

  function badge(r){
    const s=status(r);
    if(s==='PARTS_READY'||s==='ORDERED')return '<span class="belm-badge belm-badge--approved">'+esc(s.replaceAll('_',' '))+'</span>';
    if(s==='PURCHASE_REQUIRED')return '<span class="belm-badge belm-badge--urgent">PURCHASE REQUIRED</span>';
    return '<span class="belm-badge belm-badge--pending">'+esc((s||'PENDING').replaceAll('_',' '))+'</span>';
  }

  function actionHref(r){
    const s=status(r);
    if(s==='ORDERED')return '/customer-procurement-workspace/?view=orders';
    if(s==='PARTS_READY')return '/customer-procurement-workspace/?view=delivery';
    return '/customer-procurement-workspace/?view=queue';
  }

  function priorityRank(r){
    const s=status(r);
    if(s==='PURCHASE_REQUIRED')return 0;
    if(s==='PENDING_PROCUREMENT')return 1;
    if(s==='ORDERED')return 2;
    if(s==='PARTS_READY')return 3;
    return 4;
  }

  function renderStats(counts){
    $('statTotal').textContent=items.length;
    $('statPending').textContent=Number(counts.pending||0)+Number(counts.purchaseRequired||0);
    $('statOrdered').textContent=Number(counts.ordered||0);
    $('statReady').textContent=Number(counts.partsReady||0);
  }

  function renderPriority(){
    const rows=[...items].sort((a,b)=>priorityRank(a)-priorityRank(b)).slice(0,8);
    $('priorityBody').innerHTML=rows.length?rows.map(r=>`<tr>
      <td>${esc(r.description||r.part_number||'Spare Part')}</td>
      <td>${esc(machine(r))}${r.fleet_number?`<br><small>${esc(r.fleet_number)}</small>`:''}</td>
      <td>${esc(companyName)}</td>
      <td>${esc(Number(r.quantity||0))} ${esc(r.unit||'PC')}</td>
      <td>${esc(fmtDate(r.expected_delivery_at||r.requested_at))}</td>
      <td>${badge(r)}</td>
      <td><a class="belm-btn-row ${status(r)==='PURCHASE_REQUIRED'?'belm-btn-row--gold':status(r)==='PARTS_READY'?'belm-btn-row--green':'belm-btn-row--blue'}" href="${actionHref(r)}">Review</a></td>
    </tr>`).join(''):'<tr><td colspan="7">No purchase requests yet.</td></tr>';
  }

  function renderProforma(){
    const pending=items.filter(r=>['PURCHASE_REQUIRED','PENDING_PROCUREMENT'].includes(status(r))).slice(0,3);
    $('proformaGrid').innerHTML=pending.length?pending.map((r,i)=>`<article class="belm-proforma-card">
      <div class="belm-proforma-card__head"><div class="belm-proforma-card__logo">P${i+1}</div><div><div class="belm-proforma-card__name">${esc(r.supplier_name||'Supplier Proforma Pending')}</div><div class="belm-proforma-card__loc">${esc(machine(r))}</div></div></div>
      <div><div class="belm-proforma-card__field">SPARE / MATERIAL</div><div class="belm-proforma-card__field-value">${esc(r.description||r.part_number||'Spare Part')}</div></div>
      <div><div class="belm-proforma-card__field">REQUESTED</div><div class="belm-proforma-card__field-value">${esc(fmtDate(r.requested_at))}</div></div>
      <div class="belm-proforma-card__actions"><a class="belm-btn-row belm-btn-row--blue" href="/customer-procurement-workspace/?view=proforma">Compare / Process</a></div>
    </article>`).join(''):'<div class="belm-proforma-empty">No pending proforma requests.</div>';
  }

  function renderDelivery(){
    const delivery=items.filter(r=>['ORDERED','PARTS_READY'].includes(status(r))).slice(0,6);
    $('deliveryList').innerHTML=delivery.length?delivery.map(r=>`<a class="belm-delivery-row" href="/customer-procurement-workspace/?view=delivery"><div><b>${esc(r.description||r.part_number||'Spare Part')}</b><small>${esc(machine(r))} · ${esc(r.supplier_name||'Supplier not recorded')}</small></div><div>${badge(r)}<small>${esc(fmtDate(r.expected_delivery_at))}</small></div></a>`).join(''):'<div class="belm-delivery-empty">No active deliveries.</div>';
  }

  async function load(){
    try{
      const [dash,summary]=await Promise.all([api('/dashboard'),api('/procurement-summary')]);
      setCompany(dash?.customer?.name||'Customer');
      items=Array.isArray(summary?.items)?summary.items:[];
      renderStats(summary?.counts||{});
      renderPriority();
      renderProforma();
      renderDelivery();
    }catch(error){
      $('priorityBody').innerHTML='<tr><td colspan="7">Could not load procurement data: '+esc(error.message)+'</td></tr>';
      $('proformaGrid').innerHTML='<div class="belm-proforma-empty">Could not load pending proforma.</div>';
      $('deliveryList').innerHTML='<div class="belm-delivery-empty">Could not load delivery tracking.</div>';
    }
  }

  $('sidebarToggle')?.addEventListener('click',()=>$('belmShell')?.classList.toggle('is-sidebar-open'));
  $('logout')?.addEventListener('click',e=>{e.preventDefault();localStorage.removeItem('belm_customer_token');localStorage.removeItem('belm_active_account_type');location.replace('/login');});

  const themeToggle=$('themeToggle');
  if(themeToggle){
    const update=()=>{$('themeLabel').textContent=document.documentElement.getAttribute('data-theme')==='light'?'Dark mode':'Light mode';};
    update();
    themeToggle.addEventListener('click',()=>{
      if(window.BELMTheme&&typeof window.BELMTheme.toggle==='function')window.BELMTheme.toggle();
      else document.documentElement.setAttribute('data-theme',document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');
      update();
    });
  }

  window.addEventListener('pageshow',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden)load();},60000);
  load();
})();