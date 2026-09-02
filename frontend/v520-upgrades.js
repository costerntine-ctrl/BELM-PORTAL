(function(){
  function isCustomerMachineView(){
    return location.pathname==='/portal/dashboard' && new URLSearchParams(location.search).get('view')==='machines' && !!localStorage.getItem('belm_customer_token');
  }
  function installMachineViewBack(){
    if(!isCustomerMachineView()||document.getElementById('belmCustomerMachineBack'))return;
    const headings=[...document.querySelectorAll('h1,h2')];
    const heading=headings.find(el=>/machines/i.test((el.textContent||'').trim()));
    const request=[...document.querySelectorAll('button,a')].find(el=>/^\+?\s*request service$/i.test((el.textContent||'').trim()));
    const parent=request?.parentElement||heading?.parentElement;
    if(!parent)return;
    const link=document.createElement('a');
    link.id='belmCustomerMachineBack';
    link.className='belm-customer-machine-back';
    link.href='/portal/dashboard';
    link.setAttribute('aria-label','Back to Customer Dashboard');
    link.innerHTML='<span aria-hidden="true">&#8592;</span> Back to Dashboard';
    if(parent.firstChild)parent.insertBefore(link,parent.firstChild);else parent.appendChild(link);
  }
  function installChecklistSync(){
    if(!isCustomerMachineView()||document.getElementById('belmCustomerChecklistSyncControl'))return;
    const token=localStorage.getItem('belm_customer_token');
    const headings=[...document.querySelectorAll('h1,h2')];
    const heading=headings.find(el=>/machines/i.test((el.textContent||'').trim()));
    const request=[...document.querySelectorAll('button,a')].find(el=>/^\+?\s*request service$/i.test((el.textContent||'').trim()));
    const parent=request?.parentElement||heading?.parentElement;
    if(!parent)return;
    const box=document.createElement('div');
    box.id='belmCustomerChecklistSyncControl';box.className='belm-customer-checklist-sync-control';
    box.innerHTML='<button type="button" class="belm-customer-checklist-sync-button">Sync Checklist Template</button><span class="belm-customer-checklist-sync-status" role="status" aria-live="polite"></span>';
    if(request&&request.parentElement===parent)parent.insertBefore(box,request);else parent.appendChild(box);
    const button=box.querySelector('button'),status=box.querySelector('span');const set=(m,state='')=>{status.textContent=m;status.dataset.state=state};
    button.addEventListener('click',async()=>{const original=button.textContent;button.disabled=true;button.textContent='Syncing...';set('Checking current machine templates...','working');try{const r=await fetch('/api/customer-portal/dashboard',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)throw new Error('Could not load customer machines.');const d=await r.json(),machines=Array.isArray(d.machines)?d.machines:[];if(!machines.length){set('No machines registered yet. Add a machine first, then sync its Checklist Template.','missing');return;}let synced=0;const missing=[];for(const machine of machines){try{const x=await fetch(`/api/customer-portal/machines/${encodeURIComponent(machine.id)}/daily-checklist`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!x.ok){missing.push(machine.model||machine.machineType||'Machine');continue;}const j=await x.json();if(String(j?.sync?.status||'').toUpperCase()==='SYNCED')synced++;else missing.push(machine.model||machine.machineType||'Machine');}catch(_){missing.push(machine.model||machine.machineType||'Machine');}}if(!missing.length)set(`Synced ${synced}/${machines.length} machine${machines.length===1?'':'s'} with active Checklist Template${machines.length===1?'':'s'}.`,'synced');else set(`Synced ${synced}/${machines.length}. Missing template: ${missing.join(', ')}.`,'missing');}catch(e){set(e?.message||'Checklist Template sync failed.','error');}finally{button.disabled=false;button.textContent=original;}});
  }
  function installProcurementFuelRecord(){
    if(location.pathname!=='/customer-procurement/'&&location.pathname!=='/customer-procurement')return;
    if(document.getElementById('fuelConsumptionRecordLink'))return;
    const actions=document.querySelector('.download-actions');if(!actions)return;
    const link=document.createElement('a');link.className='secondary';link.id='fuelConsumptionRecordLink';link.textContent='Fuel Consumption Record';
    const machine=new URLSearchParams(location.search).get('machine');link.href=machine?`/customer-fuel-usage/?machine=${encodeURIComponent(machine)}`:'/customer-fuel-usage/';
    const receipts=document.getElementById('receiptsButton');if(receipts)actions.insertBefore(link,receipts);else actions.appendChild(link);
  }
  function openMachineFromSettings(){
    if(!isCustomerMachineView())return;const q=new URLSearchParams(location.search);if(q.get('action')!=='add-machine'||document.documentElement.dataset.v520AddMachine==='1')return;
    const find=()=>[...document.querySelectorAll('button,a')].find(el=>/^\+\s*add machine$/i.test((el.textContent||'').trim())||/^add machine$/i.test((el.textContent||'').trim()));let tries=0;const timer=setInterval(()=>{const btn=find();tries++;if(btn){clearInterval(timer);document.documentElement.dataset.v520AddMachine='1';btn.click();}else if(tries>20)clearInterval(timer);},150);
  }
  function run(){installMachineViewBack();installChecklistSync();installProcurementFuelRecord();openMachineFromSettings();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();const mo=new MutationObserver(run);mo.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>mo.disconnect(),12000);
})();