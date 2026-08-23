(function(){
  const qs=new URLSearchParams(location.search);
  const actor=(qs.get('actor')||'customer').toLowerCase();
  const isBelm=actor==='belm';
  const customerId=qs.get('customerId')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const alertBox=document.getElementById('pageAlert');
  let technicians=[];
  let toolIssues=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function show(message,error=false){alertBox.textContent=message;alertBox.className=`alert${error?' error':''}`}
  function clear(){alertBox.className='alert hidden';alertBox.textContent=''}
  async function customerApi(path,options={}){
    const r=await fetch(`/api/customer-portal${path}`,{...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${customerToken}`,...(options.headers||{})}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  async function adminApi(path){const r=await fetch(`/api${path}`,{cache:'no-store',headers:{Authorization:`Bearer ${adminToken}`}});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data}
  function setBelmMode(customer){
    document.getElementById('modePill').textContent='BELM CUSTOMER VIEW';
    document.getElementById('backLink').href='/customers-manager/';
    document.getElementById('workshopTitle').textContent=`${customer?.name||'Customer'} — Workshop`;
    document.getElementById('workshopSubtitle').textContent='Customer workshop role structure viewed from BELM. Customer-owned team controls remain separated from BELM staff.';
    const suffix=customerId?`?customerId=${encodeURIComponent(customerId)}`:'';
    document.getElementById('managerJobCardLink').href='/belm-workshop/#job-cards';
    document.getElementById('managerAnalysisLink').href='/belm-workshop/#workshop-analysis';
    document.getElementById('storeLink').href='/spare-parts-manager/';
    document.getElementById('storeLink').textContent='BELM Spare / Support View';
    document.getElementById('workshop-store').classList.add('hidden');
    document.getElementById('toolDocumentsButton').classList.add('hidden');
    document.getElementById('technicianManageLink').href='/roles-manager/?role=Technician&technical=1';
    document.getElementById('technicianManageLink').textContent='BELM Technician Directory';
    document.getElementById('technicianWorkLink').href='/belm-workshop/#job-cards';
    document.getElementById('technicianWorkLink').textContent='Technical Department';
    document.getElementById('toolDocumentsPanel').classList.add('hidden');
  }
  async function loadBelm(){
    if(!adminToken){location.href='/app/belm';return}
    let selected=null;
    try{const customers=await adminApi('/customers');selected=(Array.isArray(customers)?customers:(customers?.customers||[])).find(c=>String(c.id)===String(customerId))||null}catch(e){show(e.message,true)}
    setBelmMode(selected);
  }
  async function loadCustomer(){
    if(!customerToken){location.href='/portal/login';return}
    document.getElementById('modePill').textContent='CUSTOMER WORKSHOP';
    document.getElementById('backLink').href='/portal/dashboard';
    try{
      const dashboard=await customerApi('/dashboard');
      const name=dashboard?.customer?.name||'Customer';
      document.getElementById('workshopTitle').textContent=`${name} — Workshop`;
      document.getElementById('workshopSubtitle').textContent='Workshop Manager, Store Keeper and Technicians work through one controlled Job Card flow.';
    }catch(e){show(e.message,true)}
    try{technicians=await customerApi('/technicians');document.getElementById('technicianCount').textContent=`${technicians.length} TECH${technicians.length===1?'':'S'}`;renderTechnicianOptions()}catch(_){technicians=[];renderTechnicianOptions()}
    await loadStore();
  }
  async function loadStore(){
    if(isBelm)return;
    const rows=document.getElementById('storeRows');
    rows.innerHTML='<tr><td colspan="7" class="empty">Loading Customer Store…</td></tr>';
    try{
      const data=await customerApi('/store');
      const items=data.items||[];
      const qty=items.reduce((sum,x)=>sum+Number(x.qty_on_hand??x.qtyOnHand??0),0);
      const out=items.filter(x=>Number(x.qty_on_hand??x.qtyOnHand??0)<=0).length;
      document.getElementById('storeItemCount').textContent=items.length;
      document.getElementById('storeQtyCount').textContent=qty.toLocaleString(undefined,{maximumFractionDigits:2});
      document.getElementById('storeOutCount').textContent=out;
      rows.innerHTML=items.length?items.map(x=>`<tr><td><b>${esc(x.part_number??x.partNumber??'—')}</b></td><td>${esc(x.description||'—')}</td><td>${esc(x.unit||'PC')}</td><td>${Number(x.total_received??x.totalReceived??0).toLocaleString()}</td><td>${Number(x.total_issued??x.totalIssued??0).toLocaleString()}</td><td><b>${Number(x.qty_on_hand??x.qtyOnHand??0).toLocaleString()}</b></td><td>TZS ${Number(x.average_unit_cost??x.averageUnitCost??0).toLocaleString()}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No customer Store stock recorded yet.</td></tr>';
    }catch(e){rows.innerHTML=`<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`}
  }
  function openReceiveStock(){document.getElementById('receiveStockForm').reset();document.getElementById('receiveUnitCost').value='0';document.getElementById('receiveStockError').classList.add('hidden');document.getElementById('receiveStockDialog').showModal()}

  function renderTechnicianOptions(){const select=document.getElementById('toolTechnician');select.innerHTML='<option value="">Select Technician…</option>'+technicians.filter(t=>Boolean(t.isActive??t.is_active)).map(t=>`<option value="${esc(t.id)}" data-name="${esc(t.name)}">${esc(t.name)}</option>`).join('')}
  function fmtDate(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  function renderToolIssues(){
    const rows=document.getElementById('toolIssueRows');
    const out=toolIssues.filter(x=>!x.returnedAt).length,returned=toolIssues.length-out;
    document.getElementById('toolsOutCount').textContent=out;document.getElementById('toolsReturnedCount').textContent=returned;document.getElementById('toolDocumentCount').textContent=toolIssues.length;
    rows.innerHTML=toolIssues.length?toolIssues.map(x=>`<tr><td><b>${esc(x.documentNo||'—')}</b></td><td>${esc(x.jobCardNo||'—')}</td><td>${esc(x.technicianName||'—')}</td><td><b>${esc(x.toolName)}</b>${x.toolAssetId?`<br><small>${esc(x.toolAssetId)}</small>`:''}</td><td>${esc(x.quantity)}</td><td>${fmtDate(x.issuedAt)}</td><td><span class="${x.returnedAt?'status-returned':'status-out'}">${x.returnedAt?'RETURNED':'OUT WITH TECHNICIAN'}</span></td><td>${x.returnedAt?`${fmtDate(x.returnedAt)}<br><small>${esc(x.conditionIn||'')}</small>`:`<button class="return-button" type="button" data-return-tool="${esc(x.id)}">Receive Return</button>`}</td></tr>`).join(''):'<tr><td colspan="8" class="empty">No Tool Issue Documents yet.</td></tr>';
    rows.querySelectorAll('[data-return-tool]').forEach(b=>b.addEventListener('click',()=>openReturn(b.dataset.returnTool)));
  }
  async function loadToolIssues(){if(isBelm)return;const rows=document.getElementById('toolIssueRows');rows.innerHTML='<tr><td colspan="8" class="empty">Loading Tool Issue Documents…</td></tr>';try{const data=await customerApi('/tool-issues');toolIssues=data.items||[];renderToolIssues()}catch(e){rows.innerHTML=`<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`}}
  function openIssue(){document.getElementById('toolIssueForm').reset();document.getElementById('toolQuantity').value='1';document.getElementById('toolIssueError').classList.add('hidden');document.getElementById('toolIssueDialog').showModal()}
  function openReturn(id){document.getElementById('toolReturnForm').reset();document.getElementById('toolReturnId').value=id;document.getElementById('toolReturnError').classList.add('hidden');document.getElementById('toolReturnDialog').showModal()}
  document.getElementById('toolDocumentsButton').addEventListener('click',async()=>{const p=document.getElementById('toolDocumentsPanel');p.classList.remove('hidden');p.scrollIntoView({behavior:'smooth',block:'start'});await loadToolIssues()});
  document.getElementById('newToolIssueButton').addEventListener('click',openIssue);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close)?.close()));
  document.getElementById('toolIssueForm').addEventListener('submit',async e=>{e.preventDefault();const errorBox=document.getElementById('toolIssueError');try{const tech=document.getElementById('toolTechnician');const opt=tech.selectedOptions[0];await customerApi('/tool-issues',{method:'POST',body:JSON.stringify({jobCardNo:document.getElementById('toolJobCardNo').value.trim(),technicianId:tech.value,technicianName:opt?.dataset?.name||opt?.textContent||'',toolName:document.getElementById('toolName').value.trim(),toolAssetId:document.getElementById('toolAssetId').value.trim(),quantity:Number(document.getElementById('toolQuantity').value||1),expectedReturnAt:document.getElementById('toolExpectedReturn').value||null,conditionOut:document.getElementById('toolConditionOut').value.trim(),note:document.getElementById('toolIssueNote').value.trim()})});document.getElementById('toolIssueDialog').close();show('Tool Issue Document created.');await loadToolIssues()}catch(err){errorBox.textContent=err.message;errorBox.classList.remove('hidden')}});
  document.getElementById('toolReturnForm').addEventListener('submit',async e=>{e.preventDefault();const errorBox=document.getElementById('toolReturnError');try{const id=document.getElementById('toolReturnId').value;await customerApi(`/tool-issues/${encodeURIComponent(id)}/return`,{method:'POST',body:JSON.stringify({conditionIn:document.getElementById('toolConditionIn').value.trim(),receivedBy:document.getElementById('toolReceivedBy').value.trim(),note:document.getElementById('toolReturnNote').value.trim()})});document.getElementById('toolReturnDialog').close();show('Tool return recorded.');await loadToolIssues()}catch(err){errorBox.textContent=err.message;errorBox.classList.remove('hidden')}});
  document.getElementById('receiveStockButton').addEventListener('click',openReceiveStock);
  document.getElementById('receiveStockForm').addEventListener('submit',async e=>{e.preventDefault();const errorBox=document.getElementById('receiveStockError');try{await customerApi('/store',{method:'POST',body:JSON.stringify({partNumber:document.getElementById('receivePartNumber').value.trim(),description:document.getElementById('receiveDescription').value.trim(),unit:document.getElementById('receiveUnit').value,quantity:Number(document.getElementById('receiveQuantity').value||0),unitCost:Number(document.getElementById('receiveUnitCost').value||0),note:document.getElementById('receiveNote').value.trim()})});document.getElementById('receiveStockDialog').close();show('Customer Store stock received.');await loadStore()}catch(err){errorBox.textContent=err.message;errorBox.classList.remove('hidden')}});
  document.getElementById('refreshButton').addEventListener('click',async()=>{clear();if(isBelm)await loadBelm();else{await loadCustomer();if(!document.getElementById('toolDocumentsPanel').classList.contains('hidden'))await loadToolIssues()}});
  isBelm?loadBelm():loadCustomer();
})();
