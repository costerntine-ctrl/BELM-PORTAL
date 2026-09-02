(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token){location.href='/login';return}
  let issues=[],technicians=[],jobCards=[];

  // V494: if this page is opened inside the WM iframe, any Workshop back link
  // closes the outer workspace instead of navigating the iframe into another
  // copy of PORTAL-BELM WM.
  if(new URLSearchParams(location.search).get('embed')==='1' && window.parent!==window){
    document.querySelectorAll('a[href="/belm-workshop/"],a[href="/belm-workshop"]').forEach(link=>{
      link.addEventListener('click',event=>{
        event.preventDefault();
        window.parent.postMessage({type:'belm-workshop-back-home'},location.origin);
      });
    });
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  async function api(action,options={}){const r=await fetch(`/api/engineering?action=${encodeURIComponent(action)}`,{...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`,...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data}
  async function downloadReport(){
    const r=await fetch('/api/engineering?action=workshop-tool-report-pdf',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    if(!r.ok){let data={};try{data=await r.json()}catch{}throw new Error(data.error||`Could not prepare report (${r.status}).`)}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BELM-Tool-Issue-Report.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function deliveryUrl(issue){
    const p=new URLSearchParams({source:'tool-issue'});
    if(issue?.id)p.set('toolIssueId',issue.id);
    if(issue?.jobCardNo)p.set('jobCardNo',issue.jobCardNo);
    if(issue?.toolName)p.set('toolName',issue.toolName);
    if(issue?.toolAssetId)p.set('toolAssetId',issue.toolAssetId);
    if(issue?.quantity)p.set('quantity',String(issue.quantity));
    if(issue?.conditionOut)p.set('conditionOut',issue.conditionOut);
    if(issue?.technicianName)p.set('technicianName',issue.technicianName);
    return `/delivery-notes/?${p.toString()}`;
  }
  function show(msg,error=false){const box=document.getElementById('pageAlert');box.textContent=msg;box.className=`alert${error?' error':''}`;box.scrollIntoView({behavior:'smooth',block:'nearest'});setTimeout(()=>box.classList.add('hidden'),4500)}
  function isOverdue(x){return !x.returnedAt&&x.expectedReturnAt&&new Date(x.expectedReturnAt).getTime()<Date.now()}
  function render(){
    const q=document.getElementById('searchInput').value.trim().toLowerCase();
    const visible=issues.filter(x=>!q||[x.documentNo,x.jobCardNo,x.technicianName,x.toolName,x.toolAssetId].some(v=>String(v||'').toLowerCase().includes(q)));
    document.getElementById('outCount').textContent=issues.filter(x=>!x.returnedAt).length;
    document.getElementById('returnedCount').textContent=issues.filter(x=>x.returnedAt).length;
    document.getElementById('documentCount').textContent=issues.length;
    document.getElementById('overdueCount').textContent=issues.filter(isOverdue).length;
    const body=document.getElementById('issueRows');
    body.innerHTML=visible.length?visible.map(x=>{
      const overdue=isOverdue(x),status=x.returnedAt?'RETURNED':overdue?'RETURN OVERDUE':'OUT WITH TECHNICIAN';
      return `<tr><td><b>${esc(x.documentNo)}</b></td><td>${esc(x.jobCardNo||'—')}</td><td>${esc(x.technicianName||'—')}</td><td><b>${esc(x.toolName)}</b>${x.toolAssetId?`<br><small>${esc(x.toolAssetId)}</small>`:''}</td><td>${esc(x.quantity)}</td><td><b>${esc(x.issuedByName||'BELM')}</b></td><td>${fmt(x.issuedAt)}</td><td>${fmt(x.expectedReturnAt)}</td><td><span class="status-pill ${x.returnedAt?'returned':overdue?'overdue':''}">${status}</span></td><td><div class="row-actions"><button class="delivery-row-button" data-delivery="${esc(x.id)}">Delivery Note</button>${x.returnedAt?`<span class="returned-detail">${fmt(x.returnedAt)}<br><small>${esc(x.receivedBy||'')}</small></span>`:`<button class="return-button" data-return="${esc(x.id)}">Receive Return</button>`}</div></td></tr>`;
    }).join(''):'<tr><td colspan="10" class="empty">No Tool Issue Documents found.</td></tr>';
    body.querySelectorAll('[data-return]').forEach(b=>b.addEventListener('click',()=>openReturn(b.dataset.return)));
    body.querySelectorAll('[data-delivery]').forEach(b=>b.addEventListener('click',()=>{const issue=issues.find(x=>String(x.id)===String(b.dataset.delivery));location.href=deliveryUrl(issue)}));
  }
  function renderOptions(){
    document.getElementById('technicianId').innerHTML='<option value="">Select Technician…</option>'+technicians.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}${t.assigned_customer_name?` — ${esc(t.assigned_customer_name)}`:''}</option>`).join('');
    document.getElementById('jobCardNo').innerHTML='<option value="">Not linked to a Job Card</option>'+jobCards.map(j=>{const machine=j.fleet_number||[j.brand,j.model].filter(Boolean).join(' ')||j.machine_type||'Machine';return `<option value="${esc(j.job_card_no)}" data-tech="${esc(j.technician_id||'')}">${esc(j.job_card_no)} — ${esc(j.customer_name)} — ${esc(machine)}</option>`}).join('');
  }
  async function load(){
    try{
      const [list,opts]=await Promise.all([api('workshop-tool-issues'),api('workshop-tool-options')]);
      issues=list.items||[];technicians=opts.technicians||[];jobCards=opts.jobCards||[];renderOptions();render();
    }catch(e){show(e.message,true);document.getElementById('issueRows').innerHTML=`<tr><td colspan="10" class="empty">${esc(e.message)}</td></tr>`}
  }
  function openIssue(){document.getElementById('issueForm').reset();document.getElementById('quantity').value='1';document.getElementById('issueError').classList.add('hidden');renderOptions();document.getElementById('issueDialog').showModal()}
  function openReturn(id){const issue=issues.find(x=>String(x.id)===String(id));if(!issue)return;document.getElementById('returnForm').reset();document.getElementById('returnId').value=id;document.getElementById('receivedBy').value='';document.getElementById('returnContext').innerHTML=`<b>${esc(issue.documentNo)}</b> · ${esc(issue.toolName)} · Technician: ${esc(issue.technicianName)}`;document.getElementById('returnError').classList.add('hidden');document.getElementById('returnDialog').showModal()}
  document.getElementById('jobCardNo').addEventListener('change',e=>{const tech=e.target.selectedOptions[0]?.dataset.tech||'';if(tech)document.getElementById('technicianId').value=tech});
  document.getElementById('deliveryNoteButton').addEventListener('click',()=>{location.href='/delivery-notes/?source=tool-issue'});
  document.getElementById('spareStockRecordButton').addEventListener('click',()=>{
    const embedded=new URLSearchParams(location.search).get('embed')==='1' && window.parent!==window;
    if(embedded){
      window.parent.postMessage({type:'belm-workshop-open-module',module:'store'},location.origin);
      return;
    }
    location.href='/spare-parts-manager/?from=tool-issues';
  });
  document.getElementById('downloadReportButton').addEventListener('click',async e=>{const b=e.currentTarget,old=b.textContent;b.disabled=true;b.textContent='Preparing PDF…';try{await downloadReport()}catch(err){show(err.message,true)}finally{b.disabled=false;b.textContent=old}});
  document.getElementById('newIssueButton').addEventListener('click',openIssue);
  document.getElementById('refreshButton').addEventListener('click',load);
  document.getElementById('searchInput').addEventListener('input',render);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close)?.close()));
  document.getElementById('issueForm').addEventListener('submit',async e=>{e.preventDefault();const error=document.getElementById('issueError');try{await api('workshop-tool-issues',{method:'POST',body:JSON.stringify({jobCardNo:document.getElementById('jobCardNo').value,technicianId:document.getElementById('technicianId').value,toolName:document.getElementById('toolName').value.trim(),toolAssetId:document.getElementById('toolAssetId').value.trim(),quantity:Number(document.getElementById('quantity').value||1),expectedReturnAt:document.getElementById('expectedReturnAt').value||'',conditionOut:document.getElementById('conditionOut').value.trim(),note:document.getElementById('issueNote').value.trim()})});document.getElementById('issueDialog').close();show('Tool Issue Document created and linked to BELM Workshop.');await load()}catch(err){error.textContent=err.message;error.classList.remove('hidden')}});
  document.getElementById('returnForm').addEventListener('submit',async e=>{e.preventDefault();const error=document.getElementById('returnError');try{await api('workshop-tool-return',{method:'POST',body:JSON.stringify({id:document.getElementById('returnId').value,conditionIn:document.getElementById('conditionIn').value.trim(),receivedBy:document.getElementById('receivedBy').value.trim(),note:document.getElementById('returnNote').value.trim()})});document.getElementById('returnDialog').close();show('Tool return recorded.');await load()}catch(err){error.textContent=err.message;error.classList.remove('hidden')}});
  load();
})();
