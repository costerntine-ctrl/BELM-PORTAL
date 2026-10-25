
(function(){
  'use strict';
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token){location.href='/login';return;}

  const $=id=>document.getElementById(id);
  const customerFilter=$('customerFilter'), customerType=$('customerType'), fromDate=$('fromDate'), toDate=$('toDate');
  const reportTitle=$('reportTitle'), reportStatus=$('reportStatus'), reportTable=$('reportTable');
  const pettyBalance=$('pettyBalance'), pettySummary=$('pettySummary'), pettyTable=$('pettyTable');
  const entryDialog=$('entryDialog'), entryForm=$('entryForm'), entryId=$('entryId'), entryType=$('entryType'), entryDate=$('entryDate'), entryAmount=$('entryAmount'), entryCustomer=$('entryCustomer'), entryMachine=$('entryMachine'), entryCategory=$('entryCategory'), entryDescription=$('entryDescription'), entryReference=$('entryReference'), entryReceipt=$('entryReceipt'), entryTitle=$('entryTitle');
  const reportPage=location.pathname.endsWith('/service-maintenance-report.html');
  const routeParams=new URLSearchParams(location.search);
  let reportType=['maintenance','breakdown','lube'].includes(routeParams.get('report'))?routeParams.get('report'):'maintenance', customers=[], machines=[], pettyEntries=[], selectedPettyId='';

  const money=v=>'TZS '+Number(v||0).toLocaleString('en-TZ',{maximumFractionDigits:0});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(path,opt={}){
    const response=await fetch('/api/workshop-service-maintenance'+path,{...opt,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(opt.headers||{})}});
    const text=await response.text(); let data={}; try{data=text?JSON.parse(text):{}}catch(_){data={};}
    if(!response.ok) throw new Error(data.error||'Request failed ('+response.status+').');
    return data;
  }
  function query(section,extra={}){const q=new URLSearchParams({section,...extra});return '?'+q.toString();}
  function reportQuery(format=''){
    const payload={reportType,customerId:customerFilter.value,customerType:customerType.value,from:fromDate.value,to:toDate.value};
    if(format){payload.action='export';payload.format=format;}
    return query('reports',payload);
  }
  function fillCustomers(){
    const selectedFilter=customerFilter?.value||customerFilter?.dataset.initial||'', selectedEntry=entryCustomer?.value||'';
    if(customerFilter) customerFilter.innerHTML='<option value="">All customers</option>'+customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.customerType==='PERMANENT'?'Permanent':'Non-Permanent'}</option>`).join('');
    if(entryCustomer) entryCustomer.innerHTML='<option value="">BELM / General</option>'+customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    if(customerFilter&&[...customerFilter.options].some(o=>o.value===selectedFilter)) customerFilter.value=selectedFilter;
    if(entryCustomer&&[...entryCustomer.options].some(o=>o.value===selectedEntry)) entryCustomer.value=selectedEntry;
    if(customerFilter)delete customerFilter.dataset.initial;
  }
  function fillMachines(){
    const customerId=entryCustomer.value, selected=entryMachine.value;
    entryMachine.innerHTML='<option value="">General / no machine</option>'+machines.filter(m=>!customerId||m.customerId===customerId).map(m=>`<option value="${esc(m.id)}">${esc(m.label)}${m.fleetNumber?' · '+esc(m.fleetNumber):''}</option>`).join('');
    if([...entryMachine.options].some(o=>o.value===selected)) entryMachine.value=selected;
  }
  function renderReport(data){
    customers=data.customers||customers; fillCustomers();
    const labels={maintenance:'Maintenance Report',breakdown:'Breakdown Case Report',lube:'Lube Use Report'};
    reportTitle.textContent=labels[reportType]||'Service & Maintenance Report';
    reportStatus.textContent=`${data.total||0} record(s) · ${data.customerType==='ALL'?'All customer types':String(data.customerType||'').replaceAll('_',' ')} · ${data.generatedAt?new Date(data.generatedAt).toLocaleString():''}`;
    const rows=data.rows||[];
    reportTable.innerHTML=rows.length?`<table class="sm-table"><thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Machine</th><th>Fleet</th><th>Details</th><th>Status</th><th>Recorded By</th><th>Cost</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date||'—')}</td><td><strong>${esc(r.customer||'—')}</strong><br><span class="pill ${r.customerType==='PERMANENT'?'permanent':'non'}">${r.customerType==='PERMANENT'?'Permanent':'Non-Permanent'}</span></td><td>${esc(r.serviceType||'—')}</td><td>${esc(r.machine||'—')}</td><td>${esc(r.fleetNumber||'—')}</td><td>${esc(r.details||'—')}</td><td><span class="pill ${String(r.status||'').toUpperCase()==='COMPLETED'?'done':'open'}">${esc(r.status||'—')}</span></td><td>${esc(r.recordedBy||'—')}</td><td>${r.cost!=null?money(r.cost):'—'}</td></tr>`).join('')}</tbody></table>`:'<div style="padding:18px">No records found for this filter.</div>';
  }
  async function loadReport(){
    reportStatus.textContent='Loading…';
    try{renderReport(await request(reportQuery()));}
    catch(error){reportStatus.textContent=error.message;reportTable.innerHTML='<div style="padding:18px">'+esc(error.message)+'</div>';}
  }
  function renderPetty(data){
    customers=data.customers||customers; machines=data.machines||[]; pettyEntries=data.entries||[]; fillCustomers(); fillMachines();
    pettyBalance.textContent=money(data.balance); pettySummary.textContent=`Funded ${money(data.totalFunded)} · Used ${money(data.totalUsed)}`;
    pettyTable.innerHTML=pettyEntries.length?`<table class="sm-table"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Customer / Machine</th><th>Category</th><th>Description</th><th>Amount</th><th>Receipt</th><th>Handled By</th></tr></thead><tbody>${pettyEntries.map(e=>`<tr data-entry="${esc(e.id)}"><td>${esc(e.transactionDate||String(e.createdAt||'').slice(0,10))}</td><td>${esc(e.type)}</td><td>${esc(e.reference||'—')}</td><td>${esc(e.customer||'BELM / General')}<br>${esc(e.machine||'')}</td><td>${esc(e.category||'—')}</td><td>${esc(e.description||'—')}</td><td>${money(e.amount)}</td><td>${e.hasReceipt?`<button type="button" data-receipt="${esc(e.id)}" data-receipt-name="${esc(e.receiptName||'receipt')}">View Receipt</button>`:'—'}</td><td>${esc(e.createdBy||'—')}</td></tr>`).join('')}</tbody></table>`:'<div style="padding:18px">No Petty Cash transactions yet.</div>';
  }
  async function loadPetty(){
    try{renderPetty(await request(query('petty-cash')));}
    catch(error){pettyTable.innerHTML='<div style="padding:18px">'+esc(error.message)+'</div>';}
  }
  async function fileData(file){
    if(!file) return '';
    if(file.size>8*1024*1024) throw new Error('Receipt must be 8 MB or smaller.');
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read receipt file.'));reader.readAsDataURL(file);});
  }
  async function downloadAuthenticated(path,filename,openInstead=false){
    const response=await fetch('/api/workshop-service-maintenance'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token}});
    if(!response.ok){let message='Download failed.';try{const data=await response.json();message=data.error||message;}catch(_){}throw new Error(message);}
    const blob=await response.blob();const url=URL.createObjectURL(blob);
    if(openInstead){window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);return;}
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function openEntry(type,entry=null){
    entryForm.reset();entryId.value=entry?.id||'';entryType.value=type;entryDate.value=entry?.transactionDate||new Date().toISOString().slice(0,10);entryAmount.value=entry?.amount||'';entryCategory.value=entry?.category||'';entryDescription.value=entry?.description||'';entryReference.value=entry?.reference||'';entryCustomer.value=entry?.customerId||'';fillMachines();entryMachine.value=entry?.machineId||'';entryTitle.textContent=entry?'Edit Petty Cash Entry':(type==='FUND'?'Deposit Petty Cash':'Save Workshop Expense');entryDialog.showModal();
  }

  if(reportPage){
    const labels={maintenance:'Maintenance Report',breakdown:'Breakdown Case Report',lube:'Lube Use Report'};
    $('pageReportTitle').textContent=labels[reportType];
    document.title=labels[reportType]+' — BELM Workshop Manager';
    customerFilter.dataset.initial=routeParams.get('customerId')||'';
    customerType.value=['ALL','PERMANENT','NON_PERMANENT'].includes(routeParams.get('customerType'))?routeParams.get('customerType'):'ALL';
    fromDate.value=routeParams.get('from')||'';toDate.value=routeParams.get('to')||'';
    function applyReportFilters(){
      const url=new URL(location.href);
      for(const [key,value] of Object.entries({customerId:customerFilter.value,customerType:customerType.value,from:fromDate.value,to:toDate.value})){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}
      history.replaceState(null,'',url);loadReport();
    }
    $('applyFilter').addEventListener('click',applyReportFilters);
    $('refreshReport').addEventListener('click',loadReport);
    $('reportPdf').addEventListener('click',()=>downloadAuthenticated(reportQuery('pdf'),`BELM-${reportType}-report.pdf`).catch(e=>alert(e.message)));
    $('reportCsv').addEventListener('click',()=>downloadAuthenticated(reportQuery('csv'),`BELM-${reportType}-report.csv`).catch(e=>alert(e.message)));
    $('reportPrint').addEventListener('click',()=>window.BelmRecordFiles.download('/api/workshop-service-maintenance'+reportQuery('pdf'),token,`BELM-${reportType}-report.pdf`,true).catch(e=>alert(e.message)));
    loadReport();
    return;
  }

  entryForm.addEventListener('submit',async function(event){
    event.preventDefault();
    const confirmation=window.belmConfirmEdit?await window.belmConfirmEdit({title:entryId.value?'Edit Petty Cash entry?':'Save Petty Cash entry?',message:'Enter Edit PIN to confirm this transaction.'}):null;
    if(!confirmation) return;
    try{
      const file=entryReceipt.files?.[0];
      const payload={id:entryId.value,type:entryType.value,amount:Number(entryAmount.value),transactionDate:entryDate.value,customerId:entryCustomer.value,machineId:entryMachine.value,category:entryCategory.value.trim(),description:entryDescription.value.trim(),reference:entryReference.value.trim(),editPin:confirmation.editPin,receiptPhoto:file?await fileData(file):'',receiptName:file?.name||''};
      await request(query('petty-cash',entryId.value?{id:entryId.value}:{}),{method:entryId.value?'PUT':'POST',body:JSON.stringify(payload)});
      entryDialog.close();selectedPettyId='';await loadPetty();
    }catch(error){alert(error.message);}
  });

  $('pcPdf').addEventListener('click',()=>downloadAuthenticated('?section=petty-cash&action=export&format=pdf','BELM-Workshop-Petty-Cash.pdf').catch(e=>alert(e.message)));
  $('pcCsv').addEventListener('click',()=>downloadAuthenticated('?section=petty-cash&action=export&format=csv','BELM-Workshop-Petty-Cash.csv').catch(e=>alert(e.message)));
  $('depositButton').addEventListener('click',()=>openEntry('FUND'));
  $('expenseButton').addEventListener('click',()=>openEntry('EXPENSE'));
  $('editButton').addEventListener('click',()=>{const entry=pettyEntries.find(e=>e.id===selectedPettyId)||pettyEntries[0];if(!entry){alert('No Petty Cash entry is available to edit.');return;}openEntry(entry.type,entry);});
  pettyTable.addEventListener('click',event=>{
    const receipt=event.target.closest('[data-receipt]');
    if(receipt){event.stopPropagation();downloadAuthenticated('?section=petty-cash&action=receipt&id='+encodeURIComponent(receipt.dataset.receipt),'',true).catch(e=>alert(e.message));return;}
    const row=event.target.closest('[data-entry]');if(!row)return;selectedPettyId=row.dataset.entry;pettyTable.querySelectorAll('tr[data-entry]').forEach(r=>r.style.outline=r===row?'2px solid #2f6fd6':'');
  });
  entryCustomer.addEventListener('change',fillMachines);$('closeEntry').addEventListener('click',()=>entryDialog.close());$('cancelEntry').addEventListener('click',()=>entryDialog.close());

  loadPetty();
})();
