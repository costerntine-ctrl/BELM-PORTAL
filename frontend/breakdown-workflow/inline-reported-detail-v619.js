(()=>{
  const list=document.getElementById('caseList');
  const detailPanel=document.querySelector('.detail-panel');
  const detail=document.getElementById('caseDetail');
  const grid=document.querySelector('.grid');
  if(!list||!detailPanel||!detail||!grid)return;

  let expandedCard=null;
  let pendingCard=null;
  let originalNext=detailPanel.nextSibling;

  const restorePanel=()=>{
    if(detailPanel.parentElement!==grid){
      if(originalNext&&originalNext.parentNode===grid)grid.insertBefore(detailPanel,originalNext);
      else grid.appendChild(detailPanel);
    }
    detailPanel.classList.remove('inline-case-detail');
    expandedCard?.classList.remove('inline-detail-open');
    expandedCard=null;
    pendingCard=null;
  };

  const placeInline=card=>{
    if(!card||!card.isConnected)return;
    if(expandedCard&&expandedCard!==card)expandedCard.classList.remove('inline-detail-open');
    expandedCard=card;
    card.classList.add('inline-detail-open');
    detailPanel.classList.add('inline-case-detail');
    card.appendChild(detailPanel);
    requestAnimationFrame(()=>{
      detailPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  };

  list.addEventListener('click',event=>{
    const report=event.target.closest('.queue-message-block.report-message');
    if(!report)return;
    const card=report.closest('[data-case]');
    if(!card)return;
    event.preventDefault();
    event.stopPropagation();

    if(expandedCard===card&&detailPanel.parentElement===card){
      restorePanel();
      return;
    }

    pendingCard=card;
    // Use the existing Job Card loader without duplicating workflow logic.
    card.click();
  },true);

  const observer=new MutationObserver(()=>{
    if(pendingCard&&detail.children.length){
      placeInline(pendingCard);
      pendingCard=null;
    }
  });
  observer.observe(detail,{childList:true,subtree:false});

  // When the queue re-renders after Sync, return the detail workspace to its
  // normal container so stale cards do not hold it.
  const listObserver=new MutationObserver(()=>{
    if(expandedCard&&!expandedCard.isConnected)restorePanel();
  });
  listObserver.observe(list,{childList:true});
})();