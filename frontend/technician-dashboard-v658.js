(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  if(window.__belmTechDashboard658)return;
  window.__belmTechDashboard658=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const token=()=>localStorage.getItem('belm_tech_token')||'';
  const user=()=>{try{return JSON.parse(localStorage.getItem('belm_tech_user')||'{}')}catch(_){return{}}};
  const payload=()=>{try{const t=token().split('.')[1];return t?JSON.parse(atob(t.replace(/-/g,'+').replace(/_/g,'/'))):{}}catch(_){return{}}};
  const customerId=()=>user().assignedCustomerId||user().assigned_customer_id||payload().assignedCustomerId||payload().assigned_customer_id||'';
  const api=async(url,opts={})=>{const r=await fetch(url,{cache:'no-store',...opts,headers:{...(opts.headers||{}),Authorization:`Bearer ${token()}`}});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||d?.message||`Request failed (${r.status})`);return d};
  const reportDate=value=>{if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime())){const p=String(value).slice(0,10).split('-');return p.length===3?`${p[2]}.${p[1]}.${p[0].slice(-2)}`:String(value)}return [String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),String(d.getFullYear()).slice(-2)].join('.')};
  const reportFile=async(url,name,button,print=false)=>{const old=button.textContent;button.disabled=true;button.textContent='Preparing…';try{const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Could not prepare report.')}const blob=await r.blob(),href=URL.createObjectURL(blob);if(print){const w=window.open(href,'_blank');if(!w)throw new Error('Allow pop-ups to print this report.');setTimeout(()=>{try{w.print()}catch(_){}},900)}else{const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove()}setTimeout(()=>URL.revokeObjectURL(href),60000)}finally{button.disabled=false;button.textContent=old}};

  function condition(machine){
    const raw=String(machine?.status||machine?.machineStatus||machine?.machine_status||'UNKNOWN').toUpperCase();
    if(raw.includes('RED')||raw.includes('CRITICAL'))return{status:'RED',label:'Critical condition',note:'Do not operate until the fault is corrected.'};
    if(raw.includes('YELLOW')||raw.includes('WARNING'))return{status:'YELLOW',label:'Attention required',note:'Inspect and correct the reported condition.'};
    if(raw.includes('GREEN')||raw.includes('NORMAL')||raw.includes('OK'))return{status:'GREEN',label:'Normal condition',note:'Machine condition is within the accepted range.'};
    return{status:'UNKNOWN',label:'Condition not checked',note:'Complete a machine check-up to establish current condition.'};
  }
  function operator(machine){
    const r=machine?.latestOperatorMessage||machine?.latest_operator_message||null;
    if(!r||!String(r.message||'').trim())return{text:'No operator message reported yet.',meta:'Waiting for Operator report'};
    const who=String(r.operatorName||r.operator_name||'Operator').trim();
    return{text:String(r.message).trim(),meta:`${who}${r.status?` · ${String(r.status).toUpperCase()}`:''}`};
  }
  function reasons(machine,c){
    const a=Array.isArray(machine?.alertReasons)?machine.alertReasons.filter(Boolean):Array.isArray(machine?.alert_reasons)?machine.alert_reasons.filter(Boolean):[];
    if(a.length)return a.join(' · ');
    if(c.status==='RED')return 'Critical machine alert — do not operate until corrected.';
    if(c.status==='YELLOW')return 'Machine needs attention — inspection or maintenance is required.';
    if(c.status==='GREEN')return 'No active machine alert.';
    return 'Machine condition has not been checked yet.';
  }
  function opValue(machine){return String(machine?.operationalStatus||machine?.operational_status||'NORMAL').toUpperCase()}
  const opLabels={NORMAL:'Normal',SERVICE_IN_PROGRESS:'Service in progress',CHECKUP_IN_PROGRESS:'Check-up in progress',MAINTENANCE_IN_PROGRESS:'Maintenance in progress',GROUNDED:'Grounded'};

  function modal(title,html){
    document.getElementById('belmTech658Modal')?.remove();
    const d=document.createElement('dialog');d.id='belmTech658Modal';d.className='belm-tech658-modal';
    d.innerHTML=`<section><header><div><small>BELM Technician</small><h2>${esc(title)}</h2></div><button type="button" data-close>×</button></header><div class="belm-tech658-modal-body">${html}</div></section>`;
    document.body.appendChild(d);d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return d;
  }
  async function openReports(machine){
    const d=modal(`${machine.model||'Machine'} — Reports`,'<p class="loading">Loading machine reports…</p>');
    try{
      const data=await api(`/api/checklist-reports/technician-general?machineId=${encodeURIComponent(machine.id)}`);
      const types=[['checklists','Checklist Report',data?.checklists||[],data?.counts?.checklists||0],['operator','Operator Report',data?.operatorReports||[],data?.counts?.operatorReports||0],['fuel','Fuel Report',data?.fuelReports||[],data?.counts?.fuelReports||0],['job-cards','Job Card Reports',data?.jobCards||[],data?.counts?.jobCards||0],['maintenance','Maintenance Report',data?.maintenanceReports||[],data?.counts?.maintenanceReports||0]];
      const body=d.querySelector('.belm-tech658-modal-body');
      const checked=date=>`<span class="checked-date">${esc(reportDate(date))} · CHECKED</span>`;
      const rowHtml=(key,rows)=>rows.length?`<div class="report-list">${rows.map(r=>{if(key==='checklists')return `<article><b>${esc(r.templateName||'Checklist Report')}</b>${checked(r.createdAt)}<small>${esc(r.status||'GREEN')} · Hour meter: ${esc(r.hourMeterReading??'—')} · ${esc(r.filledBy||'Not recorded')}</small></article>`;if(key==='operator')return `<article><b>${esc(r.operatorName||'Operator')}</b>${checked(r.createdAt)}<small>${esc(r.status||'OPEN')} · ${esc(r.message||'No message')}</small></article>`;if(key==='fuel')return `<article><b>${esc(r.litres||0)} Litres · TZS ${Number(r.cost||0).toLocaleString('en-TZ')}</b>${checked(r.date||r.createdAt)}<small>${esc(r.description||'Fuel')} · By ${esc(r.loggedBy||'Not recorded')}</small></article>`;if(key==='job-cards')return `<article><b>${esc(r.jobCardNo||'Job Card')} · ${esc(r.title||'Maintenance')}</b>${checked(r.completedAt||r.createdAt)}<small>${esc(r.status||'OPEN')} · ${esc(r.faultDescription||'')}</small></article>`;return `<article><b>${esc(r.serviceType||'Maintenance')}</b>${checked(r.date)}<small>Hour meter: ${esc(r.hourMeterReading??'—')} · ${esc(r.recordedBy||'Not recorded')}</small></article>`}).join('')}</div>`:'<p class="empty-report">No report records found.</p>';
      body.innerHTML=`<div class="machine-report-types">${types.map(([key,title,rows,count])=>`<article class="machine-report-type"><div><b>${esc(title)}</b><small>${Number(count)} report(s)</small></div><div class="machine-report-actions"><button type="button" data-report-view="${key}">View Report</button></div></article>`).join('')}</div>`;
      body.querySelectorAll('[data-report-view]').forEach(button=>button.onclick=()=>{location.href=`/tech-report/?machineId=${encodeURIComponent(machine.id)}&category=${encodeURIComponent(button.dataset.reportView)}&v=665`});

    }catch(e){d.querySelector('.belm-tech658-modal-body').innerHTML=`<p>${esc(e.message)}</p>`}
  }
  async function openServiceParts(machine){
    const d=modal(`${machine.model||'Machine'} — Service Parts`,'<p class="loading">Loading service parts…</p>');
    try{
      const data=await api(`/api/customers/machines/${encodeURIComponent(machine.id)}/service-parts`);
      const list=Array.isArray(data)?data:(Array.isArray(data?.parts)?data.parts:[]);
      d.querySelector('.belm-tech658-modal-body').innerHTML=`<div class="service-kit"><b>Service Kit</b><span>${esc(machine.serviceKit||machine.service_kit||'Not recorded')}</span></div>${list.length?`<div class="report-list">${list.map(p=>`<article><b>${esc(p.name||p.partName||p.part_name||p.reference||'Part')}</b><span>${esc(p.reference||p.partNumber||p.part_number||'')}</span><small>${esc(p.quantity??p.qty??'')}</small></article>`).join('')}</div>`:'<p>No service-parts list recorded for this machine.</p>'}`;
    }catch(e){d.querySelector('.belm-tech658-modal-body').innerHTML=`<div class="service-kit"><b>Service Kit</b><span>${esc(machine.serviceKit||machine.service_kit||'Not recorded')}</span></div><p>${esc(e.message)}</p>`}
  }

  function card(machine,nativeButton){
    const c=condition(machine),op=operator(machine),model=machine.model||machine.machineModel||'Machine',type=machine.machineType||machine.machine_type||'Machine',serial=machine.serialNumber||machine.serial_number||machine.regNumber||machine.reg_number||'—',fleet=machine.fleetNumber||machine.fleet_number||'—',status=opValue(machine);
    const el=document.createElement('article');
    el.className=`belm-tech658-card status-${c.status.toLowerCase()}`;el.dataset.machineId=machine.id||'';
    el.innerHTML=`
      <div class="top"><div><h2>${esc(model)}</h2><div class="identity">${esc(type)} · ${esc(serial)}</div></div><div class="fleet"><small>FLEET NO.</small><b>${esc(fleet)}</b></div></div>
      <div class="stripe"></div>
      <section class="health"><div><small>MACHINE STATUS</small><strong>${esc(c.status)}</strong></div><div><small>CONDITION</small><strong>${esc(c.label)}</strong><p>${esc(c.note)}</p></div></section>
      <section class="alerts"><div class="operator"><small>OPERATOR MESSAGE</small><strong>${esc(op.text)}</strong><p>${esc(op.meta)}</p></div><div class="machine-alert"><small>MACHINE ALERT</small><strong>${esc(reasons(machine,c))}</strong><p>Service range: ${esc(machine.serviceRange||machine.service_range||'checking…')}</p></div></section>
      <details><summary><b>MACHINE DETAILS</b><span>Type, registration, serial & service kit</span></summary><div class="detail-grid"><div><small>Brand</small><b>${esc(machine.brand||'Not recorded')}</b></div><div><small>Machine Type</small><b>${esc(type)}</b></div><div><small>Serial No.</small><b>${esc(machine.serialNumber||machine.serial_number||'Not recorded')}</b></div><div><small>Registration</small><b>${esc(machine.regNumber||machine.reg_number||'Not recorded')}</b></div><div><small>Service Kit</small><b>${esc(machine.serviceKit||machine.service_kit||'Not recorded')}</b></div><div><small>Last Checked</small><b>${esc(machine.lastCheckedAt||machine.last_checked_at||'Never checked')}</b></div></div></details>
      <section class="activity"><div><b>ACTIVITY STATUS</b><small>Synced live to Customer and BELM</small></div><select aria-label="Activity Status">${Object.entries(opLabels).map(([v,l])=>`<option value="${v}" ${v===status?'selected':''}>${esc(l)}</option>`).join('')}</select></section>
      <div class="actions"><button class="report" type="button">▤ <span>Report</span></button><button class="check" type="button">▣ <span>Check Up</span>${c.status==='RED'||c.status==='YELLOW'?'<i>!</i>':''}</button><button class="parts" type="button">⚙ <span>Service Parts</span></button><button class="jobs" type="button">▰ <span>Machine Job Cards</span></button></div>`;
    el.querySelector('.report').onclick=e=>{e.stopPropagation();openReports(machine)};
    el.querySelector('.parts').onclick=e=>{e.stopPropagation();openServiceParts(machine)};
    el.querySelector('.jobs').onclick=e=>{e.stopPropagation();location.href=`/technician-job-cards/?machine=${encodeURIComponent(machine.id)}`};
    el.querySelector('.check').onclick=e=>{e.stopPropagation();try{sessionStorage.setItem('belm_current_checkup_machine_id',machine.id)}catch(_){}nativeButton?.click()};
    el.querySelector('select').onchange=async e=>{const s=e.currentTarget;s.disabled=true;try{await api(`/api/customers/machines/${encodeURIComponent(machine.id)}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationalStatus:s.value})});machine.operationalStatus=s.value}catch(err){alert(err.message);s.value=status}finally{s.disabled=false}};
    return el;
  }

  function rawButtons(){
    const all=[...document.querySelectorAll('button')];
    return all.filter(b=>{if(b.closest('header,nav,dialog,.belm-tech658-card'))return false;const t=(b.textContent||'').trim();return t.length>2&&(/Reach Stacker|Forklift|Crane|Loader|Excavator|Stacker/i.test(t)||/\b\d{6,}\b/.test(t))});
  }
  async function render(){
    if(document.body.dataset.belmTech658Ready==='1')return;
    const cid=customerId();if(!cid)return;
    let customer;try{customer=await api(`/api/customers/${encodeURIComponent(cid)}`)}catch(_){return}
    const machines=Array.isArray(customer?.machines)?customer.machines:[];if(!machines.length)return;
    const buttons=rawButtons();if(!buttons.length)return;
    const host=buttons[0].parentElement;if(!host)return;
    document.body.dataset.belmTech658Ready='1';document.body.classList.add('belm-tech658-page');
    const heading=[...document.querySelectorAll('h1,h2,h3')].find(x=>(x.textContent||'').trim().toLowerCase()==='your customer');if(heading)heading.textContent='Your Machines';
    host.classList.add('belm-tech658-grid');
    machines.forEach(m=>{const model=String(m.model||'').trim(),serial=String(m.serialNumber||m.serial_number||m.regNumber||m.reg_number||'').trim();const native=buttons.find(b=>{const t=b.textContent||'';return model&&t.includes(model)&&(!serial||t.includes(serial))})||buttons.find(b=>!b.dataset.belmMatched);if(!native)return;native.dataset.belmMatched='1';native.classList.add('belm-tech658-native');native.hidden=true;host.appendChild(card(m,native))});
  }

  const style=document.createElement('style');style.textContent=`
    body.belm-tech658-page{background:#071426!important;color:#fff!important}.belm-tech658-grid{display:grid!important;grid-template-columns:minmax(0,690px)!important;justify-content:center!important;gap:22px!important}.belm-tech658-native{display:none!important}
    .belm-tech658-card{--status:#8190a4;--rgb:129,144,164;background:#03162a;color:#fff;border:3px solid var(--status);border-radius:26px;padding:26px;box-shadow:0 0 24px rgba(var(--rgb),.2),0 18px 46px rgba(0,0,0,.34);font-family:Inter,system-ui,Arial,sans-serif;text-align:left}.belm-tech658-card.status-red{--status:#ff2638;--rgb:255,38,56}.belm-tech658-card.status-yellow{--status:#f6b500;--rgb:246,181,0}.belm-tech658-card.status-green{--status:#12c44b;--rgb:18,196,75}
    .belm-tech658-card .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.belm-tech658-card h2{margin:4px 0 26px;font-size:31px;line-height:1;font-weight:950;color:#fff}.belm-tech658-card .identity{color:#aebdce;font-size:13px;font-weight:700;text-transform:uppercase}.belm-tech658-card .fleet{min-width:170px;padding:11px 13px;border:2px solid #0a79bd;border-radius:16px;background:#04172a}.belm-tech658-card .fleet small{display:block;color:#b9c6d5;font-size:10px;font-weight:900}.belm-tech658-card .fleet b{display:block;margin-top:5px;font-size:18px}.belm-tech658-card .stripe{height:5px;border-radius:3px;background:linear-gradient(90deg,#10a8f5 0 28%,#10c64d 28% 75%,#f5b500 75%);margin:6px 0 24px}
    .belm-tech658-card .health{display:grid;grid-template-columns:.7fr 1.5fr;gap:26px;background:#f4f4f2;color:#152034;border:1px solid #fff;border-left:8px solid var(--status);border-radius:22px;padding:24px 22px}.belm-tech658-card .health small,.belm-tech658-card .alerts small{display:block;font-size:11px;font-weight:950;letter-spacing:.04em}.belm-tech658-card .health strong{display:block;color:var(--status);font-size:20px;font-weight:950;margin-top:10px}.belm-tech658-card .health p{font-size:12px;line-height:1.4;margin:8px 0 0}
    .belm-tech658-card .alerts{margin-top:18px;padding:15px;border:1px solid #0b78bd;border-radius:22px;background:#021329}.belm-tech658-card .operator{padding:21px 18px;border:3px solid var(--status);border-radius:20px;box-shadow:0 0 16px rgba(var(--rgb),.48)}.belm-tech658-card .alerts small{color:#18a9f4}.belm-tech658-card .alerts strong{display:block;color:var(--status);font-size:16px;line-height:1.3;margin-top:10px}.belm-tech658-card .alerts p{margin:10px 0 0;color:#c3cedb;font-size:12px}.belm-tech658-card .machine-alert{margin-top:14px;padding:15px;border:1px solid #17466f;border-radius:16px;background:#04172a}
    .belm-tech658-card details{margin-top:16px;border:1px solid #174160;border-radius:16px;background:#04172a;overflow:hidden}.belm-tech658-card summary{position:relative;display:flex;align-items:center;gap:16px;min-height:62px;padding:0 52px 0 18px;cursor:pointer;list-style:none}.belm-tech658-card summary::-webkit-details-marker{display:none}.belm-tech658-card summary span{margin-left:auto;color:#a8b7c9;font-size:10px}.belm-tech658-card summary:after{content:'+';position:absolute;right:18px;color:#18a9f4;font-size:30px}.belm-tech658-card details[open] summary:after{content:'−'}.belm-tech658-card .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 14px}.belm-tech658-card .detail-grid div{padding:10px;border:1px solid #173e60;border-radius:10px;background:#021329}.belm-tech658-card .detail-grid small{display:block;color:#7ea4c4;font-size:9px;text-transform:uppercase}.belm-tech658-card .detail-grid b{display:block;margin-top:4px;font-size:11px}
    .belm-tech658-card .activity{display:grid;grid-template-columns:1fr minmax(220px,.9fr);gap:16px;align-items:center;margin-top:16px;padding:16px 18px;border:1px solid #173e60;border-radius:16px;background:#04172a}.belm-tech658-card .activity>div>b{display:block;font-size:14px}.belm-tech658-card .activity>div>small{display:block;color:#a8b7c9;font-size:10px;margin-top:6px}.belm-tech658-card select{height:48px;padding:0 14px;border:2px solid #16b83f;border-radius:12px;background:#021329;color:#fff;font-weight:850}
    .belm-tech658-card .actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:24px}.belm-tech658-card .actions button{position:relative;min-height:76px;border-radius:14px;border:1px solid #174160;color:#fff;font-weight:900;font-size:12px}.belm-tech658-card .actions .report{background:#04172a}.belm-tech658-card .actions .check{background:#0d8ed7;border-color:#128edf}.belm-tech658-card .actions .parts{background:#11b940;border-color:#12b83f}.belm-tech658-card .actions .jobs{background:#f7b50a;border-color:#f6ad00;color:#172033}.belm-tech658-card .actions i{position:absolute;right:-6px;top:-12px;width:30px;height:30px;display:grid;place-items:center;border:2px solid #07182a;border-radius:50%;background:#f7b500;color:#111;font-style:normal;font-size:18px}
    .belm-tech658-modal{width:min(720px,94vw);border:0;padding:0;border-radius:20px;background:#03162a;color:#fff}.belm-tech658-modal::backdrop{background:rgba(0,0,0,.72)}.belm-tech658-modal section{padding:20px}.belm-tech658-modal header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #174160;padding-bottom:14px}.belm-tech658-modal h2{margin:4px 0 0;font-size:20px}.belm-tech658-modal header small{color:#17a8f4;font-weight:900}.belm-tech658-modal header button{border:0;background:transparent;color:#fff;font-size:30px}.belm-tech658-modal-body{padding-top:16px}.machine-report-types{display:grid;gap:11px}.machine-report-type{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid #174160;border-radius:13px;background:#04172a}.machine-report-type.active{border-color:#18a9f4;box-shadow:0 0 0 2px rgba(24,169,244,.12)}.machine-report-type>div:first-child{display:grid;gap:4px}.machine-report-type small{color:#9fb0c8}.machine-report-actions{display:flex;gap:8px}.machine-report-actions button{padding:8px 10px;border:1px solid #1684ff;border-radius:9px;background:#0d4fa3;color:#fff;font-size:11px;font-weight:900}.machine-report-actions button+button{border-color:#12b83f;background:#087b43}.machine-report-view{margin-top:14px;padding:14px;border:1px solid #174160;border-radius:13px;background:#021329}.machine-report-view h3{margin:0}.opened-report-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.opened-report-head>div{display:flex;gap:7px;flex-wrap:wrap}.opened-report-head button{padding:7px 9px;border:1px solid #1684ff;border-radius:8px;background:#0d4fa3;color:#fff;font-size:10px;font-weight:900}.checked-date{color:#65e489!important;font-weight:900}.empty-report{color:#aebdce}.report-list{display:grid;gap:10px}.report-list article,.service-kit{display:grid;gap:4px;padding:12px;border:1px solid #174160;border-radius:12px;background:#04172a}.report-list article span,.report-list article small,.service-kit span{color:#aebdce}
    @media(max-width:720px){.belm-tech658-grid{grid-template-columns:1fr!important}.belm-tech658-card{padding:17px;border-width:2px;border-radius:20px}.belm-tech658-card .top{gap:10px}.belm-tech658-card h2{font-size:25px}.belm-tech658-card .fleet{min-width:118px;padding:8px}.belm-tech658-card .fleet b{font-size:14px}.belm-tech658-card .health{grid-template-columns:105px 1fr;gap:12px;padding:17px 14px}.belm-tech658-card .health strong{font-size:16px}.belm-tech658-card .activity{grid-template-columns:1fr;gap:10px}.belm-tech658-card .actions{gap:7px}.belm-tech658-card .actions button{min-height:64px;font-size:10px;padding:8px 4px}}
    @media(max-width:520px){.opened-report-head{align-items:stretch;flex-direction:column}.opened-report-head>div{display:grid;grid-template-columns:repeat(3,1fr)}.machine-report-type{align-items:stretch;flex-direction:column}.machine-report-actions{display:grid;grid-template-columns:1fr 1fr}.machine-report-actions button{width:100%}}\n    @media(max-width:430px){.belm-tech658-card .top{display:block}.belm-tech658-card .fleet{margin-bottom:14px}.belm-tech658-card .health{grid-template-columns:1fr}.belm-tech658-card .actions{grid-template-columns:1fr 1fr}.belm-tech658-card .actions button{font-size:11px}}
  `;document.head.appendChild(style);

  const observer=new MutationObserver(()=>render());observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
  setTimeout(render,300);setTimeout(render,1000);setTimeout(render,2500);
})();