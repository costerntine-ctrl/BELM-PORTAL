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
  let listFilter='active';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const up=v=>String(v||'').trim().toUpperCase();
  const val=(o,...keys)=>{for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null)return o[k]}return''};
  const fmtDateTime=v=>{
    const text=String(v||'').trim();if(!text)return '—';
    const d=new Date(text.includes('T')?text:text.replace(' ','T'));
    if(Number.isNaN(d.getTime()))return text;
    return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
  };

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
      html.belm-single-job-control #summaryCards,html.belm-single-job-control main>.filters,html.belm-single-job-control .jc-ref-head,html.belm-single-job-control #jobProcessPanel,html.belm-single-job-control #dispatchPanel{display:none!important}
      .jcm814{margin:0 0 14px;border:1px solid var(--line);border-radius:15px;background:var(--surface);overflow:hidden;box-shadow:0 7px 24px rgba(10,30,55,.06)}
      .jcm814-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:15px 16px;border-bottom:1px solid var(--line)}
      .jcm814-head h2{margin:0 0 3px;font-size:18px}.jcm814-head p{margin:0;color:var(--muted);font-size:11px}.jcm814-head .scope{padding:6px 10px;border-radius:999px;background:#0b3154;color:#fff;font-size:10px;font-weight:900;white-space:nowrap}
      .jcm814-flow{display:grid;grid-template-columns:repeat(8,minmax(86px,1fr));gap:5px;padding:11px 14px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface) 92%,#0b67c2 8%)}
      .jcm814-flow>span{min-height:46px;display:grid;place-items:center;text-align:center;padding:6px 5px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:9px;font-weight:900;line-height:1.2;text-transform:uppercase}
      .jcm814-create{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.2fr;gap:9px;padding:13px 14px;border-bottom:1px solid var(--line)}
      .jcm814-create label{font-size:10px;font-weight:850;color:var(--muted)}.jcm814-create select,.jcm814-create input,.jcm814-create textarea{width:100%;margin-top:5px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink)}
      .jcm814-create .wide{grid-column:span 2}.jcm814-actions{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px}.jcm814-note{font-size:10px;color:var(--muted);line-height:1.4}.jcm814-note.ok{color:#16834e}.jcm814-note.error{color:#c72f2f}.jcm814-button{border:0;border-radius:9px;padding:10px 14px;background:#0b67c2;color:#fff;font-weight:900;cursor:pointer}.jcm814-button.green{background:#09834a}.jcm814-button:disabled{opacity:.55;cursor:not-allowed}
      .jcm814-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}.jcm814-toolbar b{font-size:12px}.jcm814-toolbar span{font-size:10px;color:var(--muted)}.jcm814-toolbar-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.jcm814-filter{border:1px solid var(--line);border-radius:999px;padding:7px 11px;background:var(--surface);color:var(--ink);font-size:9px;font-weight:900;cursor:pointer}.jcm814-filter.active{background:#0b67c2;color:#fff;border-color:#0b67c2}.jcm814-problem{max-width:260px;white-space:normal;line-height:1.35}.jcm814-dates{white-space:nowrap}.jcm814-dates small{white-space:nowrap}
      .jcm814-table-wrap{overflow:auto;padding:0 10px 12px}.jcm814-table{width:100%;min-width:1180px;border-collapse:separate;border-spacing:0 7px}.jcm814-table th{padding:4px 8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase}.jcm814-table td{padding:10px 8px;background:var(--bg);border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:11px;vertical-align:top}.jcm814-table td:first-child{border-left:1px solid var(--line);border-radius:10px 0 0 10px}.jcm814-table td:last-child{border-right:1px solid var(--line);border-radius:0 10px 10px 0}.jcm814-table small{display:block;margin-top:3px;color:var(--muted);line-height:1.35}.jcm814-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#e7f1ff;color:#0b5ca8;font-size:9px;font-weight:900;text-transform:uppercase}.jcm814-badge.pending{background:#fff4c1;color:#6b5600}.jcm814-badge.ok{background:#e4f7ec;color:#08683b}.jcm814-badge.red{background:#fee8e8;color:#9a2222}.jcm814-ground{font-size:15px;font-weight:900}.jcm814-row-actions{display:flex;flex-wrap:wrap;gap:5px}.jcm814-row-actions button{border:1px solid var(--line);border-radius:7px;padding:6px 8px;background:var(--surface);color:var(--ink);font-size:9px;font-weight:850;cursor:pointer}.jcm814-row-actions .approve{background:#09834a;color:#fff;border-color:#09834a}.jcm814-row-actions .return{background:#fee8e8;color:#9a2222;border-color:#efb7b7}
      .jcm814-step-track{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-top:6px}.jcm814-step-track i{height:5px;border-radius:4px;background:#d7e0ea}.jcm814-step-track i.done{background:#09834a}.jcm814-step-track i.current{background:#f2c318}
      .jcm814-register-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px 8px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--surface) 96%,#0b67c2 4%)}.jcm814-register-toolbar b{font-size:13px}.jcm814-register-toolbar span{font-size:10px;color:var(--muted)}.jcm814-register-scope{padding:5px 9px;border:1px solid var(--line);border-radius:999px;white-space:nowrap}
      .jcm814-register-wrap{overflow:auto;padding:0 10px 14px;background:color-mix(in srgb,var(--surface) 96%,#0b67c2 4%)}.jcm814-register-table{width:100%;min-width:1540px;border-collapse:collapse;border:1px solid var(--line);border-radius:10px;overflow:hidden}.jcm814-register-table th{padding:9px 8px;text-align:left;color:var(--muted);font-size:9px;text-transform:uppercase;white-space:nowrap;background:var(--bg);border-bottom:1px solid var(--line)}.jcm814-register-table td{padding:10px 8px;font-size:10px;vertical-align:top;border-bottom:1px solid var(--line);white-space:nowrap}.jcm814-register-table tbody tr:last-child td{border-bottom:0}.jcm814-register-table .problem{white-space:normal;min-width:230px;max-width:340px;line-height:1.4}.jcm814-register-table .process{white-space:normal;min-width:150px}.jcm814-register-table small{display:block;margin-top:3px;color:var(--muted);line-height:1.35}.jcm814-register-empty{text-align:center!important;color:var(--muted)!important;padding:18px!important}
      html[data-theme="dark"] .jcm814-badge{background:#143154;color:#a8d0ff}html[data-theme="dark"] .jcm814-badge.pending{background:#403511;color:#f7d96d}html[data-theme="dark"] .jcm814-badge.ok{background:#153b2b;color:#8ee4b6}html[data-theme="dark"] .jcm814-badge.red{background:#401d23;color:#ffaaaa}
      [hidden]{display:none!important}.jcm814-head{padding:22px}.jcm814-head h2{font-size:22px}.jcm814-head p{font-size:13px;line-height:1.6}.jcm814-flow.simple-flow{grid-template-columns:repeat(3,1fr);padding:15px 20px;gap:12px}.simple-flow>span{font-size:12px;min-height:40px;text-transform:none;letter-spacing:0;font-weight:600}.jcm814-create{grid-template-columns:1fr 1fr;padding:22px;gap:18px}.jcm814-create label{font-size:12px}.jcm814-create input,.jcm814-create select,.jcm814-create textarea{padding:12px;font-size:14px}.jcm814-note{font-size:12px;line-height:1.6}.jcm814-toolbar{padding:16px 20px}.jcm814-toolbar b{font-size:16px}.jcm814-toolbar input{padding:10px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink)}.jcm814-filter{font-size:12px;text-decoration:none;border-radius:7px}.jcm814-table{min-width:0;width:100%;border-collapse:collapse}.jcm814-table th{font-size:11px;padding:14px;text-transform:none}.jcm814-table td{font-size:13px;padding:17px 14px;white-space:normal;line-height:1.6;max-width:280px;overflow-wrap:anywhere}.jcm814-table small{font-size:12px}.jcm814-badge{font-size:10px;text-transform:none}.jcm814-row-actions button{font-size:12px;padding:10px 12px}.jcm-simple-dialog{width:min(850px,95vw);max-height:92vh;padding:0;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--ink)}.jcm-simple-dialog::backdrop{background:#07182c99}.simple-detail-head,.simple-detail-footer{padding:20px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line)}.simple-detail-head h2{margin:5px 0;font-size:24px}.simple-detail-head small{color:var(--muted)}.simple-detail-head button{font-size:24px;border:0;background:none;color:inherit;cursor:pointer}.simple-detail-body{padding:22px;line-height:1.7}.simple-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;padding-bottom:15px}.simple-facts small,.simple-facts b{display:block}.simple-facts small{color:var(--muted);font-size:11px}.simple-facts b{font-size:13px}.simple-detail-body section{padding:14px 0;border-top:1px solid var(--line)}.simple-detail-body h3{font-size:14px;margin:0 0 7px}.simple-detail-body p{font-size:13px;white-space:pre-wrap;margin:0}.simple-detail-body summary{padding:14px 0;cursor:pointer;font-size:13px}.simple-detail-body label{display:grid;gap:8px;font-size:13px}.simple-detail-body textarea{font:inherit;padding:12px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:7px}.simple-detail-footer{border-top:1px solid var(--line);border-bottom:0}.simple-detail-footer button{padding:10px;border:1px solid var(--line);border-radius:7px;color:var(--ink);background:var(--surface);cursor:pointer}#jcmReviewError{color:#d24636;padding:10px 0}@media(max-width:700px){.jcm814-table thead{display:none}.jcm814-table tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:10px;margin:12px 0;padding:8px}.jcm814-table td{border:0!important;border-radius:0!important;padding:9px!important;max-width:none}.jcm814-table td:first-child{grid-column:1/-1}.jcm814-head{align-items:flex-start;flex-direction:column}.jcm814-flow.simple-flow{gap:5px;padding:12px}.simple-flow>span{font-size:10px}.simple-facts{grid-template-columns:1fr 1fr}}
      @media(max-width:1000px){.jcm814-flow{grid-template-columns:repeat(4,1fr)}.jcm814-create{grid-template-columns:1fr 1fr}.jcm814-create .wide{grid-column:1/-1}}
      @media(max-width:620px){.jcm814-flow{grid-template-columns:repeat(2,1fr)}.jcm814-create{grid-template-columns:1fr}.jcm814-create .wide{grid-column:auto}.jcm814-actions{align-items:stretch;flex-direction:column}.jcm814-button{width:100%}.jcm814-register-toolbar{align-items:flex-start;flex-direction:column}}
    `;doc.head.appendChild(s);
  }

  function mount(){
    const doc=frame?frame.contentDocument:document;
    const win=frame?frame.contentWindow:window;
    if(!doc||!doc.body)return;
    childDoc=doc;childWin=win;ensureStyle(doc);
    doc.documentElement.classList.add('belm-single-job-control');
    if(doc.getElementById('jobCardManagerV814')){refresh();return;}
    const grid=doc.querySelector('.grid');
    if(!grid)return;
    const root=doc.createElement('section');root.id='jobCardManagerV814';root.className='jcm814';
    root.innerHTML=`
      <div class="jcm814-head"><div><h2>Workshop Job Cards</h2><p>Assign work, review diagnosis and track repairs to completion.</p></div><button id="jcm814New" class="jcm814-button" type="button">+ New / Assign Job</button></div>
      <div class="jcm814-flow simple-flow"><span>1 · Assign & Diagnose</span><span>2 · Approve & Repair</span><span>3 · Test & Complete</span></div>
      <form id="jcm814Create" class="jcm814-create" hidden>
        <div class="wide"><b>Assign a Job Card</b><p class="jcm814-note">Choose the machine issue and the responsible technician.</p></div>
        <label class="wide">Work case / machine<select id="jcm814Case" required><option value="">Loading cases...</option></select></label>
        <label>Responsible technician<select id="jcm814Tech" required><option value="">Select case first...</option></select></label>
        <label>Job title<input id="jcm814Title" placeholder="e.g. Repair hydraulic leak"></label>
        <label class="wide">Work instruction (optional)<textarea id="jcm814Instruction" rows="2" placeholder="Work scope, safety or location instructions"></textarea></label>
        <div class="jcm814-actions"><span id="jcm814Note" class="jcm814-note" role="status">An existing active Job Card is reused when assigning this case.</span><button id="jcm814Assign" class="jcm814-button" type="submit">Save & Assign Technician</button></div>
      </form>
      <p id="jcm814Status" class="jcm814-note" role="status" style="padding:0 20px"></p>
      <div class="jcm814-toolbar"><div><b>Active Job Cards</b><span id="jcm814Counts"></span></div><div class="jcm814-toolbar-actions"><input id="jcm814Search" type="search" aria-label="Search Job Cards" placeholder="Search job, machine or technician"><a class="jcm814-filter" id="jcm814Weekly" target="_top">Weekly Report</a><a class="jcm814-filter" id="jcm814Completed" target="_top">Completed Reports</a><button id="jcm814Refresh" class="jcm814-filter" type="button">Refresh</button></div></div>
      <div class="jcm814-table-wrap"><table class="jcm814-table"><thead><tr><th>Job Card / Machine</th><th>Technician</th><th>Current status</th><th>Last update</th><th>Action</th></tr></thead><tbody id="jcm814Rows"><tr><td colspan="5">Loading Job Cards...</td></tr></tbody></table></div>`;
    grid.parentNode.insertBefore(root,grid);
    doc.getElementById('jcm814New').addEventListener('click',()=>{const form=doc.getElementById('jcm814Create');form.hidden=!form.hidden;if(!form.hidden)doc.getElementById('jcm814Case').focus()});
    doc.getElementById('jcm814Weekly').href='/weekly-maintenance/?actor='+actor;
    const oldGrid=doc.querySelector('.grid');if(oldGrid)oldGrid.hidden=true;
    const oldTitle=doc.querySelector('.grid .panel .panel-head h2');if(oldTitle)oldTitle.textContent='Live Job Card / Breakdown Queue';
    const oldCopy=doc.querySelector('.grid .panel .panel-head p');if(oldCopy)oldCopy.textContent='Active machine issues remain here until Final Result = OK. Completed work is removed from the active queue but remains available in Job Card reports and process history.';
    const completedUrl=new URL('/completed-maintenance-reports/',location.origin);completedUrl.searchParams.set('actor',actor);completedUrl.searchParams.set('returnTo',location.pathname+location.search);doc.getElementById('jcm814Completed').href=completedUrl.pathname+completedUrl.search;
    doc.getElementById('jcm814Search').addEventListener('input',renderRows);
    doc.getElementById('jcm814Refresh').addEventListener('click',refresh);
    doc.getElementById('jcm814Case').addEventListener('change',caseChanged);
    doc.getElementById('jcm814Create').addEventListener('submit',assignJob);
    doc.getElementById('jcm814Rows').addEventListener('click',rowAction);
    root.querySelectorAll('[data-jcm-filter]').forEach(button=>button.addEventListener('click',()=>setListFilter(button.dataset.jcmFilter||'active')));
    refresh();
  }

  function note(message,type=''){['jcm814Note','jcm814Status'].forEach(id=>{const el=childDoc?.getElementById(id);if(el){el.textContent=message;el.className='jcm814-note'+(type?' '+type:'')}})}
  function caseLabel(c){const machine=[c.brand,c.model].filter(Boolean).join(' ')||val(c,'machineType','machine_type')||'Machine';const fleet=val(c,'fleetNumber','fleet_number');return `${machine}${fleet?` · Fleet ${fleet}`:''} · ${val(c,'title','description')||'Work case'}`}

  async function refresh(){
    if(busy)return;busy=true;const btn=childDoc?.getElementById('jcm814Refresh');if(btn)btn.disabled=true;
    try{
      const [processData,caseData]=await Promise.all([request('/api/job-card-workflow-v814?action=list&state=active'),workflowApi('')]);
      items=Array.from(new Map((Array.isArray(processData?.items)?processData.items:[]).map(item=>[String(item.id),item])).values());cases=(Array.isArray(caseData)?caseData:[]).filter(item=>!['COMPLETED','CANCELLED'].includes(up(item.status)));
      renderCases();renderRows();note(`Synced ${items.filter(x=>up(x.status)!=='CANCELLED'&&!hasFinalReport(x)).length} active Job Cards with no final report. Completed reports are available in the report archive.`,'ok');
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
      note(`Job Card ${result.jobCardNo||''} assigned to ${tech?.name||'Technician'}. Step 2 is Technician Receive.`,'ok');childDoc.getElementById('jcm814Instruction').value='';childDoc.getElementById('jcm814Create').hidden=true;await refresh();childDoc.getElementById('refreshButton')?.click();
    }catch(e){note(e.message,'error')}
    finally{button.disabled=false;button.textContent='Save & Assign Technician'}
  }

  function rowProcess(item){const step=Math.max(1,Math.min(8,Number(item.processStep||1)));return `<b>${esc(item.processLabel||processSteps[step-1])}</b><div class="jcm814-step-track">${processSteps.map((_,i)=>`<i class="${i+1<step?'done':i+1===step?'current':''}"></i>`).join('')}</div><small>Step ${step}/8 · ${esc(item.currentDepartment||'')}</small>`}
  function hasFinalReport(item){
    const status=up(item?.status);
    const final=up(item?.finalResult);
    const step=Number(item?.processStep||0);
    return status==='COMPLETED'||final==='OK'||step>=8||!!item?.completedAt;
  }
  function setListFilter(next){
    const safe=['active','completed','all'].includes(String(next||'').toLowerCase())?String(next).toLowerCase():'active';
    listFilter=safe;
    childDoc?.querySelectorAll('[data-jcm-filter]').forEach(button=>button.classList.toggle('active',button.dataset.jcmFilter===safe));
    renderRows();
  }

  function renderRows(){
    const body=childDoc?.getElementById('jcm814Rows');if(!body)return;
    const all=items.filter(x=>up(x.status)!=='CANCELLED');
    const activeCount=all.filter(x=>!hasFinalReport(x)).length;
    const completedCount=all.filter(hasFinalReport).length;
    const pendingCount=all.filter(x=>String(x.pendingReason||'').trim()&&!hasFinalReport(x)).length;
    const query=String(childDoc.getElementById('jcm814Search')?.value||'').trim().toLowerCase();
    const scoped=listFilter==='completed'?all.filter(hasFinalReport):listFilter==='all'?all:all.filter(x=>!hasFinalReport(x));
    const rows=scoped.filter(item=>!query||Object.values(item).filter(value=>typeof value==='string'||typeof value==='number').join(' ').toLowerCase().includes(query));
    const counts=childDoc.getElementById('jcm814Counts');
    if(counts)counts.textContent=` · ${activeCount} active · ${pendingCount} pending · Completed reports are available in the report archive`;
    childDoc?.querySelectorAll('[data-jcm-filter]').forEach(button=>button.classList.toggle('active',button.dataset.jcmFilter===listFilter));

    body.innerHTML=rows.length?rows.map(item=>{
      const review=up(item.status)==='REPORT_REVIEW';
      const label=review?'Awaiting review':up(item.status)==='WAITING_FOR_PARTS'?'Waiting for parts':up(item.status)==='TESTING'?'Testing':!item.receivedAt?'Awaiting technician':item.maintenanceApproved?'Repair in progress':'Diagnosis';
      return `<tr data-job="${esc(item.id)}"><td><b>${esc(item.jobCardNo)}</b><small>${esc(item.machineLabel)} · ${esc(item.fleetNumber)}</small><small>${esc(item.title)}</small></td><td><b>${esc(item.technicianName||'Unassigned')}</b><small>${esc(item.customerName)}</small></td><td><span class="jcm814-badge ${review?'pending':''}">${esc(label)}</span>${item.pendingReason?`<small>${esc(item.pendingReason)}</small>`:''}</td><td>${esc(fmtDateTime(item.updatedAt||item.createdAt))}</td><td><div class="jcm814-row-actions"><button data-view>${review?'Review report':'View Job Card'}</button></div></td></tr>`;
    }).join(''):'<tr><td colspan="5" style="text-align:center;padding:35px">No active Job Cards match this search. Completed work remains in Completed Reports.</td></tr>';
  }

  function viewJob(item){
    let dialog=childDoc.getElementById('jcmSimpleDetail');if(dialog)dialog.remove();
    dialog=childDoc.createElement('dialog');dialog.id='jcmSimpleDetail';dialog.className='jcm-simple-dialog';
    const facts=[['Machine',item.machineLabel+' · '+item.fleetNumber],['Customer',item.customerName],['Technician',item.technicianName],['Status',item.processLabel],['Created',fmtDateTime(item.createdAt)],['Updated',fmtDateTime(item.updatedAt)]];
    const report=[['Reported fault',item.faultDescription||item.title],['Diagnosis / Inspection',item.diagnosis],['Findings',item.findings],['Proposed solution',item.solution],['Maintenance performed',item.workDone],['Test result',item.finalResult],['Test notes',item.testNotes],['Pending / follow-up',item.pendingReason],['Required parts',item.requiredSpare],['Manager review',item.managerReview]];
    dialog.innerHTML=`<div class="simple-detail-head"><div><small>JOB CARD</small><h2>${esc(item.jobCardNo)}</h2></div><button data-close aria-label="Close Job Card">×</button></div><div class="simple-detail-body"><div class="simple-facts">${facts.map(([k,v])=>`<div><small>${esc(k)}</small><b>${esc(v||'—')}</b></div>`).join('')}</div>${report.filter(x=>x[1]).map(([k,v])=>`<section><h3>${esc(k)}</h3><p>${esc(v)}</p></section>`).join('')}<details><summary>Additional technical details</summary><section><h3>Explanation</h3><p>${esc(item.explanation||'Not recorded')}</p><h3>Root cause</h3><p>${esc(item.rootCause||'Not confirmed')}</p><h3>Downtime</h3><p>${Number(item.groundedDays||0).toFixed(1)} days</p></section></details>${up(item.status)==='REPORT_REVIEW'?`<form id="jcmReviewForm"><h3>Workshop Manager review</h3><label>Review note / correction required<textarea name="note" rows="3" placeholder="Enter any review comments"></textarea></label><p id="jcmReviewError" role="alert"></p><div class="jcm814-row-actions"><button class="approve" name="decision" value="approve" type="submit">Approve repair${item.requiredSpare?' & parts':''}</button><button class="return" name="decision" value="return" type="submit">Return for correction</button></div></form>`:''}</div><div class="simple-detail-footer"><button data-pdf>Download Job Card PDF</button><button data-close>Close</button></div>`;
    dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
    dialog.querySelector('[data-pdf]').addEventListener('click',()=>hasFinalReport(item)?downloadReport(item):downloadOpenJob(item));
    const form=dialog.querySelector('form');if(form)form.addEventListener('submit',async event=>{event.preventDefault();const approve=event.submitter?.value==='approve';const text=form.elements.note.value.trim();if(!approve&&!text){dialog.querySelector('#jcmReviewError').textContent='Enter the correction required before returning the report.';return;}const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const result=await processApi('review-report',{id:item.id,fetch:{method:'PUT',body:JSON.stringify({approve,note:text})}});dialog.close();note(result.message||'Review saved.','ok');await refresh();}catch(e){dialog.querySelector('#jcmReviewError').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}});
    childDoc.body.appendChild(dialog);dialog.showModal();
  }
  async function downloadOpenJob(item){try{const r=await fetch('/api/breakdown-workflow/job-card-pdf/'+encodeURIComponent(item.id),{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('Could not download Job Card.');const u=URL.createObjectURL(await r.blob());const a=childDoc.createElement('a');a.href=u;a.download=(item.jobCardNo||'BELM-Job-Card')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);}catch(e){note(e.message,'error');}}
  async function rowAction(event){const button=event.target.closest('[data-view]');if(!button)return;const id=button.closest('[data-job]')?.dataset.job;const item=items.find(x=>String(x.id)===String(id));if(item)viewJob(item);}

  async function downloadReport(item){
    try{
      const r=await fetch(`/api/job-card-workflow-v814?action=report&id=${encodeURIComponent(item.id)}`,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const t=await r.text();let d={};try{d=JSON.parse(t)}catch{}throw new Error(d.error||'Could not generate Job Card report.')}
      const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${item.jobCardNo||'Job-Card'}-FINAL-REPORT.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){note(e.message,'error')}
  }

  if(frame)frame.addEventListener('load',()=>setTimeout(mount,80));
  else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();