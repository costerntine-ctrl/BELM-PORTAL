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

      /* V743: Job Card modal must always have one real vertical scroll owner. */
      dialog.belm-jc-detail-dialog{overflow:hidden!important;max-height:94vh!important}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{
        display:block!important;
        min-height:0!important;
        max-height:calc(94vh - 154px)!important;
        overflow-y:scroll!important;
        overflow-x:hidden!important;
        overscroll-behavior:contain!important;
        touch-action:pan-y!important;
        -webkit-overflow-scrolling:touch!important;
        scrollbar-gutter:stable!important;
        position:relative!important;
      }
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll::-webkit-scrollbar{width:11px}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll::-webkit-scrollbar-thumb{background:#7890aa;border-radius:10px;border:2px solid transparent;background-clip:padding-box}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.05)}
      @media(max-width:700px){dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{max-height:calc(96vh - 148px)!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureModalScroll(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    const scroll=dialog?.querySelector('.belm-jc-detail-scroll');
    if(!dialog||!scroll)return;

    // Keep injected approval/report content inside the scrollable body, never below
    // the clipped dialog viewport.
    const approval=dialog.querySelector('.belm-shared-tech-approval');
    if(approval&&!scroll.contains(approval))scroll.appendChild(approval);

    scroll.tabIndex=0;
    scroll.style.overflowY='scroll';
    scroll.style.overflowX='hidden';
    scroll.style.minHeight='0';
    scroll.style.maxHeight='calc(94vh - 154px)';
    scroll.style.touchAction='pan-y';
    scroll.style.webkitOverflowScrolling='touch';
    scroll.style.overscrollBehavior='contain';

    if(!scroll.dataset.belmScrollV743){
      scroll.dataset.belmScrollV743='1';

      // Embedded Workshop iframe + nested <dialog> can lose the browser's default
      // wheel target. Make this panel the explicit scroll owner.
      scroll.addEventListener('wheel',event=>{
        if(!dialog.open)return;
        const max=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
        if(max<=0)return;
        const before=scroll.scrollTop;
        scroll.scrollTop=Math.max(0,Math.min(max,before+event.deltaY));
        if(scroll.scrollTop!==before)event.preventDefault();
      },{passive:false});

      let touchY=null;
      let moved=false;
      scroll.addEventListener('touchstart',event=>{
        if(!event.touches?.length)return;
        touchY=event.touches[0].clientY;
        moved=false;
      },{passive:true});
      scroll.addEventListener('touchmove',event=>{
        if(touchY===null||!event.touches?.length)return;
        const next=event.touches[0].clientY;
        const delta=touchY-next;
        if(Math.abs(delta)<1)return;
        touchY=next;
        const max=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
        const before=scroll.scrollTop;
        scroll.scrollTop=Math.max(0,Math.min(max,before+delta));
        moved=moved||scroll.scrollTop!==before;
        if(moved)event.preventDefault();
      },{passive:false});
      const endTouch=()=>{touchY=null;moved=false};
      scroll.addEventListener('touchend',endTouch,{passive:true});
      scroll.addEventListener('touchcancel',endTouch,{passive:true});

      scroll.addEventListener('keydown',event=>{
        const page=Math.max(120,scroll.clientHeight*.82);
        let delta=0;
        if(event.key==='ArrowDown')delta=48;
        else if(event.key==='ArrowUp')delta=-48;
        else if(event.key==='PageDown'||event.key===' ')delta=page;
        else if(event.key==='PageUp')delta=-page;
        else if(event.key==='Home'){scroll.scrollTop=0;event.preventDefault();return}
        else if(event.key==='End'){scroll.scrollTop=scroll.scrollHeight;event.preventDefault();return}
        if(delta){scroll.scrollBy({top:delta,behavior:'smooth'});event.preventDefault()}
      });
    }
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
    const scroll=dialog.querySelector('.belm-jc-detail-scroll');
    if(workHeading){
      workHeading.textContent='TECHNICIAN WORK APPROVAL';
      const host=workHeading.closest('section,.section,.belm-jc-detail-job,div')||workHeading.parentElement;
      if(host&&scroll?.contains(host))return host;
    }
    return scroll;
  }

  async function patchSharedModal(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    if(!dialog||!dialog.open)return;
    ensureModalScroll();
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
    }else if(!host.contains(block)){
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
    ensureModalScroll();
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

  function patch(){ensureStyle();ensureModalScroll();patchCaseDetail();patchSharedModal()}

  ensureStyle();
  const observer=new MutationObserver(()=>queueMicrotask(patch));
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',()=>window.setTimeout(patch,60),true);
  window.addEventListener('resize',ensureModalScroll);
  patch();
})();