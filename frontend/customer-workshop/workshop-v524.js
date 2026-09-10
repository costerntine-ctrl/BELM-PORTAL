(function(){
  'use strict';
  const qs=new URLSearchParams(location.search);
  const actor=(qs.get('actor')||'customer').toLowerCase();
  const isBelm=actor==='belm';
  const customerId=qs.get('customerId')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const alertBox=document.getElementById('pageAlert');
  const $=id=>document.getElementById(id);
  const show=(m,error=false)=>{if(!alertBox)return;alertBox.textContent=m;alertBox.className=`alert${error?' error':''}`};
  const clear=()=>{if(alertBox){alertBox.className='alert hidden';alertBox.textContent=''}};

  async function customerApi(path,options={}){
    const r=await fetch(`/api/customer-portal${path}`,{
      ...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${customerToken}`,...(options.headers||{})}
    });
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(err){console.warn('Customer Workshop Portal: response body was not valid JSON.',err)}
    if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  async function adminApi(path){
    const r=await fetch(`/api${path}`,{cache:'no-store',headers:{Authorization:`Bearer ${adminToken}`}});
    const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  function role(profile){if(String(profile?.actorType||'').toLowerCase()==='owner')return'owner';return String(profile?.actorRole||'assistant').toLowerCase().replace(/\s+/g,'_')}
  function permitted(profile,key){if(role(profile)==='owner')return true;const p=profile?.actorPermissions;return p==null||p==='all'||(Array.isArray(p)&&p.includes(key))}
  function visible(id,on){$(id)?.classList.toggle('cwm-role-hidden',!on)}

  function applyRoleAccess(profile,belmOn,workshopActive){
    const r=role(profile), ownerAdmin=r==='owner'||r==='admin', manager=ownerAdmin||r==='workshop_manager';
    const store=ownerAdmin||['store_keeper','workshop_manager','procurement'].includes(r);
    const procurement=ownerAdmin||['procurement','workshop_manager'].includes(r);
    const accounts=ownerAdmin||r==='accounts';
    visible('managerJobCardLink',manager||permitted(profile,'workflow'));
    visible('technicianManageLink',!belmOn&&manager);
    visible('storeLink',workshopActive&&store&&permitted(profile,'store'));
    visible('managerAnalysisLink',manager||permitted(profile,'workflow'));
    visible('cwmProcurementLink',procurement&&(permitted(profile,'machine-expenses')||permitted(profile,'store')));
    visible('cwmGeneralReportLink',r!=='operator');
    visible('cwmPettyCashLink',accounts||permitted(profile,'machine-expenses'));
    visible('cwmGeneralAnalysisLink',ownerAdmin||r==='workshop_manager'||r==='accounts');
    visible('cwmSettingsLink',ownerAdmin||r==='workshop_manager');
    const meta={owner:['CUSTOMER OWNER / ADMIN','Managing Company Workshop','OWNER'],admin:['CUSTOMER ADMIN','Managing Company Workshop','ADMIN'],workshop_manager:['WORKSHOP MANAGER','Managing Workshop','CONTROL'],store_keeper:['STORE KEEPER','Store & Spare Control','STORE'],procurement:['PROCUREMENT','Workshop Procurement','PROCUREMENT'],accounts:['ACCOUNTS / FINANCE','Workshop Finance','FINANCE'],operator:['OPERATOR','Machine Operations','OPERATOR'],assistant:['CUSTOMER USER','Customer Workshop','ACCESS']}[r]||['CUSTOMER USER','Customer Workshop','ACCESS'];
    if($('cwmRoleLabel'))$('cwmRoleLabel').textContent=meta[0];if($('cwmRoleTitle'))$('cwmRoleTitle').textContent=meta[1];if($('cwmRoleStatus'))$('cwmRoleStatus').textContent=meta[2];
    if($('cwmRoleDescription'))$('cwmRoleDescription').textContent=`${meta[1]} — same BELM Workshop Manager Portal operating card, scoped to this customer company and signed-in role.`;
  }

  async function loadCustomer(){
    if(!customerToken){location.replace('/login');return}
    try{
      const dashboard=await customerApi('/dashboard'), p=dashboard?.customer||{};
      const name=p.name||'Customer', belmOn=Boolean(p.belmServiceProviderActive), workshopActive=p.workshopModuleActive!==false;
      if($('modePill'))$('modePill').textContent='Customer Workshop Portal HOME';
      if($('workshopTitle'))$('workshopTitle').textContent=`${name} — Customer Workshop Portal`;
      if($('workshopSubtitle'))$('workshopSubtitle').textContent=belmOn?'BELM Service Mode — customer records remain company-scoped; BELM Job Cards go directly to TECHNICAL DEP.':'Customer Workshop Manager home — customer records remain company-scoped; BELM support is used only when requested.';
      if($('cwmMachinesLink'))$('cwmMachinesLink').textContent=`${name.toUpperCase()} MACHINES`;
      // Technician management is locked while BELM Service handles maintenance directly.
      const tech=$('technicianManageLink');
      if(tech){
        if(belmOn){tech.textContent='Technicians Locked · BELM ON';tech.removeAttribute('href');tech.setAttribute('aria-disabled','true');tech.classList.add('locked-action')}
        else{tech.textContent='Manage Technicians';tech.href='/customer-technicians/';tech.removeAttribute('aria-disabled');tech.classList.remove('locked-action')}
      }
      applyRoleAccess(p,belmOn,workshopActive);
      if(!workshopActive){$('storeLink')?.classList.add('cwm-role-hidden')}
    }catch(e){show(e.message,true)}
  }

  async function loadBelm(){
    if(!adminToken){location.replace('/login');return}
    try{
      const list=await adminApi('/customers');
      const c=(Array.isArray(list)?list:list?.customers||[]).find(x=>String(x.id)===String(customerId));
      if($('modePill'))$('modePill').textContent='BELM CUSTOMER VIEW';
      if($('workshopTitle'))$('workshopTitle').textContent=`${c?.name||'Customer'} — Workshop`;
      if($('workshopSubtitle'))$('workshopSubtitle').textContent='Customer workshop viewed from BELM. Customer-owned team records remain separate from BELM staff.';
    }catch(e){show(e.message,true)}
  }

  $('refreshButton')?.addEventListener('click',async()=>{clear();if(isBelm)await loadBelm();else await loadCustomer()});

  (async()=>{if(isBelm)await loadBelm();else await loadCustomer()})();
})();
