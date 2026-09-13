(()=>{
  if(window.__belmTechnicianWorkApprovalV742)return;
  window.__belmTechnicianWorkApprovalV742=true;

  function normalize(text){return String(text||'').replace(/\s+/g,' ').trim().toUpperCase()}

  function ensureStyle(){
    if(document.getElementById('belm-tech-work-approval-v742-style'))return;
    const style=document.createElement('style');
    style.id='belm-tech-work-approval-v742-style';
    style.textContent=`
      .belm-tech-work-approval-note{margin:6px 0 10px;color:var(--muted,#75869b);font-size:11px;line-height:1.45}
      #approveJobCard.belm-tech-approve-action{background:#159447!important;color:#fff!important}
      #returnJobCard.belm-tech-return-action{background:#fee8e8!important;color:#9a2222!important}
    `;
    document.head.appendChild(style);
  }

  function patch(){
    ensureStyle();
    const root=document.getElementById('caseDetail');
    if(!root)return;

    root.querySelectorAll('h1,h2,h3,h4,.section-head h3,.section h3').forEach(el=>{
      const value=normalize(el.textContent);
      if(value==='WORK APPROVAL'||value==='WORK APPROVAL OF TECHNICIAN'||value==='TECHNICIAN APPROVAL'){
        el.textContent='TECHNICIAN WORK APPROVAL';
        if(!el.parentElement?.querySelector('.belm-tech-work-approval-note')){
          const note=document.createElement('div');
          note.className='belm-tech-work-approval-note';
          note.textContent='Review the Technician Report before approving. Approval closes the Job Card as Completed; Return sends the work back to the assigned Technician for correction.';
          el.insertAdjacentElement('afterend',note);
        }
      }
    });

    const approve=root.querySelector('#approveJobCard');
    const ret=root.querySelector('#returnJobCard');
    if(approve){
      approve.textContent='Approve Technician Work & Complete';
      approve.classList.add('belm-tech-approve-action');
      approve.title='Approve the assigned Technician work and complete this Job Card';
    }
    if(ret){
      ret.textContent='Return Work to Technician';
      ret.classList.add('belm-tech-return-action');
      ret.title='Return this Job Card to the assigned Technician for correction';
    }

    // If the original layout renders only the action buttons without a heading,
    // add the correct Technician approval heading immediately above them.
    if((approve||ret) && !Array.from(root.querySelectorAll('h1,h2,h3,h4')).some(el=>normalize(el.textContent)==='TECHNICIAN WORK APPROVAL')){
      const actions=(approve||ret).closest('.job-process-actions,.actions')|| (approve||ret).parentElement;
      if(actions && !actions.previousElementSibling?.classList?.contains('belm-tech-work-approval-auto')){
        const block=document.createElement('div');
        block.className='belm-tech-work-approval-auto';
        block.innerHTML='<h3 style="margin:12px 0 4px">TECHNICIAN WORK APPROVAL</h3><div class="belm-tech-work-approval-note">Review the Technician Report before approving. Approval closes the Job Card as Completed; Return sends the work back to the assigned Technician for correction.</div>';
        actions.parentElement?.insertBefore(block,actions);
      }
    }
  }

  const target=document.getElementById('caseDetail')||document.body;
  const observer=new MutationObserver(()=>queueMicrotask(patch));
  observer.observe(target,{childList:true,subtree:true});
  patch();
})();