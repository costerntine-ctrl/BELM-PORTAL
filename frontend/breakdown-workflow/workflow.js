(function(){
  const embedded=new URLSearchParams(location.search).get('embed')==='1' && window.parent!==window;
  const customerToken=localStorage.getItem('belm_customer_token');
  const techToken=localStorage.getItem('belm_tech_token');
  const adminToken=localStorage.getItem('belm_admin_token');
  const params=new URLSearchParams(location.search);
  const requestedActor=String(params.get('actor')||params.get('source')||'').toLowerCase();
  const activeAccountType=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
  const actorToken={customer:customerToken,tech:techToken,technician:techToken,admin:adminToken};
  let source=['customer','tech','technician','admin'].includes(requestedActor)?(requestedActor==='technician'?'tech':requestedActor):'';
  if(source && !actorToken[source]){location.replace(source==='admin'?'/login':source==='tech'?'/tech':'/login');return}
  if(!source && ['customer','technician','admin'].includes(activeAccountType)){source=activeAccountType==='technician'?'tech':activeAccountType}
  if(!source || !actorToken[source]) source=customerToken?'customer':techToken?'tech':'admin';
  const token=actorToken[source]||null;

  let cases=[],selected=null,machines=[],jobTechnicians=[];
  let dispatchTechnicians=[],dispatchCustomers=[],dispatchMachines=[],dispatchJobCards=[];
  const machineFilter=params.get('machine')||'';
  const payload=parseToken(token);
  const customerRole=payload?.customerRole||payload?.role||'';
  const isOwner=source==='customer'&&payload?.actorType==='owner';
  const isBelmAdmin=source==='admin';
  const isWorkshop=isBelmAdmin||isOwner||customerRole==='workshop_manager'||customerRole==='admin';
  const isStore=isBelmAdmin||isOwner||customerRole==='store_keeper'||customerRole==='workshop_manager';
  const isProcurement=isBelmAdmin||isOwner||customerRole==='procurement';
  const isAccounts=isBelmAdmin||isOwner||customerRole==='accounts';
  const isTechnician=source==='tech';

  // V320: BELM staff use one Maintenance Process owner only: Engineering > Job Cards.
  // Customer workflow remains standalone for customer teams, while any legacy admin
  // bookmark is folded back into Engineering. Embedded mode is the canonical admin view.
  if(isBelmAdmin&&!embedded){
    const target=new URL('/engineering-manager/',location.origin);
    if(machineFilter)target.searchParams.set('machine',machineFilter);
    target.hash='job-cards';
    location.replace(`${target.pathname}${target.search}${target.hash}`);
    return;
  }

  if(isTechnician){
    const q=machineFilter?`?machine=${encodeURIComponent(machineFilter)}`:'';
    location.replace(`/technician-job-cards/${q}`);
    return;
  }

  function parseToken(t){if(!t)return null;try{const x=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(Array.from(atob(x)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')))}catch{return null}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
  function normalizeJobCard(job={}){
    const jobCardNo=String(job.job_card_no??job.jobCardNo??'').trim()||'Job Card';
    const title=String(job.title??job.service_type??job.serviceType??'').trim()||'Machine Breakdown';
    return {...job,job_card_no:jobCardNo,jobCardNo,customerId:job.customerId??job.customer_id??'',customer_id:job.customer_id??job.customerId??'',machineId:job.machineId??job.machine_id??'',machine_id:job.machine_id??job.machineId??'',customerName:job.customerName??job.customer_name??'Customer',machineLabel:job.machineLabel??job.machine_label??job.machine??'Machine',sourceType:job.sourceType??job.source_type??'',due_date:job.due_date??job.dueDate??'',dueDate:job.dueDate??job.due_date??'',title};
  }
  function fmtDate(v){if(!v)return '-';const raw=String(v).trim();const iso=/^\d{4}-\d{2}-\d{2} /.test(raw)?raw.replace(' ','T').replace(/([+-]\d{2})(?!:?\d{2})$/,'$1:00'):raw;const d=new Date(iso);if(Number.isNaN(d.getTime()))return raw;return d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  function duration(h){h=Number(h||0);return h>=24?`${(h/24).toFixed(h>=72?0:1)} days`:`${Math.round(h)} hrs`}
  function sourceLabel(c){const s=String(c?.sourceType||'MANUAL').toUpperCase();return s==='SERVICE_REQUEST'?'BELM SUPPORT':s==='OPERATOR_REPORT'?'PROBLEM REPORT':s==='PROCUREMENT'?'PROCUREMENT':'MANUAL CASE'}
  function show(msg,error=false){const e=document.getElementById('alertBox');e.textContent=msg;e.className=`alert${error?' error':''}`;setTimeout(()=>e.classList.add('hidden'),5000)}
  async function api(path,opt={}){const r=await fetch(`/api/breakdown-workflow${path}`,{...opt,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token||''}`,...(opt.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok){const error=new Error(data?.error||`Request failed (${r.status}).`);error.status=r.status;throw error}return data}
  async function engineeringApi(path,opt={}){const r=await fetch(`/api${path}`,{...opt,cache:'no-store',headers:{...(opt.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${adminToken||''}`,...(opt.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok){const error=new Error(data?.error||`Request failed (${r.status}).`);error.status=r.status;throw error}return data}
  if(!token){location.href='/';return}

  document.getElementById('backButton').onclick=()=>{if(embedded){window.parent.postMessage({type:'belm-engineering-open-service-requests'},window.location.origin);return;}location.href=source==='customer'?'/portal/dashboard':source==='tech'?'/tech':'/engineering-manager/#service-requests'};
  if(source!=='customer'||!isWorkshop) document.querySelectorAll('.customer-only').forEach(e=>e.classList.add('hidden'));
  if(!isWorkshop||isTechnician){document.getElementById('workshopReportPanel')?.classList.add('hidden');document.querySelector('.performance-panel')?.classList.add('hidden');}
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close)?.close());
  document.getElementById('refreshButton').onclick=load;
  document.getElementById('searchBox').oninput=renderList;

  function dispatchMode(){return document.querySelector('input[name="jobCardMode"]:checked')?.value||'existing'}
  function renderDispatchMachines(){
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const select=document.getElementById('dispatchMachine');if(!select)return;
    const current=select.value||'';
    const rows=dispatchMachines.filter(m=>!customerId||String(m.customer_id)===String(customerId));
    const placeholder=!customerId?'Select Customer first...':(rows.length?'Select Machine...':'No active machines for this customer');
    select.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(m=>{const label=[m.brand,m.model].filter(Boolean).join(' ')||m.machine_type||'Machine';const serial=m.serial_number?` · ${m.serial_number}`:'';return `<option value="${esc(m.id)}">${esc(label+serial)}</option>`}).join('');
    if(rows.some(m=>String(m.id)===String(current)))select.value=current;
  }
  function renderReceivedJobCards(){
    const select=document.getElementById('dispatchJobCard');if(!select)return;
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const current=select.value||'';
    const rows=dispatchJobCards.filter(job=>!customerId||String(job.customerId)===String(customerId));
    const placeholder=customerId&&!rows.length?'No received Job Cards for this customer':(!rows.length?'No received Job Cards waiting for dispatch':'Select received Job Card...');
    select.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(job=>{const src=String(job.sourceType||'')==='SERVICE_REQUEST'?'Service Request':'Customer Job Card';const serial=job.machineSerial?` · S/N ${job.machineSerial}`:'';return `<option value="${esc(job.id)}">${esc(`RECEIVED · ${job.jobCardNo} · ${job.customerName} · ${job.machineLabel}${serial} · ${job.title} · ${src}`)}</option>`}).join('');
    if(rows.some(job=>String(job.id)===String(current)))select.value=current;
    const dataList=document.getElementById('dispatchJobCardNoList');if(dataList)dataList.innerHTML=rows.map(job=>`<option value="${esc(job.proformaCode||job.jobCardNo)}">${esc(`${job.customerName} · ${job.machineLabel}`)}</option>`).join('');
    const help=document.getElementById('receivedJobCardHelp');if(help)help.textContent=rows.length?`${rows.length} received Job Card${rows.length===1?'':'s'} waiting for Technician assignment${customerId?' for this customer':''}.`:(customerId?'No unassigned received Job Card is waiting for this customer. You can still type a known JC / Proforma code in the field on the right.':'No unassigned received Job Cards are waiting. Service Requests are synchronized automatically when this list refreshes.');
  }
  function syncDispatchJcNumberFromSelection(){
    const input=document.getElementById('dispatchJobCardNo');if(!input)return;
    const selectedId=document.getElementById('dispatchJobCard')?.value||'';
    const job=dispatchJobCards.find(x=>String(x.id)===String(selectedId));
    if(job){
      input.value=job.proformaCode||job.jobCardNo||'';
      input.dataset.source='auto';
      input.classList.add('jc-auto-detected');input.classList.remove('jc-manual');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent=`Detected automatically: ${input.value}. This same code stays PENDING in Proforma until the Job Card is ready for billing.`;
    }else if(input.dataset.source==='auto'){
      input.value='';input.dataset.source='';input.classList.remove('jc-auto-detected');
    }
  }
  function resolveDispatchJobCardNumber(){
    const input=document.getElementById('dispatchJobCardNo');if(!input)return;
    const raw=String(input.value||'').trim();
    input.value=raw;
    input.classList.remove('jc-auto-detected','jc-manual');
    if(!raw){input.dataset.source='';return}
    const match=dispatchJobCards.find(job=>[job.jobCardNo,job.proformaCode,job.proformaInvoiceNo].filter(Boolean).some(code=>String(code).trim().toUpperCase()===raw.toUpperCase()));
    if(match){
      const select=document.getElementById('dispatchJobCard');if(select)select.value=match.id;
      const customer=document.getElementById('dispatchCustomer');if(customer)customer.value=match.customerId||'';
      document.getElementById('dispatchPriority').value=match.priority||'NORMAL';
      document.getElementById('dispatchDueDate').value=match.due_date||'';
      input.value=match.proformaCode||match.jobCardNo||raw;input.dataset.source='auto';input.classList.add('jc-auto-detected');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent=`Matched automatically to received Job Card ${match.jobCardNo}.`;
      renderReceivedJobCards();
      const reselect=document.getElementById('dispatchJobCard');if(reselect)reselect.value=match.id;
      updateDispatchNote();
    }else{
      input.dataset.source='manual';input.classList.add('jc-manual');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent='Manual JC / Proforma code entered. Assign will ask the server to find the matching received Job Card by this code.';
    }
  }
  function updateDispatchNote(){
    const techId=document.getElementById('dispatchTechnician')?.value||'';
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const tech=dispatchTechnicians.find(x=>String(x.id)===String(techId));
    const customer=dispatchCustomers.find(x=>String(x.id)===String(customerId));
    const note=document.getElementById('dispatchNote');if(!note)return;
    if(tech&&customer&&tech.assignedCustomerId&&String(tech.assignedCustomerId)!==String(customer.id)){note.innerHTML=`<b>TEMPORARY OVERRIDE:</b> ${esc(tech.name)} stays permanently attached to ${esc(tech.assignedCustomerName||'their home customer')}. Only this Job Card is for ${esc(customer.name)}.`;note.classList.add('override')}
    else if(tech&&customer){note.textContent=`${tech.name} is already attached to ${customer.name}; this Job Card is a normal assignment.`;note.classList.remove('override')}
    else{note.textContent=dispatchMode()==='existing'?'Select a received Job Card and Technician.':'Select a Technician, customer and machine to create a Job Card.';note.classList.remove('override')}
  }
  function syncJobCardSource(){
    const existing=dispatchMode()==='existing';
    document.getElementById('receivedJobCardField')?.classList.toggle('hidden',!existing);
    document.getElementById('dispatchJobCardNoField')?.classList.toggle('hidden',!existing);
    document.getElementById('dispatchMachineField')?.classList.toggle('hidden',existing);
    document.getElementById('dispatchTitleField')?.classList.toggle('hidden',existing);
    document.getElementById('dispatchDescriptionField')?.classList.toggle('hidden',existing);
    if(existing){const job=dispatchJobCards.find(x=>String(x.id)===String(document.getElementById('dispatchJobCard')?.value||''));if(job){const customer=document.getElementById('dispatchCustomer');if(customer)customer.value=job.customerId||'';document.getElementById('dispatchPriority').value=job.priority||'NORMAL';document.getElementById('dispatchDueDate').value=job.due_date||''}renderReceivedJobCards();if(job){const reselect=document.getElementById('dispatchJobCard');if(reselect)reselect.value=job.id}syncDispatchJcNumberFromSelection()}else renderDispatchMachines();
    updateDispatchNote();
  }
  async function loadDispatchOptions({announce=false,syncSources=true}={}){
    if(!isBelmAdmin)return;
    const panel=document.getElementById('dispatchPanel');if(!panel)return;
    const selectedValues={technicianId:document.getElementById('dispatchTechnician')?.value||'',customerId:document.getElementById('dispatchCustomer')?.value||'',machineId:document.getElementById('dispatchMachine')?.value||'',jobCardId:document.getElementById('dispatchJobCard')?.value||'',jobCardNo:document.getElementById('dispatchJobCardNo')?.value||''};
    try{
      const data=await engineeringApi(`/engineering?action=dispatch-options${syncSources?'':'&skipSync=1'}`);
      dispatchTechnicians=data.technicians||[];dispatchCustomers=data.customers||[];dispatchMachines=data.machines||[];dispatchJobCards=(data.receivedJobCards||[]).map(normalizeJobCard);
      const technicianSelect=document.getElementById('dispatchTechnician'),customerSelect=document.getElementById('dispatchCustomer');
      technicianSelect.innerHTML='<option value="">Select Technician...</option>'+dispatchTechnicians.map(tech=>{const home=tech.assignedCustomerName?` · Home: ${tech.assignedCustomerName}`:' · No home customer';return `<option value="${esc(tech.id)}">${esc(tech.name+home)}</option>`}).join('');
      customerSelect.innerHTML='<option value="">Select Customer...</option>'+dispatchCustomers.map(customer=>`<option value="${esc(customer.id)}">${esc(customer.name)}</option>`).join('');
      if(dispatchTechnicians.some(tech=>String(tech.id)===String(selectedValues.technicianId)))technicianSelect.value=selectedValues.technicianId;
      if(dispatchCustomers.some(customer=>String(customer.id)===String(selectedValues.customerId)))customerSelect.value=selectedValues.customerId;
      renderReceivedJobCards();if(dispatchJobCards.some(job=>String(job.id)===String(selectedValues.jobCardId)))document.getElementById('dispatchJobCard').value=selectedValues.jobCardId;
      const jcInput=document.getElementById('dispatchJobCardNo');if(jcInput&&selectedValues.jobCardNo&&!document.getElementById('dispatchJobCard')?.value){jcInput.value=selectedValues.jobCardNo;jcInput.dataset.source='manual';jcInput.classList.add('jc-manual')}else syncDispatchJcNumberFromSelection();
      renderDispatchMachines();if(dispatchMachines.some(machine=>String(machine.id)===String(selectedValues.machineId)))document.getElementById('dispatchMachine').value=selectedValues.machineId;
      syncJobCardSource();panel.classList.remove('hidden');
      if(announce){const received=Number(data.dispatchSync?.receivedJobCards??dispatchJobCards.length);if(data.dispatchSync?.error)show(`Technician Dispatch loaded ${received} received Job Card${received===1?'':'s'}, but source synchronization reported an error.`,true);else show(received?`Technician Dispatch refreshed: ${received} received Job Card${received===1?'':'s'} waiting for assignment.`:'Technician Dispatch refreshed. No received Job Cards are currently waiting for assignment.',false)}
    }catch(x){panel.classList.add('hidden');if(x.status!==403)show(x.message||'Could not load Technician Dispatch.',true)}
  }
  async function dispatchTechnician(e){
    e.preventDefault();
    const mode=dispatchMode(),technicianId=document.getElementById('dispatchTechnician').value,jobCardId=document.getElementById('dispatchJobCard')?.value||'',jobCardNo=document.getElementById('dispatchJobCardNo')?.value.trim()||'';
    const existingJob=dispatchJobCards.find(x=>String(x.id)===String(jobCardId));
    const customerId=mode==='existing'?(existingJob?.customerId||document.getElementById('dispatchCustomer').value||''):document.getElementById('dispatchCustomer').value;
    const tech=dispatchTechnicians.find(x=>String(x.id)===String(technicianId)),customer=dispatchCustomers.find(x=>String(x.id)===String(customerId));
    if(!technicianId){show('Select Technician.',true);return}if(mode==='existing'&&!jobCardId&&!jobCardNo){show('Select a received Job Card or fill the received JC Number / Proforma Code.',true);return}if(mode==='create'&&(!customerId||!document.getElementById('dispatchMachine').value||!document.getElementById('dispatchTitle').value.trim())){show('Customer, machine and Job Card title are required.',true);return}
    const temporary=Boolean(tech?.assignedCustomerId&&customerId&&String(tech.assignedCustomerId)!==String(customerId));
    if(temporary&&!confirm(`${tech.name} is attached to ${tech.assignedCustomerName||'another customer'}. Assign this Job Card to ${customer?.name||'the selected customer'} as a Temporary Override?`))return;
    try{
      const currentCaseId=selected?.case?.id||'';
      const result=await engineeringApi('/engineering?action=dispatch',{method:'POST',body:JSON.stringify({jobCardMode:mode,jobCardId,jobCardNo,technicianId,customerId,machineId:document.getElementById('dispatchMachine')?.value||'',title:document.getElementById('dispatchTitle')?.value.trim()||'',description:document.getElementById('dispatchDescription')?.value.trim()||'',priority:document.getElementById('dispatchPriority').value,dueDate:document.getElementById('dispatchDueDate').value||null,temporaryOverride:temporary})});
      show(`${result.jobCardNo||'Job Card'} assigned to Technician${result.temporaryOverride?' as Temporary Override':''}. Proforma sync: ${result.proformaStatus||'PENDING'} · code ${result.proformaCode||result.jobCardNo||jobCardNo}.`,false);
      document.getElementById('dispatchTitle').value='';document.getElementById('dispatchDescription').value='';document.getElementById('dispatchDueDate').value='';
      await load();if(currentCaseId)try{await openCase(currentCaseId)}catch{}
    }catch(x){show(x.message||'Could not assign the Job Card.',true)}
  }
  function initTechnicianDispatch(){
    const panel=document.getElementById('dispatchPanel');if(!panel)return;
    if(!isBelmAdmin){panel.classList.add('hidden');return}
    document.getElementById('dispatchTechnician')?.addEventListener('change',updateDispatchNote);
    document.getElementById('dispatchCustomer')?.addEventListener('change',()=>{if(dispatchMode()==='existing'){const jobSelect=document.getElementById('dispatchJobCard');if(jobSelect)jobSelect.value='';renderReceivedJobCards()}else renderDispatchMachines();updateDispatchNote()});
    document.getElementById('dispatchJobCard')?.addEventListener('change',syncJobCardSource);
    document.getElementById('dispatchJobCardNo')?.addEventListener('change',resolveDispatchJobCardNumber);
    document.getElementById('dispatchJobCardNo')?.addEventListener('blur',resolveDispatchJobCardNumber);
    document.getElementById('refreshReceivedJobCards')?.addEventListener('click',()=>loadDispatchOptions({announce:true}));
    document.querySelectorAll('input[name="jobCardMode"]').forEach(input=>input.addEventListener('change',syncJobCardSource));
    document.getElementById('dispatchForm')?.addEventListener('submit',dispatchTechnician);
  }

  function localIsoDate(){const d=new Date();const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10)}
  const reportDateEl=document.getElementById('reportDate');if(reportDateEl)reportDateEl.value=localIsoDate();
  function pct(v){return `${Number(v||0).toFixed(Number(v||0)%1?1:0)}%`}
  function reportDuration(v){const h=Number(v||0);return h>=24?`${(h/24).toFixed(1)}d`:`${h.toFixed(h%1?1:0)}h`}
  function renderDepartmentReport(r){const s=r.summary||{}, bottlenecks=r.bottlenecks||[], tech=r.technicians||[], faults=r.repeatFaults||[];document.getElementById('departmentReport').innerHTML=`<div class="department-report"><div class="report-scope"><b>${esc(r.scopeLabel)}</b><span>${esc(r.periodLabel)} · ${esc(String(r.period).toUpperCase())}</span></div><div class="report-kpis"><div class="report-kpi blue"><b>${s.newBreakdowns||0}</b><span>New breakdowns</span></div><div class="report-kpi green"><b>${s.completedJobs||0}</b><span>Jobs completed</span></div><div class="report-kpi red"><b>${s.delayedBreakdowns||0}</b><span>Delayed now</span></div><div class="report-kpi yellow"><b>${s.waitingParts||0}</b><span>Waiting parts/process</span></div><div class="report-kpi green"><b>${pct(s.firstTimeFixRate)}</b><span>First-time fix</span></div><div class="report-kpi blue"><b>${reportDuration(s.avgResolutionHours)}</b><span>Avg repair time</span></div></div><div class="analysis-grid"><div class="analysis-box"><h3>Where work is waiting now</h3><table class="analysis-table"><thead><tr><th>Department</th><th>Open</th><th>Delayed</th><th>Avg wait</th></tr></thead><tbody>${bottlenecks.length?bottlenecks.map(x=>`<tr><td><span class="delay-dot ${x.delayedCases?'red':''}"></span>${esc(x.department)}</td><td>${x.openCases}</td><td>${x.delayedCases}</td><td>${reportDuration(x.avgWaitHours)}</td></tr>`).join(''):'<tr><td colspan="4">No open bottleneck.</td></tr>'}</tbody></table></div><div class="analysis-box"><h3>Technician results - selected period</h3><table class="analysis-table"><thead><tr><th>Technician</th><th>Done</th><th>First fix</th><th>Avg time</th><th>Repeat</th></tr></thead><tbody>${tech.length?tech.map(x=>`<tr><td>${esc(x.technicianName)}</td><td>${x.completedJobs}/${Math.max(x.totalJobs,x.completedJobs)}</td><td>${pct(x.firstTimeFixRate)}</td><td>${reportDuration(x.avgResolutionHours)}</td><td>${x.repeatJobs}</td></tr>`).join(''):'<tr><td colspan="5">No Job Card activity in this period.</td></tr>'}</tbody></table></div><div class="analysis-box"><h3>Workshop control</h3><table class="analysis-table"><tbody><tr><td>Open breakdowns now</td><td><b>${s.openBreakdowns||0}</b></td></tr><tr><td>Waiting Administration approval</td><td><b>${s.waitingAdministration||0}</b></td></tr><tr><td>Job Cards created</td><td><b>${s.jobCardsCreated||0}</b></td></tr><tr><td>Breakdowns closed</td><td><b>${s.closedBreakdowns||0}</b></td></tr><tr><td>Repeat / rework jobs</td><td><b>${s.repeatJobs||0}</b></td></tr></tbody></table></div><div class="analysis-box"><h3>Repeat / common faults</h3><table class="analysis-table"><thead><tr><th>Fault / Job</th><th>Completed</th><th>Repeat</th></tr></thead><tbody>${faults.length?faults.map(x=>`<tr><td>${esc(x.title)}</td><td>${x.count}</td><td>${x.repeatCount}</td></tr>`).join(''):'<tr><td colspan="3">No completed fault data in this period.</td></tr>'}</tbody></table></div></div></div>`}
  async function loadDepartmentReport(){if(!isWorkshop||isTechnician)return;try{const p=document.getElementById('reportPeriod')?.value||'daily',d=document.getElementById('reportDate')?.value||localIsoDate();const r=await api(`/department-report?period=${encodeURIComponent(p)}&date=${encodeURIComponent(d)}`);renderDepartmentReport(r)}catch(x){const el=document.getElementById('departmentReport');if(el)el.innerHTML=`<div class="empty">${esc(x.message)}</div>`}}
  document.getElementById('reportRefresh')?.addEventListener('click',loadDepartmentReport);
  document.getElementById('reportPeriod')?.addEventListener('change',loadDepartmentReport);
  document.getElementById('reportDate')?.addEventListener('change',loadDepartmentReport);
  document.getElementById('reportPdf')?.addEventListener('click',async()=>{try{const p=document.getElementById('reportPeriod')?.value||'daily',d=document.getElementById('reportDate')?.value||localIsoDate();const r=await fetch(`/api/breakdown-workflow/department-report-pdf?period=${encodeURIComponent(p)}&date=${encodeURIComponent(d)}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Could not prepare Workshop report PDF.')}const blob=await r.blob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`Workshop-Department-Report-${p}-${d}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(x){show(x.message,true)}});

  async function loadMachines(){if(source!=='customer')return;try{const r=await fetch('/api/customer-portal/dashboard',{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();machines=d.machines||[];document.getElementById('caseMachine').innerHTML='<option value="">Select machine...</option>'+machines.map(m=>`<option value="${esc(m.id)}">${esc([m.brand,m.model].filter(Boolean).join(' ')||m.machineType)}</option>`).join('');if(machineFilter)document.getElementById('caseMachine').value=machineFilter}catch{}}
  document.getElementById('newCaseButton').onclick=()=>document.getElementById('caseDialog').showModal();
  document.getElementById('caseForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/case',{method:'POST',body:JSON.stringify({machineId:document.getElementById('caseMachine').value,description:document.getElementById('caseDescription').value})});document.getElementById('caseDialog').close();show('Breakdown case opened. Workshop now owns the next action.');await load();await openCase(d.id)}catch(x){show(x.message,true)}};

  function renderSummary(){const open=cases.filter(c=>c.status!=='COMPLETED');const delayed=open.filter(c=>c.delayed);const administration=open.filter(c=>c.stage==='PROCUREMENT'||c.stage==='BOSS_APPROVAL');const avg=open.length?open.reduce((a,c)=>a+Number(c.breakdownHours||0),0)/open.length:0;document.getElementById('summaryCards').innerHTML=`<div class="summary-card"><b>${open.length}</b><span>Open breakdowns</span></div><div class="summary-card red"><b>${delayed.length}</b><span>Delayed / SLA exceeded</span></div><div class="summary-card yellow"><b>${administration.length}</b><span>Waiting Procurement / approval</span></div><div class="summary-card green"><b>${duration(avg)}</b><span>Average open time</span></div>`}
  function renderList(){const q=document.getElementById('searchBox').value.toLowerCase().trim();const list=cases.filter(c=>!q||[c.machineLabel,c.department,c.stage,c.status,c.description,c.sourceType,sourceLabel(c)].join(' ').toLowerCase().includes(q));document.getElementById('caseList').innerHTML=list.length?list.map(c=>`<article class="case-card ${c.delayed?'delayed':''} ${c.status==='COMPLETED'?'closed':''}" data-case="${esc(c.id)}"><div class="case-title-line"><h3>${esc(c.machineLabel)}</h3><span class="pill source-pill">${esc(sourceLabel(c))}</span></div><div>${esc(c.description)}</div><div class="case-meta"><span class="pill ${c.delayed?'red':c.status==='COMPLETED'?'green':'yellow'}">${esc(c.delayed?'DELAYED':c.status)}</span><span class="pill">${esc(c.department)}</span><span class="pill">Breakdown ${esc(duration(c.breakdownHours))}</span>${c.delayed?`<span class="pill red">Delay ${esc(duration(c.delayHours))}</span>`:''}</div></article>`).join(''):`<div class="empty">${q?'No case matches this search.':'No open/synced breakdown cases. Problem Reports and official BELM Support Requests linked to a machine will appear here automatically.'}</div>`;document.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>openCase(e.dataset.case))}

  async function openCase(id){try{selected=await api(`/case/${encodeURIComponent(id)}`);selected={...selected,jobCards:(selected?.jobCards||[]).map(normalizeJobCard),spares:selected?.spares||[],events:selected?.events||[]};renderDetail()}catch(x){show(x.message,true)}}
  function spareActions(s){if(s.procurementRequestId||s.procurement_request_id)return `<span class="pill yellow">Managed in Procurement</span>`;if(s.status==='WAITING_BOSS_APPROVAL'&&isOwner)return `<button class="approve" data-approve="${s.id}">Administration Approve</button><button class="reject" data-reject="${s.id}">Reject</button>`;if(s.status==='APPROVED'&&isStore)return `<button class="approve" data-spare-status="${s.id}|STORE_AVAILABLE">Available in Store</button><button class="yellow" data-spare-status="${s.id}|PROCUREMENT_REQUIRED">Send Procurement</button>`;if(['PROCUREMENT_REQUIRED','ORDERED'].includes(s.status)&&isProcurement)return `<button class="yellow" data-spare-status="${s.id}|PI_WAITING_ACCOUNTS">Send to Accounts / PI</button><button class="blue" data-spare-status="${s.id}|ORDERED">Mark Ordered</button>`;if(s.status==='PI_WAITING_ACCOUNTS'&&isAccounts)return `<button class="blue" data-spare-status="${s.id}|ORDERED">Accounts cleared / Ordered</button>`;if(['STORE_AVAILABLE','ORDERED'].includes(s.status)&&(isStore||isWorkshop))return `<button class="approve" data-spare-status="${s.id}|PARTS_READY">Parts Ready for Repair</button>`;return ''}
  function serviceJobCardActions(j,c){
    const isService=String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST';
    const signed=Boolean(j.has_signed_copy);
    const finished=String(j.status||'').toUpperCase()==='COMPLETED';
    const caseClosed=String(c.status||'').toUpperCase()==='COMPLETED';
    let html='';
    if(isService && finished){
      html+=`<span class="pill ${signed?'green':'yellow'}">${signed?'CUSTOMER SIGNED':'WAITING SIGNED COPY'}</span>`;
      if(signed){
        html+=`<button class="approve" data-signed-job-view="${esc(j.id)}">View Signed Copy</button><button class="blue" data-signed-job-download="${esc(j.id)}">Download Signed Copy</button>`;
      }
      if(isBelmAdmin && caseClosed){
        html+=`<button class="yellow" data-signed-job-upload="${esc(j.id)}">${signed?'Replace Signed Copy':'Upload Customer-Signed Job Card'}</button><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-signed-job-file="${esc(j.id)}" hidden>`;
        if(signed){
          html+=`<button class="approve" data-job-billing="proforma" data-job-id="${esc(j.id)}">Prepare Proforma</button><button class="blue" data-job-billing="invoice" data-job-id="${esc(j.id)}">Prepare Invoice</button>`;
        }
      }
      if(source==='customer' && caseClosed && !signed){
        html+=`<span class="job-signoff-note">Print/download the Job Card, sign it, then give the signed copy to BELM for upload.</span>`;
      }
    }
    return html;
  }

  function renderJobCard(j,c){
    const awaitingTech=!j.technician_id && !['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase());
    const customerIssued=String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST'||String(j.issued_by_type||'').toUpperCase()==='CUSTOMER';
    return `<div class="job"><div class="job-head"><b>${esc(j.job_card_no)} - ${esc(j.title)}</b><span class="pill">${esc(j.status)}</span></div>
      ${customerIssued?`<div class="job-receipt-confirmation"><b>✓ RECEIVED BY BELM</b><span>${fmtDate(j.issued_at||j.created_at)} · Current: ${esc(String(j.status||'RECEIVED').replaceAll('_',' '))}</span></div>`:''}
      <small>Issued by: <b>${esc(j.issued_by_name||j.generated_by_name||c.customerName||'Customer')}</b> · ${fmtDate(j.issued_at||j.created_at)}</small>
      <small>Technician: ${esc(j.technician_name||'Unassigned')} · Created ${fmtDate(j.created_at)}</small>
      ${awaitingTech?'<div class="job-override-badge job-awaiting-tech">AWAITING TECHNICIAN ASSIGNMENT · Workshop / Dispatch action required</div>':''}
      ${j.temporary_override?`<div class="job-override-badge">TEMPORARY OVERRIDE · Home: ${esc(j.technician_home_customer_name||'Other customer')}</div>`:''}
      ${j.diagnosis?`<p><b>Diagnosis:</b> ${esc(j.diagnosis)}</p><p><b>Work done:</b> ${esc(j.work_done)}</p>${j.test_result?`<p><b>Test:</b> ${esc(j.test_result)}</p>`:''}`:''}
      ${j.billing_status&&j.billing_status!=='NOT_READY'?`<div class="job-billing-status"><b>Procurement / Billing:</b> ${esc(String(j.billing_status).replaceAll('_',' '))}</div>`:''}
      <div class="actions"><button class="blue" data-job-pdf="${esc(j.id)}">Download Job Card PDF</button>${isTechnician&&j.status!=='COMPLETED'?`<button class="blue" data-tech-report="${esc(j.id)}">Open / Save Job Report</button>`:''}${serviceJobCardActions(j,c)}</div></div>`;
  }

  async function signedJobFile(jobId, download=false){
    try{
      const r=await fetch(`/api/breakdown-workflow/signed-job-card-file/${encodeURIComponent(jobId)}${download?'?download=1':''}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Could not open signed Job Card.');}
      const blob=await r.blob();const u=URL.createObjectURL(blob);
      if(download){const a=document.createElement('a');a.href=u;a.download=`Signed-Job-Card-${jobId}`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}
      else{window.open(u,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(u),60000);}
    }catch(x){show(x.message,true)}
  }

  async function uploadSignedJobCard(jobId,file){
    if(!file)return;
    if(file.size>5*1024*1024){show('Signed Job Card is too large (max 5MB).',true);return;}
    if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)){show('Use PDF, JPG, PNG or WebP for the signed Job Card.',true);return;}
    const signedBy=prompt('Customer / supervisor name who signed this Job Card:','');
    if(!signedBy||!signedBy.trim())return;
    try{
      const fileData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read signed Job Card.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file)});
      await api(`/signed-job-card/${encodeURIComponent(jobId)}`,{method:'PUT',body:JSON.stringify({signedByName:signedBy.trim(),fileName:file.name,fileData})});
      show('Customer-signed Job Card uploaded. Procurement / Billing can now prepare Proforma or Invoice.');
      await openCase(selected.case.id);
    }catch(x){show(x.message,true)}
  }

  function openJobBilling(kind,jobId){
    const job=(selected?.jobCards||[]).find(x=>String(x.id)===String(jobId));
    const c=selected?.case;if(!job||!c)return;
    const prefill={customerId:c.customerId,machineId:c.machineId,sourceJobCardId:job.id,description:`Service ${job.job_card_no} - ${job.title}`,qty:1,unitPrice:0};
    sessionStorage.setItem(kind==='proforma'?'belm_prefill_proforma':'belm_prefill_invoice',JSON.stringify(prefill));
    location.href=`/billing-manager/?tab=${kind==='proforma'?'proformas':'invoices'}`;
  }

  function renderDetail(){
    const d=selected,c=d.case;
    const awaitingAssignment=c.stage==='TECHNICIAN_ASSIGNMENT';
    const mainJob=d.jobCards.find(j=>!['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase())) || d.jobCards[0] || null;
    const jobStatus=String(mainJob?.status||'').toUpperCase();
    const hasOpenSpare=d.spares.some(s=>!['REJECTED','PARTS_READY'].includes(String(s.status||'').toUpperCase()));
    const blockerText=c.blockerReason?esc(c.blockerReason):(awaitingAssignment?'Assign a Technician to the RECEIVED Job Card.':'No blocker reason recorded.');
    const focusClass=c.delayed?'delayed':c.status==='COMPLETED'?'complete':'';
    const focusTitle=c.status==='COMPLETED'?'COMPLETED - MACHINE RETURNED TO SERVICE':awaitingAssignment?`${c.delayed?'DELAYED - ':''}AWAITING TECHNICIAN ASSIGNMENT - WORKSHOP / DISPATCH OWNS THE NEXT ACTION`:`${c.delayed?'DELAYED - ':''}${esc(c.department)} OWNS THE NEXT ACTION`;
    const sparesHtml=d.spares.length?d.spares.map(s=>{const spareName=s.spareName??s.spare_name??'Spare';const partNumber=s.partNumber??s.part_number??'';const requestedBy=s.requestedByName??s.requested_by_name??'-';const requestedAt=s.requestedAt??s.requested_at;const approvedBy=s.approvedByName??s.approved_by_name;const approvedAt=s.approvedAt??s.approved_at;return `<div class="spare"><div class="spare-head"><b>${esc(spareName)} x ${esc(s.quantity)} ${esc(s.unit)}</b><span class="pill">${esc(String(s.status||'').replaceAll('_',' '))}</span></div><small>${esc(partNumber||'No part number')} · Requested by ${esc(requestedBy)} · ${fmtDate(requestedAt)}</small>${approvedBy?`<div><small>Administration: ${esc(approvedBy)} · ${fmtDate(approvedAt)}</small></div>`:''}<div class="actions">${spareActions(s)}</div></div>`}).join(''):'<div class="empty">No spare request on this case.</div>';
    const jobsHtml=d.jobCards.length?d.jobCards.map(j=>renderJobCard(j,c)).join(''):'<div class="empty">No Job Card yet.</div>';
    const timelineHtml=d.events.length?`<div class="timeline">${d.events.map(e=>`<div class="event"><b>${esc(e.action)} - ${esc(e.department)}</b><div>${esc(e.note||'')}</div><small>${esc(e.actor_name||'System')} · ${fmtDate(e.created_at)}</small></div>`).join('')}</div>`:'<div class="empty">No process event recorded.</div>';

    const processKey=c.status==='COMPLETED'?'COMPLETED':
      (c.stage==='TESTING'?'TESTING':
      (['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS','PARTS_READY'].includes(c.stage)||hasOpenSpare?'SPARES':
      (jobStatus==='IN_PROGRESS'||['DIAGNOSIS','REPAIR'].includes(c.stage)?'IN_PROGRESS':
      (jobStatus==='ASSIGNED'||c.stage==='JOB_CARD_ASSIGNED'?'ASSIGNED':'RECEIVED'))));
    const steps=[['RECEIVED','Received by BELM'],['ASSIGNED','Assigned'],['IN_PROGRESS','In Progress'],['SPARES','Spares'],['TESTING','Testing'],['COMPLETED','Completed']];
    const activeIndex=Math.max(0,steps.findIndex(([key])=>key===processKey));
    const processHtml=`<div class="job-process-card"><div class="job-process-title"><div><span>MAIN JOB CARD PROCESS</span><b>${mainJob?esc(mainJob.job_card_no+' · '+mainJob.title):'Waiting for Job Card'}</b></div>${mainJob?`<span class="pill">${esc(jobStatus||'RECEIVED')}</span>`:''}</div><div class="job-process-steps">${steps.map(([key,label],i)=>`<div class="job-process-step ${i<activeIndex?'done':i===activeIndex?'active':''}"><span>${i+1}</span><b>${label}</b></div>`).join('')}</div><div class="job-process-actions">${mainJob?`<button class="blue" data-job-pdf="${esc(mainJob.id)}">Download Main Job Card PDF</button>`:''}${(isWorkshop||isTechnician)&&c.status!=='COMPLETED'&&mainJob?'<button class="yellow" id="requestSpare">Request Spare</button>':''}${isWorkshop&&c.stage==='TESTING'?'<button class="approve" id="completeCase">Test Passed - Return to Service</button>':''}</div></div>`;
    const mainJobHtml=mainJob?`<div class="main-job-card"><div class="main-job-card-head"><div><span>MAIN JOB CARD</span><h3>${esc(mainJob.job_card_no)} · ${esc(mainJob.title)}</h3></div><span class="pill">${esc(jobStatus)}</span></div><div class="main-job-meta"><span>Issued by <b>${esc(mainJob.issued_by_name||mainJob.generated_by_name||c.customerName||'Customer')}</b></span>${String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST'||String(mainJob.issued_by_type||'').toUpperCase()==='CUSTOMER'?`<span>BELM Receipt <b>✓ RECEIVED · ${fmtDate(mainJob.issued_at||mainJob.created_at)}</b></span>`:''}<span>Technician <b>${esc(mainJob.technician_name||'Unassigned')}</b></span><span>Created <b>${fmtDate(mainJob.created_at)}</b></span></div>${mainJob.diagnosis?`<div class="main-job-summary"><p><b>Diagnosis:</b> ${esc(mainJob.diagnosis)}</p><p><b>Work done:</b> ${esc(mainJob.work_done||'-')}</p></div>`:''}<div class="actions"><button class="blue" data-job-pdf="${esc(mainJob.id)}">Download Job Card PDF</button></div></div>`:'<div class="main-job-card empty">No Main Job Card has been issued yet.</div>';

    document.getElementById('caseDetail').innerHTML=`<div class="detail">
      <div class="detail-title-row"><div><h2>${esc(c.machineLabel)}</h2><div class="detail-sub">${esc(c.title)} · ${esc(c.machineType||'')} · ${esc(c.serialNumber||'No serial')} · <b>${esc(sourceLabel(c))}</b></div></div><span class="pill ${c.status==='COMPLETED'?'green':c.delayed?'red':'yellow'}">${esc(c.status)}</span></div>
      <div class="workflow-focus ${focusClass}"><div><span>CURRENT PROCESS OWNER</span><strong>${focusTitle}</strong><small>Waiting here: ${esc(duration(c.stageHours))}${c.delayed?` · SLA exceeded by ${esc(duration(c.delayHours))}`:''}</small></div><div class="workflow-focus-reason"><span>WHY / BLOCKER</span><b>${blockerText}</b></div></div>
      <div class="status-box"><div><span>Breakdown Time</span><b>${esc(duration(c.breakdownHours))}</b></div><div><span>Current Stage</span><b>${esc(c.stage.replaceAll('_',' '))}</b></div><div><span>Department</span><b>${esc(c.department)}</b></div><div><span>Waiting Here</span><b>${esc(duration(c.stageHours))}</b></div></div>
      ${processHtml}
      <div class="actions workflow-primary-actions">${isWorkshop&&c.status!=='COMPLETED'&&d.jobCards.length===0?'<button class="blue" id="generateJob">+ Digital Job Card</button>':''}</div>
      <div class="workflow-tabs" role="tablist"><button type="button" class="active" data-workflow-tab="overview">Overview</button><button type="button" data-workflow-tab="jobs">Job Cards <span>${d.jobCards.length}</span></button><button type="button" data-workflow-tab="spares">Spares <span>${d.spares.length}</span></button><button type="button" data-workflow-tab="timeline">Timeline <span>${d.events.length}</span></button></div>
      <section class="workflow-tab-panel active" data-workflow-panel="overview">${mainJobHtml}<div class="workflow-overview-grid"><div><span>Reported issue</span><b>${esc(c.description||c.title||'-')}</b></div><div><span>Next responsible team</span><b>${esc(c.department)}</b></div><div><span>Open Job Cards</span><b>${d.jobCards.filter(j=>j.status!=='COMPLETED').length}</b></div><div><span>Open Spare Requests</span><b>${d.spares.filter(s=>!['REJECTED','PARTS_READY'].includes(s.status)).length}</b></div></div></section>
      <section class="workflow-tab-panel" data-workflow-panel="jobs"><div class="section tab-section collapsible-section" data-collapsible-section="jobs"><div class="section-head"><h3>Digital Job Cards</h3><button type="button" class="section-toggle" data-collapse-panel="jobs" aria-expanded="true">Hide</button></div><div class="section-content" data-collapse-content="jobs">${jobsHtml}</div></div></section>
      <section class="workflow-tab-panel" data-workflow-panel="spares"><div class="section tab-section"><h3>Spare Approval Process</h3>${sparesHtml}</div></section>
      <section class="workflow-tab-panel" data-workflow-panel="timeline"><div class="section tab-section collapsible-section" data-collapsible-section="timeline"><div class="section-head"><h3>Process Timeline</h3><button type="button" class="section-toggle" data-collapse-panel="timeline" aria-expanded="true">Hide</button></div><div class="section-content" data-collapse-content="timeline">${timelineHtml}</div></div></section>
    </div>`;
    wireDetail();
  }

  function wireDetail(){
    document.querySelectorAll('[data-workflow-tab]').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('[data-workflow-tab]').forEach(x=>x.classList.toggle('active',x===button));
      document.querySelectorAll('[data-workflow-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.workflowPanel===button.dataset.workflowTab));
    }));
    document.querySelectorAll('[data-collapse-panel]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.collapsePanel;const content=document.querySelector(`[data-collapse-content="${key}"]`);const section=document.querySelector(`[data-collapsible-section="${key}"]`);if(!content)return;
      const hidden=content.classList.toggle('hidden');if(section)section.classList.toggle('collapsed',hidden);button.textContent=hidden?'Show':'Hide';button.setAttribute('aria-expanded',hidden?'false':'true');
    }));
    document.getElementById('generateJob')?.addEventListener('click',openJob);
    document.getElementById('requestSpare')?.addEventListener('click',()=>{
      if(source==='customer'){location.href=`/customer-service-request/?machine=${encodeURIComponent(selected.case.machineId||selected.case.machine_id||machineFilter)}#procurement-spares`;return;}
      document.getElementById('spareCaseId').value=selected.case.id;const mainJob=(selected.jobCards||[]).find(j=>!['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase()))||(selected.jobCards||[])[0];document.getElementById('spareForm').dataset.jobCardId=mainJob?.id||'';document.getElementById('spareDialog').showModal();
    });
    document.getElementById('completeCase')?.addEventListener('click',async()=>{
      await api(`/stage/${selected.case.id}`,{method:'PUT',body:JSON.stringify({stage:'COMPLETED',note:'Workshop test passed; machine returned to service. Customer signature is required on BELM Service Job Cards before billing follow-up.'})});
      show('Machine returned to service. For BELM Service Jobs, collect the customer signature and upload the signed Job Card.');await load();await openCase(selected.case.id);
    });
    document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approveSpare(b.dataset.approve,true));
    document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>approveSpare(b.dataset.reject,false));
    document.querySelectorAll('[data-spare-status]').forEach(b=>b.onclick=async()=>{const [id,status]=b.dataset.spareStatus.split('|');const note=prompt('Process note / reason (optional):')||'';try{await api(`/spare-status/${id}`,{method:'PUT',body:JSON.stringify({status,note})});await openCase(selected.case.id);await load()}catch(x){show(x.message,true)}});
    document.querySelectorAll('[data-tech-report]').forEach(b=>b.onclick=()=>{document.getElementById('techJobId').value=b.dataset.techReport;document.getElementById('techReportDialog').showModal()});
    document.querySelectorAll('[data-job-pdf]').forEach(b=>b.onclick=async()=>{try{const r=await fetch(`/api/breakdown-workflow/job-card-pdf/${encodeURIComponent(b.dataset.jobPdf)}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Could not prepare Job Card PDF.')}const blob=await r.blob();const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`BELM-Job-Card-${b.dataset.jobPdf}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}catch(x){show(x.message,true)}});
    document.querySelectorAll('[data-signed-job-view]').forEach(b=>b.onclick=()=>signedJobFile(b.dataset.signedJobView,false));
    document.querySelectorAll('[data-signed-job-download]').forEach(b=>b.onclick=()=>signedJobFile(b.dataset.signedJobDownload,true));
    document.querySelectorAll('[data-signed-job-upload]').forEach(b=>b.onclick=()=>document.querySelector(`[data-signed-job-file="${b.dataset.signedJobUpload}"]`)?.click());
    document.querySelectorAll('[data-signed-job-file]').forEach(input=>input.onchange=()=>{const file=input.files?.[0];uploadSignedJobCard(input.dataset.signedJobFile,file);input.value='';});
    document.querySelectorAll('[data-job-billing]').forEach(b=>b.onclick=()=>openJobBilling(b.dataset.jobBilling,b.dataset.jobId));
  }
  async function loadJobTechnicians(showToast=false){
    const select=document.getElementById('jobTechnician');
    const status=document.getElementById('jobTechSyncStatus');
    const btn=document.getElementById('jobTechSync');
    if(!selected?.case?.customerId)return;
    if(btn)btn.disabled=true;
    if(status)status.textContent='Syncing...';
    try{
      jobTechnicians=await api(`/technicians?customerId=${encodeURIComponent(selected.case.customerId)}&_=${Date.now()}`);
      select.innerHTML='<option value="">Unassigned</option>'+jobTechnicians.map(x=>{
        const home=x.assignedCustomerName?` · Home: ${x.assignedCustomerName}`:'';
        const tag=x.temporaryForCustomer?' · TEMP OVERRIDE':'';
        return `<option value="${esc(x.id)}">${esc(x.name+home+tag)}</option>`;
      }).join('');
      if(status)status.textContent=jobTechnicians.length?`${jobTechnicians.length} technician${jobTechnicians.length===1?'':'s'} synced`:'0 technicians synced';
      if(showToast)show(jobTechnicians.length?`Technicians synced: ${jobTechnicians.length}.`:'No eligible Technician found for this customer.',!jobTechnicians.length);
    }catch(x){
      jobTechnicians=[];
      select.innerHTML='<option value="">Unassigned</option>';
      if(status)status.textContent='Sync failed';
      show(`Technician sync failed: ${x.message}`,true);
    }finally{if(btn)btn.disabled=false;}
  }
  async function openJob(){
    document.getElementById('jobCaseId').value=selected.case.id;
    document.getElementById('jobTitle').value=selected.case.title;
    const note=document.getElementById('jobOverrideNote');
    if(note){note.classList.add('hidden');note.textContent='';}
    // V263 - "Send to BELM instead" only makes sense for an actual
    // Customer actor requesting BELM's help. It was showing up
    // unconditionally, including on BELM's own Admin/Workshop
    // dashboard - nonsensical there, since BELM Admin IS BELM.
    const sendRow=document.getElementById('jobSendToBelm')?.closest('.belm-send-row');
    if(sendRow) sendRow.classList.toggle('hidden', source!=='customer');
    document.getElementById('jobDialog').showModal();
    await loadJobTechnicians(false);
  }
  document.getElementById('jobTechSync')?.addEventListener('click',()=>loadJobTechnicians(true));
  document.getElementById('jobSendToBelm')?.addEventListener('click',()=>{
    const machineId=selected?.case?.machineId||'';
    const description=selected?.case?.description||selected?.case?.title||'';
    const url=`/customer-service-request/?machine=${encodeURIComponent(machineId)}${description?`&note=${encodeURIComponent(description)}`:''}`;
    location.href=url;
  });
  document.getElementById('jobTechnician')?.addEventListener('change',e=>{
    const tech=jobTechnicians.find(x=>String(x.id)===String(e.target.value));
    const note=document.getElementById('jobOverrideNote');
    if(!note)return;
    if(tech?.temporaryForCustomer){
      note.textContent=`Temporary Override: ${tech.name} remains attached to ${tech.assignedCustomerName||'their home customer'}. This Job Card only will be shared.`;
      note.classList.remove('hidden');
    }else{note.classList.add('hidden');note.textContent='';}
  });
  let isGeneratingJobCard=false;
  document.getElementById('jobForm').onsubmit=async e=>{
    e.preventDefault();
    // V264 - guard against a fast double-click/tap firing this twice and
    // creating a duplicate Job Card, and give clear "Sent" feedback on
    // the button itself before resetting the form for the next use.
    if(isGeneratingJobCard)return;
    isGeneratingJobCard=true;
    const submitBtn=document.getElementById('jobGenerateSubmit');
    const originalLabel=submitBtn.textContent;
    submitBtn.disabled=true;
    submitBtn.textContent='Generating…';
    try{
      const techId=document.getElementById('jobTechnician').value;
      const tech=jobTechnicians.find(x=>String(x.id)===String(techId));
      const temporaryOverride=Boolean(tech?.temporaryForCustomer);
      if(temporaryOverride&&!confirm(`${tech.name} is attached to ${tech.assignedCustomerName||'another customer'}. Use Temporary Override for this Job Card only?`)){
        submitBtn.disabled=false;submitBtn.textContent=originalLabel;isGeneratingJobCard=false;return;
      }
      const r=await api('/job-card',{method:'POST',body:JSON.stringify({caseId:document.getElementById('jobCaseId').value,title:document.getElementById('jobTitle').value,technicianId:techId,temporaryOverride})});
      submitBtn.textContent='✓ Sent';
      await new Promise(resolve=>setTimeout(resolve,900));
      document.getElementById('jobForm').reset();
      document.getElementById('jobDialog').close();
      show(`Job Card ${r.jobCardNo} generated${temporaryOverride?' with Temporary Override':''}.`);
      await load();await openCase(selected.case.id);
    }catch(x){show(x.message,true)}
    finally{submitBtn.disabled=false;submitBtn.textContent=originalLabel;isGeneratingJobCard=false;}
  };
  document.getElementById('spareForm').onsubmit=async e=>{e.preventDefault();try{await api('/spare',{method:'POST',body:JSON.stringify({caseId:document.getElementById('spareCaseId').value,jobCardId:document.getElementById('spareForm').dataset.jobCardId||'',spareName:document.getElementById('spareName').value,partNumber:document.getElementById('sparePart').value,quantity:Number(document.getElementById('spareQty').value),unit:document.getElementById('spareUnit').value,reason:document.getElementById('spareReason').value})});document.getElementById('spareDialog').close();show('Spare request sent to Administration for approval.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}};
  async function approveSpare(id,approve){const note=prompt(approve?'Administration approval note (optional):':'Reason for rejection:')||'';try{await api(`/approve-spare/${id}`,{method:'PUT',body:JSON.stringify({approve,note})});show(approve?'Spare approved by Administration.':'Spare request rejected.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}}
  document.getElementById('techReportForm').onsubmit=async e=>{e.preventDefault();try{await api(`/job-report/${document.getElementById('techJobId').value}`,{method:'PUT',body:JSON.stringify({diagnosis:document.getElementById('techDiagnosis').value,workDone:document.getElementById('techWork').value,testResult:document.getElementById('techTest').value,completionNote:document.getElementById('techNote').value,repeatIssue:document.getElementById('techRepeat').checked,complete:document.getElementById('techComplete').checked})});document.getElementById('techReportDialog').close();show('Digital Job Card report saved.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}};
  async function loadPerformance(){try{const rows=await api('/performance');document.getElementById('performanceGrid').innerHTML=rows.length?rows.map(r=>`<article class="tech-card"><strong>${esc(r.technicianName)}</strong><div class="metrics"><div><span>Completed</span><b>${r.completedJobs}/${r.totalJobs}</b></div><div><span>Completion rate</span><b>${r.completionRate}%</b></div><div><span>First-time fix</span><b>${r.firstTimeFixRate}%</b></div><div><span>Avg resolution</span><b>${duration(r.avgResolutionHours)}</b></div><div><span>Repeat / rework</span><b>${r.repeatJobs}</b></div></div></article>`).join(''):'<div class="empty">No completed Job Card data yet.</div>'}catch(x){document.getElementById('performanceGrid').innerHTML=`<div class="empty">${esc(x.message)}</div>`}}
  async function load(){
    const syncStatus=document.getElementById('syncStatus');
    try{
      if(syncStatus){
        syncStatus.textContent='Syncing Problem Reports, BELM Support Requests and Job Cards...';
        syncStatus.classList.remove('sync-error');
      }

      let sync=null;
      let syncError=null;
      try{sync=await api('/sync')}catch(error){syncError=error}
      if(!syncError&&sync?.sync?.error){
        syncError=new Error(String(sync.sync.error));
      }

      cases=await api(machineFilter?`?machineId=${encodeURIComponent(machineFilter)}`:'');
      renderSummary();
      renderList();

      if(syncStatus){
        const made=Number(sync?.sync?.created||0);
        const requests=Number(sync?.sync?.serviceRequests||0);
        const reports=Number(sync?.sync?.operatorReports||0);
        if(syncError){
          const failed=Number(sync?.sync?.failedSources||0),inconsistent=Number(sync?.sync?.inconsistencies||0);
          const detail=(failed||inconsistent)?` (${failed} failed source${failed===1?'':'s'}, ${inconsistent} unresolved consistency issue${inconsistent===1?'':'s'})`:'';
          syncStatus.textContent=`Workflow loaded, but source sync needs attention: ${syncError.message}${detail}`;
          syncStatus.classList.add('sync-error');
        }else if(made>0){
          syncStatus.textContent=`${made} missing workflow case${made===1?'':'s'} restored. ${requests} Service Request${requests===1?'':'s'} and ${reports} Problem Report${reports===1?'':'s'} checked.`;
        }else{
          syncStatus.textContent=`Synced: ${requests} Service Request${requests===1?'':'s'} + ${reports} Problem Report${reports===1?'':'s'} + Digital Job Cards.`;
        }
      }

      // If the main source sync succeeded, Dispatch only reads the already
      // reconciled rows. If it failed, Dispatch gets one independent retry.
      if(isBelmAdmin)await loadDispatchOptions({syncSources:Boolean(syncError)});
      await Promise.allSettled([loadPerformance(),loadDepartmentReport()]);
      if(syncError)show('Maintenance data loaded, but full source synchronization did not complete. Use Sync / Refresh again after checking the API.',true);
    }catch(x){
      show(x.message,true);
      if(syncStatus){
        syncStatus.textContent='Sync failed - use Sync / Refresh after checking the API.';
        syncStatus.classList.add('sync-error');
      }
      document.getElementById('caseList').innerHTML=`<div class="empty">${esc(x.message)}</div>`;
    }
  }
  if(embedded){
    const reportEmbedHeight=()=>{
      const height=Math.ceil(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight));
      window.parent.postMessage({type:'belm-breakdown-workflow-height',height},window.location.origin);
    };
    window.addEventListener('load',reportEmbedHeight);
    window.addEventListener('resize',reportEmbedHeight);
    if(window.ResizeObserver)new ResizeObserver(reportEmbedHeight).observe(document.body);
    window.setTimeout(reportEmbedHeight,100);
  }
  initTechnicianDispatch();loadMachines();load();
})();
