(()=>{
  if(window.__belmTechnicianWorkApprovalV742)return;
  window.__belmTechnicianWorkApprovalV742=true;

  const cache=new Map();
  let loadingKey='';

  function normalize(text){return String(text||'').replace(/\s+/g,' ').trim().toUpperCase()}
  function parseToken(token){
    if(!token)return null;
    try{
      const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    }catch(_){return null}
  }
  function adminToken(){return localStorage.getItem('belm_admin_token')||''}
  function actorRole(){
    const p=parseToken(adminToken())||{};
    return String(p.roleName||p.role||'').trim().toLowerCase().replace(/[_-]+/g,' ');
  }
  function isBelmReviewer(){return ['workshop manager','super admin','engineer'].includes(actorRole())}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function ensureStyle(){
    if(document.getElementById('belm-tech-work-approval-v742-style'))return;
    const style=document.createElement('style');
    style.id='belm-tech-work-approval-v742-style';
    style.textContent=`
      .belm-tech-work-approval-note{margin:6px 0 10px;color:var(--muted,#75869b);font-size:11px;line-height:1.45}
      #approveJobCard.belm-tech-approve-action{background:#159447!important;color:#fff!important}
      #returnJobCard.belm-tech-return-action{background:#fee8e8!important;color:#9a2222!important}
      .belm-shared-tech-approval{margin-top:18px;padding:16px 18px;border:1px solid #dcc25b;border-radius:13px;background:rgba(242,195,24,.08)}
      .belm-shared-tech-approval h3{margin:0 0 5px!important;color:#fff!important;font-size:15px!important;letter-spacing:.02em}
      .belm-shared-tech-approval p{margin:0 0 12px;color:#b9c9dc;font-size:11px;line-height:1.45}
      .belm-shared-tech-approval .belm-approval-status{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
      .belm-shared-tech-approval .belm-approval-status span{display:inline-flex;padding:5px 8px;border-radius:999px;background:#102a47;color:#d9e8f7;font-size:10px;font-weight:900}
      .belm-shared-tech-approval .belm-approval-actions{display:flex;flex-wrap:wrap;gap:9px}
      .belm-shared-tech-approval button{border:0;border-radius:9px;padding:10px 14px;font-weight:900;cursor:pointer}
      .belm-shared-tech-approval .approve-tech{background:#159447;color:#fff}.belm-shared-tech-approval .return-tech{background:#fee8e8;color:#9a2222}
      .belm-shared-tech-approval button:disabled{opacity:.55;cursor:not-allowed}
      [data-theme="light"] .belm-shared-tech-approval h3{color:#24364a!important}[data-theme="light"] .belm-shared-tech-approval p{color:#65758c}
    `;
    document.head.appendChild(style);
  }

  function patchCaseDetail(){
    const root=document.getElementById('caseDetail');
    if(!root)return;
    root.querySelectorAll('h1,h2,h3,h4,.section-head h3,.section h3').forEach(el=>{
      const value=normalize(el.textContent);
      if(value==='WORK APPROVAL'||value==='WORK APPROVAL OF TECHNICIAN'||value==='TECHNICIAN APPROVAL'){
        el.textContent='TECHNICIAN WORK APPROVAL';
        if(!el.parentElement?.querySelector('.belm-tech-work-approval-note')){
          const note=document.createElement('div');
          note.className='belm-tech-work-approval-note';
          note.textContent='Workshop Manager reviews the Technician Report before approval. Approval closes the Job Card as Completed; Return sends it back to the assigned Technician.';
          el.insertAdjacentElement('afterend',note);
        }
      }
    });

    const approve=root.querySelector('#approveJobCard');
    const ret=root.querySelector('#returnJobCard');
    if(approve){approve.textContent='Approve Technician Work & Complete';approve.classList.add('belm-tech-approve-action');}
    if(ret){ret.textContent='Return Work to Technician';ret.classList.add('belm-tech-return-action');}
  }

  async function loadModalJob(jobCardNo){
    if(cache.has(jobCardNo))return cache.get(jobCardNo);
    if(loadingKey===jobCardNo)return null;
    const token=adminToken();
    if(!token)return null;
    loadingKey=jobCardNo;
    try{
      const r=await fetch('/api/job-card-detail?jobCardNo='+encodeURIComponent(jobCardNo),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
      const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}
      if(!r.ok)throw new Error(data?.error||'Could not load Job Card approval data.');
      cache.set(jobCardNo,data);
      return data;
    }catch(_){return null}
    finally{loadingKey=''}
  }

  function locateApprovalHost(dialog){
    const headings=[...dialog.querySelectorAll('h1,h2,h3,h4')];
    const workHeading=headings.find(h=>['WORK APPROVAL','TECHNICIAN WORK APPROVAL','WORK APPROVAL OF TECHNICIAN'].includes(normalize(h.textContent)));
    if(workHeading){
      workHeading.textContent='TECHNICIAN WORK APPROVAL';
      const host=workHeading.closest('section,.section,.belm-jc-detail-job,div')||workHeading.parentElement;
      if(host)return host;
    }
    return dialog.querySelector('.belm-jc-detail-scroll');
  }

  async function patchSharedModal(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    if(!dialog||!dialog.open)return;
    const title=String(dialog.querySelector('.belm-jc-detail-head h2')?.textContent||'').trim();
    if(!title)return;

    const data=await loadModalJob(title);
    if(!data?.job)return;
    const job=data.job;
    const status=normalize(job.status||job.current_stage||'OPEN');
    const host=locateApprovalHost(dialog);
    if(!host)return;

    let block=dialog.querySelector('.belm-shared-tech-approval');
    if(!block){
      block=document.createElement('section');
      block.className='belm-shared-tech-approval';
      host.appendChild(block);
    }

    const reviewer=isBelmReviewer();
    const pending=status==='PENDING_APPROVAL';
    const technician=job.technicianName||job.technician_name||'Assigned Technician';
    const jobNo=job.jobCardNo||job.job_card_no||title;
    block.innerHTML=`<h3>WORKSHOP MANAGER APPROVAL</h3>
      <p>Review the Technician Report, then approve the Technician's work or return it for correction.</p>
      <div class="belm-approval-status"><span>${esc(jobNo)}</span><span>Technician: ${esc(technician)}</span><span>Status: ${esc(status.replaceAll('_',' '))}</span></div>
      <div class="belm-approval-actions">
        <button type="button" class="approve-tech" data-workshop-approve ${(!reviewer||!pending)?'disabled':''}>Approve Technician Work & Complete</button>
        <button type="button" class="return-tech" data-workshop-return ${(!reviewer||!pending)?'disabled':''}>Return Work to Technician</button>
      </div>
      ${reviewer&&!pending?'<p style="margin-top:10px">Approval becomes active when the Technician submits the Job Card to <b>Pending Approval</b>.</p>':''}
      ${!reviewer?'<p style="margin-top:10px">Only BELM Workshop Manager / Super Admin / Engineer can approve this Technician work.</p>':''}`;

    block.querySelector('[data-workshop-approve]')?.addEventListener('click',()=>reviewJob(job,true,block));
    block.querySelector('[data-workshop-return]')?.addEventListener('click',()=>reviewJob(job,false,block));
  }

  async function reviewJob(job,approve,block){
    if(!job?.id)return;
    let note='';
    if(approve){
      note=window.prompt('Workshop Manager approval note (optional):')||'';
      if(!window.confirm(`Approve ${job.jobCardNo||job.job_card_no||'this Job Card'} Technician work and mark it Completed?`))return;
    }else{
      note=window.prompt('Reason / correction required from Technician:')||'';
      if(!note.trim())return;
    }

    const buttons=[...block.querySelectorAll('button')];
    buttons.forEach(b=>b.disabled=true);
    const active=approve?block.querySelector('[data-workshop-approve]'):block.querySelector('[data-workshop-return]');
    if(active)active.textContent=approve?'Approving...':'Returning...';
    try{
      const r=await fetch('/api/breakdown-workflow/job-approval/'+encodeURIComponent(job.id),{
        method:'PUT',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken()},
        body:JSON.stringify({approve:!!approve,note:note.trim()})
      });
      const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}
      if(!r.ok)throw new Error(data?.error||'Workshop Manager approval failed.');
      cache.clear();
      document.getElementById('refreshButton')?.click();
      document.getElementById('refreshJobProcess')?.click();
      window.dispatchEvent(new CustomEvent('belm-job-card-changed'));
      if(active)active.textContent=approve?'Approved ✓':'Returned ✓';
      window.setTimeout(()=>{
        if(window.BELMJobCardDetail?.open)window.BELMJobCardDetail.open({id:job.id});
      },350);
    }catch(error){
      window.alert(error.message||'Workshop Manager approval failed.');
      buttons.forEach(b=>b.disabled=false);
      patchSharedModal();
    }
  }

  function patch(){ensureStyle();patchCaseDetail();patchSharedModal()}

  ensureStyle();
  const observer=new MutationObserver(()=>queueMicrotask(patch));
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',()=>window.setTimeout(patch,60),true);
  patch();
})();