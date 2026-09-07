(function(){
  'use strict';
  const qs=new URLSearchParams(location.search);
  const actor=(qs.get('actor')||'customer').toLowerCase();
  const isBelm=actor==='belm';
  const customerId=qs.get('customerId')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const alertBox=document.getElementById('pageAlert');
  let currentProfile=null, currentView='main', technicians=[], toolIssues=[];
  const stateKey=`belm_cwm_view_state:${actor}:${customerId||'self'}`;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const show=(m,error=false)=>{if(!alertBox)return;alertBox.textContent=m;alertBox.className=`alert${error?' error':''}`};
  const clear=()=>{if(alertBox){alertBox.className='alert hidden';alertBox.textContent=''}};

  async function customerApi(path,options={}){
    const r=await fetch(`/api/customer-portal${path}`,{
      ...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${customerToken}`,...(options.headers||{})}
    });
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){}
    if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  async function adminApi(path){
    const r=await fetch(`/api${path}`,{cache:'no-store',headers:{Authorization:`Bearer ${adminToken}`}});
    const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  function role(profile){if(String(profile?.actorType||'').toLowerCase()==='owner')return'owner';return String(profile?.actorRole||'assistant').toLowerCase().replace(/\s+/g,'_')}
  function permitted(profile,key){if(role(profile)==='owner')return true;const p=profile?.actorPermissions;return p==null||p==='all'||(Array.isArray(p)&&p.includes(key))}
  function visible(id,on){$(id)?.classList.toggle('cwm-role-hidden',!on)}
  function saveState(){try{sessionStorage.setItem(stateKey,JSON.stringify({view:currentView,scrollY:window.scrollY||0,tools:!$('toolDocumentsPanel')?.classList.contains('hidden')}))}catch(_){}}
  function readState(){try{return JSON.parse(sessionStorage.getItem(stateKey)||'{}')||{}}catch(_){return{}}}

  async function showView(view,restore=false){
    const allowed=['main','store','settings'];currentView=allowed.includes(view)?view:'main';
    if(isBelm&&currentView!=='main')currentView='main';
    $('cwmMainDashboard')?.classList.toggle('hidden',currentView!=='main');
    $('cwmStoreView')?.classList.toggle('hidden',currentView!=='store');
    $('cwmSettingsView')?.classList.toggle('hidden',currentView!=='settings');
    if(currentView==='store'&&!isBelm)await loadStore();
    if(currentView==='settings'&&!isBelm)await loadLogo();
    if(!restore)window.scrollTo(0,0);saveState();
  }
  function applyRoleAccess(profile,belmOn,workshopActive){
    const r=role(profile), ownerAdmin=r==='owner'||r==='admin', manager=ownerAdmin||r==='workshop_manager';
    const store=ownerAdmin||['store_keeper','workshop_manager','procurement'].includes(r);
    const procurement=ownerAdmin||['procurement','workshop_manager'].includes(r);
    const accounts=ownerAdmin||r==='accounts';
    visible('managerJobCardLink',manager||permitted(profile,'workflow'));
    visible('storeLink',workshopActive&&store&&permitted(profile,'store'));
    visible('cwmProcurementLink',procurement&&(permitted(profile,'machine-expenses')||permitted(profile,'store')));
    visible('technicianManageLink',!belmOn&&manager);
    visible('managerAnalysisLink',manager||permitted(profile,'workflow'));
    visible('cwmGeneralReportLink',r!=='operator');
    visible('cwmPettyCashLink',accounts||permitted(profile,'machine-expenses'));
    visible('cwmGeneralAnalysisLink',ownerAdmin||r==='workshop_manager'||r==='accounts');
    visible('cwmSettingsLink',ownerAdmin||r==='workshop_manager');
    const meta={owner:['CUSTOMER OWNER / ADMIN','Managing Company Workshop','OWNER'],admin:['CUSTOMER ADMIN','Managing Company Workshop','ADMIN'],workshop_manager:['WORKSHOP MANAGER','Managing Workshop','CONTROL'],store_keeper:['STORE KEEPER','Store & Spare Control','STORE'],procurement:['PROCUREMENT','Workshop Procurement','PROCUREMENT'],accounts:['ACCOUNTS / FINANCE','Workshop Finance','FINANCE'],operator:['OPERATOR','Machine Operations','OPERATOR'],assistant:['CUSTOMER USER','Customer Workshop','ACCESS']}[r]||['CUSTOMER USER','Customer Workshop','ACCESS'];
    if($('cwmRoleLabel'))$('cwmRoleLabel').textContent=meta[0];if($('cwmRoleTitle'))$('cwmRoleTitle').textContent=meta[1];if($('cwmRoleStatus'))$('cwmRoleStatus').textContent=meta[2];
    if($('cwmRoleDescription'))$('cwmRoleDescription').textContent=`${meta[1]} — same PORTAL-BELM WM operating card, scoped to this customer company and signed-in role.`;
    if($('cwmAssignFunction'))$('cwmAssignFunction').textContent=belmOn?'BELM Technician Assignment':'Assign / Reassign Technician';
    if($('cwmWorkloadFunction'))$('cwmWorkloadFunction').textContent=belmOn?'BELM Job Progress':'Technician Workload';
  }
  async function loadCustomer(){
    if(!customerToken){location.replace('/login');return}
    try{
      const dashboard=await customerApi('/dashboard'), p=dashboard?.customer||{};currentProfile=p;
      const name=p.name||'Customer', belmOn=Boolean(p.belmServiceProviderActive), workshopActive=p.workshopModuleActive!==false;
      if($('modePill'))$('modePill').textContent='PORTAL-CWM HOME';
      if($('workshopTitle'))$('workshopTitle').textContent=`${name} — PORTAL-CWM`;
      if($('workshopSubtitle'))$('workshopSubtitle').textContent=belmOn?'BELM Service Mode — customer records remain company-scoped; BELM Job Cards go directly to TECHNICAL DEP.':'Customer Workshop Manager home — customer records remain company-scoped; BELM support is used only when requested.';
      if($('cwmCompanyName'))$('cwmCompanyName').textContent=name;if($('cwmCompanyAddress'))$('cwmCompanyAddress').textContent=p.address||'Not recorded';if($('cwmCompanyEmail'))$('cwmCompanyEmail').textContent=p.email||'Not recorded';if($('cwmCompanyContact'))$('cwmCompanyContact').textContent=p.phone||'Not recorded';
      if($('cwmBelmStatus')){$('cwmBelmStatus').textContent=belmOn?'BELM ON · SERVICE ACTIVE':'BELM OFF · CUSTOMER WORKSHOP';$('cwmBelmStatus').classList.toggle('is-on',belmOn);$('cwmBelmStatus').classList.toggle('is-off',!belmOn)}
      if($('cwmMachinesLink')){$('cwmMachinesLink').textContent=`${name.toUpperCase()} MACHINES`; $('cwmMachinesLink').href='/portal/dashboard?view=machines'}
      const tech=$('technicianManageLink');if(tech){if(belmOn){tech.textContent='Technicians Locked · BELM ON';tech.removeAttribute('href');tech.setAttribute('aria-disabled','true');tech.classList.add('locked-action')}else{tech.textContent='Manage Technicians';tech.href='/customer-users/';tech.removeAttribute('aria-disabled');tech.classList.remove('locked-action')}}
      applyRoleAccess(p,belmOn,workshopActive);
      if(!workshopActive){$('storeLink')?.classList.add('cwm-role-hidden');$('cwmStoreView')?.classList.add('hidden')}
      if(!belmOn){try{technicians=await customerApi('/technicians')}catch(_){technicians=[]}}else technicians=[];
      renderTechnicianOptions();
    }catch(e){show(e.message,true)}
  }
  async function loadBelm(){
    if(!adminToken){location.replace('/login');return}
    try{const list=await adminApi('/customers');const c=(Array.isArray(list)?list:list?.customers||[]).find(x=>String(x.id)===String(customerId));if($('modePill'))$('modePill').textContent='BELM CUSTOMER VIEW';if($('workshopTitle'))$('workshopTitle').textContent=`${c?.name||'Customer'} — Workshop`;if($('workshopSubtitle'))$('workshopSubtitle').textContent='Customer workshop viewed from BELM. Customer-owned team records remain separate from BELM staff.'}catch(e){show(e.message,true)}
  }

  function renderTechnicianOptions(){const s=$('toolTechnician');if(!s)return;s.innerHTML='<option value="">Select Technician…</option>'+technicians.filter(t=>Boolean(t.isActive??t.is_active)).map(t=>`<option value="${esc(t.id)}" data-name="${esc(t.name)}">${esc(t.name)}</option>`).join('')}
  async function loadStore(){const rows=$('storeRows');if(!rows)return;rows.innerHTML='<tr><td colspan="7" class="empty">Loading Customer Store…</td></tr>';try{const d=await customerApi('/store'),items=d.items||[];const qty=items.reduce((s,x)=>s+Number(x.qty_on_hand??x.qtyOnHand??0),0),out=items.filter(x=>Number(x.qty_on_hand??x.qtyOnHand??0)<=0).length;if($('storeItemCount'))$('storeItemCount').textContent=items.length;if($('storeQtyCount'))$('storeQtyCount').textContent=qty.toLocaleString();if($('storeOutCount'))$('storeOutCount').textContent=out;rows.innerHTML=items.length?items.map(x=>`<tr><td><b>${esc(x.part_number??x.partNumber??'—')}</b></td><td>${esc(x.description||'—')}</td><td>${esc(x.unit||'PC')}</td><td>${Number(x.total_received??x.totalReceived??0).toLocaleString()}</td><td>${Number(x.total_issued??x.totalIssued??0).toLocaleString()}</td><td><b>${Number(x.qty_on_hand??x.qtyOnHand??0).toLocaleString()}</b></td><td>TZS ${Number(x.average_unit_cost??x.averageUnitCost??0).toLocaleString()}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No customer Store stock recorded yet.</td></tr>'}catch(e){rows.innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`}}
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString()};
  function renderToolIssues(){const rows=$('toolIssueRows');if(!rows)return;const out=toolIssues.filter(x=>!x.returnedAt).length;if($('toolsOutCount'))$('toolsOutCount').textContent=out;if($('toolsReturnedCount'))$('toolsReturnedCount').textContent=toolIssues.length-out;if($('toolDocumentCount'))$('toolDocumentCount').textContent=toolIssues.length;rows.innerHTML=toolIssues.length?toolIssues.map(x=>`<tr><td><b>${esc(x.documentNo||'—')}</b></td><td>${esc(x.jobCardNo||'—')}</td><td>${esc(x.technicianName||'—')}</td><td><b>${esc(x.toolName||'—')}</b></td><td>${esc(x.quantity||1)}</td><td>${fmtDate(x.issuedAt)}</td><td><span class="${x.returnedAt?'status-returned':'status-out'}">${x.returnedAt?'RETURNED':'OUT WITH TECHNICIAN'}</span></td><td>${x.returnedAt?fmtDate(x.returnedAt):`<button class="return-button" type="button" data-return-tool="${esc(x.id)}">Receive Return</button>`}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">No Tool Issue Documents yet.</td></tr>';rows.querySelectorAll('[data-return-tool]').forEach(b=>b.onclick=()=>{if($('toolReturnId'))$('toolReturnId').value=b.dataset.returnTool;$('toolReturnDialog')?.showModal()})}
  async function loadToolIssues(){try{const d=await customerApi('/tool-issues');toolIssues=d.items||[];renderToolIssues()}catch(e){show(e.message,true)}}

  function canLogo(){const r=role(currentProfile);return r==='owner'||r==='admin'}
  function renderLogo(d={}){const img=$('cwmCompanyLogoPreview'),ph=$('cwmLogoPlaceholder'),rm=$('cwmRemoveLogoButton'),up=$('cwmUploadLogoButton');if(d.logoDataUrl&&img&&ph){img.src=d.logoDataUrl;img.hidden=false;ph.hidden=true}else if(img&&ph){img.hidden=true;img.removeAttribute('src');ph.hidden=false}const ok=d.canManage??canLogo();if(up){up.disabled=!ok;up.textContent=ok?'Upload Company Logo':'Company Logo · Owner/Admin Only'}if(rm)rm.hidden=!d.logoDataUrl||!ok}
  async function loadLogo(){try{renderLogo(await customerApi('/company-logo'))}catch(_){renderLogo({canManage:canLogo()})}}

  $('storeLink')?.addEventListener('click',e=>{if(isBelm)return;e.preventDefault();showView('store')});
  $('cwmSettingsLink')?.addEventListener('click',e=>{if(isBelm)return;e.preventDefault();showView('settings')});
  document.querySelectorAll('[data-cwm-main]').forEach(b=>b.addEventListener('click',()=>showView('main')));
  $('cwmBackButton')?.addEventListener('click',e=>{if(isBelm)return;e.preventDefault();showView('main')});
  $('refreshButton')?.addEventListener('click',async()=>{clear();if(isBelm)await loadBelm();else await loadCustomer();await showView(currentView,true)});
  $('toolDocumentsButton')?.addEventListener('click',async()=>{$('toolDocumentsPanel')?.classList.remove('hidden');await loadToolIssues()});
  $('newToolIssueButton')?.addEventListener('click',()=>{$('toolIssueForm')?.reset();$('toolIssueDialog')?.showModal()});
  $('receiveStockButton')?.addEventListener('click',()=>{$('receiveStockForm')?.reset();if($('receiveUnitCost'))$('receiveUnitCost').value='0';$('receiveStockDialog')?.showModal()});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close)?.close()));
  $('receiveStockForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await customerApi('/store',{method:'POST',body:JSON.stringify({partNumber:$('receivePartNumber').value.trim(),description:$('receiveDescription').value.trim(),unit:$('receiveUnit').value,quantity:Number($('receiveQuantity').value||0),unitCost:Number($('receiveUnitCost').value||0),note:$('receiveNote').value.trim()})});$('receiveStockDialog').close();show('Customer Store stock received.');await loadStore()}catch(err){show(err.message,true)}});
  $('toolIssueForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const s=$('toolTechnician'),o=s.selectedOptions[0];await customerApi('/tool-issues',{method:'POST',body:JSON.stringify({jobCardNo:$('toolJobCardNo').value.trim(),technicianId:s.value,technicianName:o?.dataset?.name||o?.textContent||'',toolName:$('toolName').value.trim(),toolAssetId:$('toolAssetId').value.trim(),quantity:Number($('toolQuantity').value||1),expectedReturnAt:$('toolExpectedReturn').value||null,conditionOut:$('toolConditionOut').value.trim(),note:$('toolIssueNote').value.trim()})});$('toolIssueDialog').close();show('Tool Issue Document created.');await loadToolIssues()}catch(err){show(err.message,true)}});
  $('toolReturnForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const id=$('toolReturnId').value;await customerApi(`/tool-issues/${encodeURIComponent(id)}/return`,{method:'POST',body:JSON.stringify({conditionIn:$('toolConditionIn').value.trim(),receivedBy:$('toolReceivedBy').value.trim(),note:$('toolReturnNote').value.trim()})});$('toolReturnDialog').close();show('Tool return recorded.');await loadToolIssues()}catch(err){show(err.message,true)}});
  $('cwmLogoutButton')?.addEventListener('click',()=>{if(isBelm){location.replace('/login');return}localStorage.removeItem('belm_customer_token');localStorage.removeItem('belm_session_refreshed_belm_customer_token');try{sessionStorage.removeItem(stateKey)}catch(_){}location.replace('/login')});
  window.addEventListener('pagehide',saveState);
  (async()=>{if(isBelm)await loadBelm();else await loadCustomer();const s=readState();await showView(s.view||'main',true);requestAnimationFrame(()=>window.scrollTo(0,Number(s.scrollY)||0));if(s.tools&&currentView==='store'){$('toolDocumentsPanel')?.classList.remove('hidden');await loadToolIssues()}})();
})();
