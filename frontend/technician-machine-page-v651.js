(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  const isMachinePage=()=>new URLSearchParams(location.search).get('view')==='machines';
  const style=document.createElement('style');
  style.textContent=`
    body.belm-tech-machines-page #belmTechnicianCustomerCard{display:none!important}
    body.belm-tech-machines-page #belmTechnicianMachineListHeading{margin-top:0!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid{display:grid!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;transform:none!important;gap:16px!important;align-items:start!important}
    body.belm-tech-machines-page .belm-technician-dashboard-shell>div:first-child{display:none!important}
    .belm-tech-machines-page-head{display:flex;align-items:center;gap:14px;margin:0 0 16px;padding:13px 15px;border:1px solid #274b69;border-radius:14px;background:#071b2e;color:#fff}
    .belm-tech-machines-page-head a{display:grid;place-items:center;width:40px;height:40px;border:1px solid #355a78;border-radius:10px;color:#fff;text-decoration:none;font-size:22px}
    .belm-tech-machines-page-head span{display:block;color:#7fa2bf;font-size:11px;margin-top:3px}

    /* Compact the real technician machine card without changing its approved order. */
    body.belm-tech-machines-page .belm-tech-machine-compact{
      height:auto!important;
      min-height:0!important;
      max-height:none!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:flex-start!important;
      align-items:stretch!important;
      gap:0!important;
      padding-bottom:12px!important;
      align-self:start!important;
    }
    body.belm-tech-machines-page .belm-tech-machine-compact>*{flex:0 0 auto!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-info{margin-top:8px!important;gap:8px!important;min-height:0!important;height:auto!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-health{min-height:0!important;height:auto!important;margin-bottom:8px!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-alert-copy{min-height:0!important;height:auto!important;max-height:none!important;padding:10px!important;margin:0!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message,
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message{min-height:0!important;height:auto!important;max-height:none!important;padding:9px 10px!important;margin:0!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message strong,
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;display:block!important;line-height:1.3!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-machine-details-disclosure{margin:7px 0 0!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-op-status{margin:7px 0 0!important}

    /* The approved buttons remain at the bottom, but sit immediately after content. */
    body.belm-tech-machines-page .belm-tech-machine-actionbar-compact{
      position:static!important;
      inset:auto!important;
      transform:none!important;
      margin:9px 0 0!important;
      padding:0!important;
      min-height:0!important;
      height:auto!important;
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:7px!important;
      align-items:stretch!important;
    }
    body.belm-tech-machines-page .belm-tech-machine-actionbar-compact>*{
      position:static!important;
      transform:none!important;
      margin:0!important;
      min-width:0!important;
      width:100%!important;
      min-height:42px!important;
      height:auto!important;
      padding:8px 6px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      line-height:1.12!important;
      text-align:center!important;
    }

    @media(min-width:1000px){
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    }
    @media(min-width:650px) and (max-width:999px){
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:1fr!important}
    }
    @media(max-width:649px){
      .belm-tech-machines-page-head{margin:0 0 10px;padding:10px 11px}
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:1fr!important;gap:11px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact{padding:11px!important;padding-bottom:10px!important;border-radius:16px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-info{margin-top:6px!important;gap:6px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-alert-copy{padding:8px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message,
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message{padding:7px 8px!important}
      body.belm-tech-machines-page .belm-tech-machine-actionbar-compact{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important;margin-top:7px!important}
      body.belm-tech-machines-page .belm-tech-machine-actionbar-compact>*{min-height:39px!important;padding:6px 3px!important;font-size:10px!important}
    }
    @media(max-width:390px){
      body.belm-tech-machines-page .belm-tech-machine-actionbar-compact{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      body.belm-tech-machines-page .belm-tech-machine-actionbar-compact>*{font-size:11px!important}
    }
  `;
  document.head.appendChild(style);

  function actionText(el){return (el?.textContent||'').trim().replace(/\s+/g,' ')}
  function isMachineAction(el){return /^(Report|Check Up|Service Parts|Machine Job Cards|Job Cards)$/i.test(actionText(el))}

  function commonActionParent(actions,card){
    if(!actions.length)return null;
    let parent=actions[0].parentElement;
    while(parent&&parent!==card){
      if(actions.every(el=>parent.contains(el)))return parent;
      parent=parent.parentElement;
    }
    return actions.every(el=>card.contains(el))?card:null;
  }

  function compactMachineCard(card){
    if(!card)return;
    const info=card.querySelector('.belm-technician-machine-info');
    if(!info)return;
    card.classList.add('belm-tech-machine-compact');

    const actions=[...card.querySelectorAll('button,a')].filter(el=>el!==card&&isMachineAction(el));
    if(!actions.length)return;
    let bar=commonActionParent(actions,card);

    if(!bar||bar===card){
      bar=document.createElement('div');
      actions.forEach(el=>bar.appendChild(el));
      card.appendChild(bar);
    }else if(bar.parentElement!==card){
      /* Preserve the approved bottom-button order but remove wrapper spacing. */
      const clean=document.createElement('div');
      actions.forEach(el=>clean.appendChild(el));
      card.appendChild(clean);
      bar=clean;
    }else{
      card.appendChild(bar);
    }
    bar.classList.add('belm-tech-machine-actionbar-compact');
  }

  function wire(){
    const button=document.querySelector('[data-technician-view-machines]');
    if(button&&!button.dataset.belmDedicatedMachinePage){
      button.dataset.belmDedicatedMachinePage='1';
      button.addEventListener('click',e=>{
        e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();
        location.href='/tech?view=machines';
      },true);
    }
    if(!isMachinePage())return;
    document.body.classList.add('belm-tech-machines-page');
    const grid=document.getElementById('belmTechnicianMachineGrid');
    const heading=document.getElementById('belmTechnicianMachineListHeading');
    if(grid){
      grid.classList.remove('belm-technician-machine-grid-collapsed');
      grid.hidden=false;
      [...grid.children].forEach(compactMachineCard);
    }
    if(heading){
      heading.classList.remove('belm-technician-machine-list-heading-collapsed');
      if(!document.getElementById('belmTechMachinesPageHead')){
        const head=document.createElement('div');
        head.id='belmTechMachinesPageHead';
        head.className='belm-tech-machines-page-head';
        head.innerHTML='<a href="/tech" aria-label="Back to Technician Dashboard">←</a><div><b>MY MACHINES</b><span>Assigned machines only</span></div>';
        heading.before(head);
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  const mo=new MutationObserver(wire);mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>mo.disconnect(),18000);
})();