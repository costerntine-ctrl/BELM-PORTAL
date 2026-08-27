(()=>{
  const list=document.getElementById('caseList');
  const detailPanel=document.querySelector('.detail-panel');
  const detail=document.getElementById('caseDetail');
  const grid=document.querySelector('.grid');
  if(!list||!detailPanel||!detail||!grid)return;

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

  list.addEventListener('click',event=>{
    const report=event.target.closest('.queue-message-block.report-message');
    if(!report)return;
    const card=report.closest('[data-case]');
    if(!card)return;
    event.preventDefault();
    event.stopPropagation();
    pendingCard=card;
    card.click();
  },true);

  const observer=new MutationObserver(()=>{
    if(!pendingCard||!detail.children.length)return;
    keepRightWorkspace();
    pendingCard=null;
    requestAnimationFrame(()=>{
      detailPanel.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
    });
  });
  observer.observe(detail,{childList:true,subtree:false});

  keepRightWorkspace();
})();