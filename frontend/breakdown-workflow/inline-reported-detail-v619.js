(()=>{
  const list=document.getElementById('caseList');
  const detailPanel=document.querySelector('.detail-panel');
  const detail=document.getElementById('caseDetail');
  const grid=document.querySelector('.grid');
  if(!list||!detailPanel||!detail||!grid)return;

  const fullQueueMode=document.documentElement.classList.contains('admin-job-cards-full-view');
  let pendingCard=null;
  const originalNext=detailPanel.nextSibling;

  const keepRightWorkspace=()=>{
    if(detailPanel.parentElement!==grid){
      if(originalNext&&originalNext.parentNode===grid)grid.insertBefore(detailPanel,originalNext);
      else grid.appendChild(detailPanel);
    }
    detailPanel.classList.remove('inline-case-detail');
    detailPanel.classList.add('reported-workspace-open');
  };

  const showFullProcess=()=>{
    document.documentElement.classList.add('belm-job-detail-full');
    detailPanel.classList.remove('inline-case-detail','reported-workspace-open');
    const root=detail.querySelector('.detail');
    if(root&&!root.querySelector('.belm-back-to-job-list')){
      const back=document.createElement('button');
      back.type='button';
      back.className='belm-back-to-job-list';
      back.textContent='← Back to Job Cards';
      back.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        document.documentElement.classList.remove('belm-job-detail-full');
        const card=pendingCard;
        pendingCard=null;
        requestAnimationFrame(()=>{
          if(card&&document.body.contains(card))card.scrollIntoView({behavior:'smooth',block:'center'});
          else grid.scrollIntoView({behavior:'smooth',block:'start'});
        });
      });
      root.insertBefore(back,root.firstChild);
    }
    requestAnimationFrame(()=>detailPanel.scrollIntoView({behavior:'smooth',block:'start',inline:'nearest'}));
  };

  if(fullQueueMode){
    document.documentElement.classList.add('belm-job-queue-full');
    detailPanel.classList.remove('inline-case-detail','reported-workspace-open');
  }else{
    keepRightWorkspace();
  }

  list.addEventListener('click',event=>{
    const card=event.target.closest('[data-case]');
    if(!card)return;
    pendingCard=card;

    const report=event.target.closest('.queue-message-block.report-message');
    if(!report)return;
    event.preventDefault();
    event.stopPropagation();
    card.click();
  },true);

  const observer=new MutationObserver(()=>{
    if(!pendingCard||!detail.children.length)return;
    if(fullQueueMode){
      showFullProcess();
      return;
    }
    keepRightWorkspace();
    pendingCard=null;
    requestAnimationFrame(()=>{
      detailPanel.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
    });
  });
  observer.observe(detail,{childList:true,subtree:false});
})();