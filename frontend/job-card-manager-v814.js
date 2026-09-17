(function(){
  'use strict';
  if(window.__BELM_JOB_CARD_MANAGER_V814)return;
  window.__BELM_JOB_CARD_MANAGER_V814=true;

  const hostBody=document.body;
  const actor=String(hostBody?.dataset?.jobActor||new URLSearchParams(location.search).get('actor')||'admin').toLowerCase()==='customer'?'customer':'admin';
  const token=actor==='customer'?(localStorage.getItem('belm_customer_token')||''):(localStorage.getItem('belm_admin_token')||'');
  if(!token)return;
  const frame=document.getElementById('workflowFrame');
  const processSteps=['Create & Assign','Receive','Diagnosis / Inspection','Manager Review','Maintenance / Spare','Testing','Final Result','Report'];
  let childDoc=null;
  let childWin=null;
  let items=[];
  let cases=[];
  let technicians=[];
  let busy=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const up=v=>String(v||'').trim().toUpperCase();
  const val=(o,...keys)=>{for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null)return o[k]}return''};

  async function request(url,opt={}){
    const r=await fetch(url,{...opt,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(opt.headers||{})}});
    const type=String(r.headers.get('content-type')||'');
    if(type.includes('application/pdf'))return r;
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);
    return data;
  }
  const processApi=(action,opt={})=>request(`/api/job-card-workflow-v814?action=${encodeURIComponent(action)}${opt.id?`&id=${encodeURIComponent(opt.id)}`:''}`,opt.fetch||{});
  const workflowApi=(path,opt={})=>request(`/api/breakdown-workflow${path}`,opt);

  function ensureStyle(doc){
    if(doc.getElementById('jobCardManagerV814Style'))return;
    const s=doc.createElement('style');s.id='jobCardManagerV814Style';s.textContent=`
      .jcm814{margin:0 0 14px;border:1px solid var(--line);border-radius:15px;background:var(--surface);overflow:hidden;box-shadow:0 7px 24px rgba(10,30,55,.06)}
      .jcm814-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:15px 16px;border-bottom:1px solid var(--line)}
      .jcm814-head h2{margin:0 0 3px;font-size:18px}.jcm814-head p{margin:0;color:var(--muted);font-size:11px}.jcm814-head .scope{padding:6px 10px;border-radius:999px;background:#0b3154;color:#fff;font-size:10px;font-weight:900;white-space:nowrap}
      .jcm814-flow{display:grid;grid-template-columns:repeat(8,minmax(86px,1fr));gap:5px;padding:11px 14px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 92%,#0b67c2 8%)}
      .jcm814-flow span{min-height:46px;display:grid;place-items:center;text-align:center;padding:6px 5px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:9px;font-weight:900;line-height:1.2;text-transform:uppercase}
      .jcm814-create{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.2fr;gap:9px;padding:13px 14px;border-bottom:1px solid var(--line)}
      .jcm814-create label{font-size:10px;font-weight:850;color:var(--muted)}.jcm814-create select,.jcm814-create input,.jcm814-create textarea{width:100%;margin-top:5px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)}
      .jcm814-create .wide{grid-column:span 2}.jcm814-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px}.jcm814-note{font-size:10px;color:var(--muted);line-height:1.4}.jcm814-note.ok{color:#16834e}.jcm814-note.error{color:#c72f2f}.jcm814-button{border:0;border-radius:9px;padding:10px 14px;background:#0b67c2;color:#fff;font-weight:900;cursor:pointer}.jcm814-button.green{background:#09834a}.jcm814-button:disabled{opacity:.55;cursor:not-allowed}
      .jcm814-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line)}.jcm814-toolbar b{font-size:12px}.jcm814-toolbar span{font-size:10px;color:var(--muted)}
      .jcm814-table-wrap{overflow:auto;padding:0 10px 12px}.jcm814-table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0 7px}.jcm814-table th{padding:4px 8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase}.jcm814-table td{padding:10px 8px;background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:11px;vertical-align:top}.jcm814-table td:first-child{border-left:1px solid var(--line);border-radius:10px 0 0 10px}.jcm814-table td:last-child{border-right:1px solid var(--line);border-radius:0 10px 10px 0}.jcm814-table small{display:block;margin-top:3px;color:var(--muted);line-height:1.35}.jcm814-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#e7f1ff;color:#0b5ca8;font-size:9px;font-weight:900;text-transform:uppercase}.jcm814-badge.pending{background:#fff4c1;color:#6b5600}.jcm814-badge.ok{background:#e4f7ec;color:#08683b}.jcm814-badge.red{background:#fee8e8;color:#9a2222}.jcm814-ground{font-size:15px;font-weight:900}.jcm814-row-actions{display:flex;flex-wrap:wrap;gap:5px}.jcm814-row-actions button{border:1px solid var(--line);border-radius:7px;padding:6px 8px;background:var(--surface);color:var(--ink);font-size:9px;font-weight:850;cursor:pointer}.jcm814-row-actions .approve{background:#09834a;color:#fff;border-color:#09834a}.jcm814-row-actions .return{background:#fee8e8;color:#9a2222;border-color:#efb7b7}
      .jcm814-step-track{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-top:6px}.jcm814-step-track i{height:5px;border-radius:4px;background:#d7e0ea}.jcm814-step-track i.done{background:#09834a}.jcm814-step-track i.current{background:#f2c318}
      html[data-theme="dark"] .jcm814-badge{background:#143154;color:#a8d0ff}html[data-theme="dark"] .jcm814-badge.pending{background:#403511;color:#f7d96d}html[data-theme="dark"] .jcm814-badge.ok{background:#153b2b;color:#8ee4b6}html[data-theme="dark"] .jcm814-badge.red{background:#401d23;color:#ffaaaa}
      @media(max-width:1000px){.jcm814-flow{grid-template-columns:repeat(4,1fr)}.jcm814-create{grid-template-columns:1fr 1fr}.jcm814-create .wide{grid-column:1/-1}}
      @media(max-width:620px){.jcm814-flow{grid-template-columns:repeat(2,1fr)}.jcm814-create{grid-template-columns:1fr}.jcm814-create .wide{grid-column:auto}.jcm814-actions{align-items:stretch;flex-direction:column}.jcm814-button{width:100%}}
    `;doc.head.appendChild(s);
  }

  function mount(){
    const doc=frame?frame.contentDocument:document;
    const win=frame?frame.contentWindow:window;
    if(!doc||!doc.body)return;
    childDoc=doc;childWin=win;ensureStyle(doc);
    if(doc.getElementById('jobCardManagerV814')){refresh();return;}
    const grid=doc.querySelector('.grid');
    if(!grid)return;
    const root=doc.createElement('section');root.id='jobCardManagerV814';root.className='jcm814';
    root.innerHTML=`
      <div class="jcm814-head"><div><h2>Digital Job Card Control</h2><p>One process for BELM and Customer Workshops. Permissions and technicians remain separated by organization.</p></div><span class="scope">${actor==='customer'?'CUSTOMER WORKSHOP':'BELM WORKSHOP'}</span></div>
      <div class="jcm814-flow">${processSteps.map((x,i)=>`<span>${i+1}. ${esc(x)}</span>`).join('')}</div>
      <form id="jcm814Create" class="jcm814-create">
        <label>Work case / machine<select id="jcm814Case" required><option value="">Loading cases...</option></select></label>
        <label>Technician<select id="jcm814Tech" required><option value="">Select case first...</option></select></label>
        <label>Job title<input id="jcm814Title" placeholder="Job title"></label>
        <label>Case type<input id="jcm814CaseType" value="Auto-detected after diagnosis" disabled></label>
        <label class="wide">Workshop Manager instruction<textarea id="jcm814Instruction" rows="2" placeholder="Scope, safety instruction, location note..."></textarea></label>
        <div class="jcm814-actions"><span id="jcm814Note" class="jcm814-note">Select a case and Technician. Existing active Job Card will be assigned/reassigned; otherwise a new Job Card is created.</span><button id="jcm814Assign" class="jcm814-button" type="submit">Create Job Card & Assign Technician</button></div>
      </form>
      <div class="jcm814-toolbar"><div><b>Live Job Card Process</b><span id="jcm814Counts"></span></div><button id="jcm814Refresh" class="jcm814-button green" type="button">Sync / Refresh</button></div>
      <div class="jcm814-table-wrap"><table class="jcm814-table"><thead><tr><th>Job Card / Machine</th><th>Technician</th><th>Case</th><th>Grounded</th><th>Process</th><th>Pending / Why</th><th>Manager Review</th><th>Report</th></tr></thead><tbody id="jcm814Rows"><tr><td colspan="8">Loading...</td></tr></tbody></table></div>`;
    grid.parentNode.insertBefore(root,grid);
    const oldTitle=doc.querySelector('.grid .panel .panel-head h2');if(oldTitle)oldTitle.textContent='Live Job Card / Breakdown Queue';
    const oldCopy=doc.querySelector('.grid .panel .panel-head p');if(oldCopy)oldCopy.textContent='Active machine issues remain here until Final Result = OK. Completed work is removed from the active queue but remains available in Job Card reports and process history.';
    doc.getElementById('jcm814Refresh').addEventListener('click',refresh);
    doc.getElementById('jcm814Case').addEventListener('change',caseChanged);
    doc.getElementById('jcm814Create').addEventListener('submit',assignJob);
    doc.getElementById('jcm814Rows').addEventListener('click',rowAction);
    refresh();
  }

  function note(message,type=''){const el=childDoc?.getElementById('jcm814Note');if(!el)return;el.textContent=message;el.className='jcm814-note'+(type?' '+type:'')}
  function caseLabel(c){const machine=[c.brand,c.model].filter(Boolean).join(' ')||val(c,'machineType','machine_type')||'Machine';const fleet=val(c,'fleetNumber','fleet_number');return `${machine}${fleet?` · Fleet ${fleet}`:''} · ${val(c,'title','description')||'Work case'}`}

  async function refresh(){
    if(busy)return;busy=true;const btn=childDoc?.getElementById('jcm814Refresh');if(btn)btn.disabled=true;
    try{
      const [processData,caseData]=await Promise.all([processApi('list'),workflowApi('')]);
      items=Array.isArray(processData?.items)?processData.items:[];cases=Array.isArray(caseData)?caseData:[];
      renderCases();renderRows();note(`Synced ${items.filter(x=>up(x.status)!=='COMPLETED').length} active Job Cards. Completed items are removed from the active Breakdown Queue automatically.`,'ok');
    }catch(e){note(e.message||'Job Card sync failed.','error')}
    finally{busy=false;if(btn)btn.disabled=false}
  }

  function renderCases(){
    const select=childDoc?.getElementById('jcm814Case');if(!select)return;
    const current=select.value;
    select.innerHTML='<option value="">Select work case / machine...</option>'+cases.map(c=>`<option value="${esc(c.id)}">${esc(caseLabel(c))}</option>`).join('');
    if(cases.some(c=>String(c.id)===String(current)))select.value=current;
  }

  async function caseChanged(){
    const caseId=childDoc.getElementById('jcm814Case').value;const select=childDoc.getElementById('jcm814Tech');const title=childDoc.getElementById('jcm814Title');
    technicians=[];select.innerHTML='<option value="">Loading Technicians...</option>';if(!caseId){select.innerHTML='<option value="">Select case first...</option>';return}
    const c=cases.find(x=>String(x.id)===String(caseId));if(c&&!title.value.trim())title.value=val(c,'title','description')||'Machine repair';
    const customerId=val(c,'customerId','customer_id');
    try{
      technicians=await workflowApi(`/technicians?customerId=${encodeURIComponent(customerId)}`);technicians=Array.isArray(technicians)?technicians:[];
      select.innerHTML='<option value="">Select Technician...</option>'+technicians.map(t=>`<option value="${esc(t.id)}" data-temp="${t.temporaryForCustomer?'1':'0'}">${esc(t.name||t.email||'Technician')}${t.assignedCustomerName?` · Home: ${esc(t.assignedCustomerName)}`:''}${t.temporaryForCustomer?' · TEMP OVERRIDE':''}</option>`).join('');
    }catch(e){select.innerHTML='<option value="">Technician sync failed</option>';note(e.message,'error')}
  }

  async function assignJob(event){
    event.preventDefault();const caseId=childDoc.getElementById('jcm814Case').value;const techId=childDoc.getElementById('jcm814Tech').value;if(!caseId||!techId){note('Select Work Case and Technician.','error');return}
    const c=cases.find(x=>String(x.id)===String(caseId));const tech=technicians.find(x=>String(x.id)===String(techId));const title=childDoc.getElementById('jcm814Title').value.trim()||val(c,'title','description')||'Machine repair';const instruction=childDoc.getElementById('jcm814Instruction').value.trim();
    let override=false;if(tech?.temporaryForCustomer){override=childWin.confirm('This BELM Technician belongs to another home customer. Use Temporary Override for this Job Card only?');if(!override)return}
    const button=childDoc.getElementById('jcm814Assign');button.disabled=true;button.textContent='Assigning...';
    try{
      const result=await workflowApi('/job-card',{method:'POST',body:JSON.stringify({caseId,technicianId:techId,title,jobCardMode:'auto',temporaryOverride:override,workshopInstruction:instruction})});
      note(`Job Card ${result.jobCardNo||''} assigned to ${tech?.name||'Technician'}. Step 2 is Technician Receive.`,'ok');childDoc.getElementById('jcm814Instruction').value='';await refresh();childDoc.getElementById('refreshButton')?.click();
    }catch(e){note(e.message,'error')}
    finally{button.disabled=false;button.textContent='Create Job Card & Assign Technician'}
  }

  function rowProcess(item){const step=Math.max(1,Math.min(8,Number(item.processStep||1)));return `<b>${esc(item.processLabel||processSteps[step-1])}</b><div class="jcm814-step-track">${processSteps.map((_,i)=>`<i class="${i+1<step?'done':i+1===step?'current':''}"></i>`).join('')}</div><small>Step ${step}/8 · ${esc(item.currentDepartment||'')}</small>`}
  function renderRows(){
    const body=childDoc?.getElementById('jcm814Rows');if(!body)return;const active=items.filter(x=>up(x.status)!=='CANCELLED');
    const activeCount=active.filter(x=>up(x.status)!=='COMPLETED').length;const completed=active.filter(x=>up(x.status)==='COMPLETED').length;const pending=active.filter(x=>String(x.pendingReason||'').trim()&&up(x.status)!=='COMPLETED').length;
    const counts=childDoc.getElementById('jcm814Counts');if(counts)counts.textContent=` · ${activeCount} active · ${pending} pending · ${completed} completed reports`;
    body.innerHTML=active.length?active.map(item=>{
      const status=up(item.status);const review=status==='REPORT_REVIEW';const final=up(item.finalResult);const pendingText=item.pendingReason||((review)?'Waiting Workshop Manager report review':'—');const badgeClass=status==='COMPLETED'?'ok':review||pendingText!=='—'?'pending':final&&final!=='OK'?'red':'';
      return `<tr data-job="${esc(item.id)}"><td><b>${esc(item.jobCardNo)}</b><small>${esc(item.machineLabel)} · Fleet ${esc(item.fleetNumber)}<br>${esc(item.customerName)}</small></td><td><b>${esc(item.technicianName||'Unassigned')}</b><small>${esc(status.replaceAll('_',' '))}</small></td><td><span class="jcm814-badge ${item.repeatIssue?'red':''}">${esc(item.caseType||'NEW CASE')}</span><small>${item.rootCause?`Root cause: ${esc(item.rootCause)}`:'Root cause pending diagnosis'}</small></td><td><span class="jcm814-ground">${Number(item.groundedDays||0).toFixed(1)}</span><small>days grounded</small></td><td>${rowProcess(item)}</td><td><span class="jcm814-badge ${badgeClass}">${esc(status==='COMPLETED'?'CLOSED':pendingText==='—'?'ON PROCESS':'PENDING')}</span><small>${esc(pendingText)}</small>${item.requiredSpare?`<small>Spare: ${esc(item.requiredSpare)}</small>`:''}</td><td>${review?`<div class="jcm814-row-actions"><button class="approve" data-review="approve">Approve Maintenance${item.requiredSpare?' + Spare':''}</button><button class="return" data-review="return">Return Report</button></div>`:`<span class="jcm814-badge ${item.maintenanceApproved?'ok':''}">${item.maintenanceApproved?'MAINTENANCE APPROVED':'—'}</span><small>${esc(item.managerReview||'')}</small>`}</td><td><div class="jcm814-row-actions"><button data-report>Report PDF</button>${item.findings?'<button data-view>View Report</button>':''}</div><small>Final: ${esc(item.finalResult||'Pending')}</small></td></tr>`;
    }).join(''):'<tr><td colspan="8">No Job Cards found.</td></tr>';
  }

  async function rowAction(event){
    const button=event.target.closest('button');if(!button)return;const row=button.closest('[data-job]');const id=row?.dataset.job;if(!id)return;const item=items.find(x=>String(x.id)===String(id));if(!item)return;
    if(button.hasAttribute('data-report')){await downloadReport(item);return}
    if(button.hasAttribute('data-view')){childWin.alert(`TECHNICIAN REPORT\n\nCase: ${item.caseType}\n\nDiagnosis / Inspection:\n${item.diagnosis||'—'}\n\nExplanation:\n${item.explanation||'—'}\n\nFindings:\n${item.findings||'—'}\n\nRoot Cause:\n${item.rootCause||'—'}\n\nSolution:\n${item.solution||'—'}\n\nWork Done:\n${item.workDone||'—'}\n\nManager Review:\n${item.managerReview||'—'}\n\nTest: ${item.testDurationMinutes||0} min\nFinal Result: ${item.finalResult||'Pending'}\nPending: ${item.pendingReason||'—'}\nGrounded Days: ${item.groundedDays}`);return}
    const type=button.dataset.review;if(!type)return;
    const approve=type==='approve';let noteText='';
    if(approve){noteText=childWin.prompt(`Review note for ${item.jobCardNo} (optional):`,'')||'';if(!childWin.confirm(`Approve Technician Report and maintenance${item.requiredSpare?' / required spare':''}?`))return}
    else{noteText=childWin.prompt('Reason / correction required from Technician:','')||'';if(!noteText.trim())return}
    button.disabled=true;
    try{const result=await processApi('review-report',{id,fetch:{method:'PUT',body:JSON.stringify({approve,note:noteText.trim()})}});note(result.message||'Review updated.','ok');await refresh();childDoc.getElementById('refreshButton')?.click()}
    catch(e){note(e.message,'error')}
    finally{button.disabled=false}
  }

  async function downloadReport(item){
    try{
      const r=await fetch(`/api/job-card-workflow-v814?action=report&id=${encodeURIComponent(item.id)}`,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const t=await r.text();let d={};try{d=JSON.parse(t)}catch{}throw new Error(d.error||'Could not generate Job Card report.')}
      const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${item.jobCardNo||'Job-Card'}-FINAL-REPORT.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){note(e.message,'error')}
  }

  if(frame)frame.addEventListener('load',()=>setTimeout(mount,80));
  else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();