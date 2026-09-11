(()=>{
  if(window.__belmJobCardDetailV734)return;
  window.__belmJobCardDetailV734=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})};
  const upper=v=>String(v||'').trim().toUpperCase();
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const techToken=localStorage.getItem('belm_tech_token')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const isTechPage=location.pathname.startsWith('/technician-job-cards');
  const isAdminJobCards=location.pathname.startsWith('/breakdown-workflow')&&String(new URLSearchParams(location.search).get('actor')||'').toLowerCase()==='admin';

  function ensureFitStyle(){
    if(document.getElementById('belm-jc-detail-fit-v738'))return;
    const s=document.createElement('style');
    s.id='belm-jc-detail-fit-v738';
    s.textContent=`
      /* V738: widen the existing Job Card detail modal only and remove bottom horizontal scrolling. */
      dialog.belm-jc-detail-dialog{
        width:min(1040px,96vw)!important;
        max-width:1040px!important;
        max-height:92vh!important;
        padding:0!important;
        overflow:hidden!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog #belmJcDetailContent{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        overflow:hidden!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-head,
      dialog.belm-jc-detail-dialog .belm-jc-detail-actions{
        width:100%!important;
        max-width:100%!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        max-height:calc(92vh - 150px)!important;
        overflow-y:auto!important;
        overflow-x:hidden!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-grid{
        display:grid!important;
        grid-template-columns:minmax(280px,.82fr) minmax(0,1.18fr)!important;
        gap:24px!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-section,
      dialog.belm-jc-detail-dialog .belm-jc-detail-job,
      dialog.belm-jc-detail-dialog .belm-jc-activity,
      dialog.belm-jc-detail-dialog .belm-jc-timeline{
        min-width:0!important;
        max-width:100%!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-job-facts{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:14px 18px!important;
        width:100%!important;
        max-width:100%!important;
        min-width:0!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-job-fact{
        min-width:0!important;
        max-width:100%!important;
        overflow-wrap:anywhere!important;
        word-break:break-word!important;
        box-sizing:border-box!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-job-fact b,
      dialog.belm-jc-detail-dialog .belm-jc-activity-item,
      dialog.belm-jc-detail-dialog .belm-jc-activity-item p{
        white-space:normal!important;
        overflow-wrap:anywhere!important;
        word-break:break-word!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-actions{
        display:flex!important;
        flex-wrap:wrap!important;
        gap:10px!important;
      }
      @media(max-width:900px){
        dialog.belm-jc-detail-dialog{width:min(94vw,860px)!important}
        dialog.belm-jc-detail-dialog .belm-jc-detail-grid{grid-template-columns:1fr!important;gap:18px!important}
        dialog.belm-jc-detail-dialog .belm-jc-job-facts{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
      @media(max-width:560px){
        dialog.belm-jc-detail-dialog{width:96vw!important;max-height:94vh!important}
        dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{max-height:calc(94vh - 150px)!important}
        dialog.belm-jc-detail-dialog .belm-jc-job-facts{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(s);
  }

  function parseToken(t){if(!t)return null;try{const x=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(decodeURIComponent(Array.from(atob(x)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')))}catch{return null}}
  function token(){
    if(isAdminJobCards&&adminToken)return adminToken;
    const tp=parseToken(techToken),cp=parseToken(customerToken);
    if(tp&&String(tp.roleName||'').toLowerCase()==='technician')return techToken;
    if(cp&&String(cp.roleName||cp.customerRole||cp.role||'').toLowerCase()==='technician')return customerToken;
    return adminToken||customerToken||techToken;
  }

  async function request(url,opt={}){
    const r=await fetch(url,{...opt,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`,...(opt.headers||{})}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!r.ok)throw new Error(data?.error||`Request failed (${r.status})`);
    return data;
  }

  function ensureDialog(){
    ensureFitStyle();
    let d=document.getElementById('belmJobCardDetailDialog');
    if(d)return d;
    d=document.createElement('dialog');d.id='belmJobCardDetailDialog';d.className='belm-jc-detail-dialog';
    d.innerHTML='<div id="belmJcDetailContent" class="belm-jc-detail-loading">Loading Job Card...</div>';
    document.body.appendChild(d);
    d.addEventListener('click',e=>{if(e.target===d)d.close()});
    return d;
  }

  function eventMatch(events,terms){
    return events.find(e=>{const s=upper([e.stage,e.department,e.action,e.note].join(' '));return terms.some(t=>s.includes(t))})||null;
  }
  function lastEventMatch(events,terms){
    return [...events].reverse().find(e=>{const s=upper([e.stage,e.department,e.action,e.note].join(' '));return terms.some(t=>s.includes(t))})||null;
  }

  function steps(data){
    const j=data.job||{},events=data.events||[];
    const received=eventMatch(events,['JOB_CARD_RECEIVED','TECHNICIAN RECEIVED']);
    const diagnosisStart=eventMatch(events,['TECHNICIAN OPENED JOB CARD','DIAGNOSIS']);
    const diagnosisReport=lastEventMatch(events,['DIAGNOSIS REPORT SAVED','DIAGNOSIS REPORT']);
    const repair=lastEventMatch(events,['REPAIR','WORK DONE']);
    const testing=lastEventMatch(events,['TESTING','TEST RESULT','TEST PASSED']);
    const completed=lastEventMatch(events,['COMPLETED','APPROVED']);
    const dispatched=eventMatch(events,['ASSIGNED','DISPATCH','JOB CARD'])||{created_at:j.issued_at||j.created_at};
    const stage=upper(j.current_stage),status=upper(j.status),caseStatus=upper(j.case_status);
    const currentIndex=(caseStatus==='COMPLETED'||status==='COMPLETED'||stage==='COMPLETED')?6:
      (stage==='TESTING'||String(j.test_result||'').trim())?5:
      (stage==='REPAIR'||String(j.work_done||'').trim()||status==='PENDING_APPROVAL')?4:
      (String(j.diagnosis||'').trim())?3:
      (stage==='DIAGNOSIS'||j.started_at)?2:
      (status==='RECEIVED'||received)?1:0;
    return [
      ['Dispatched',dispatched?.created_at||j.issued_at||j.created_at],
      ['Received',received?.created_at||(status==='RECEIVED'?j.updated_at:null)],
      ['Diagnosis',diagnosisStart?.created_at||j.started_at],
      ['Diagnosis Report',diagnosisReport?.created_at||(j.diagnosis?j.updated_at:null)],
      ['Repair / Action',repair?.created_at||(j.work_done?j.updated_at:null)],
      ['Testing',testing?.created_at||(j.test_result?j.updated_at:null)],
      ['Completed',completed?.created_at||j.completed_at]
    ].map((x,i)=>({label:x[0],time:x[1],state:i<currentIndex?'done':i===currentIndex?'current':'pending'}));
  }

  function activityHtml(events){
    if(!events?.length)return '<div class="belm-jc-activity-item"><b>No activity recorded yet</b><p>The Job Card timeline will update as work progresses.</p></div>';
    return [...events].reverse().map(e=>`<div class="belm-jc-activity-item"><b>${esc(String(e.action||'Activity').replaceAll('_',' '))}</b>${e.note?`<p>${esc(e.note)}</p>`:''}<small>${esc(e.actor_name||e.department||'System')} · ${esc(fmt(e.created_at))}</small></div>`).join('');
  }

  function fact(label,value){return `<div class="belm-jc-job-fact"><span>${esc(label)}</span><b>${esc(value||'—')}</b></div>`}

  function render(data){
    const d=ensureDialog(),box=d.querySelector('#belmJcDetailContent'),j=data.job||{},per=data.permissions||{};
    const st=steps(data);
    const timeline=st.map(s=>`<div class="belm-jc-step ${s.state}"><span class="belm-jc-dot"></span><div><b>${esc(s.label)}</b>${s.time?`<small>${esc(fmt(s.time))}</small>`:''}</div></div>`).join('');
    const modelSerial=[j.brand,j.model].filter(Boolean).join(' ')+(j.serialNumber?` · ${j.serialNumber}`:'');
    const machineLine=[j.customerName,j.machineLabel,j.fleetNumber?`(${j.fleetNumber})`:null].filter(Boolean).join(' · ');
    box.className='';
    box.innerHTML=`<div class="belm-jc-detail-head"><div><h2>${esc(j.jobCardNo||j.job_card_no||'Job Card')}</h2><p>${esc(machineLine)}</p></div><button type="button" class="belm-jc-detail-close" data-jc-close>×</button></div>
      <div class="belm-jc-detail-scroll">
        <div class="belm-jc-detail-grid">
          <section class="belm-jc-detail-section"><h3>PROCESS TIMELINE</h3><div class="belm-jc-timeline">${timeline}</div></section>
          <section class="belm-jc-detail-section"><h3>COMMUNICATION / ACTIVITY HISTORY</h3><div class="belm-jc-activity">${activityHtml(data.events||[])}</div></section>
        </div>
        <section class="belm-jc-detail-job"><h3>JOB DETAILS</h3><div class="belm-jc-job-facts">
          ${fact('Model / Serial',modelSerial||j.machine_type)}${fact('Location',j.jobLocation)}${fact('Reported Problem',j.fault_description||j.title)}${fact('Requested By',j.requestedBy)}
          ${fact('Technician',j.technicianName)}${fact('Priority',j.priority||'NORMAL')}${fact('Due Date',j.due_date||'No due date')}${fact('Current Status',String(j.status||j.current_stage||'OPEN').replaceAll('_',' '))}
        </div></section>
      </div>
      <div class="belm-jc-detail-actions">
        <button type="button" class="belm-jc-btn-close" data-jc-close>Close</button>
        ${per.canDispatch?'<button type="button" class="belm-jc-btn-dispatch" data-jc-dispatch>Technician Dispatch</button>':''}
        ${per.canReceive?'<button type="button" class="belm-jc-btn-main" data-jc-receive>Receive</button>':''}
        ${per.canWork?'<button type="button" class="belm-jc-btn-main" data-jc-work>Open Job Report</button>':''}
        ${per.canCancel?'<button type="button" class="belm-jc-btn-cancel" data-jc-cancel>Cancel Job Card</button>':''}
      </div>`;
    box.querySelectorAll('[data-jc-close]').forEach(b=>b.onclick=()=>d.close());
    box.querySelector('[data-jc-receive]')?.addEventListener('click',async()=>{
      try{await request(`/api/breakdown-workflow/job-receive/${encodeURIComponent(j.id)}`,{method:'PUT',body:'{}'});refreshParent();await open({id:j.id})}catch(e){alert(e.message)}
    });
    box.querySelector('[data-jc-cancel]')?.addEventListener('click',async()=>{
      const reason=prompt('Reason for cancelling this Job Card:');if(!reason?.trim())return;
      if(!confirm(`Cancel ${j.jobCardNo||j.job_card_no}? The record will remain in Audit/Activity History.`))return;
      try{await request(`/api/job-card-detail?id=${encodeURIComponent(j.id)}`,{method:'PUT',body:JSON.stringify({action:'cancel',reason:reason.trim()})});d.close();refreshParent()}catch(e){alert(e.message)}
    });
    box.querySelector('[data-jc-work]')?.addEventListener('click',()=>{
      d.close();
      const existing=document.querySelector(`[data-report="${CSS.escape(String(j.id))}"]`);if(existing){existing.click();return}
      if(isTechPage)document.querySelector(`[data-receive="${CSS.escape(String(j.id))}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    box.querySelector('[data-jc-dispatch]')?.addEventListener('click',()=>openDispatch(j));
  }

  function openDispatch(j){
    const d=ensureDialog();d.close();
    const panel=document.getElementById('dispatchPanel');if(!panel)return;
    panel.classList.remove('hidden');panel.classList.add('jc-open');
    const mode=document.querySelector('input[name="jobCardMode"][value="existing"]');if(mode){mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}))}
    const select=document.getElementById('dispatchJobCard');
    if(select){const match=[...select.options].find(o=>String(o.value)===String(j.id)||String(o.textContent||'').includes(j.jobCardNo||j.job_card_no));if(match){select.value=match.value;select.dispatchEvent(new Event('change',{bubbles:true}))}}
    const no=document.getElementById('dispatchJobCardNo');if(no&&!no.value){no.value=j.jobCardNo||j.job_card_no||'';no.dispatchEvent(new Event('change',{bubbles:true}))}
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function refreshParent(){
    document.getElementById('refreshButton')?.click();
    document.getElementById('refreshJobProcess')?.click();
    window.dispatchEvent(new CustomEvent('belm-job-card-changed'));
  }

  async function open(ref){
    const d=ensureDialog();
    d.querySelector('#belmJcDetailContent').className='belm-jc-detail-loading';
    d.querySelector('#belmJcDetailContent').textContent='Loading Job Card...';
    if(!d.open)d.showModal();
    const q=ref?.id?`id=${encodeURIComponent(ref.id)}`:`jobCardNo=${encodeURIComponent(ref?.jobCardNo||'')}`;
    try{const data=await request(`/api/job-card-detail?${q}`);render(data)}catch(e){const box=d.querySelector('#belmJcDetailContent');box.className='belm-jc-detail-error';box.innerHTML=`<p>${esc(e.message)}</p><button class="belm-jc-btn-close" type="button">Close</button>`;box.querySelector('button').onclick=()=>d.close()}
  }

  window.BELMJobCardDetail={open};

  function enhanceTechnicianCards(root=document){
    root.querySelectorAll?.('.job-card').forEach(card=>{
      if(card.dataset.jcDetailReady==='1')return;
      const id=card.querySelector('[data-receive],[data-report],[data-pdf]')?.dataset.receive||card.querySelector('[data-report]')?.dataset.report||card.querySelector('[data-pdf]')?.dataset.pdf;
      if(!id)return;
      const actions=card.querySelector('.actions');if(!actions)return;
      const b=document.createElement('button');b.type='button';b.className='belm-jc-view-button';b.textContent='View Job Card';b.dataset.jcDetail=id;
      actions.prepend(b);card.dataset.jcDetailReady='1';
    });
  }

  document.addEventListener('click',e=>{
    const own=e.target.closest?.('[data-jc-detail]');if(own){e.preventDefault();open({id:own.dataset.jcDetail});return}
    if(isAdminJobCards){
      const menu=e.target.closest?.('.jc-ref-menu');
      if(menu){const row=menu.closest('tr');const no=row?.querySelector('.jc-ref-no')?.textContent?.trim()||row?.cells?.[0]?.textContent?.trim();if(no){e.preventDefault();e.stopImmediatePropagation();open({jobCardNo:no})}}
    }
  },true);

  if(isTechPage){enhanceTechnicianCards();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)enhanceTechnicianCards(n)}))).observe(document.body,{childList:true,subtree:true})}
})();