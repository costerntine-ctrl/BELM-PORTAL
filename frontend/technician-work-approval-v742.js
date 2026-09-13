(()=>{
  if(window.__belmTechnicianWorkApprovalV742)return;
  window.__belmTechnicianWorkApprovalV742=true;

  const cache=new Map();
  const pendingLoads=new Map();
  let patchTimer=null;
  let patchBusy=false;

  const normalize=text=>String(text||'').replace(/\s+/g,' ').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parseToken(token){
    if(!token)return null;
    try{
      const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    }catch(_){return null}
  }
  const adminToken=()=>localStorage.getItem('belm_admin_token')||'';
  function actorRole(){const p=parseToken(adminToken())||{};return String(p.roleName||p.role||'').trim().toLowerCase().replace(/[_-]+/g,' ')}
  const isBelmReviewer=()=>['workshop manager','super admin','engineer'].includes(actorRole());

  function ensureStyle(){
    if(document.getElementById('belm-tech-work-approval-v744-style'))return;
    const style=document.createElement('style');
    style.id='belm-tech-work-approval-v744-style';
    style.textContent=`
      .belm-tech-work-approval-note{margin:6px 0 10px;color:var(--muted,#75869b);font-size:11px;line-height:1.45}
      #approveJobCard.belm-tech-approve-action{background:#159447!important;color:#fff!important}
      #returnJobCard.belm-tech-return-action{background:#fee8e8!important;color:#9a2222!important}
      dialog.belm-jc-detail-dialog{overflow:hidden!important;max-height:94vh!important}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{min-height:0!important;max-height:calc(94vh - 154px)!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;scrollbar-gutter:stable!important;position:relative!important}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll::-webkit-scrollbar{width:11px}
      dialog.belm-jc-detail-dialog .belm-jc-detail-scroll::-webkit-scrollbar-thumb{background:#7890aa;border-radius:10px;border:2px solid transparent;background-clip:padding-box}
      .belm-shared-tech-approval{margin-top:18px;padding:16px 18px;border:1px solid #dcc25b;border-radius:13px;background:rgba(242,195,24,.08)}
      .belm-shared-tech-approval h3{margin:0 0 5px!important;color:#fff!important;font-size:15px!important}.belm-shared-tech-approval p{margin:0 0 12px;color:#b9c9dc;font-size:11px;line-height:1.45}
      .belm-shared-tech-approval .belm-approval-status{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.belm-shared-tech-approval .belm-approval-status span{display:inline-flex;padding:5px 8px;border-radius:999px;background:#102a47;color:#d9e8f7;font-size:10px;font-weight:900}
      .belm-shared-tech-approval .belm-approval-actions{display:flex;flex-wrap:wrap;gap:9px}.belm-shared-tech-approval button{border:0;border-radius:9px;padding:10px 14px;font-weight:900;cursor:pointer}.belm-shared-tech-approval .approve-tech{background:#159447;color:#fff}.belm-shared-tech-approval .return-tech{background:#fee8e8;color:#9a2222}.belm-shared-tech-approval button:disabled{opacity:.55;cursor:not-allowed}
      [data-theme="light"] .belm-shared-tech-approval h3{color:#24364a!important}[data-theme="light"] .belm-shared-tech-approval p{color:#65758c}
      @media(max-width:700px){dialog.belm-jc-detail-dialog .belm-jc-detail-scroll{max-height:calc(96vh - 148px)!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureModalScroll(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    const scroll=dialog?.querySelector('.belm-jc-detail-scroll');
    if(!dialog||!scroll)return;
    scroll.tabIndex=0;
    if(scroll.dataset.belmScrollV744)return;
    scroll.dataset.belmScrollV744='1';
    scroll.addEventListener('wheel',event=>{
      if(!dialog.open)return;
      const max=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
      if(max<=0)return;
      const before=scroll.scrollTop;
      scroll.scrollTop=Math.max(0,Math.min(max,before+event.deltaY));
      if(scroll.scrollTop!==before)event.preventDefault();
    },{passive:false});
    scroll.addEventListener('keydown',event=>{
      const page=Math.max(120,scroll.clientHeight*.82);
      if(event.key==='ArrowDown'){scroll.scrollBy(0,48);event.preventDefault()}
      else if(event.key==='ArrowUp'){scroll.scrollBy(0,-48);event.preventDefault()}
      else if(event.key==='PageDown'||event.key===' '){scroll.scrollBy(0,page);event.preventDefault()}
      else if(event.key==='PageUp'){scroll.scrollBy(0,-page);event.preventDefault()}
      else if(event.key==='Home'){scroll.scrollTop=0;event.preventDefault()}
      else if(event.key==='End'){scroll.scrollTop=scroll.scrollHeight;event.preventDefault()}
    });
  }

  function patchCaseDetail(){
    const root=document.getElementById('caseDetail');
    if(!root)return;
    root.querySelectorAll('h1,h2,h3,h4,.section-head h3,.section h3').forEach(el=>{
      const value=normalize(el.textContent);
      if(['WORK APPROVAL','WORK APPROVAL OF TECHNICIAN','TECHNICIAN APPROVAL'].includes(value)){
        el.textContent='TECHNICIAN WORK APPROVAL';
        if(!el.nextElementSibling?.classList?.contains('belm-tech-work-approval-note')){
          const note=document.createElement('div');
          note.className='belm-tech-work-approval-note';
          note.textContent='Workshop Manager reviews the Technician Report before approval. Approval closes the Job Card as Completed; Return sends it back to the assigned Technician.';
          el.insertAdjacentElement('afterend',note);
        }
      }
    });
    const approve=root.querySelector('#approveJobCard');
    const ret=root.querySelector('#returnJobCard');
    if(approve&&approve.textContent!=='Approve Technician Work & Complete'){approve.textContent='Approve Technician Work & Complete';approve.classList.add('belm-tech-approve-action')}
    if(ret&&ret.textContent!=='Return Work to Technician'){ret.textContent='Return Work to Technician';ret.classList.add('belm-tech-return-action')}
  }

  async function loadModalJob(jobCardNo){
    if(cache.has(jobCardNo))return cache.get(jobCardNo);
    if(pendingLoads.has(jobCardNo))return pendingLoads.get(jobCardNo);
    const token=adminToken();
    if(!token)return null;
    const promise=(async()=>{
      try{
        const r=await fetch('/api/job-card-detail?jobCardNo='+encodeURIComponent(jobCardNo),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
        const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}
        if(!r.ok)throw new Error(data?.error||'Could not load Job Card approval data.');
        cache.set(jobCardNo,data);return data;
      }catch(_){return null}
      finally{pendingLoads.delete(jobCardNo)}
    })();
    pendingLoads.set(jobCardNo,promise);
    return promise;
  }

  async function patchSharedModal(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    if(!dialog||!dialog.open)return;
    ensureModalScroll();
    const title=String(dialog.querySelector('.belm-jc-detail-head h2')?.textContent||'').trim();
    if(!title)return;
    const data=await loadModalJob(title);
    if(!data?.job||!dialog.open)return;
    const job=data.job;
    const status=normalize(job.status||job.current_stage||'OPEN');
    const reviewer=isBelmReviewer();
    const pending=status==='PENDING_APPROVAL';
    const technician=job.technicianName||job.technician_name||'Assigned Technician';
    const jobNo=job.jobCardNo||job.job_card_no||title;
    const renderKey=[job.id,status,reviewer?'1':'0',pending?'1':'0',technician].join('|');
    const scroll=dialog.querySelector('.belm-jc-detail-scroll');
    if(!scroll)return;
    let block=scroll.querySelector('.belm-shared-tech-approval');
    if(block?.dataset.renderKey===renderKey)return;
    if(!block){block=document.createElement('section');block.className='belm-shared-tech-approval';scroll.appendChild(block)}
    block.dataset.renderKey=renderKey;
    block.innerHTML=`<h3>WORKSHOP MANAGER APPROVAL</h3><p>Review the Technician Report, then approve the Technician's work or return it for correction.</p><div class="belm-approval-status"><span>${esc(jobNo)}</span><span>Technician: ${esc(technician)}</span><span>Status: ${esc(status.replaceAll('_',' '))}</span></div><div class="belm-approval-actions"><button type="button" class="approve-tech" data-workshop-approve ${(!reviewer||!pending)?'disabled':''}>Approve Technician Work & Complete</button><button type="button" class="return-tech" data-workshop-return ${(!reviewer||!pending)?'disabled':''}>Return Work to Technician</button></div>${reviewer&&!pending?'<p style="margin-top:10px">Approval becomes active when the Technician submits the Job Card to <b>Pending Approval</b>.</p>':''}${!reviewer?'<p style="margin-top:10px">Only BELM Workshop Manager / Super Admin / Engineer can approve this Technician work.</p>':''}`;
    block.querySelector('[data-workshop-approve]')?.addEventListener('click',()=>reviewJob(job,true,block));
    block.querySelector('[data-workshop-return]')?.addEventListener('click',()=>reviewJob(job,false,block));
  }

  async function reviewJob(job,approve,block){
    if(!job?.id)return;
    let note='';
    if(approve){note=window.prompt('Workshop Manager approval note (optional):')||'';if(!window.confirm(`Approve ${job.jobCardNo||job.job_card_no||'this Job Card'} Technician work and mark it Completed?`))return}
    else{note=window.prompt('Reason / correction required from Technician:')||'';if(!note.trim())return}
    const buttons=[...block.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    const active=approve?block.querySelector('[data-workshop-approve]'):block.querySelector('[data-workshop-return]');if(active)active.textContent=approve?'Approving...':'Returning...';
    try{
      const r=await fetch('/api/breakdown-workflow/job-approval/'+encodeURIComponent(job.id),{method:'PUT',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken()},body:JSON.stringify({approve:!!approve,note:note.trim()})});
      const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}
      if(!r.ok)throw new Error(data?.error||'Workshop Manager approval failed.');
      cache.clear();document.getElementById('refreshButton')?.click();document.getElementById('refreshJobProcess')?.click();window.dispatchEvent(new CustomEvent('belm-job-card-changed'));
      if(active)active.textContent=approve?'Approved ✓':'Returned ✓';
      setTimeout(()=>window.BELMJobCardDetail?.open?.({id:job.id}),350);
    }catch(error){window.alert(error.message||'Workshop Manager approval failed.');buttons.forEach(b=>b.disabled=false)}
  }

  async function runPatch(){
    if(patchBusy)return;
    patchBusy=true;
    try{ensureStyle();patchCaseDetail();ensureModalScroll();await patchSharedModal()}finally{patchBusy=false}
  }
  function schedulePatch(delay=70){
    clearTimeout(patchTimer);
    patchTimer=setTimeout(runPatch,delay);
  }

  ensureStyle();
  const observer=new MutationObserver(mutations=>{
    const relevant=mutations.some(m=>{
      if(m.type==='attributes')return m.target?.id==='belmJobCardDetailDialog';
      return [...m.addedNodes].some(n=>n.nodeType===1&&(n.id==='belmJobCardDetailDialog'||n.id==='caseDetail'||n.querySelector?.('#belmJobCardDetailDialog,#caseDetail')));
    });
    if(relevant)schedulePatch(60);
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  document.addEventListener('click',()=>schedulePatch(80),true);
  window.addEventListener('resize',()=>schedulePatch(40));
  window.addEventListener('belm-job-card-changed',()=>{cache.clear();schedulePatch(80)});
  schedulePatch(0);
})();