(function(){
  const token=localStorage.getItem('belm_customer_token');
  const alertBox=document.getElementById('alertBox');
  const list=document.getElementById('requestList');
  let state={items:[],members:[],machines:[],actorRole:'',isBoss:false,allowedRequestTypes:[]};
  let filter='ALL';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const money=v=>{const n=Number(v||0);return n>0?`TZS ${n.toLocaleString(undefined,{maximumFractionDigits:2})}`:'—';};
  const roleLabel=r=>({owner:'Boss / Customer Owner',admin:'Customer Admin / Boss',workshop_manager:'Workshop Manager',store_keeper:'Store Keeper / Tools',procurement:'Procurement',accounts:'Accounts / Finance',operator:'Machine Operator'}[r]||r||'User');
  const typeLabel=t=>({GENERAL:'General Approval',WORKSHOP:'Workshop Approval',TECHNICAL:'Technical Approval',OPERATOR:'Operator Request',SAFETY:'Safety Request',STORE:'Store Request',TOOLS:'Tools Request',PROCUREMENT:'Procurement Approval',PURCHASE:'Purchase Approval',FINANCE:'Finance Approval',PAYMENT:'Payment Approval',FUNDING:'Funding Approval'}[t]||t);
  const stageLabel=s=>String(s||'').replaceAll('_',' ');

  function show(message,error=false){alertBox.textContent=message;alertBox.className=`alert${error?' error':''}`;window.scrollTo({top:0,behavior:'smooth'});}
  function clear(){alertBox.className='alert hidden';alertBox.textContent='';}
  async function api(path,options={}){
    const res=await fetch(`/api/customer-portal${path}`,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token||''}`,...(options.headers||{})}});
    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=null}
    if(!res.ok){if(res.status===401){localStorage.removeItem('belm_customer_token');location.href='/customer-app.html';throw new Error('Session expired.');}throw new Error(data?.error||'Request failed.');}
    return data;
  }

  function prepareDocument(file){return new Promise((resolve,reject)=>{if(!file){resolve({data:'',name:''});return;}if(file.type==='application/pdf'){if(file.size>4*1024*1024){reject(new Error('PDF must be 4 MB or smaller.'));return;}const r=new FileReader();r.onerror=()=>reject(new Error('Could not read PDF.'));r.onload=()=>resolve({data:String(r.result||''),name:file.name});r.readAsDataURL(file);return;}if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){reject(new Error('Document must be JPG, PNG, WebP or PDF.'));return;}const r=new FileReader();r.onerror=()=>reject(new Error('Could not read image.'));r.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('Image is invalid.'));img.onload=()=>{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',.8);if(data.length>2.8*1024*1024){reject(new Error('Image is too large after compression.'));return;}resolve({data,name:file.name});};img.src=r.result;};r.readAsDataURL(file);});}

  async function openAttachment(id,download=false){try{const res=await fetch(`/api/customer-portal/management-requests/${encodeURIComponent(id)}/attachment${download?'?download=1':''}`,{headers:{Authorization:`Bearer ${token||''}`}});if(!res.ok){let message='Could not load document.';try{message=(await res.json()).error||message}catch{}throw new Error(message);}const blob=await res.blob(),url=URL.createObjectURL(blob);if(download){const a=document.createElement('a');a.href=url;const cd=res.headers.get('Content-Disposition')||'';const m=cd.match(/filename="?([^";]+)"?/i);a.download=m?.[1]||'management-request-document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}else{window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}}catch(e){show(e.message,true);}}

  function renderSummary(){
    const count=s=>state.items.filter(x=>x.status===s).length;
    document.getElementById('waitingCount').textContent=count('WAITING_BOSS_APPROVAL');
    document.getElementById('approvedCount').textContent=count('APPROVED');
    document.getElementById('processCount').textContent=count('IN_PROCESS');
    document.getElementById('completedCount').textContent=count('COMPLETED');
  }

  function renderMembers(){
    const configured=Boolean(state.emailAlertsConfigured);
    const emailText=document.getElementById('emailStateText');
    if(emailText)emailText.textContent=configured?'Email alerts ON':'Portal inbox ON · SMTP setup needed';
    document.getElementById('emailState')?.classList.toggle('email-warning',!configured);
    const wrap=document.getElementById('memberChips');
    wrap.innerHTML=state.members.length?state.members.map(m=>`<span class="member-chip"><span><b>${esc(m.name)}</b><small>${esc(m.roleLabel||roleLabel(m.role))}</small></span><span class="email-ok">${configured?'✓ Email alert':'Portal only'}</span></span>`).join(''):'<span class="muted">No active Management Group members found.</span>';
    const note=document.getElementById('visibilityNote');
    note.textContent=state.actorRole==='operator'
      ? 'Operator view is intentionally limited: Store, Procurement and Finance requests are hidden. Operator can follow operational/general approvals without seeing purchasing or finance details.'
      : 'Workshop Manager, Store Keeper, Procurement and Accounts/Finance share the live approval board. Boss sees every request and makes the final approval/rejection decision.';
  }

  function filteredItems(){return filter==='ALL'?state.items:state.items.filter(x=>x.status===filter);}
  function actionsHtml(x){
    const buttons=[`<button type="button" data-history="${esc(x.id)}">View History</button>`];
    if(x.hasAttachment){buttons.push(`<button type="button" data-view-attachment="${esc(x.id)}">View Document</button>`);buttons.push(`<button type="button" data-download-attachment="${esc(x.id)}">Download</button>`);}
    if(x.canManageAttachment)buttons.push(`<button type="button" data-upload-attachment="${esc(x.id)}">${x.hasAttachment?'Replace Document':'Upload Document'}</button>`);
    if(x.canApprove){buttons.push(`<button class="approve" type="button" data-action="approve" data-id="${esc(x.id)}">Approve</button>`);buttons.push(`<button class="reject" type="button" data-action="reject" data-id="${esc(x.id)}">Reject</button>`);}
    if(x.canProgress&&x.status==='APPROVED')buttons.push(`<button class="start" type="button" data-action="start" data-id="${esc(x.id)}">Start Process</button>`);
    if(x.canProgress&&['APPROVED','IN_PROCESS'].includes(x.status))buttons.push(`<button class="complete" type="button" data-action="complete" data-id="${esc(x.id)}">Complete</button>`);
    if(x.canCancel)buttons.push(`<button type="button" data-action="cancel" data-id="${esc(x.id)}">Cancel Request</button>`);
    return buttons.join('');
  }
  function renderRequests(){
    const items=filteredItems();
    if(!items.length){list.innerHTML='<div class="empty">No requests in this status yet.</div>';return;}
    list.innerHTML=items.map(x=>{
      const machine=x.machineId?`${x.machineBrand||''} ${x.machineModel||''}${x.machineFleetNumber?` · Fleet ${x.machineFleetNumber}`:''}`.trim():'Not machine-specific';
      return `<article class="request-card">
        <div class="request-top"><div><div class="request-id"><b>${esc(x.requestNo)}</b><span class="status ${esc(x.status)}">${esc(stageLabel(x.status))}</span><span class="priority ${esc(x.priority)}">${esc(x.priority)} PRIORITY</span></div><h3>${esc(x.title)}</h3></div><small>${esc(fmtDate(x.requestedAt))}</small></div>
        <p class="description">${esc(x.description)}</p>
        <div class="meta-grid">
          <div class="meta"><span>REQUESTED BY</span><b>${esc(x.requestedByName)} · ${esc(roleLabel(x.requestedByRole))}</b></div>
          <div class="meta"><span>CURRENT STAGE</span><b>${esc(stageLabel(x.currentStage))}</b></div>
          <div class="meta"><span>NEXT / RESPONSIBLE</span><b>${esc(stageLabel(x.targetDepartment))}</b></div>
          <div class="meta"><span>AMOUNT</span><b>${esc(money(x.amount))}</b></div>
          <div class="meta"><span>TYPE</span><b>${esc(typeLabel(x.requestType))}</b></div>
          <div class="meta"><span>MACHINE</span><b>${esc(machine||'—')}</b></div>
          <div class="meta"><span>REFERENCE</span><b>${esc(x.referenceText||'—')}</b></div>
          <div class="meta"><span>SUPPORTING DOCUMENT</span><b>${x.hasAttachment?esc(x.attachmentName||'Attached'):(x.requiresProof?'Required before completion':'Optional')}</b></div>
          <div class="meta"><span>BOSS DECISION</span><b>${x.decidedByName?`${esc(x.decidedByName)} · ${esc(fmtDate(x.decidedAt))}`:'Waiting'}</b></div>
        </div>
        ${x.decisionNote?`<div class="decision"><b>Boss note:</b> ${esc(x.decisionNote)}</div>`:''}
        ${x.requiresProof&&!x.hasAttachment?`<div class="proof-warning"><b>Proof required:</b> Upload receipt, invoice, quotation or payment proof before this monetary request can be Completed.</div>`:''}
        <div class="request-actions">${actionsHtml(x)}</div>
      </article>`;
    }).join('');
    list.querySelectorAll('[data-history]').forEach(b=>b.addEventListener('click',()=>openHistory(b.dataset.history)));
    list.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>openAction(b.dataset.id,b.dataset.action)));
    list.querySelectorAll('[data-view-attachment]').forEach(b=>b.addEventListener('click',()=>openAttachment(b.dataset.viewAttachment,false)));
    list.querySelectorAll('[data-download-attachment]').forEach(b=>b.addEventListener('click',()=>openAttachment(b.dataset.downloadAttachment,true)));
    list.querySelectorAll('[data-upload-attachment]').forEach(b=>b.addEventListener('click',()=>openUploadAttachment(b.dataset.uploadAttachment)));
  }

  function populateForm(){
    const type=document.getElementById('requestType');
    type.innerHTML=state.allowedRequestTypes.map(t=>`<option value="${esc(t)}">${esc(typeLabel(t))}</option>`).join('');
    const machines=document.getElementById('machineId');
    machines.innerHTML='<option value="">Not machine-specific</option>'+state.machines.map(m=>`<option value="${esc(m.id)}">${esc(`${m.brand||''} ${m.model||''}${m.fleetNumber?` · Fleet ${m.fleetNumber}`:''}`.trim())}</option>`).join('');
    document.getElementById('targetDepartmentWrap').classList.toggle('hidden',state.actorRole==='operator');
  }

  async function load(){
    clear();list.innerHTML='<div class="empty">Loading Management Group requests…</div>';
    try{
      state=await api('/management-requests');
      renderSummary();renderMembers();populateForm();renderRequests();
    }catch(e){list.innerHTML=`<div class="empty">${esc(e.message)}</div>`;show(e.message,true);}
  }

  function openRequest(){document.getElementById('requestForm').reset();document.getElementById('requestError').className='alert error hidden';populateForm();document.getElementById('requestDialog').showModal();}
  document.getElementById('requestForm').addEventListener('submit',async e=>{
    e.preventDefault();const err=document.getElementById('requestError');err.className='alert error hidden';
    const btn=document.getElementById('submitRequestButton');btn.disabled=true;
    try{
      const prepared=await prepareDocument(document.getElementById('requestAttachment').files?.[0]);
      await api('/management-requests',{method:'POST',body:JSON.stringify({requestType:document.getElementById('requestType').value,priority:document.getElementById('priority').value,title:document.getElementById('requestTitle').value.trim(),description:document.getElementById('requestDescription').value.trim(),machineId:document.getElementById('machineId').value,amount:document.getElementById('amount').value,referenceText:document.getElementById('referenceText').value.trim(),targetDepartment:document.getElementById('targetDepartment').value,attachmentData:prepared.data,attachmentName:prepared.name})});
      document.getElementById('requestDialog').close();show('Request sent to Boss. The Management Group can now follow its live status.');await load();
    }catch(ex){err.textContent=ex.message;err.className='alert error';}finally{btn.disabled=false;}
  });

  async function openHistory(id){
    const dlg=document.getElementById('historyDialog');const rows=document.getElementById('historyRows');rows.innerHTML='<div class="empty">Loading history…</div>';dlg.showModal();
    try{const data=await api(`/management-requests/${encodeURIComponent(id)}/history`);document.getElementById('historyTitle').textContent=`${data.request.requestNo} History`;rows.innerHTML=data.events.length?data.events.map(ev=>`<div class="history-row"><span class="history-dot"></span><div class="history-body"><b>${esc(stageLabel(ev.eventType))} · ${esc(stageLabel(ev.status))}</b><small>${esc(ev.actorName)} · ${esc(roleLabel(ev.actorRole))} · ${esc(fmtDate(ev.createdAt))}</small>${ev.note?`<p>${esc(ev.note)}</p>`:''}</div></div>`).join(''):'<div class="empty">No history recorded.</div>';}catch(e){rows.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
  }

  function openUploadAttachment(id){document.getElementById('attachmentForm').reset();document.getElementById('attachmentRequestId').value=id;document.getElementById('attachmentError').className='alert error hidden';document.getElementById('attachmentDialog').showModal();}
  document.getElementById('attachmentForm').addEventListener('submit',async e=>{e.preventDefault();const id=document.getElementById('attachmentRequestId').value,err=document.getElementById('attachmentError'),btn=document.getElementById('uploadAttachmentButton');err.className='alert error hidden';btn.disabled=true;try{const prepared=await prepareDocument(document.getElementById('attachmentFile').files?.[0]);if(!prepared.data)throw new Error('Choose a document to upload.');await api(`/management-requests/${encodeURIComponent(id)}/attachment`,{method:'PUT',body:JSON.stringify({attachmentData:prepared.data,attachmentName:prepared.name})});document.getElementById('attachmentDialog').close();show('Supporting document uploaded. Management Group history has been updated.');await load();}catch(ex){err.textContent=ex.message;err.className='alert error';}finally{btn.disabled=false;}});

  const actionConfig={
    approve:{title:'Approve Request',note:'Approval becomes visible to the permitted Management Group immediately. The responsible department can then start the process.',button:'Approve',required:false},
    reject:{title:'Reject Request',note:'Enter the reason. The team will see the rejection reason in the request history.',button:'Reject',required:true},
    start:{title:'Start Approved Process',note:'This changes the request to In Process so the whole permitted group can see that work has started.',button:'Start Process',required:false},
    complete:{title:'Complete Request',note:'Mark this approval process completed. Add a short result/note if useful.',button:'Complete',required:false},
    cancel:{title:'Cancel Request',note:'Cancel this request before Boss makes a decision.',button:'Cancel Request',required:false}
  };
  function openAction(id,action){const cfg=actionConfig[action];if(!cfg)return;document.getElementById('actionRequestId').value=id;document.getElementById('actionName').value=action;document.getElementById('actionTitle').textContent=cfg.title;document.getElementById('actionNoteText').textContent=cfg.note;document.getElementById('actionNote').value='';document.getElementById('actionNote').required=cfg.required;document.getElementById('confirmActionButton').textContent=cfg.button;document.getElementById('actionError').className='alert error hidden';document.getElementById('actionDialog').showModal();}
  document.getElementById('actionForm').addEventListener('submit',async e=>{
    e.preventDefault();const id=document.getElementById('actionRequestId').value;const action=document.getElementById('actionName').value;const note=document.getElementById('actionNote').value.trim();const err=document.getElementById('actionError');err.className='alert error hidden';const btn=document.getElementById('confirmActionButton');btn.disabled=true;
    try{await api(`/management-requests/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,{method:'PUT',body:JSON.stringify({note})});document.getElementById('actionDialog').close();show(`Request updated: ${actionConfig[action]?.button||'Done'}.`);await load();}catch(ex){err.textContent=ex.message;err.className='alert error';}finally{btn.disabled=false;}
  });

  document.getElementById('filters').querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderRequests();}));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close)?.close()));
  document.getElementById('newRequestButton').addEventListener('click',openRequest);
  document.getElementById('refreshButton').addEventListener('click',load);
  if(!token){location.href='/customer-app.html';return;}load();
})();
