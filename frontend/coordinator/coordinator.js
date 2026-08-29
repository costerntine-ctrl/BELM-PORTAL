(()=>{
  const token=localStorage.getItem('belm_admin_token');
  if(!token){location.replace('/login');return}
  let user=null;try{user=JSON.parse(localStorage.getItem('belm_admin_user')||'null')}catch(_){}
  const role=String(user?.role||'').toLowerCase();
  if(role!=='super admin'&&user?.allowedPages!==null){location.replace('/belm-workshop/');return}
  let all=[];
  const deptButton=document.getElementById('belmDepartmentsButton'),deptPanel=document.getElementById('belmDepartmentsPanel'),deptClose=document.getElementById('closeBelmDepartments');
  function setDepartmentPanel(open){if(!deptPanel)return;deptPanel.hidden=!open;if(open){deptPanel.scrollIntoView({behavior:'smooth',block:'start'});deptClose?.focus();}else deptButton?.focus();}
  deptButton?.addEventListener('click',()=>setDepartmentPanel(true));
  deptClose?.addEventListener('click',()=>setDepartmentPanel(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&deptPanel&&!deptPanel.hidden)setDepartmentPanel(false)});
  const box=document.getElementById('customers'),alertBox=document.getElementById('alert');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(path,opt={}){const r=await fetch('/api'+path,{...opt,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(opt.headers||{})},cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`Request failed (${r.status})`);return d}
  function buttonState(f,key,def){return f?.machineCardButtons?.operator?.[key]||def}
  function stateOptions(value){return ['enabled','disabled','hidden'].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x==='enabled'?'Enabled':x==='disabled'?'Disabled':'Hidden / Removed'}</option>`).join('')}
  const departmentLabels={administration:'Administration',technical:'Technical / Workshop',operator:'Machine Operator',procurement:'Procurement',store:'Store / Inventory',finance:'Finance / Accounts',generalReport:'General Report'};
  function departmentState(c,key){return c?.departmentStates?.[key]==='REMOVED'?'REMOVED':'ENABLED'}
  function departmentOptions(value){return `<option value="ENABLED" ${value==='ENABLED'?'selected':''}>Added / Enabled</option><option value="REMOVED" ${value==='REMOVED'?'selected':''}>Removed</option>`}
  function render(){
    const q=document.getElementById('search').value.toLowerCase().trim();
    const rows=all.filter(x=>!q||`${x.name} ${x.email}`.toLowerCase().includes(q));
    box.innerHTML=rows.length?rows.map(c=>{
      const f=c.coordinatorFeatures||{},connected=!c.selfServiceEnabled;
      return `<article class="customer" data-id="${esc(c.id)}">
        <div class="customer-main"><h3>${esc(c.name)}</h3><small>${esc(c.email||'')} · ${esc(c.phone||'')}</small><div><span class="mode ${connected?'connected':'independent'}">${connected?'CONNECTED TO BELM':'INDEPENDENT CUSTOMER'}</span></div></div>
        <div class="switches"><label class="toggle"><input type="checkbox" data-feature="belm" ${connected?'checked':''}> BELM Service</label><label class="toggle"><input type="checkbox" data-feature="invoiceSystem" ${f.invoiceSystem?'checked':''}> Invoice System</label><label class="toggle"><input type="checkbox" data-feature="proformaSystem" ${f.proformaSystem?'checked':''}> Proforma System</label><label class="toggle"><input type="checkbox" data-feature="operatorDashboard" ${f.operatorDashboard!==false?'checked':''}> Machine Operator Dashboard</label><label class="toggle"><input type="checkbox" data-feature="technicianDashboard" ${f.technicianDashboard!==false?'checked':''}> Technician Dashboard</label></div>
        <div class="department-controller"><div class="button-controller-head"><b>Customer Department Controller</b><span>Add / Remove access only · workflow data is preserved</span></div>
          ${Object.entries(departmentLabels).map(([key,label])=>`<label>${label}<select data-department-key="${key}">${departmentOptions(departmentState(c,key))}</select></label>`).join('')}
        </div>
        <div class="button-controller"><div class="button-controller-head"><b>Machine Card Button Controller</b><span>Operator Dashboard · Enabled / Disabled / Hidden</span></div>
          <label>Report<select data-button-key="report">${stateOptions(buttonState(f,'report','enabled'))}</select></label>
          <label>Check Up<select data-button-key="checkup">${stateOptions(buttonState(f,'checkup','enabled'))}</select></label>
          <label>Service Parts<select data-button-key="parts">${stateOptions(buttonState(f,'parts','disabled'))}</select></label>
          <label>Operation Card<select data-button-key="operationCard">${stateOptions(buttonState(f,'operationCard','enabled'))}</select></label>
        </div>
      </article>`
    }).join(''):'<div class="empty">No matching customer.</div>';
    wire();
  }
  async function confirmEdit(message){if(!window.belmConfirmEdit)return null;return await window.belmConfirmEdit({title:'Coordinator change',message})}
  function currentPayload(c){
    const f=c.coordinatorFeatures||{};
    return {
      invoiceSystem:!!f.invoiceSystem,proformaSystem:!!f.proformaSystem,
      operatorDashboard:f.operatorDashboard!==false,technicianDashboard:f.technicianDashboard!==false,
      machineCardButtons:{operator:{
        report:buttonState(f,'report','enabled'),checkup:buttonState(f,'checkup','enabled'),parts:buttonState(f,'parts','disabled'),operationCard:buttonState(f,'operationCard','enabled')
      }}
    }
  }
  function wire(){
    box.querySelectorAll('input[data-feature]').forEach(inp=>inp.addEventListener('change',async()=>{
      const card=inp.closest('.customer'),id=card.dataset.id,c=all.find(x=>x.id===id),feature=inp.dataset.feature,desired=inp.checked;inp.disabled=true;
      try{
        const conf=await confirmEdit(`Confirm ${desired?'enable':'disable'} ${feature==='belm'?'BELM Service':feature} for ${c.name}. No customer data will be deleted.`);if(!conf){inp.checked=!desired;return}
        if(feature==='belm'){await api(`/customers/${id}/machinery-admin`,{method:'PUT',body:JSON.stringify({serviceProviderEnabled:desired,editPin:conf.editPin})});c.selfServiceEnabled=!desired}
        else{const payload=currentPayload(c);payload[feature]=desired;await api(`/customers/${id}/coordinator-features`,{method:'PUT',body:JSON.stringify({...payload,editPin:conf.editPin})});c.coordinatorFeatures=payload}
        render();
      }catch(e){inp.checked=!desired;alertBox.textContent=e.message;alertBox.hidden=false}finally{inp.disabled=false}
    }));
    box.querySelectorAll('select[data-department-key]').forEach(sel=>sel.addEventListener('change',async()=>{
      const card=sel.closest('.customer'),id=card.dataset.id,c=all.find(x=>x.id===id),key=sel.dataset.departmentKey,newState=sel.value,oldState=departmentState(c,key);sel.disabled=true;
      try{
        const conf=await confirmEdit(`${newState==='ENABLED'?'Add / enable':'Remove'} ${departmentLabels[key]} for ${c.name}. This changes access only; existing workflow records and history remain stored.`);if(!conf){sel.value=oldState;return}
        const d=await api(`/customers/${id}/coordinator-departments`,{method:'PUT',body:JSON.stringify({departments:{[key]:newState},editPin:conf.editPin})});c.departmentStates=d.departmentStates;render();
      }catch(e){sel.value=oldState;alertBox.textContent=e.message;alertBox.hidden=false}finally{sel.disabled=false}
    }));
    box.querySelectorAll('select[data-button-key]').forEach(sel=>sel.addEventListener('change',async()=>{
      const card=sel.closest('.customer'),id=card.dataset.id,c=all.find(x=>x.id===id),key=sel.dataset.buttonKey,newState=sel.value,oldState=buttonState(c.coordinatorFeatures||{},key,key==='parts'?'disabled':'enabled');sel.disabled=true;
      try{
        const conf=await confirmEdit(`Set Operator Machine Card button “${key}” to ${newState.toUpperCase()} for ${c.name}. Hidden only removes it from display; no function or data is deleted.`);if(!conf){sel.value=oldState;return}
        const payload=currentPayload(c);payload.machineCardButtons.operator[key]=newState;
        await api(`/customers/${id}/coordinator-features`,{method:'PUT',body:JSON.stringify({...payload,editPin:conf.editPin})});c.coordinatorFeatures=payload;render();
      }catch(e){sel.value=oldState;alertBox.textContent=e.message;alertBox.hidden=false}finally{sel.disabled=false}
    }));
  }
  async function load(){alertBox.hidden=true;try{all=await api('/customers/cwm-overview');render()}catch(e){box.innerHTML=`<div class="empty">${esc(e.message)}</div>`}}
  document.getElementById('search').oninput=render;document.getElementById('refresh').onclick=load;load();
})();
