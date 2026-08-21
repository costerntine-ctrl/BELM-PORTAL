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

  let cases=[],selected=null,machines=[],jobTechnicians=[],inlineTechnicians=[],queueTechnicians=[];
  let dispatchTechnicians=[],dispatchCustomers=[],dispatchMachines=[],dispatchJobCards=[],jobProcessRows=[];
  const machineFilter=params.get('machine')||'';
  const payload=parseToken(token);
  const customerRole=payload?.customerRole||payload?.role||'';
  const isOwner=source==='customer'&&payload?.actorType==='owner';
  const isCustomerAdmin=source==='customer'&&(isOwner||customerRole==='admin');
  const isBelmAdmin=source==='admin';
  const isWorkshop=isBelmAdmin||isOwner||customerRole==='workshop_manager'||customerRole==='admin';
  const isStore=isBelmAdmin||isOwner||customerRole==='store_keeper'||customerRole==='workshop_manager';
  const isProcurement=isBelmAdmin||isOwner||customerRole==='procurement';
  const isAccounts=isBelmAdmin||isOwner||customerRole==='accounts';
  const isTechnician=source==='tech';
  const requestedView=String(params.get('view')||'').toLowerCase();
  const adminWorkshopAnalysisOnly=Boolean(isBelmAdmin&&embedded&&requestedView==='analysis');
  const adminJobCardsDispatchOnly=Boolean(isBelmAdmin&&embedded&&!adminWorkshopAnalysisOnly);
  if(adminJobCardsDispatchOnly)document.documentElement.classList.add('admin-job-cards-dispatch-only');
  if(adminWorkshopAnalysisOnly)document.documentElement.classList.add('admin-workshop-analysis-only');

  // V320: BELM staff use one Maintenance Process owner only: TECHNICAL DEP > Job Card.
  // Customer workflow remains standalone for customer teams, while any legacy admin
  // bookmark is folded back into TECHNICAL DEP. Embedded mode is the canonical admin view.
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
    const technicianId=job.technicianId??job.technician_id??'';
    const technicianName=job.technicianName??job.technician_name??'';
    const jobLocation=job.jobLocation??job.job_location??job.customerAddress??job.customer_address??'';
    return {...job,job_card_no:jobCardNo,jobCardNo,customerId:job.customerId??job.customer_id??'',customer_id:job.customer_id??job.customerId??'',machineId:job.machineId??job.machine_id??'',machine_id:job.machine_id??job.machineId??'',customerName:job.customerName??job.customer_name??'Customer',machineLabel:job.machineLabel??job.machine_label??job.machine??'Machine',sourceType:job.sourceType??job.source_type??'',due_date:job.due_date??job.dueDate??'',dueDate:job.dueDate??job.due_date??'',jobLocation,job_location:jobLocation,technicianId,technician_id:technicianId,technicianName,technician_name:technicianName,dispatchStatus:String(job.dispatchStatus??job.status??'RECEIVED').toUpperCase(),title};
  }
  function fmtDate(v){if(!v)return '-';const raw=String(v).trim();const iso=/^\d{4}-\d{2}-\d{2} /.test(raw)?raw.replace(' ','T').replace(/([+-]\d{2})(?!:?\d{2})$/,'$1:00'):raw;const d=new Date(iso);if(Number.isNaN(d.getTime()))return raw;return d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
  function duration(h){h=Number(h||0);return h>=24?`${(h/24).toFixed(h>=72?0:1)} days`:`${Math.round(h)} hrs`}
  function sourceLabel(c){const s=String(c?.sourceType||'BREAKDOWN_CASE').toUpperCase();return s==='SERVICE_REQUEST'?'CUSTOMER JOB CARD':s==='OPERATOR_REPORT'?'OPERATOR REPORTED':s==='CHECKLIST_REPORT'?'CHECKLIST / TECH REPORT':s==='TECHNICIAN_REPORT'?'TECHNICIAN REPORT':s==='JOB_CARD'?'JOB CARD':s==='PROCUREMENT'?'PROCUREMENT':'BREAKDOWN CASE'}
  function show(msg,error=false){const e=document.getElementById('alertBox');e.textContent=msg;e.className=`alert${error?' error':''}`;setTimeout(()=>e.classList.add('hidden'),5000)}
  // V329: every workflow button gives immediate tactile/visual feedback on click.
  document.addEventListener('pointerdown',event=>{
    const button=event.target.closest?.('button');
    if(!button||button.disabled)return;
    button.classList.remove('button-pressed');
    void button.offsetWidth;
    button.classList.add('button-pressed');
    window.setTimeout(()=>button.classList.remove('button-pressed'),260);
  },true);
  function setActionButtonState(button,state,label=''){
    if(!button)return;
    if(!button.dataset.idleLabel)button.dataset.idleLabel=(button.textContent||'').trim();
    button.classList.remove('action-busy','action-success','action-error');
    if(state==='busy'){
      button.disabled=true;
      button.classList.add('action-busy');
      if(label)button.textContent=label;
      return;
    }
    button.disabled=false;
    if(state==='success')button.classList.add('action-success');
    if(state==='error')button.classList.add('action-error');
    if(label)button.textContent=label;
    if(state==='idle'){
      button.textContent=button.dataset.idleLabel||button.textContent;
      delete button.dataset.idleLabel;
    }
  }
  async function api(path,opt={}){const r=await fetch(`/api/breakdown-workflow${path}`,{...opt,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token||''}`,...(opt.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok){const error=new Error(data?.error||`Request failed (${r.status}).`);error.status=r.status;throw error}return data}
  async function engineeringApi(path,opt={}){const r=await fetch(`/api${path}`,{...opt,cache:'no-store',headers:{...(opt.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${adminToken||''}`,...(opt.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok){const error=new Error(data?.error||`Request failed (${r.status}).`);error.status=r.status;throw error}return data}
  if(!token){location.href='/';return}

  document.getElementById('backButton').onclick=()=>{if(embedded){window.parent.postMessage({type:'belm-engineering-open-service-requests'},window.location.origin);return;}location.href=source==='customer'?'/portal/dashboard':source==='tech'?'/tech':'/engineering-manager/#job-cards'};
  if(source!=='customer'||!isWorkshop) document.querySelectorAll('.customer-only').forEach(e=>e.classList.add('hidden'));
  if(!isWorkshop||isTechnician){document.getElementById('workshopReportPanel')?.classList.add('hidden');document.querySelector('.performance-panel')?.classList.add('hidden');}
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close)?.close());
  document.getElementById('refreshButton').onclick=load;
  document.getElementById('searchBox').oninput=renderList;


  function jobProcessClass(code){return String(code||'ASSIGNED').toLowerCase().replaceAll('_','-')}
  function renderJobProcess(){
    const panel=document.getElementById('jobProcessPanel'),body=document.getElementById('jobProcessBody');
    if(!panel||!body)return;
    if(!isBelmAdmin){panel.classList.add('hidden');return}
    panel.classList.remove('hidden');
    body.innerHTML=jobProcessRows.length?jobProcessRows.map(row=>`<tr>
      <td>${esc(row.job_card_no||row.jobCardNo||'Job Card')}<span class="job-process-updated">${esc(fmtDate(row.updated_at||row.updatedAt))}</span></td>
      <td>${esc(row.technicianName||'Unassigned')}</td>
      <td><b>${esc(row.fleetNumber||'—')}</b></td>
      <td>${esc(row.companyName||'Customer')}</td>
      <td class="job-process-address">${esc(row.address||'—')}</td>
      <td><span class="job-process-state ${jobProcessClass(row.processCode)}">${esc(row.processLabel||'Assigned')}</span>${row.processDetail?`<small class="job-process-detail">${esc(row.processDetail)}</small>`:''}</td>
    </tr>`).join(''):'<tr><td colspan="6" class="job-process-empty">No assigned Job Card process yet.</td></tr>';
  }
  async function loadJobProcess(){
    if(!isBelmAdmin)return;
    try{jobProcessRows=await engineeringApi('/engineering?action=job-process');renderJobProcess()}
    catch(error){const body=document.getElementById('jobProcessBody');if(body)body.innerHTML=`<tr><td colspan="6" class="job-process-empty">${esc(error.message||'Could not load Job Card process.')}</td></tr>`}
  }

  function dispatchMode(){return document.querySelector('input[name="jobCardMode"]:checked')?.value||'existing'}
  function dispatchCustomerAddress(customerId){const row=dispatchCustomers.find(c=>String(c.id)===String(customerId));return String(row?.address||row?.customerAddress||'').trim()}
  function syncDispatchLocation(force=false){const input=document.getElementById('dispatchLocation');if(!input)return;const existing=dispatchMode()==='existing';const selectedJob=dispatchJobCards.find(x=>String(x.id)===String(document.getElementById('dispatchJobCard')?.value||''));const candidate=existing?String(selectedJob?.jobLocation||'').trim():dispatchCustomerAddress(document.getElementById('dispatchCustomer')?.value||'');if(force||!input.value.trim())input.value=candidate}
  function normalizeDispatchMachine(machine={}){
    const customerId=machine.customerId??machine.customer_id??'';
    const machineType=machine.machineType??machine.machine_type??'';
    const serialNumber=machine.serialNumber??machine.serial_number??'';
    return {...machine,customerId,customer_id:customerId,machineType,machine_type:machineType,serialNumber,serial_number:serialNumber};
  }
  function renderDispatchMachines(){
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const select=document.getElementById('dispatchMachine');if(!select)return;
    const current=select.value||'';
    // V316 regression wording: No active machines for this customer.
    // V339: API responses are camelCased by api_shape(). Older Dispatch code
    // filtered on m.customer_id only, so a valid customer could incorrectly
    // show "No active machines" even while registered machines existed.
    const rows=dispatchMachines.filter(m=>!customerId||String(m.customerId??m.customer_id??'')===String(customerId));
    const placeholder=!customerId?'Select Customer first...':(rows.length?'Select Machine...':'No registered machines found for this customer');
    select.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(m=>{const label=[m.brand,m.model].filter(Boolean).join(' ')||m.machineType||m.machine_type||'Machine';const serial=(m.serialNumber||m.serial_number)?` · ${m.serialNumber||m.serial_number}`:'';return `<option value="${esc(m.id)}">${esc(label+serial)}</option>`}).join('');
    if(rows.some(m=>String(m.id)===String(current)))select.value=current;
  }
  function renderReceivedJobCards(){
    const select=document.getElementById('dispatchJobCard');if(!select)return;
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const current=select.value||'';
    const rows=dispatchJobCards.filter(job=>!customerId||String(job.customerId)===String(customerId));
    const placeholder=customerId&&!rows.length?'No active Job Cards for this customer':(!rows.length?'No received / assigned Job Cards available':'Select Job Card...');
    select.innerHTML=`<option value="">${esc(placeholder)}</option>`+rows.map(job=>{
      const src=String(job.sourceType||'')==='SERVICE_REQUEST'?'Customer Admin Job Card':'BELM Job Card';
      const serial=job.machineSerial?` · S/N ${job.machineSerial}`:'';
      const assigned=job.technicianName?` · Technician: ${job.technicianName}`:'';
      const status=String(job.dispatchStatus||job.status||'RECEIVED').toUpperCase();
      return `<option value="${esc(job.id)}">${esc(`${status} · ${job.jobCardNo} · ${job.customerName} · ${job.machineLabel}${serial}${assigned} · ${job.title} · ${src}`)}</option>`;
    }).join('');
    if(rows.some(job=>String(job.id)===String(current)))select.value=current;
    const dataList=document.getElementById('dispatchJobCardNoList');if(dataList)dataList.innerHTML=rows.map(job=>`<option value="${esc(job.jobCardNo||job.proformaCode)}">${esc(`${String(job.dispatchStatus||job.status||'RECEIVED').toUpperCase()} · ${job.customerName} · ${job.machineLabel}${job.technicianName?` · ${job.technicianName}`:''}`)}</option>`).join('');
    const assigned=rows.filter(job=>job.technicianId||job.technicianName||String(job.dispatchStatus||'').toUpperCase()==='ASSIGNED').length;
    const waiting=rows.length-assigned;
    const help=document.getElementById('receivedJobCardHelp');
    if(help)help.textContent=rows.length?`${rows.length} active Job Card${rows.length===1?'':'s'}${customerId?' for this customer':''}: ${waiting} waiting, ${assigned} assigned. Assigned cards are selectable for confirmation or reassignment.`:(customerId?'No active received/assigned Job Card for this customer. You can still type a known JC Number in the field on the right.':'No active Customer Admin Job Cards are available. Official Job Cards are synchronized automatically when this list refreshes.');
  }
  function syncDispatchJcNumberFromSelection(){
    const input=document.getElementById('dispatchJobCardNo');if(!input)return;
    const selectedId=document.getElementById('dispatchJobCard')?.value||'';
    const job=dispatchJobCards.find(x=>String(x.id)===String(selectedId));
    if(job){
      input.value=job.jobCardNo||job.proformaCode||'';
      input.dataset.source='auto';
      input.classList.add('jc-auto-detected');input.classList.remove('jc-manual');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent=`Detected automatically: ${input.value}. This is the Job Card reference. Billing assigns a separate PI-0000000 number when the Proforma is generated.`;
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
      const locationInput=document.getElementById('dispatchLocation');if(locationInput)locationInput.value=match.jobLocation||'';
      input.value=match.jobCardNo||match.proformaCode||raw;input.dataset.source='auto';input.classList.add('jc-auto-detected');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent=`Matched automatically to received Job Card ${match.jobCardNo}.`;
      renderReceivedJobCards();
      const reselect=document.getElementById('dispatchJobCard');if(reselect)reselect.value=match.id;
      updateDispatchNote();
    }else{
      input.dataset.source='manual';input.classList.add('jc-manual');
      const help=document.getElementById('dispatchJobCardNoHelp');if(help)help.textContent='Manual JC Number entered. Assign will ask the server to find the matching active received/assigned Job Card by this reference.';
    }
  }
  function updateDispatchNote(){
    const techId=document.getElementById('dispatchTechnician')?.value||'';
    const customerId=document.getElementById('dispatchCustomer')?.value||'';
    const selectedJob=dispatchJobCards.find(x=>String(x.id)===String(document.getElementById('dispatchJobCard')?.value||''));
    const tech=dispatchTechnicians.find(x=>String(x.id)===String(techId));
    const customer=dispatchCustomers.find(x=>String(x.id)===String(customerId));
    const note=document.getElementById('dispatchNote');if(!note)return;
    note.classList.remove('dispatch-success','dispatch-error');
    if(selectedJob&&(selectedJob.technicianId||selectedJob.technicianName)){
      const same=techId&&selectedJob.technicianId&&String(techId)===String(selectedJob.technicianId);
      note.innerHTML=same
        ? `<b>ASSIGNED:</b> ${esc(selectedJob.jobCardNo)} is already assigned to ${esc(selectedJob.technicianName||tech?.name||'this Technician')}. You can keep this assignment and update priority/due date.`
        : `<b>ASSIGNED:</b> ${esc(selectedJob.jobCardNo)} is currently assigned to ${esc(selectedJob.technicianName||'another Technician')}. Select a Technician and click Assign Job Card to reassign.`;
      note.classList.toggle('override',!same);
      return;
    }
    if(tech&&customer&&tech.assignedCustomerId&&String(tech.assignedCustomerId)!==String(customer.id)){note.innerHTML=`<b>TEMPORARY OVERRIDE:</b> ${esc(tech.name)} stays permanently attached to ${esc(tech.assignedCustomerName||'their home customer')}. Only this Job Card is for ${esc(customer.name)}.`;note.classList.add('override')}
    else if(tech&&customer){note.textContent=`${tech.name} is already attached to ${customer.name}; this Job Card is a normal assignment.`;note.classList.remove('override')}
    else{note.textContent=dispatchMode()==='existing'?'Select a received or assigned Job Card and Technician.':'Select a Technician, customer and machine to create a Job Card.';note.classList.remove('override')}
  }
  function syncJobCardSource(){
    const existing=dispatchMode()==='existing';
    document.querySelectorAll('.workflow-job-source .job-source-option').forEach(label=>{const radio=label.querySelector('input[name="jobCardMode"]');label.classList.toggle('is-selected',Boolean(radio?.checked));});
    document.getElementById('receivedJobCardField')?.classList.toggle('hidden',!existing);
    document.getElementById('dispatchJobCardNoField')?.classList.toggle('hidden',!existing);
    document.getElementById('dispatchMachineField')?.classList.toggle('hidden',existing);
    document.getElementById('dispatchTitleField')?.classList.toggle('hidden',existing);
    document.getElementById('dispatchDescriptionField')?.classList.toggle('hidden',existing);
    if(existing){
      const job=dispatchJobCards.find(x=>String(x.id)===String(document.getElementById('dispatchJobCard')?.value||''));
      if(job){
        const customer=document.getElementById('dispatchCustomer');if(customer)customer.value=job.customerId||'';
        document.getElementById('dispatchPriority').value=job.priority||'NORMAL';document.getElementById('dispatchDueDate').value=job.due_date||'';
        const locationInput=document.getElementById('dispatchLocation');if(locationInput)locationInput.value=job.jobLocation||'';
        const technician=document.getElementById('dispatchTechnician');
        if(technician&&job.technicianId&&dispatchTechnicians.some(x=>String(x.id)===String(job.technicianId)))technician.value=job.technicianId;
      }
      renderReceivedJobCards();if(job){const reselect=document.getElementById('dispatchJobCard');if(reselect)reselect.value=job.id}
      syncDispatchJcNumberFromSelection();
    }else renderDispatchMachines();
    syncDispatchLocation(false);updateDispatchNote();
  }
  async function loadDispatchOptions({announce=false,syncSources=true}={}){
    if(!isBelmAdmin)return;
    const panel=document.getElementById('dispatchPanel');if(!panel)return;
    const selectedValues={technicianId:document.getElementById('dispatchTechnician')?.value||'',customerId:document.getElementById('dispatchCustomer')?.value||'',machineId:document.getElementById('dispatchMachine')?.value||'',jobCardId:document.getElementById('dispatchJobCard')?.value||'',jobCardNo:document.getElementById('dispatchJobCardNo')?.value||'',jobLocation:document.getElementById('dispatchLocation')?.value||''};
    try{
      const data=await engineeringApi(`/engineering?action=dispatch-options${syncSources?'':'&skipSync=1'}`);
      dispatchTechnicians=data.technicians||[];dispatchCustomers=data.customers||[];dispatchMachines=(data.machines||[]).map(normalizeDispatchMachine);dispatchJobCards=(data.jobCards||data.receivedJobCards||[]).map(normalizeJobCard);
      const technicianSelect=document.getElementById('dispatchTechnician'),customerSelect=document.getElementById('dispatchCustomer');
      technicianSelect.innerHTML='<option value="">Select Technician...</option>'+dispatchTechnicians.map(tech=>{const home=tech.assignedCustomerName?` · Home: ${tech.assignedCustomerName}`:' · No home customer';return `<option value="${esc(tech.id)}">${esc(tech.name+home)}</option>`}).join('');
      customerSelect.innerHTML='<option value="">Select Customer...</option>'+dispatchCustomers.map(customer=>`<option value="${esc(customer.id)}">${esc(customer.name)}</option>`).join('');
      if(dispatchTechnicians.some(tech=>String(tech.id)===String(selectedValues.technicianId)))technicianSelect.value=selectedValues.technicianId;
      if(dispatchCustomers.some(customer=>String(customer.id)===String(selectedValues.customerId)))customerSelect.value=selectedValues.customerId;
      renderReceivedJobCards();if(dispatchJobCards.some(job=>String(job.id)===String(selectedValues.jobCardId)))document.getElementById('dispatchJobCard').value=selectedValues.jobCardId;
      const jcInput=document.getElementById('dispatchJobCardNo');if(jcInput&&selectedValues.jobCardNo&&!document.getElementById('dispatchJobCard')?.value){jcInput.value=selectedValues.jobCardNo;jcInput.dataset.source='manual';jcInput.classList.add('jc-manual')}else syncDispatchJcNumberFromSelection();
      renderDispatchMachines();if(dispatchMachines.some(machine=>String(machine.id)===String(selectedValues.machineId)))document.getElementById('dispatchMachine').value=selectedValues.machineId;
      const loc=document.getElementById('dispatchLocation');if(loc){loc.value=selectedValues.jobLocation||'';syncDispatchLocation(false)}
      syncJobCardSource();panel.classList.remove('hidden');
      if(announce){const total=Number(data.dispatchSync?.totalJobCards??dispatchJobCards.length),assigned=Number(data.dispatchSync?.assignedJobCards??0),waiting=Number(data.dispatchSync?.receivedJobCards??Math.max(0,total-assigned));if(data.dispatchSync?.error)show(`Technician Dispatch loaded ${total} active Job Card${total===1?'':'s'} (${waiting} waiting, ${assigned} assigned), but source synchronization reported an error.`,true);else show(total?`Technician Dispatch refreshed: ${total} active Job Card${total===1?'':'s'} (${waiting} waiting, ${assigned} assigned).`:'Technician Dispatch refreshed. No active received/assigned Job Cards are available.',false)}
    }catch(x){panel.classList.add('hidden');if(x.status!==403)show(x.message||'Could not load Technician Dispatch.',true)}
  }
  function resetTechnicianDispatchForm(){
    const form=document.getElementById('dispatchForm');if(!form)return;
    form.reset();
    const existingMode=form.querySelector('input[name="jobCardMode"][value="existing"]');if(existingMode)existingMode.checked=true;
    ['dispatchTechnician','dispatchJobCard','dispatchCustomer','dispatchMachine'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    const jcInput=document.getElementById('dispatchJobCardNo');
    if(jcInput){jcInput.value='';jcInput.dataset.source='';jcInput.classList.remove('jc-auto-detected','jc-manual')}
    const jcHelp=document.getElementById('dispatchJobCardNoHelp');if(jcHelp)jcHelp.textContent='Auto-detected from the selected Job Card. You can also type the JC Number manually.';
    const priority=document.getElementById('dispatchPriority');if(priority)priority.value='NORMAL';
    const due=document.getElementById('dispatchDueDate');if(due)due.value='';
    const title=document.getElementById('dispatchTitle');if(title)title.value='';
    const description=document.getElementById('dispatchDescription');if(description)description.value='';
    const locationInput=document.getElementById('dispatchLocation');if(locationInput)locationInput.value='';
    renderReceivedJobCards();
    renderDispatchMachines();
    syncJobCardSource();
  }
  function showDispatchResult(message,error=false){
    const note=document.getElementById('dispatchNote');if(!note)return;
    note.textContent=message;
    note.classList.remove('override','dispatch-success','dispatch-error');
    note.classList.add(error?'dispatch-error':'dispatch-success');
  }
  async function dispatchTechnician(e){
    e.preventDefault();
    const submitBtn=e.submitter||document.getElementById('dispatchSubmit')||document.querySelector('#dispatchForm button[type="submit"]');
    const mode=dispatchMode(),technicianId=document.getElementById('dispatchTechnician').value,jobCardId=document.getElementById('dispatchJobCard')?.value||'',jobCardNo=document.getElementById('dispatchJobCardNo')?.value.trim()||'';
    const existingJob=dispatchJobCards.find(x=>String(x.id)===String(jobCardId));
    const customerId=mode==='existing'?(existingJob?.customerId||document.getElementById('dispatchCustomer').value||''):document.getElementById('dispatchCustomer').value;
    const tech=dispatchTechnicians.find(x=>String(x.id)===String(technicianId)),customer=dispatchCustomers.find(x=>String(x.id)===String(customerId));
    if(!technicianId){show('Select Technician.',true);showDispatchResult('Select Technician before assigning the Job Card.',true);return}
    if(mode==='existing'&&!jobCardId&&!jobCardNo){show('Select a received/assigned Job Card or fill the JC Number.',true);showDispatchResult('Select a Job Card or enter its JC Number.',true);return}
    if(mode==='create'&&(!customerId||!document.getElementById('dispatchMachine').value||!document.getElementById('dispatchTitle').value.trim())){show('Customer, machine and Job Card title are required.',true);showDispatchResult('Customer, machine and Job Card title are required.',true);return}
    const currentAssignedTechId=String(existingJob?.technicianId||'');
    const reassigning=mode==='existing'&&currentAssignedTechId&&currentAssignedTechId!==String(technicianId);
    if(reassigning&&!confirm(`${existingJob?.jobCardNo||'This Job Card'} is currently assigned to ${existingJob?.technicianName||'another Technician'}. Reassign it to ${tech?.name||'the selected Technician'}?`))return;
    const temporary=Boolean(tech?.assignedCustomerId&&customerId&&String(tech.assignedCustomerId)!==String(customerId));
    if(temporary&&!confirm(`${tech.name} is attached to ${tech.assignedCustomerName||'another customer'}. Assign this Job Card to ${customer?.name||'the selected customer'} as a Temporary Override?`))return;
    setActionButtonState(submitBtn,'busy',reassigning?'Reassigning...':'Assigning BELM Technician...');
    showDispatchResult(reassigning?'Reassigning Job Card...':'Assigning Job Card to BELM Technician...');
    try{
      const currentCaseId=selected?.case?.id||'';
      const result=await engineeringApi('/engineering?action=dispatch',{method:'POST',body:JSON.stringify({jobCardMode:mode,jobCardId,jobCardNo,technicianId,customerId,machineId:document.getElementById('dispatchMachine')?.value||'',title:document.getElementById('dispatchTitle')?.value.trim()||'',description:document.getElementById('dispatchDescription')?.value.trim()||'',priority:document.getElementById('dispatchPriority').value,dueDate:document.getElementById('dispatchDueDate').value||null,jobLocation:document.getElementById('dispatchLocation')?.value.trim()||'',temporaryOverride:temporary})});
      const verb=result.reassigned?'reassigned':'assigned';
      const successMessage=`✓ ${result.jobCardNo||'Job Card'} ${verb} and assigned to BELM staff. Technician: ${tech?.name||'Technician'}. Dispatch reset and ready for the next Job Card. Proforma: ${result.proformaStatus||'PENDING'} · PI number is assigned in Billing when generated.`;
      show(`${result.jobCardNo||'Job Card'} ${result.reassigned?'reassigned':'assigned/confirmed'} and assigned to BELM staff${result.temporaryOverride?' as Temporary Override':''}. Technician: ${tech?.name||'Technician'}. Proforma sync: ${result.proformaStatus||'PENDING'} · PI number will be created in Billing.`,false);
      setActionButtonState(submitBtn,'success',result.reassigned?'✓ Reassigned':'✓ Assigned');
      // Clear every dispatch choice BEFORE reload so loadDispatchOptions cannot preserve stale selections.
      resetTechnicianDispatchForm();
      await load();
      await loadJobProcess();
      if(currentCaseId)try{await openCase(currentCaseId)}catch{}
      showDispatchResult(successMessage,false);
      window.setTimeout(()=>setActionButtonState(submitBtn,'idle'),1200);
    }catch(x){
      setActionButtonState(submitBtn,'error','Try Again');
      showDispatchResult(`Assignment failed: ${x.message||'Could not assign the Job Card.'}`,true);
      show(x.message||'Could not assign the Job Card.',true);
      window.setTimeout(()=>setActionButtonState(submitBtn,'idle'),1600);
    }
  }
  function initTechnicianDispatch(){
    const panel=document.getElementById('dispatchPanel');if(!panel)return;
    if(!isBelmAdmin){panel.classList.add('hidden');return}
    document.getElementById('dispatchTechnician')?.addEventListener('change',updateDispatchNote);
    document.getElementById('dispatchCustomer')?.addEventListener('change',()=>{if(dispatchMode()==='existing'){const jobSelect=document.getElementById('dispatchJobCard');if(jobSelect)jobSelect.value='';renderReceivedJobCards()}else{renderDispatchMachines();syncDispatchLocation(true)}updateDispatchNote()});
    document.getElementById('dispatchJobCard')?.addEventListener('change',syncJobCardSource);
    document.getElementById('dispatchJobCardNo')?.addEventListener('change',resolveDispatchJobCardNumber);
    document.getElementById('dispatchJobCardNo')?.addEventListener('blur',resolveDispatchJobCardNumber);
    document.getElementById('refreshReceivedJobCards')?.addEventListener('click',async()=>{await loadDispatchOptions({announce:true});await loadJobProcess()});
    document.getElementById('refreshJobProcess')?.addEventListener('click',loadJobProcess);
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

  function renderSummary(){const open=cases.filter(c=>c.status!=='COMPLETED');const delayed=open.filter(c=>c.delayed);const administration=open.filter(c=>c.stage==='PROCUREMENT'||c.stage==='BOSS_APPROVAL');const avg=open.length?open.reduce((a,c)=>a+Number(c.breakdownHours||0),0)/open.length:0;document.getElementById('summaryCards').innerHTML=`<div class="summary-card"><b>${open.length}</b><span>Open breakdowns</span></div><div class="summary-card red"><b>${delayed.length}</b><span>Service Level Agreement</span></div><div class="summary-card yellow"><b>${administration.length}</b><span>Waiting Procurement / approval</span></div><div class="summary-card green"><b>${duration(avg)}</b><span>Average open time</span></div>`}
  function queueAssignmentAllowed(c){
    const jobStatus=String(c.jobStatus||'').toUpperCase();
    return source==='customer'&&isWorkshop&&Boolean(c.customerManagesWorkshop)
      && String(c.sourceType||'').toUpperCase()!=='SERVICE_REQUEST'
      && !['PENDING_APPROVAL','COMPLETED','CANCELLED'].includes(jobStatus);
  }
  function queueTechnicianOptions(c){
    const currentId=String(c.technicianId||'');
    const currentName=String(c.technicianName||'').trim();
    let options='<option value="">Assign Technician...</option>';
    if(currentId&&!queueTechnicians.some(x=>String(x.id)===currentId))options+=`<option value="${esc(currentId)}">${esc((currentName||'Current Technician')+' · ASSIGNED')}</option>`;
    options+=queueTechnicians.map(t=>`<option value="${esc(t.id)}" ${String(t.id)===currentId?'selected':''}>${esc(t.name+(String(t.id)===currentId?' · ASSIGNED':''))}</option>`).join('');
    return options;
  }
  function renderList(){
    const q=document.getElementById('searchBox').value.toLowerCase().trim();
    const list=cases.filter(c=>!['COMPLETED','CANCELLED','CLOSED'].includes(String(c.status||'').toUpperCase()))
      .filter(c=>!q||[c.machineLabel,c.customerName,c.department,c.stage,c.status,c.description,c.sourceType,c.jobCardNo,c.technicianName,sourceLabel(c)].join(' ').toLowerCase().includes(q))
      .sort((a,b)=>(Date.parse(b.openedAt||b.updatedAt||b.createdAt||'')||0)-(Date.parse(a.openedAt||a.updatedAt||a.createdAt||'')||0));
    document.getElementById('caseList').innerHTML=list.length?list.map(c=>{
      const company=String(c.customerName||'Customer').trim()||'Customer';
      const canAssign=queueAssignmentAllowed(c);
      const assignedName=String(c.technicianName||'').trim();
      const assignment=canAssign
        ? `<div class="queue-assign-row"><label><span>Assign Technician</span><select class="queue-technician-select" data-queue-assign="${esc(c.id)}" data-current-tech="${esc(c.technicianId||'')}" data-current-name="${esc(assignedName)}" ${queueTechnicians.length?'':'disabled'}>${queueTechnicianOptions(c)}</select></label><small>${assignedName?`Assigned: ${esc(assignedName)} · choose another Technician to reassign.`:(queueTechnicians.length?'Select a Technician for this Job Card.':'No customer Technician available.')}</small></div>`
        : (assignedName?`<div class="queue-assigned-readonly"><span>Technician</span><b>${esc(assignedName)}</b></div>`:'');
      return `<article class="case-card attention ${c.delayed?'delayed':''}" data-case="${esc(c.id)}">
        <div class="case-queue-head"><h3>${esc(c.machineLabel)}</h3></div>
        <div class="case-description">${esc(c.description)}</div>
        <div class="case-report-context"><span><b>Reported:</b> ${esc(fmtDate(c.reportedAt||c.openedAt))}</span><span><b>Machine Hrs:</b> ${c.machineHours===null||c.machineHours===undefined||c.machineHours===''?'—':esc(String(Number(c.machineHours).toLocaleString(undefined,{maximumFractionDigits:1})))+' HRS'}</span></div>
        <div class="case-origin-row"><span class="pill company-pill company-alert ${c.delayed?'red':''}">FROM: ${esc(company)}</span><span class="pill source-pill">${esc(sourceLabel(c))}</span>${c.jobCardNo?`<span class="pill job-card-pill">${esc(c.jobCardNo)}</span>`:''}</div>
        <div class="case-meta"><span class="pill ${c.delayed?'red':'yellow'}">${esc(c.delayed?'DELAYED':c.status)}</span><span class="pill">${esc(c.department)}</span><span class="pill">Breakdown ${esc(duration(c.breakdownHours))}</span>${c.delayed?`<span class="pill red">Delay ${esc(duration(c.delayHours))}</span>`:''}</div>
        ${assignment}
      </article>`;
    }).join(''):`<div class="empty">${q?'No unfinished job matches this search.':'No unfinished breakdown job. Completed work stays in Timeline / History and reports.'}</div>`;
    document.querySelectorAll('[data-case]').forEach(e=>e.onclick=()=>openCase(e.dataset.case));
    document.querySelectorAll('[data-queue-assign]').forEach(select=>{
      select.addEventListener('click',event=>event.stopPropagation());
      select.addEventListener('pointerdown',event=>event.stopPropagation());
      select.addEventListener('change',event=>{event.stopPropagation();assignQueueTechnician(select)});
    });
  }
  async function loadQueueTechnicians(){
    if(source!=='customer'||!isWorkshop){queueTechnicians=[];return}
    const customerId=String(cases[0]?.customerId||payload?.id||payload?.customerId||'');
    if(!customerId){queueTechnicians=[];return}
    try{queueTechnicians=await api(`/technicians?customerId=${encodeURIComponent(customerId)}&_=${Date.now()}`)}catch{queueTechnicians=[]}
  }
  async function assignQueueTechnician(select){
    const caseId=String(select?.dataset.queueAssign||'');
    const technicianId=String(select?.value||'');
    const c=cases.find(x=>String(x.id)===caseId);
    if(!c||!technicianId)return;
    const tech=queueTechnicians.find(x=>String(x.id)===technicianId);
    const previousId=String(c.technicianId||'');
    const previousName=String(c.technicianName||'').trim();
    if(previousId&&previousId!==technicianId&&!confirm(`${c.jobCardNo||'This Job Card'} is assigned to ${previousName||'another Technician'}. Reassign it to ${tech?.name||'the selected Technician'}?`)){
      select.value=previousId;return;
    }
    select.disabled=true;
    try{
      const result=await api('/job-card',{method:'POST',body:JSON.stringify({
        caseId,technicianId,title:c.title||'Machine Breakdown',jobCardMode:c.jobCardId?'existing':'auto',jobCardId:c.jobCardId||'',handoverReason:'Assigned from Live Breakdown Queue'
      })});
      show(`✓ ${result.jobCardNo||c.jobCardNo||'Job Card'} ${result.reassigned?'reassigned':'assigned'} to ${tech?.name||'Technician'}.`);
      await load();
    }catch(x){
      select.value=previousId;select.disabled=false;show(x.message,true);
    }
  }

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
          html+=`<button class="approve" data-job-billing="proforma" data-job-id="${esc(j.id)}">Prepare Proforma</button>`;
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
    const customerIssued=String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST';
    return `<div class="job"><div class="job-head"><b>${esc(j.job_card_no)} - ${esc(j.title)}</b><span class="pill">${esc(j.status)}</span></div>
      ${customerIssued?`<div class="job-receipt-confirmation"><b>✓ RECEIVED BY BELM</b><span>${fmtDate(j.issued_at||j.created_at)} · Current: ${esc(String(j.status||'RECEIVED').replaceAll('_',' '))}</span></div>`:''}
      <small>Issued by: <b>${esc(j.issued_by_name||j.generated_by_name||c.customerName||'Customer')}</b> · ${fmtDate(j.issued_at||j.created_at)}</small>
      <small>Technician: ${esc(j.technician_name||'Unassigned')} · Created ${fmtDate(j.created_at)}</small>
      ${awaitingTech?'<div class="job-override-badge job-awaiting-tech">AWAITING TECHNICIAN ASSIGNMENT · Workshop / Dispatch action required</div>':''}
      ${j.temporary_override?`<div class="job-override-badge">TEMPORARY OVERRIDE · Home: ${esc(j.technician_home_customer_name||'Other customer')}</div>`:''}
      ${j.diagnosis?`<p><b>Diagnosis:</b> ${esc(j.diagnosis)}</p><p><b>Work done:</b> ${esc(j.work_done)}</p>${j.test_result?`<p><b>Test:</b> ${esc(j.test_result)}</p>`:''}`:''}
      ${j.reviewed_by_name?`<p><b>Review:</b> ${esc(j.reviewed_by_name)}${j.review_note?` · ${esc(j.review_note)}`:''}</p>`:''}
      ${j.billing_status&&j.billing_status!=='NOT_READY'?`<div class="job-billing-status"><b>Procurement / Billing:</b> ${esc(String(j.billing_status).replaceAll('_',' '))}</div>`:''}
      <div class="actions"><button class="blue" data-job-pdf="${esc(j.id)}">Download Job Card PDF</button>${isTechnician&&!['COMPLETED','PENDING_APPROVAL'].includes(String(j.status||'').toUpperCase())?`<button class="blue" data-tech-report="${esc(j.id)}">Open / Save Job Report</button>`:''}${serviceJobCardActions(j,c)}</div></div>`;
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
      show('Customer-signed Job Card uploaded. Billing can now prepare the Proforma; the Invoice will be generated from that Proforma.');
      await openCase(selected.case.id);
    }catch(x){show(x.message,true)}
  }

  function openJobBilling(kind,jobId){
    const job=(selected?.jobCards||[]).find(x=>String(x.id)===String(jobId));
    const c=selected?.case;if(!job||!c)return;
    const prefill={customerId:c.customerId,machineId:c.machineId,sourceJobCardId:job.id,description:`Service ${job.job_card_no} - ${job.title}`,qty:1,unitPrice:0};
    sessionStorage.setItem('belm_prefill_proforma',JSON.stringify(prefill));
    location.href='/billing-manager/?tab=proformas';
  }

  function latestProcessEvent(detail, predicate){
    const rows=(detail?.events||[]).filter(predicate);
    return rows.length?rows[rows.length-1]:null;
  }

  function processStageDetailHtml(stageKey,detail,c,mainJob){
    const key=String(stageKey||'').toUpperCase();
    const jobStatus=String(mainJob?.status||'').toUpperCase();
    const techId=String(mainJob?.technician_id||mainJob?.technicianId||'');
    const techName=String(mainJob?.technician_name||mainJob?.technicianName||'').trim();
    const eventText=e=>`${String(e?.action||'')} ${String(e?.note||'')} ${String(e?.stage||'')}`.toLowerCase();
    const receivedEvent=latestProcessEvent(detail,e=>/receipt|activation confirmed|received by belm/.test(eventText(e)));
    const assignedEvent=latestProcessEvent(detail,e=>String(e?.stage||'').toUpperCase()==='JOB_CARD_ASSIGNED'||/assigned to|reassigned|technician dispatch|assignment confirmed/.test(eventText(e)));
    const progressEvents=(detail?.events||[]).filter(e=>['DIAGNOSIS','REPAIR'].includes(String(e?.stage||'').toUpperCase())||/in progress|job card updated|diagnosis|repair/.test(eventText(e)));
    const testingEvent=latestProcessEvent(detail,e=>String(e?.stage||'').toUpperCase()==='TESTING'||/test passed|waiting workshop test|testing/.test(eventText(e)));
    const completedEvent=latestProcessEvent(detail,e=>String(e?.stage||'').toUpperCase()==='COMPLETED'||/returned to service|case closed|completed/.test(eventText(e)));
    const info=(label,value)=>`<div><span>${esc(label)}</span><b>${value||'-'}</b></div>`;
    const note=e=>e?`<div class="stage-detail-event"><b>${esc(e.action||'Process update')}</b>${e.note?`<p>${esc(e.note)}</p>`:''}<small>${esc(e.actor_name||'System')} · ${fmtDate(e.created_at)}</small></div>`:'';
    if(!mainJob)return `<div class="stage-detail-empty">No Main Job Card has been created for this case yet.</div>`;

    if(key==='RECEIVED'){
      const officialBelmJob=String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST';
      const receivedBy=receivedEvent?.actor_name||(officialBelmJob?'BELM TECHNICAL DEP / automatic receipt':(mainJob.issued_by_name||mainJob.generated_by_name||c.customerName||'Customer Workshop'));
      const receivedAt=receivedEvent?.created_at||mainJob.issued_at||mainJob.created_at;
      const canAssign=isBelmAdmin&&!['COMPLETED','CANCELLED'].includes(jobStatus);
      const assignControl=canAssign?`<label class="main-job-tech-control stage-tech-control"><span>${techName?'Assigned Technician':'Assign Technician'}</span><select class="main-job-technician-select" data-job-id="${esc(mainJob.id)}" data-current-technician-id="${esc(techId)}" data-current-technician-name="${esc(techName)}"><option value="${esc(techId)}">${techName?esc(techName+' · ASSIGNED'):'Loading Technicians...'}</option></select><small class="main-job-tech-status">${techName?`Assigned to ${esc(techName)}. Select another Technician only to reassign.`:'Select a Technician to assign this Job Card.'}</small></label>`:'';
      return `<div class="stage-detail-head"><div><span>STAGE 1</span><h4>${officialBelmJob?'Received by BELM':'Created'}</h4></div><span class="pill green">${officialBelmJob?'RECEIVED':'CREATED'}</span></div><div class="stage-detail-grid">${info('Job Card',esc(mainJob.job_card_no||'-'))}${info(officialBelmJob?'Received by':'Created by',esc(receivedBy))}${info(officialBelmJob?'Received at':'Created at',fmtDate(receivedAt))}${info('Issued by',esc(mainJob.issued_by_name||mainJob.generated_by_name||c.customerName||'Customer'))}</div>${receivedEvent?note(receivedEvent):(officialBelmJob?'<div class="stage-detail-event"><b>Automatic BELM receipt</b><p>This Job Card was synchronized into TECHNICAL DEP from its source Job Card.</p></div>':'<div class="stage-detail-event"><b>Customer workshop Job Card</b><p>This Job Card stays inside the customer team unless Customer Admin sends a separate official Job Card to BELM.</p></div>')}${assignControl}`;
    }
    if(key==='ASSIGNED'){
      return `<div class="stage-detail-head"><div><span>STAGE 2</span><h4>Assigned Technician</h4></div><span class="pill yellow">${techName?'ASSIGNED':'WAITING'}</span></div><div class="stage-detail-grid">${info('Technician',esc(techName||'Not assigned yet'))}${info('Assigned by',esc(assignedEvent?.actor_name||'-'))}${info('Assigned at',assignedEvent?fmtDate(assignedEvent.created_at):'-')}${info('Job status',esc(jobStatus||'RECEIVED'))}</div>${note(assignedEvent)}`;
    }
    if(key==='IN_PROGRESS'){
      const last=progressEvents.length?progressEvents[progressEvents.length-1]:null;
      const recent=progressEvents.slice(-3).map(note).join('');
      return `<div class="stage-detail-head"><div><span>STAGE 3</span><h4>${jobStatus==='WAITING_FOR_PARTS'?'Waiting for Parts':'Work in Progress'}</h4></div><span class="pill">${esc(jobStatus||'WAITING')}</span></div><div class="stage-detail-grid">${info('Technician',esc(techName||'Unassigned'))}${info('Started',fmtDate(mainJob.started_at||last?.created_at))}${info('Diagnosis',esc(mainJob.diagnosis||'Not reported yet'))}${info('Work done',esc(mainJob.work_done||'No progress report yet'))}</div>${recent||'<div class="stage-detail-empty">No Technician progress update recorded yet.</div>'}`;
    }
    if(key==='SPARES'){
      const spares=detail?.spares||[];
      const rows=spares.length?spares.slice().reverse().map(s=>`<div class="stage-spare-row"><b>${esc(s.spareName??s.spare_name??'Spare')} x ${esc(s.quantity??1)} ${esc(s.unit??'pcs')}</b><span class="pill">${esc(String(s.status||'').replaceAll('_',' '))}</span><small>Requested by ${esc(s.requestedByName??s.requested_by_name??'-')} · ${fmtDate(s.requestedAt??s.requested_at)}</small></div>`).join(''):'<div class="stage-detail-empty">No spare request recorded for this Job Card.</div>';
      return `<div class="stage-detail-head"><div><span>STAGE 4</span><h4>Spares / Parts</h4></div><span class="pill">${spares.length}</span></div>${rows}`;
    }
    if(key==='PENDING_APPROVAL'){
      const pending=jobStatus==='PENDING_APPROVAL';
      return `<div class="stage-detail-head"><div><span>STAGE 4</span><h4>Pending Approval</h4></div><span class="pill yellow">${pending?'PENDING APPROVAL':'WAITING'}</span></div><div class="stage-detail-grid">${info('Technician',esc(techName||'Unassigned'))}${info('Submitted',fmtDate(mainJob.technician_submitted_at||testingEvent?.created_at))}${info('Test result',esc(mainJob.test_result||'Not recorded'))}${info('Completion note',esc(mainJob.completion_note||'-'))}</div>${mainJob.review_note?`<div class="stage-detail-event"><b>Latest review</b><p>${esc(mainJob.review_note)}</p><small>${esc(mainJob.reviewed_by_name||'Reviewer')} · ${fmtDate(mainJob.reviewed_at)}</small></div>`:''}`;
    }
    if(key==='TESTING'){
      return `<div class="stage-detail-head"><div><span>LEGACY</span><h4>Workshop Testing</h4></div><span class="pill">${testingEvent?'TESTING':'WAITING'}</span></div><div class="stage-detail-grid">${info('Technician',esc(techName||'Unassigned'))}${info('Repair completed',fmtDate(mainJob.completed_at||testingEvent?.created_at))}${info('Test result',esc(mainJob.test_result||'Not recorded yet'))}${info('Completion note',esc(mainJob.completion_note||'-'))}</div>${note(testingEvent)}`;
    }
    if(key==='COMPLETED'){
      return `<div class="stage-detail-head"><div><span>STAGE 5</span><h4>Completed / Returned to Service</h4></div><span class="pill green">${String(c.status||'').toUpperCase()==='COMPLETED'?'COMPLETED':'WAITING'}</span></div><div class="stage-detail-grid">${info('Technician',esc(techName||'Unassigned'))}${info('Completed at',fmtDate(mainJob.completed_at||completedEvent?.created_at))}${info('Closed by',esc(completedEvent?.actor_name||'-'))}${info('Signed Job Card',mainJob.has_signed_copy?'Yes':'Not uploaded')}</div>${note(completedEvent)}`;
    }
    return '<div class="stage-detail-empty">No stage detail available.</div>';
  }

  function renderProcessStageDetail(stageKey){
    const target=document.getElementById('jobProcessStageDetail');
    if(!target||!selected)return;
    const d=selected,c=d.case;
    const mainJob=d.jobCards.find(j=>!['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase()))||d.jobCards[0]||null;
    target.innerHTML=processStageDetailHtml(stageKey,d,c,mainJob);
    if(String(stageKey||'').toUpperCase()==='RECEIVED')void loadMainJobTechnicians(false);
  }

  function renderDetail(){
    const d=selected,c=d.case;
    const awaitingAssignment=c.stage==='TECHNICIAN_ASSIGNMENT';
    const mainJob=d.jobCards.find(j=>!['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase())) || d.jobCards[0] || null;
    const jobStatus=String(mainJob?.status||'').toUpperCase();
    const hasOpenSpare=d.spares.some(s=>!['REJECTED','PARTS_READY'].includes(String(s.status||'').toUpperCase()));
    const blockerText=c.blockerReason?esc(c.blockerReason):(awaitingAssignment?`Assign a Technician to the ${String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST'?'RECEIVED':'CREATED'} Job Card.`:'No blocker reason recorded.');
    const focusClass=c.delayed?'delayed':c.status==='COMPLETED'?'complete':'';
    const focusTitle=c.status==='COMPLETED'?'COMPLETED - MACHINE RETURNED TO SERVICE':awaitingAssignment?`${c.delayed?'DELAYED - ':''}AWAITING TECHNICIAN ASSIGNMENT - WORKSHOP / DISPATCH OWNS THE NEXT ACTION`:`${c.delayed?'DELAYED - ':''}${esc(c.department)} OWNS THE NEXT ACTION`;
    const sparesHtml=d.spares.length?d.spares.map(s=>{const spareName=s.spareName??s.spare_name??'Spare';const partNumber=s.partNumber??s.part_number??'';const requestedBy=s.requestedByName??s.requested_by_name??'-';const requestedAt=s.requestedAt??s.requested_at;const approvedBy=s.approvedByName??s.approved_by_name;const approvedAt=s.approvedAt??s.approved_at;return `<div class="spare"><div class="spare-head"><b>${esc(spareName)} x ${esc(s.quantity)} ${esc(s.unit)}</b><span class="pill">${esc(String(s.status||'').replaceAll('_',' '))}</span></div><small>${esc(partNumber||'No part number')} · Requested by ${esc(requestedBy)} · ${fmtDate(requestedAt)}</small>${approvedBy?`<div><small>Administration: ${esc(approvedBy)} · ${fmtDate(approvedAt)}</small></div>`:''}<div class="actions">${spareActions(s)}</div></div>`}).join(''):'<div class="empty">No spare request on this case.</div>';
    const jobsHtml=d.jobCards.length?d.jobCards.map(j=>renderJobCard(j,c)).join(''):'<div class="empty">No Job Card yet.</div>';
    const timelineHtml=d.events.length?`<div class="timeline">${d.events.map(e=>`<div class="event"><b>${esc(e.action)} - ${esc(e.department)}</b><div>${esc(e.note||'')}</div><small>${esc(e.actor_name||'System')} · ${fmtDate(e.created_at)}</small></div>`).join('')}</div>`:'<div class="empty">No process event recorded.</div>';

    const waitingParts=jobStatus==='WAITING_FOR_PARTS'||['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS'].includes(c.stage)||hasOpenSpare;
    const processKey=c.status==='COMPLETED'||jobStatus==='COMPLETED'?'COMPLETED':
      (jobStatus==='PENDING_APPROVAL'||c.stage==='PENDING_APPROVAL'?'PENDING_APPROVAL':
      (jobStatus==='IN_PROGRESS'||waitingParts||['DIAGNOSIS','REPAIR','TESTING'].includes(c.stage)?'IN_PROGRESS':
      (jobStatus==='ASSIGNED'||c.stage==='JOB_CARD_ASSIGNED'?'ASSIGNED':'RECEIVED')));
    const officialBelmJob=String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST';
    const receivedStepLabel=officialBelmJob?'Received by BELM':'Created';
    const steps=[['RECEIVED',receivedStepLabel],['ASSIGNED','Assigned'],['IN_PROGRESS',waitingParts?'Waiting for Parts':'In Progress'],['PENDING_APPROVAL','Pending Approval'],['COMPLETED','Completed']];
    const activeIndex=Math.max(0,steps.findIndex(([key])=>key===processKey));
    const canApprovePending=mainJob&&jobStatus==='PENDING_APPROVAL'&&((isBelmAdmin&&officialBelmJob)||(isBelmAdmin&&!officialBelmJob)||(source==='customer'&&c.customerManagesWorkshop&&(isOwner||['admin','workshop_manager'].includes(customerRole))));
    const processHtml=`<div class="job-process-card"><div class="job-process-title"><div><span>MAIN JOB CARD PROCESS</span><b>${mainJob?esc(mainJob.job_card_no+' · '+mainJob.title):'Waiting for Job Card'}</b></div>${mainJob?`<span class="pill">${esc(jobStatus||'CREATED')}</span>`:''}</div><div class="job-process-steps">${steps.map(([key,label],i)=>`<button type="button" class="job-process-step ${i<activeIndex?'done':i===activeIndex?'active':''}" data-process-step="${key}" aria-pressed="false" title="Press to view ${esc(label)} details"><span>${i+1}</span><b>${label}</b></button>`).join('')}</div><div id="jobProcessStageDetail" class="job-stage-detail"><div class="stage-detail-placeholder">Press a stage to view who handled it and what happened.</div></div><div class="job-process-actions">${mainJob?`<button class="blue" data-job-pdf="${esc(mainJob.id)}">Download Main Job Card PDF</button>`:''}${(isWorkshop||isTechnician)&&c.status!=='COMPLETED'&&mainJob&&!['PENDING_APPROVAL','COMPLETED'].includes(jobStatus)?'<button class="yellow" id="requestSpare">Request Spare</button>':''}${canApprovePending?'<button class="approve" id="approveJobCard">Approve & Complete</button><button class="reject" id="returnJobCard">Return to Technician</button>':''}${isWorkshop&&c.stage==='TESTING'&&jobStatus==='COMPLETED'?'<button class="approve" id="completeCase">Legacy Test Passed - Return to Service</button>':''}</div></div>`;
    const mainJobTechnicianId=String(mainJob?.technician_id||mainJob?.technicianId||'');
    const mainJobTechnicianName=String(mainJob?.technician_name||mainJob?.technicianName||'');
    const mainJobTechnicianHtml=isBelmAdmin&&mainJob&&!['COMPLETED','CANCELLED'].includes(jobStatus)
      ? `<label class="main-job-tech-control"><span>${mainJobTechnicianName?'Assigned Technician':'Assign Technician'}</span><select id="mainJobTechnicianSelect" class="main-job-technician-select" data-job-id="${esc(mainJob.id)}" data-current-technician-id="${esc(mainJobTechnicianId)}" data-current-technician-name="${esc(mainJobTechnicianName)}"><option value="${esc(mainJobTechnicianId)}">${mainJobTechnicianName?esc(mainJobTechnicianName+' · ASSIGNED'):'Loading Technicians...'}</option></select><small id="mainJobTechnicianStatus" class="main-job-tech-status">${mainJobTechnicianName?`Assigned to ${esc(mainJobTechnicianName)}. Select another Technician only to reassign.`:'Select a Technician to assign this Job Card.'}</small></label>`
      : `<span>Technician <b>${esc(mainJobTechnicianName||'Unassigned')}</b></span>`;
    const mainJobHtml=mainJob?`<div class="main-job-card"><div class="main-job-card-head"><div><span>MAIN JOB CARD</span><h3>${esc(mainJob.job_card_no)} · ${esc(mainJob.title)}</h3></div><span class="pill">${esc(jobStatus)}</span></div><div class="main-job-meta"><span>Issued by <b>${esc(mainJob.issued_by_name||mainJob.generated_by_name||c.customerName||'Customer')}</b></span>${String(c.sourceType||'').toUpperCase()==='SERVICE_REQUEST'?`<span>BELM Receipt <b>✓ RECEIVED · ${fmtDate(mainJob.issued_at||mainJob.created_at)}</b></span>`:''}${mainJobTechnicianHtml}<span>Created <b>${fmtDate(mainJob.created_at)}</b></span></div>${mainJob.diagnosis?`<div class="main-job-summary"><p><b>Diagnosis:</b> ${esc(mainJob.diagnosis)}</p><p><b>Work done:</b> ${esc(mainJob.work_done||'-')}</p></div>`:''}<div class="actions"><button class="blue" data-job-pdf="${esc(mainJob.id)}">Download Job Card PDF</button></div></div>`:'<div class="main-job-card empty">No Main Job Card has been issued yet.</div>';

    document.getElementById('caseDetail').innerHTML=`<div class="detail">
      <div class="detail-title-row"><div><h2>${esc(c.machineLabel)}</h2><div class="detail-sub">${esc(c.title)} · ${esc(c.machineType||'')} · ${esc(c.serialNumber||'No serial')} · <b>${esc(sourceLabel(c))}</b>${c.jobCardNo?` · <b>${esc(c.jobCardNo)}</b>`:''}</div></div><span class="pill ${c.status==='COMPLETED'?'green':c.delayed?'red':'yellow'}">${esc(c.status)}</span></div>
      <div class="workflow-focus ${focusClass}"><div><span>CURRENT PROCESS OWNER</span><strong>${focusTitle}</strong><small>Waiting here: ${esc(duration(c.stageHours))}${c.delayed?` · Service Level Agreement exceeded by ${esc(duration(c.delayHours))}`:''}</small></div><div class="workflow-focus-reason"><span>WHY / BLOCKER</span><b>${blockerText}</b></div></div>
      <div class="status-box"><div><span>Breakdown Time</span><b>${esc(duration(c.breakdownHours))}</b></div><div><span>Current Stage</span><b>${esc(c.stage.replaceAll('_',' '))}</b></div><div><span>Department</span><b>${esc(c.department)}</b></div><div><span>Waiting Here</span><b>${esc(duration(c.stageHours))}</b></div></div>
      ${processHtml}
      <div class="actions workflow-primary-actions">${isWorkshop&&c.status!=='COMPLETED'&&(source!=='customer'||(c.customerManagesWorkshop&&!officialBelmJob))&&(!mainJob||!['PENDING_APPROVAL','COMPLETED','CANCELLED'].includes(jobStatus))?`<button class="${source==='customer'&&mainJob?'yellow':'blue'}" id="generateJob">${source==='customer'&&mainJob?'Manage / Reassign Job Card':'+ Digital Job Card'}</button>`:''}${source==='customer'&&isCustomerAdmin&&c.status!=='COMPLETED'&&d.jobCards.length===0&&!c.customerManagesWorkshop?'<button class="blue" id="sendJobToBelm">Send Job Card to BELM</button>':''}</div>
      <div class="workflow-tabs" role="tablist"><button type="button" class="active" data-workflow-tab="overview">Overview</button><button type="button" data-workflow-tab="jobs">Job Cards <span>${d.jobCards.length}</span></button><button type="button" data-workflow-tab="spares">Spares <span>${d.spares.length}</span></button><button type="button" data-workflow-tab="timeline">Timeline <span>${d.events.length}</span></button></div>
      <section class="workflow-tab-panel active" data-workflow-panel="overview">${mainJobHtml}<div class="workflow-overview-grid"><div><span>Reported issue</span><b>${esc(c.description||c.title||'-')}</b></div><div><span>Next responsible team</span><b>${esc(c.department)}</b></div><div><span>Open Job Cards</span><b>${d.jobCards.filter(j=>j.status!=='COMPLETED').length}</b></div><div><span>Open Spare Requests</span><b>${d.spares.filter(s=>!['REJECTED','PARTS_READY'].includes(s.status)).length}</b></div></div></section>
      <section class="workflow-tab-panel" data-workflow-panel="jobs"><div class="section tab-section collapsible-section" data-collapsible-section="jobs"><div class="section-head"><h3>Digital Job Cards</h3><button type="button" class="section-toggle" data-collapse-panel="jobs" aria-expanded="true">Hide</button></div><div class="section-content" data-collapse-content="jobs">${jobsHtml}</div></div></section>
      <section class="workflow-tab-panel" data-workflow-panel="spares"><div class="section tab-section"><h3>Spare Approval Process</h3>${sparesHtml}</div></section>
      <section class="workflow-tab-panel" data-workflow-panel="timeline"><div class="section tab-section collapsible-section" data-collapsible-section="timeline"><div class="section-head"><h3>Process Timeline</h3><button type="button" class="section-toggle" data-collapse-panel="timeline" aria-expanded="true">Hide</button></div><div class="section-content" data-collapse-content="timeline">${timelineHtml}</div></div></section>
    </div>`;
    wireDetail();
  }

  function wireDetail(){
    document.querySelectorAll('[data-process-step]').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('[data-process-step]').forEach(x=>{const on=x===button;x.classList.toggle('inspecting',on);x.setAttribute('aria-pressed',on?'true':'false')});
      renderProcessStageDetail(button.dataset.processStep);
    }));
    document.querySelectorAll('[data-workflow-tab]').forEach(button=>button.addEventListener('click',()=>{
      document.querySelectorAll('[data-workflow-tab]').forEach(x=>x.classList.toggle('active',x===button));
      document.querySelectorAll('[data-workflow-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.workflowPanel===button.dataset.workflowTab));
    }));
    document.querySelectorAll('[data-collapse-panel]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.collapsePanel;const content=document.querySelector(`[data-collapse-content="${key}"]`);const section=document.querySelector(`[data-collapsible-section="${key}"]`);if(!content)return;
      const hidden=content.classList.toggle('hidden');if(section)section.classList.toggle('collapsed',hidden);button.textContent=hidden?'Show':'Hide';button.setAttribute('aria-expanded',hidden?'false':'true');
    }));
    document.getElementById('generateJob')?.addEventListener('click',openJob);
    document.getElementById('sendJobToBelm')?.addEventListener('click',sendSelectedCaseToBelm);
    document.getElementById('requestSpare')?.addEventListener('click',()=>{
      if(source==='customer'){location.href=`/customer-job-card/?machine=${encodeURIComponent(selected.case.machineId||selected.case.machine_id||machineFilter)}#procurement-spares`;return;}
      document.getElementById('spareCaseId').value=selected.case.id;const mainJob=(selected.jobCards||[]).find(j=>!['COMPLETED','CANCELLED'].includes(String(j.status||'').toUpperCase()))||(selected.jobCards||[])[0];document.getElementById('spareForm').dataset.jobCardId=mainJob?.id||'';document.getElementById('spareDialog').showModal();
    });
    document.getElementById('completeCase')?.addEventListener('click',async()=>{
      await api(`/stage/${selected.case.id}`,{method:'PUT',body:JSON.stringify({stage:'COMPLETED',note:'Workshop test passed; machine returned to service. Customer signature is required on BELM Service Job Cards before billing follow-up.'})});
      show('Machine returned to service. For BELM Service Jobs, collect the customer signature and upload the signed Job Card.');await load();await openCase(selected.case.id);
    });
    document.getElementById('approveJobCard')?.addEventListener('click',async()=>{
      const mainJob=(selected.jobCards||[]).find(j=>String(j.status||'').toUpperCase()==='PENDING_APPROVAL');if(!mainJob)return;
      const note=prompt('Approval / final review note (optional):')||'';
      if(!confirm(`Approve ${mainJob.job_card_no} and close this job as Completed?`))return;
      try{await api(`/job-approval/${encodeURIComponent(mainJob.id)}`,{method:'PUT',body:JSON.stringify({approve:true,note})});show('Job Card approved and Completed.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}
    });
    document.getElementById('returnJobCard')?.addEventListener('click',async()=>{
      const mainJob=(selected.jobCards||[]).find(j=>String(j.status||'').toUpperCase()==='PENDING_APPROVAL');if(!mainJob)return;
      const note=prompt('Reason / correction required from Technician:')||'';if(!note.trim())return;
      try{await api(`/job-approval/${encodeURIComponent(mainJob.id)}`,{method:'PUT',body:JSON.stringify({approve:false,note:note.trim()})});show('Job Card returned to Technician for update.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}
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
    void loadMainJobTechnicians(false);
  }
  async function loadMainJobTechnicians(showToast=false){
    const selects=[...document.querySelectorAll('.main-job-technician-select')];
    if(!selects.length||!isBelmAdmin||!selected?.case?.customerId)return;
    const setBusy=(select,busy,label)=>{
      select.disabled=busy;
      const status=select.closest('.main-job-tech-control')?.querySelector('.main-job-tech-status');
      if(status&&label)status.textContent=label;
    };
    selects.forEach(select=>setBusy(select,true,'Syncing Technicians...'));
    try{
      inlineTechnicians=await api(`/technicians?customerId=${encodeURIComponent(selected.case.customerId)}&_=${Date.now()}`);
      selects.forEach(select=>{
        const currentId=String(select.dataset.currentTechnicianId||'');
        const currentName=String(select.dataset.currentTechnicianName||'');
        let options=currentId?`<option value="${esc(currentId)}">${esc((currentName||'Current Technician')+' · ASSIGNED')}</option>`:'<option value="">Select Technician...</option>';
        if(currentId&&!inlineTechnicians.some(x=>String(x.id)===currentId)&&!currentName)options+=`<option value="${esc(currentId)}">Current Technician · ASSIGNED</option>`;
        options+=inlineTechnicians.filter(x=>String(x.id)!==currentId).map(x=>{
          const home=x.assignedCustomerName?` · Home: ${x.assignedCustomerName}`:'';
          const tag=x.temporaryForCustomer?' · TEMP OVERRIDE':'';
          return `<option value="${esc(x.id)}">${esc(x.name+home+tag)}</option>`;
        }).join('');
        select.innerHTML=options;
        if(currentId)select.value=currentId;
        select.disabled=false;
        const status=select.closest('.main-job-tech-control')?.querySelector('.main-job-tech-status');
        if(status)status.textContent=currentId?`Assigned to ${currentName||'current Technician'}. Select another Technician only when reassignment is required.`:'Select a Technician to assign this Job Card.';
        select.onchange=()=>assignMainJobTechnician(select);
      });
      if(showToast)show(inlineTechnicians.length?`Technicians synced: ${inlineTechnicians.length}.`:'No eligible BELM Technician found.',!inlineTechnicians.length);
    }catch(x){
      inlineTechnicians=[];
      selects.forEach(select=>{
        const currentId=String(select.dataset.currentTechnicianId||'');
        const currentName=String(select.dataset.currentTechnicianName||'');
        select.innerHTML=currentId?`<option value="${esc(currentId)}">${esc(currentName||'Current Technician')}</option>`:'<option value="">Technician sync failed</option>';
        select.value=currentId;
        select.disabled=false;
        const status=select.closest('.main-job-tech-control')?.querySelector('.main-job-tech-status');
        if(status)status.textContent='Technician sync failed - refresh and try again.';
      });
      show(`Technician sync failed: ${x.message}`,true);
    }
  }
  async function assignMainJobTechnician(select){
    const technicianId=String(select?.value||'');
    if(!technicianId||!selected?.case)return;
    const jobId=String(select.dataset.jobId||'');
    const mainJob=(selected.jobCards||[]).find(j=>String(j.id)===jobId);
    if(!mainJob)return;
    const tech=inlineTechnicians.find(x=>String(x.id)===technicianId);
    const previousId=String(mainJob.technician_id||'');
    const previousName=String(mainJob.technician_name||'');
    const caseId=selected.case.id;
    const customerId=selected.case.customerId||mainJob.customer_id||'';
    if(previousId&&previousId!==technicianId&&!confirm(`${mainJob.job_card_no} is assigned to ${previousName||'another Technician'}. Reassign it to ${tech?.name||'the selected Technician'}?`)){
      select.value=previousId;return;
    }
    const temporaryOverride=Boolean(tech?.temporaryForCustomer);
    if(temporaryOverride&&!confirm(`${tech.name} is attached to ${tech.assignedCustomerName||'another customer'}. Use Temporary Override for this Job Card only?`)){
      select.value=previousId;return;
    }
    const status=document.getElementById('mainJobTechnicianStatus');
    select.disabled=true;
    if(status)status.textContent='Assigning Technician...';
    try{
      const result=await engineeringApi('/engineering?action=dispatch',{method:'POST',body:JSON.stringify({
        jobCardMode:'existing',jobCardId:mainJob.id,jobCardNo:mainJob.job_card_no,
        technicianId,customerId,priority:String(mainJob.priority||'NORMAL').toUpperCase(),
        dueDate:String(mainJob.due_date||'').slice(0,10),temporaryOverride
      })});
      if(status)status.textContent=`Assigned to ${tech?.name||'Technician'} - synced.`;
      show(`✓ ${result.jobCardNo||mainJob.job_card_no} assigned to ${tech?.name||'Technician'}. Job Card, process and timeline synced.`);
      await load();
      await openCase(caseId);
    }catch(x){
      select.value=previousId;
      select.disabled=false;
      if(status)status.textContent='Assignment failed - choose Technician and try again.';
      show(x.message,true);
    }
  }
  function customerJobMode(){return document.querySelector('input[name="customerJobCardMode"]:checked')?.value||'create'}
  function customerActiveJobs(){
    return (selected?.jobCards||[]).filter(job=>!['PENDING_APPROVAL','COMPLETED','CANCELLED'].includes(String(job.status||'').toUpperCase()));
  }
  function selectedCustomerExistingJob(){
    const id=String(document.getElementById('jobExistingCard')?.value||'');
    return customerActiveJobs().find(job=>String(job.id)===id)||null;
  }
  function syncCustomerExistingJobAssignment(){
    const job=selectedCustomerExistingJob();
    const techSelect=document.getElementById('jobTechnician');
    const help=document.getElementById('jobExistingHelp');
    if(!job){if(help)help.textContent='Choose an active customer Job Card to assign or reassign.';return}
    const currentId=String(job.technician_id||job.technicianId||'');
    const currentName=String(job.technician_name||job.technicianName||'').trim();
    if(techSelect&&currentId&&jobTechnicians.some(x=>String(x.id)===currentId))techSelect.value=currentId;
    if(help)help.textContent=currentId?`${job.job_card_no||job.jobCardNo} is currently assigned to ${currentName||'a Technician'}. Select another Technician to hand over/reassign this same Job Card.`:`${job.job_card_no||job.jobCardNo} is not assigned yet. Select one of your Technicians.`;
  }
  function updateCustomerJobSourceUi(){
    const mode=customerJobMode();
    const jobs=customerActiveJobs();
    const existingField=document.getElementById('customerExistingJobField');
    const titleField=document.getElementById('customerJobTitleField');
    const reasonField=document.getElementById('customerHandoverReasonField');
    const titleInput=document.getElementById('jobTitle');
    const submit=document.getElementById('jobGenerateSubmit');
    const existingRadio=document.querySelector('input[name="customerJobCardMode"][value="existing"]');
    const createRadio=document.querySelector('input[name="customerJobCardMode"][value="create"]');
    if(existingRadio)existingRadio.disabled=jobs.length===0;
    if(createRadio)createRadio.disabled=jobs.length>0;
    if(existingField)existingField.classList.toggle('hidden',mode!=='existing');
    if(titleField)titleField.classList.toggle('hidden',mode==='existing');
    if(reasonField)reasonField.classList.toggle('hidden',mode!=='existing');
    if(titleInput)titleInput.required=mode!=='existing';
    if(submit)submit.textContent=mode==='existing'?'Assign / Reassign Job Card':'Create Job Card';
    document.querySelectorAll('.customer-job-source .job-source-option').forEach(label=>label.classList.toggle('is-selected',Boolean(label.querySelector('input:checked'))));
    if(mode==='existing')syncCustomerExistingJobAssignment();
  }
  function populateCustomerExistingJobs(){
    const select=document.getElementById('jobExistingCard');
    const jobs=customerActiveJobs();
    if(!select)return jobs;
    select.innerHTML=jobs.length?jobs.map(job=>{const status=String(job.status||'').replaceAll('_',' ');const tech=String(job.technician_name||job.technicianName||'').trim();return `<option value="${esc(job.id)}">${esc(job.job_card_no||job.jobCardNo||'Job Card')} · ${esc(status)}${tech?` · ${esc(tech)}`:''}</option>`}).join(''):'<option value="">No active Job Card</option>';
    return jobs;
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
      select.innerHTML='<option value="">Select Technician...</option>'+jobTechnicians.map(x=>{
        const home=x.assignedCustomerName?` · Home: ${x.assignedCustomerName}`:'';
        const tag=x.temporaryForCustomer?' · TEMP OVERRIDE':'';
        return `<option value="${esc(x.id)}">${esc(x.name+home+tag)}</option>`;
      }).join('');
      if(status)status.textContent=jobTechnicians.length?`${jobTechnicians.length} technician${jobTechnicians.length===1?'':'s'} synced`:'0 technicians synced';
      if(customerJobMode()==='existing')syncCustomerExistingJobAssignment();
      if(showToast)show(jobTechnicians.length?`Customer team synced: ${jobTechnicians.length} Technician${jobTechnicians.length===1?'':'s'}.`:'No customer-managed Technician is available. Customer Admin can send the Job Card to BELM instead.',!jobTechnicians.length);
    }catch(x){
      jobTechnicians=[];
      select.innerHTML='<option value="">Select Technician...</option>';
      if(status)status.textContent='Sync failed';
      show(`Technician sync failed: ${x.message}`,true);
    }finally{if(btn)btn.disabled=false;}
  }
  async function openJob(){
    document.getElementById('jobCaseId').value=selected.case.id;
    document.getElementById('jobTitle').value=selected.case.title;
    document.getElementById('jobHandoverReason').value='';
    const jobs=populateCustomerExistingJobs();
    const existingRadio=document.querySelector('input[name="customerJobCardMode"][value="existing"]');
    const createRadio=document.querySelector('input[name="customerJobCardMode"][value="create"]');
    if(jobs.length){existingRadio.checked=true;createRadio.checked=false}else{existingRadio.checked=false;createRadio.checked=true}
    const note=document.getElementById('jobOverrideNote');
    if(note){note.classList.add('hidden');note.textContent='';}
    // Only Customer Admin/Owner may issue the official machine Job Card to BELM.
    // Workshop Manager can issue/reassign internal Customer Job Cards to the customer's
    // own team, but cannot assign BELM personnel or send a Job Card directly to BELM.
    const sendRow=document.getElementById('jobSendToBelm')?.closest('.belm-send-row');
    if(sendRow) sendRow.classList.toggle('hidden', !isCustomerAdmin);
    updateCustomerJobSourceUi();
    document.getElementById('jobDialog').showModal();
    await loadJobTechnicians(false);
    updateCustomerJobSourceUi();
  }
  document.querySelectorAll('input[name="customerJobCardMode"]').forEach(input=>input.addEventListener('change',updateCustomerJobSourceUi));
  document.getElementById('jobExistingCard')?.addEventListener('change',syncCustomerExistingJobAssignment);
  document.getElementById('jobTechSync')?.addEventListener('click',()=>loadJobTechnicians(true));
  function sendSelectedCaseToBelm(){
    if(!isCustomerAdmin){show('Only Customer Admin can send a machine Job Card to BELM.',true);return}
    const machineId=selected?.case?.machineId||'';
    const description=selected?.case?.description||selected?.case?.title||'';
    const url=`/customer-job-card/?machine=${encodeURIComponent(machineId)}${description?`&note=${encodeURIComponent(description)}`:''}`;
    location.href=url;
  }
  document.getElementById('jobSendToBelm')?.addEventListener('click',sendSelectedCaseToBelm);
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
    try{
      const mode=customerJobMode();
      const techId=document.getElementById('jobTechnician').value;
      const tech=jobTechnicians.find(x=>String(x.id)===String(techId));
      if(!techId||!tech)throw new Error('Select one of your customer Technicians.');
      const existingJob=mode==='existing'?selectedCustomerExistingJob():null;
      if(mode==='existing'&&!existingJob)throw new Error('Select an existing Job Card.');
      const previousId=String(existingJob?.technician_id||existingJob?.technicianId||'');
      const previousName=String(existingJob?.technician_name||existingJob?.technicianName||'').trim();
      if(mode==='existing'&&previousId&&previousId!==String(techId)&&!confirm(`${existingJob.job_card_no||existingJob.jobCardNo} is assigned to ${previousName||'another Technician'}. Reassign this same Job Card to ${tech.name}? Existing diagnosis/history will remain on the Job Card.`)){
        isGeneratingJobCard=false;return;
      }
      const title=mode==='create'?document.getElementById('jobTitle').value.trim():String(existingJob?.title||selected.case.title||'Job Card');
      if(mode==='create'&&!title)throw new Error('Enter the Job Card title.');
      setActionButtonState(submitBtn,'busy',mode==='existing'?'Reassigning...':'Creating...');
      const r=await api('/job-card',{method:'POST',body:JSON.stringify({
        caseId:document.getElementById('jobCaseId').value,title,technicianId:techId,
        jobCardMode:mode,jobCardId:existingJob?.id||'',handoverReason:document.getElementById('jobHandoverReason').value.trim()
      })});
      setActionButtonState(submitBtn,'success',mode==='existing'?(r.reassigned?'✓ Reassigned':'✓ Assignment Confirmed'):'✓ Created');
      await new Promise(resolve=>setTimeout(resolve,900));
      document.getElementById('jobForm').reset();
      document.getElementById('jobDialog').close();
      show(mode==='existing'?`${r.jobCardNo} ${r.reassigned?'reassigned':'assignment confirmed'} for ${tech.name}. Previous Job Card history has been kept.`:`Job Card ${r.jobCardNo} created and assigned to ${tech.name}.`);
      await load();await openCase(selected.case.id);
    }catch(x){setActionButtonState(submitBtn,'error','Try Again');show(x.message,true)}
    finally{window.setTimeout(()=>setActionButtonState(submitBtn,'idle'),900);isGeneratingJobCard=false;}
  };
  document.getElementById('spareForm').onsubmit=async e=>{e.preventDefault();try{await api('/spare',{method:'POST',body:JSON.stringify({caseId:document.getElementById('spareCaseId').value,jobCardId:document.getElementById('spareForm').dataset.jobCardId||'',spareName:document.getElementById('spareName').value,partNumber:document.getElementById('sparePart').value,quantity:Number(document.getElementById('spareQty').value),unit:document.getElementById('spareUnit').value,reason:document.getElementById('spareReason').value})});document.getElementById('spareDialog').close();show('Spare request sent to Administration for approval.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}};
  async function approveSpare(id,approve){const note=prompt(approve?'Administration approval note (optional):':'Reason for rejection:')||'';try{await api(`/approve-spare/${id}`,{method:'PUT',body:JSON.stringify({approve,note})});show(approve?'Spare approved by Administration.':'Spare request rejected.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}}
  document.getElementById('techReportForm').onsubmit=async e=>{e.preventDefault();try{await api(`/job-report/${document.getElementById('techJobId').value}`,{method:'PUT',body:JSON.stringify({diagnosis:document.getElementById('techDiagnosis').value,workDone:document.getElementById('techWork').value,testResult:document.getElementById('techTest').value,completionNote:document.getElementById('techNote').value,repeatIssue:document.getElementById('techRepeat').checked,complete:document.getElementById('techComplete').checked})});document.getElementById('techReportDialog').close();show(document.getElementById('techComplete').checked?'Digital Job Card submitted for approval.':'Digital Job Card progress saved.');await load();await openCase(selected.case.id)}catch(x){show(x.message,true)}};
  async function loadPerformance(){try{const rows=await api('/performance');document.getElementById('performanceGrid').innerHTML=rows.length?rows.map(r=>`<article class="tech-card"><strong>${esc(r.technicianName)}</strong><div class="metrics"><div><span>Completed</span><b>${r.completedJobs}/${r.totalJobs}</b></div><div><span>Completion rate</span><b>${r.completionRate}%</b></div><div><span>First-time fix</span><b>${r.firstTimeFixRate}%</b></div><div><span>Avg resolution</span><b>${duration(r.avgResolutionHours)}</b></div><div><span>Repeat / rework</span><b>${r.repeatJobs}</b></div></div></article>`).join(''):'<div class="empty">No completed Job Card data yet.</div>'}catch(x){document.getElementById('performanceGrid').innerHTML=`<div class="empty">${esc(x.message)}</div>`}}
  async function load(){
    if(adminWorkshopAnalysisOnly){
      await Promise.allSettled([loadPerformance(),loadDepartmentReport()]);
      return;
    }
    if(adminJobCardsDispatchOnly){
      try{
        await Promise.all([loadDispatchOptions({announce:false,syncSources:true}),loadJobProcess()]);
      }catch(x){show(x.message||'Could not load Job Card Dispatch.',true)}
      return;
    }
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
      await loadQueueTechnicians();
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
          syncStatus.textContent=`${made} missing workflow case${made===1?'':'s'} restored. ${requests} Job Card${requests===1?'':'s'} and ${reports} Problem Report${reports===1?'':'s'} checked.`;
        }else{
          syncStatus.textContent=`Synced: ${requests} Job Card${requests===1?'':'s'} + ${reports} Problem Report${reports===1?'':'s'} + Digital Job Cards.`;
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
  if(!adminWorkshopAnalysisOnly)initTechnicianDispatch();
  if(!adminWorkshopAnalysisOnly)loadMachines();
  load();
  if(adminJobCardsDispatchOnly){
    window.addEventListener('focus',loadJobProcess);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadJobProcess()});
    window.setInterval(()=>{if(!document.hidden)loadJobProcess()},15000);
  }
})();
