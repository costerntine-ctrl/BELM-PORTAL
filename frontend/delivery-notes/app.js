(function(){
  const params=new URLSearchParams(location.search);
  const preferTech=params.get('actor')==='tech';
  const techToken=localStorage.getItem('belm_tech_token')||'';
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const token=preferTech?(techToken||adminToken):(adminToken||techToken);
  if(!token){location.href='/login';return}

  let meta={customers:[],machines:[],jobCards:[],actor:{}};
  let records=[];
  let editingId='';
  let signatureTouched=false;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const payload=(()=>{try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(Array.from(atob(p)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')))}catch{return {}}})();

  const backLink=$('backLink');
  if(String(payload.roleName||'').toLowerCase()==='technician'||preferTech){backLink.href='/technician-tasks/';backLink.querySelector('small').textContent='TECHNICIAN DELIVERY NOTE'}

  async function api(path,options={}){
    const response=await fetch(`/api${path}`,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!response.ok)throw new Error(data?.error||`Request failed (${response.status}).`);return data;
  }
  function alertMsg(message,error=false){const box=$('pageAlert');box.textContent=message;box.className=`dn-alert${error?' error':''}`;box.scrollIntoView({behavior:'smooth',block:'nearest'})}
  function fmtDate(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString('en-GB',{dateStyle:'medium',timeStyle:value.includes?.('T')?'short':undefined})}
  function machineLabel(m){return [m.fleetNumber?`Fleet ${m.fleetNumber}`:'',m.brand,m.model||m.machineType].filter(Boolean).join(' · ')||'Machine'}

  function setCustomerOptions(){
    $('customerId').innerHTML='<option value="">Select customer…</option>'+meta.customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  }
  function refreshMachineJobOptions(keepMachine='',keepJob=''){
    const customerId=$('customerId').value;
    const machines=meta.machines.filter(m=>m.customerId===customerId);
    $('machineId').innerHTML='<option value="">General delivery / no machine</option>'+machines.map(m=>`<option value="${esc(m.id)}">${esc(machineLabel(m))}</option>`).join('');
    if(keepMachine&&machines.some(m=>m.id===keepMachine))$('machineId').value=keepMachine;
    const selectedMachine=$('machineId').value;
    const jobs=meta.jobCards.filter(j=>j.customerId===customerId&&(!selectedMachine||j.machineId===selectedMachine));
    $('jobCardId').innerHTML='<option value="">No Job Card</option>'+jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.jobCardNo)} · ${esc(j.title||'Job Card')} · ${esc(j.status||'')}</option>`).join('');
    if(keepJob&&jobs.some(j=>j.id===keepJob))$('jobCardId').value=keepJob;
  }
  function applyCustomerDefaults(){
    const c=meta.customers.find(x=>x.id===$('customerId').value);if(!c)return;
    if(!$('onBehalfOf').value)$('onBehalfOf').value=c.name||'';
    if(!$('address').value)$('address').value=c.address||'';
    if(!$('phone').value)$('phone').value=c.phone||'';
    if(!$('email').value)$('email').value=c.email||'';
  }

  function addItem(item={}){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td class="item-number"></td><td><input data-item="partNumber" value="${esc(item.partNumber||'')}"></td><td><input data-item="description" value="${esc(item.description||'')}" placeholder="Filter, spare, tool or equipment"></td><td><input data-item="quantity" type="number" min="0.01" step="0.01" value="${esc(item.quantity||1)}"></td><td><input data-item="unit" value="${esc(item.unit||'pcs')}"></td><td><input data-item="condition" value="${esc(item.itemCondition||item.condition||'Good')}"></td><td><button type="button" class="remove-item">×</button></td>`;
    tr.querySelector('.remove-item').addEventListener('click',()=>{tr.remove();renumberItems();if(!$('itemsBody').children.length)addItem()});
    $('itemsBody').appendChild(tr);renumberItems();
  }
  function renumberItems(){[...$('itemsBody').children].forEach((tr,i)=>tr.querySelector('.item-number').textContent=i+1)}
  function collectItems(){return [...$('itemsBody').querySelectorAll('tr')].map(tr=>({partNumber:tr.querySelector('[data-item="partNumber"]').value.trim(),description:tr.querySelector('[data-item="description"]').value.trim(),quantity:Number(tr.querySelector('[data-item="quantity"]').value||0),unit:tr.querySelector('[data-item="unit"]').value.trim(),condition:tr.querySelector('[data-item="condition"]').value.trim()})).filter(x=>x.description||x.partNumber)}

  const canvas=$('signaturePad'),ctx=canvas.getContext('2d');let drawing=false,last=null;
  function sizeCanvas(){const r=canvas.getBoundingClientRect();const ratio=Math.max(1,window.devicePixelRatio||1);canvas.width=Math.max(300,Math.floor(r.width*ratio));canvas.height=Math.floor(190*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=2.2;ctx.strokeStyle='#111827';signatureTouched=false}
  function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{drawing=true;last=pos(e);canvas.setPointerCapture(e.pointerId);e.preventDefault()});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;signatureTouched=true;e.preventDefault()});
  const stop=()=>{drawing=false;last=null};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  $('clearSignature').addEventListener('click',()=>sizeCanvas());window.addEventListener('resize',()=>{if(!signatureTouched)sizeCanvas()});

  function resetForm(){
    editingId='';$('deliveryNoteForm').reset();$('formEyebrow').textContent='NEW DOCUMENT';$('formTitle').textContent='Prepare Delivery Note';$('deliveryNoteNo').value='Generated when saved';$('deliveryDate').value=new Date().toISOString().slice(0,10);$('technicianName').value=meta.actor?.name||payload.name||'BELM Staff';$('itemsBody').innerHTML='';addItem();$('damageField').classList.add('hidden');signatureTouched=false;sizeCanvas();setCustomerOptions();refreshMachineJobOptions();
  }
  function openForm(){resetForm();$('noteFormPanel').classList.remove('hidden');requestAnimationFrame(sizeCanvas);$('noteFormPanel').scrollIntoView({behavior:'smooth',block:'start'})}
  $('newNoteButton').addEventListener('click',openForm);$('closeFormButton').addEventListener('click',()=>$('noteFormPanel').classList.add('hidden'));
  $('addItemButton').addEventListener('click',()=>addItem());
  $('conditionStatus').addEventListener('change',()=>{$('damageField').classList.toggle('hidden',$('conditionStatus').value!=='DAMAGED')});
  $('customerId').addEventListener('change',()=>{refreshMachineJobOptions();applyCustomerDefaults()});
  $('machineId').addEventListener('change',()=>refreshMachineJobOptions($('machineId').value,''));
  $('jobCardId').addEventListener('change',()=>{const job=meta.jobCards.find(j=>j.id===$('jobCardId').value);if(job&&job.machineId){$('machineId').value=job.machineId;refreshMachineJobOptions(job.machineId,job.id)}});

  function formBody(status){
    const items=collectItems();if(!items.length)throw new Error('Add at least one delivered item.');
    if(!$('customerId').value)throw new Error('Select the customer receiving the items.');
    if(status==='SIGNED'&&!signatureTouched)throw new Error('Ask the customer to sign in the signature box before saving.');
    return {status,customerId:$('customerId').value,machineId:$('machineId').value||null,jobCardId:$('jobCardId').value||null,deliveryDate:$('deliveryDate').value,receivedBy:$('receivedBy').value.trim(),onBehalfOf:$('onBehalfOf').value.trim(),address:$('address').value.trim(),phone:$('phone').value.trim(),fax:$('fax').value.trim(),email:$('email').value.trim(),conditionStatus:$('conditionStatus').value,conditionSummary:$('conditionSummary').value.trim(),damageDescription:$('damageDescription').value.trim(),otherComments:$('otherComments').value.trim(),recipientName:$('recipientName').value.trim(),signatureData:status==='SIGNED'?canvas.toDataURL('image/jpeg',.88):null,items};
  }
  async function save(status){
    const button=status==='SIGNED'?$('saveSignedButton'):$('saveDraftButton'),old=button.textContent;button.disabled=true;button.textContent=status==='SIGNED'?'Saving signed note…':'Saving draft…';
    try{const body=formBody(status);const path=editingId?`/delivery-notes/${encodeURIComponent(editingId)}`:'/delivery-notes';const result=await api(path,{method:editingId?'PUT':'POST',body:JSON.stringify(body)});$('noteFormPanel').classList.add('hidden');alertMsg(`${result.deliveryNoteNo} ${status==='SIGNED'?'signed and saved':'saved as draft'}.`);await loadRecords()}
    catch(e){alertMsg(e.message||'Could not save Delivery Note.',true)}finally{button.disabled=false;button.textContent=old}
  }
  $('saveDraftButton').addEventListener('click',()=>save('DRAFT'));$('saveSignedButton').addEventListener('click',()=>save('SIGNED'));

  function renderRecords(){
    $('signedCount').textContent=records.filter(r=>r.status==='SIGNED').length;$('draftCount').textContent=records.filter(r=>r.status==='DRAFT').length;
    const q=$('recordSearch').value.trim().toLowerCase(),status=$('statusFilter').value;
    const shown=records.filter(r=>(!status||r.status===status)&&(!q||[r.deliveryNoteNo,r.customerName,r.machineBrand,r.machineModel,r.machineType,r.fleetNumber,r.jobCardNo,r.receivedBy,r.technicianName].join(' ').toLowerCase().includes(q)));
    $('recordList').innerHTML=shown.length?shown.map(r=>{const m=[r.fleetNumber?`Fleet ${r.fleetNumber}`:'',r.machineBrand,r.machineModel||r.machineType].filter(Boolean).join(' · ');const own=String(r.technicianId||'')===String(payload.id||'');const canDelete=meta.actor?.canManageAll||(r.status==='DRAFT'&&own);const canEdit=r.status==='DRAFT'&&(meta.actor?.canManageAll||own);return `<article class="dn-record"><div><h3>${esc(r.deliveryNoteNo)} · ${esc(r.customerName)}</h3><div class="meta">${esc(r.deliveryDate||'')} · ${esc(r.itemCount||0)} item(s) · Delivered by ${esc(r.technicianName||'BELM')}</div><div class="machine">${esc(m||'General delivery')}${r.jobCardNo?` · Job Card ${esc(r.jobCardNo)}`:''}${r.receivedBy?` · Received by ${esc(r.receivedBy)}`:''}</div></div><div class="dn-record-side"><span class="dn-status ${esc(r.status)}">${esc(r.status)}</span><div class="dn-record-actions"><button data-view="${esc(r.id)}">View</button>${canEdit?`<button data-edit="${esc(r.id)}">Continue / Sign</button>`:''}${canDelete?`<button class="danger" data-delete="${esc(r.id)}">Delete</button>`:''}</div></div></article>`}).join(''):'<div class="dn-empty">No Delivery Note records found.</div>';
  }
  async function loadRecords(){try{records=await api('/delivery-notes');renderRecords()}catch(e){$('recordList').innerHTML=`<div class="dn-empty">${esc(e.message||'Could not load Delivery Notes.')}</div>`}}

  async function editDraft(id){
    try{const n=await api(`/delivery-notes/${encodeURIComponent(id)}`);if(n.status!=='DRAFT')throw new Error('Signed Delivery Notes are locked.');resetForm();editingId=id;$('formEyebrow').textContent='DRAFT DOCUMENT';$('formTitle').textContent=`Continue ${n.deliveryNoteNo}`;$('deliveryNoteNo').value=n.deliveryNoteNo;$('customerId').value=n.customerId;refreshMachineJobOptions(n.machineId||'',n.jobCardId||'');$('deliveryDate').value=n.deliveryDate||new Date().toISOString().slice(0,10);$('receivedBy').value=n.receivedBy||'';$('onBehalfOf').value=n.onBehalfOf||'';$('address').value=n.address||'';$('phone').value=n.phone||'';$('fax').value=n.fax||'';$('email').value=n.email||'';$('conditionStatus').value=n.conditionStatus||'GOOD';$('conditionSummary').value=n.conditionSummary||'';$('damageDescription').value=n.damageDescription||'';$('otherComments').value=n.otherComments||'';$('recipientName').value=n.recipientName||'';$('damageField').classList.toggle('hidden',$('conditionStatus').value!=='DAMAGED');$('itemsBody').innerHTML='';(n.items||[]).forEach(addItem);if(!$('itemsBody').children.length)addItem();$('noteFormPanel').classList.remove('hidden');requestAnimationFrame(sizeCanvas);$('noteFormPanel').scrollIntoView({behavior:'smooth',block:'start'})}catch(e){alertMsg(e.message,true)}
  }

  function detailHtml(n){const m=[n.fleetNumber?`Fleet ${n.fleetNumber}`:'',n.machineBrand,n.machineModel||n.machineType].filter(Boolean).join(' · ');return `<div class="dn-detail"><div class="dn-detail-head"><div class="dn-detail-brand"><b>BELM GENERAL TECH SERVICE LIMITED</b><small>P.O. BOX 8419 · KINONDONI · DAR ES SALAAM<br>TEL: +255 683 317 053 / +255 689 770 910<br>E-MAIL: belmgeneraltech@gmail.com</small></div><div class="dn-detail-title"><h2>DELIVERY RECEIPT FORM</h2><b>${esc(n.deliveryNoteNo)}</b><small>${esc(n.status)}</small></div></div><div class="dn-detail-grid"><div><strong>Date</strong>${esc(n.deliveryDate||'—')}</div><div><strong>Received by</strong>${esc(n.receivedBy||'—')}</div><div><strong>On behalf of</strong>${esc(n.onBehalfOf||n.customerName||'—')}</div><div><strong>Customer</strong>${esc(n.customerName||'—')}</div><div><strong>Address</strong>${esc(n.address||n.customerAddress||'—')}</div><div><strong>Phone</strong>${esc(n.phone||n.customerPhone||'—')}</div><div><strong>Email</strong>${esc(n.email||n.customerEmail||'—')}</div><div><strong>Machine / Job Card</strong>${esc(m||'General delivery')}${n.jobCardNo?` · ${esc(n.jobCardNo)}`:''}</div></div><table><thead><tr><th>#</th><th>Part / Ref</th><th>Description</th><th>Qty</th><th>Unit</th><th>Condition</th></tr></thead><tbody>${(n.items||[]).map((i,x)=>`<tr><td>${x+1}</td><td>${esc(i.partNumber||'—')}</td><td>${esc(i.description)}</td><td>${esc(i.quantity)}</td><td>${esc(i.unit||'—')}</td><td>${esc(i.itemCondition||'—')}</td></tr>`).join('')}</tbody></table><div class="dn-detail-note"><b>Condition of Goods:</b> ${esc(String(n.conditionStatus||'GOOD').replaceAll('_',' '))}${n.conditionSummary?` · ${esc(n.conditionSummary)}`:''}${n.damageDescription?`<br><b>Damage / missing items:</b> ${esc(n.damageDescription)}`:''}${n.otherComments?`<br><b>Other Comments:</b> ${esc(n.otherComments)}`:''}</div><div class="dn-detail-sign"><div><b>Delivered / Prepared by:</b> ${esc(n.technicianName||n.createdByName||'BELM Staff')}<small>Record created ${esc(fmtDate(n.createdAt))}</small></div><div>${n.signatureData?`<img src="${n.signatureData}" alt="Customer signature">`:'<div style="height:70px;border-bottom:1px solid #1f2937"></div>'}<b>${esc(n.recipientName||n.receivedBy||'Customer signature')}</b><small>${n.signedAt?`Signed ${esc(fmtDate(n.signedAt))}`:'Not signed yet'}</small></div></div><div class="dn-detail-actions"><button data-dialog-close>Close</button><button class="print" data-print>Print / Save PDF</button></div></div>`}
  async function viewRecord(id){try{const n=await api(`/delivery-notes/${encodeURIComponent(id)}`);$('recordDialogBody').innerHTML=detailHtml(n);$('recordDialog').showModal()}catch(e){alertMsg(e.message,true)}}
  function printCurrent(){window.print()}
  $('recordDialog').addEventListener('click',e=>{if(e.target.closest('[data-dialog-close]'))$('recordDialog').close();if(e.target.closest('[data-print]'))printCurrent()});

  async function deleteRecord(id){
    const r=records.find(x=>x.id===id);if(!r)return;const own=String(r.technicianId||'')===String(payload.id||'');
    try{let body={reason:'Draft cancelled by creator'};if(!(r.status==='DRAFT'&&own)){const confirmation=await window.belmConfirmDelete({title:`Delete ${r.deliveryNoteNo}?`,message:r.status==='SIGNED'?'This is a signed customer Delivery Note. Deletion requires BELM authorization and is logged.':'Delete this Delivery Note record?'});if(!confirmation)return;body=confirmation}else if(!confirm(`Delete draft ${r.deliveryNoteNo}?`))return;await api(`/delivery-notes/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify(body)});alertMsg(`${r.deliveryNoteNo} deleted.`);await loadRecords()}catch(e){alertMsg(e.message||'Could not delete Delivery Note.',true)}
  }

  $('recordList').addEventListener('click',e=>{const view=e.target.closest('[data-view]'),edit=e.target.closest('[data-edit]'),del=e.target.closest('[data-delete]');if(view)viewRecord(view.dataset.view);else if(edit)editDraft(edit.dataset.edit);else if(del)deleteRecord(del.dataset.delete)});
  $('recordSearch').addEventListener('input',renderRecords);$('statusFilter').addEventListener('change',renderRecords);$('refreshButton').addEventListener('click',async()=>{await loadMeta();await loadRecords();alertMsg('Delivery Notes synchronized.')});

  async function loadMeta(){meta=await api('/delivery-notes/meta');setCustomerOptions();$('technicianName').value=meta.actor?.name||payload.name||'BELM Staff'}
  async function init(){try{await loadMeta();resetForm();await loadRecords()}catch(e){alertMsg(e.message||'Could not open Delivery Notes.',true)}}
  init();
})();
