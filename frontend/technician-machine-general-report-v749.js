(()=>{
  if(!location.pathname.startsWith('/tech')||window.__belmTechnicianMachineGeneralReport749)return;
  window.__belmTechnicianMachineGeneralReport749=true;

  const token=()=>localStorage.getItem('belm_tech_token')||'';
  const user=()=>{try{return JSON.parse(localStorage.getItem('belm_tech_user')||'{}')}catch(_){return{}}};
  const payload=()=>{try{const part=token().split('.')[1];if(!part)return{};const x=part.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(x+'='.repeat((4-x.length%4)%4)))}catch(_){return{}}};
  const customerId=()=>user().assignedCustomerId||user().assigned_customer_id||payload().assignedCustomerId||payload().assigned_customer_id||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const api=async(url,opts={})=>{const r=await fetch(url,{cache:'no-store',...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${token()}`}});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||d?.message||`Request failed (${r.status})`);return d};
  let customerCache=null;

  async function customer(){
    if(customerCache)return customerCache;
    const cid=customerId();
    if(!cid)throw new Error('Assigned customer was not found.');
    customerCache=await api(`/api/customers/${encodeURIComponent(cid)}`);
    return customerCache;
  }

  function machineValue(m,keyA,keyB){return String(m?.[keyA]??m?.[keyB]??'').trim()}
  function findMachine(button,machines){
    const explicit=new URLSearchParams(location.search).get('machine')||new URLSearchParams(location.search).get('machineId')||sessionStorage.getItem('belm_selected_machine_id')||sessionStorage.getItem('belm_current_checkup_machine_id')||'';
    if(explicit){const match=machines.find(m=>String(m.id)===String(explicit));if(match)return match}
    let node=button;
    for(let depth=0;node&&node!==document.body&&depth<9;depth++,node=node.parentElement){
      const txt=String(node.textContent||'').toLowerCase();
      let best=null,bestScore=0;
      machines.forEach(m=>{
        let score=0;
        const values=[machineValue(m,'fleetNumber','fleet_number'),machineValue(m,'serialNumber','serial_number'),machineValue(m,'regNumber','reg_number'),machineValue(m,'model','machineModel')].filter(v=>v&&v!=='—');
        values.forEach((v,i)=>{if(txt.includes(v.toLowerCase()))score+=i<3?4:2});
        if(score>bestScore){best=m;bestScore=score}
      });
      if(bestScore>=2)return best;
    }
    return machines.length===1?machines[0]:null;
  }

  const reportCategories=[
    ['checklists','Checklist Report','Daily, inspection and machine check-up records'],
    ['operator','Operator Report','Operator messages, daily condition and reported issues'],
    ['fuel','Fuel Report','Fuel quantity, cost and consumption records'],
    ['job-cards','Job Card Report','Assigned, active and completed Job Card history'],
    ['maintenance','Maintenance Report','Service and maintenance history']
  ];

  function injectStyle(){
    if(document.getElementById('belm-machine-general-report-v749-style'))return;
    const style=document.createElement('style');style.id='belm-machine-general-report-v749-style';style.textContent=`
      #belmMachineGeneralReport749{width:min(1120px,96vw);max-height:92vh;padding:0;border:1px solid #36577d;border-radius:20px;background:#081728;color:#eff6ff;box-shadow:0 28px 90px rgba(0,0,0,.58);font-family:Inter,Arial,sans-serif}
      #belmMachineGeneralReport749::backdrop{background:rgba(1,8,19,.8);backdrop-filter:blur(4px)}
      .mgr749-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:20px 24px;border-bottom:1px solid #274463;background:linear-gradient(135deg,#123b68,#0b2039)}
      .mgr749-head small{display:block;color:#67e994;font-weight:900;letter-spacing:.1em}.mgr749-head h2{margin:4px 0 4px;font-size:26px}.mgr749-head p{margin:0;color:#afc4d9;font-size:12px}.mgr749-close{border:0;background:transparent;color:#fff;font-size:30px;cursor:pointer}
      .mgr749-body{padding:20px 22px 24px;overflow:auto}.mgr749-loading,.mgr749-error{padding:28px;text-align:center;color:#bcd0e3}.mgr749-error{color:#ffc1c9}
      .mgr749-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.mgr749-card{border:1px solid #315170;border-radius:16px;padding:18px;background:linear-gradient(180deg,#10243b,#091727);box-shadow:0 10px 25px rgba(0,0,0,.18)}
      .mgr749-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.mgr749-card h3{margin:0;font-size:18px;color:#fff}.mgr749-card p{margin:6px 0 0;color:#93aac1;font-size:11px;line-height:1.45}.mgr749-count{min-width:56px;padding:7px 9px;border:1px solid #426685;border-radius:999px;text-align:center;color:#bcd2e7;font-size:10px;font-weight:900}
      .mgr749-period{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:17px 0 13px}.mgr749-period label{display:grid;gap:5px;color:#a7bdd2;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.mgr749-period input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #395b7b;border-radius:9px;background:#06111f;color:#fff;color-scheme:dark;font:700 12px Inter,Arial,sans-serif}
      .mgr749-actions{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px}.mgr749-actions button{min-height:40px;border-radius:9px;border:1px solid #3d617f;background:#142d48;color:#fff;font-weight:900;font-size:11px;cursor:pointer}.mgr749-actions [data-view]{background:#1976d2;border-color:#1976d2}.mgr749-actions [data-pdf]{background:#0f8b4c;border-color:#0f8b4c}.mgr749-actions [data-csv]{background:#c99b00;border-color:#c99b00;color:#101820}.mgr749-actions button:disabled{opacity:.55;cursor:wait}
      @media(max-width:760px){.mgr749-grid{grid-template-columns:1fr}.mgr749-head{padding:17px}.mgr749-body{padding:15px}.mgr749-actions{grid-template-columns:1fr 1fr 1fr}}
      @media(max-width:430px){.mgr749-actions{grid-template-columns:1fr}.mgr749-period{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(style);
  }

  async function download(url,name,button){
    const old=button.textContent;button.disabled=true;button.textContent='Preparing...';
    try{const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||`Download failed (${r.status})`)}const blob=await r.blob();const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000)}finally{button.disabled=false;button.textContent=old}
  }

  function periodParams(card,category,machineId){
    const from=card.querySelector('[data-from]').value||'',to=card.querySelector('[data-to]').value||'';
    if(from&&to&&from>to)throw new Error('From date cannot be after To date.');
    const p=new URLSearchParams({category,machineId:String(machineId)});if(from)p.set('from',from);if(to)p.set('to',to);return p;
  }

  async function openGeneralReport(machine){
    injectStyle();document.getElementById('belmMachineGeneralReport749')?.remove();
    const d=document.createElement('dialog');d.id='belmMachineGeneralReport749';
    const fleet=machineValue(machine,'fleetNumber','fleet_number'),model=machineValue(machine,'model','machineModel')||machineValue(machine,'machineType','machine_type')||'Machine';
    d.innerHTML=`<div class="mgr749-head"><div><small>MACHINE GENERAL REPORT</small><h2>${esc(model)}</h2><p>${fleet?`Fleet ${esc(fleet)} · `:''}Select report period, then View, PDF or CSV.</p></div><button class="mgr749-close" type="button">×</button></div><div class="mgr749-body"><div class="mgr749-loading">Loading machine report summary...</div></div>`;
    document.body.appendChild(d);d.querySelector('.mgr749-close').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();
    try{
      const data=await api(`/api/checklist-reports/technician-general?machineId=${encodeURIComponent(machine.id)}`);
      const counts={checklists:data?.counts?.checklists??data?.checklists?.length??0,operator:data?.counts?.operatorReports??data?.operatorReports?.length??0,fuel:data?.counts?.fuelReports??data?.fuelReports?.length??0,'job-cards':data?.counts?.jobCards??data?.jobCards?.length??0,maintenance:data?.counts?.maintenanceReports??data?.maintenanceReports?.length??0};
      const body=d.querySelector('.mgr749-body');
      body.innerHTML=`<div class="mgr749-grid">${reportCategories.map(([key,title,note])=>`<article class="mgr749-card" data-category="${key}"><div class="mgr749-card-top"><div><h3>${esc(title)}</h3><p>${esc(note)}</p></div><span class="mgr749-count">${Number(counts[key]||0)} REPORT${Number(counts[key]||0)===1?'':'S'}</span></div><div class="mgr749-period"><label>From<input type="date" data-from></label><label>To<input type="date" data-to></label></div><div class="mgr749-actions"><button type="button" data-view>VIEW</button><button type="button" data-pdf>PDF</button><button type="button" data-csv>CSV</button></div></article>`).join('')}</div>`;
      body.querySelectorAll('.mgr749-card').forEach(card=>{
        const category=card.dataset.category;
        card.querySelector('[data-view]').onclick=()=>{try{const p=periodParams(card,category,machine.id);p.set('v','749');location.href=`/tech-report/?${p.toString()}`}catch(e){alert(e.message)}};
        card.querySelector('[data-pdf]').onclick=e=>{try{const p=periodParams(card,category,machine.id);download(`/api/checklist-reports/technician-general/pdf?${p.toString()}`,`BELM-${model}-${category}-report.pdf`,e.currentTarget).catch(err=>alert(err.message))}catch(err){alert(err.message)}};
        card.querySelector('[data-csv]').onclick=e=>{try{const p=periodParams(card,category,machine.id);download(`/api/checklist-reports/technician-general/csv?${p.toString()}`,`BELM-${model}-${category}-report.csv`,e.currentTarget).catch(err=>alert(err.message))}catch(err){alert(err.message)}};
      });
    }catch(e){d.querySelector('.mgr749-body').innerHTML=`<div class="mgr749-error">${esc(e.message||'Could not load Machine General Report.')}</div>`}
  }

  async function handle(button){
    try{const c=await customer();const machines=Array.isArray(c?.machines)?c.machines:[];const machine=findMachine(button,machines);if(!machine)throw new Error('Could not identify this machine. Open the machine again and retry.');await openGeneralReport(machine)}catch(e){alert(e.message||'Could not open Machine General Report.')}
  }

  function isChecklistReportButton(button){const t=String(button.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();return t==='checklist reports'||t==='checklist report'}
  function scan(){document.querySelectorAll('button').forEach(button=>{if(!isChecklistReportButton(button)||button.dataset.machineGeneralReport749==='1')return;button.dataset.machineGeneralReport749='1';button.textContent='Machine General Report';button.setAttribute('aria-label','Machine General Report');button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();handle(button)},true)})}
  const observer=new MutationObserver(()=>requestAnimationFrame(scan));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{scan();observer.observe(document.body,{childList:true,subtree:true})},{once:true});else{scan();observer.observe(document.body,{childList:true,subtree:true})}
})();