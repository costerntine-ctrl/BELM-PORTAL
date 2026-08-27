(()=>{
  const list=document.getElementById('caseList');
  const detailPanel=document.querySelector('.detail-panel');
  const detail=document.getElementById('caseDetail');
  const grid=document.querySelector('.grid');
  if(!list||!detailPanel||!detail||!grid)return;

  let expandedCard=null;
  let pendingCard=null;
  const originalNext=detailPanel.nextSibling;

  const restorePanel=()=>{
    if(detailPanel.parentElement!==grid){
      if(originalNext&&originalNext.parentNode===grid)grid.insertBefore(detailPanel,originalNext);
      else grid.appendChild(detailPanel);
    }
    detailPanel.classList.remove('inline-case-detail','reported-workspace-open');
    expandedCard?.classList.remove('inline-detail-open');
    expandedCard=null;
    pendingCard=null;
  };

  const placeInsideCard=card=>{
    if(!card||!card.isConnected)return;
    if(expandedCard&&expandedCard!==card)expandedCard.classList.remove('inline-detail-open');
    expandedCard=card;
    card.classList.add('inline-detail-open');
    detailPanel.classList.remove('reported-workspace-open');
    detailPanel.classList.add('inline-case-detail');
    card.appendChild(detailPanel);
    requestAnimationFrame(()=>detailPanel.scrollIntoView({behavior:'smooth',block:'nearest'}));
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
    card.click();
  },true);

  const observer=new MutationObserver(()=>{
    if(pendingCard&&detail.children.length){
      placeInsideCard(pendingCard);
      pendingCard=null;
    }
  });
  observer.observe(detail,{childList:true,subtree:false});

  const listObserver=new MutationObserver(()=>{
    if(expandedCard&&!expandedCard.isConnected)restorePanel();
  });
  listObserver.observe(list,{childList:true});
})();