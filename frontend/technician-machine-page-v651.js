(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  const isMachinePage=()=>new URLSearchParams(location.search).get('view')==='machines';
  const style=document.createElement('style');
  style.textContent=`
    body.belm-tech-machines-page #belmTechnicianCustomerCard{display:none!important}
    body.belm-tech-machines-page #belmTechnicianMachineListHeading{margin-top:0!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid{display:grid!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;transform:none!important;gap:18px!important;align-items:start!important}
    body.belm-tech-machines-page .belm-technician-dashboard-shell>div:first-child{display:none!important}
    .belm-tech-machines-page-head{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:14px 16px;border:1px solid #274b69;border-radius:14px;background:#071b2e;color:#fff}
    .belm-tech-machines-page-head a{display:grid;place-items:center;width:40px;height:40px;border:1px solid #355a78;border-radius:10px;color:#fff;text-decoration:none;font-size:22px}
    .belm-tech-machines-page-head span{display:block;color:#7fa2bf;font-size:11px;margin-top:3px}

    body.belm-tech-machines-page #belmTechnicianMachineGrid>.belm-tech-machine-compact,
    body.belm-tech-machines-page #belmTechnicianMachineGrid>button.belm-tech-machine-compact{height:auto!important;min-height:0!important;max-height:none!important;padding-bottom:14px!important;align-self:start!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-info{margin-top:10px!important;gap:10px!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-alert-copy{min-height:0!important;height:auto!important;max-height:none!important;padding:12px!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message,
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message{min-height:0!important;height:auto!important;max-height:none!important;padding:10px 12px!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message strong,
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message strong{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;display:block!important;line-height:1.35!important}
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-machine-details-disclosure,
    body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-op-status{margin-top:8px!important}

    .belm-tech-machine-actions-top{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 8px;width:100%}
    .belm-tech-machine-actions-top>*{width:100%!important;min-width:0!important;min-height:46px!important;margin:0!important;padding:9px 8px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;white-space:normal!important;line-height:1.15!important}

    @media(min-width:1000px){
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .belm-tech-machine-actions-top>*{min-height:44px!important;font-size:12px!important}
    }
    @media(min-width:650px) and (max-width:999px){
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:1fr!important}
      .belm-tech-machine-actions-top{grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
      .belm-tech-machine-actions-top>*{min-height:46px!important;font-size:12px!important}
    }
    @media(max-width:649px){
      .belm-tech-machines-page-head{margin:0 0 12px;padding:11px 12px}
      body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:1fr!important;gap:12px!important}
      body.belm-tech-machines-page #belmTechnicianMachineGrid>.belm-tech-machine-compact{padding:12px!important;border-radius:16px!important}
      .belm-tech-machine-actions-top{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0}
      .belm-tech-machine-actions-top>*{min-height:44px!important;padding:8px 6px!important;font-size:11px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-info{margin-top:8px!important;gap:8px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-machine-alert-copy{padding:9px!important}
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-operator-message,
      body.belm-tech-machines-page .belm-tech-machine-compact .belm-technician-condition-message{padding:8px 9px!important}
    }
  `;
  document.head.appendChild(style);

  function moveMachineActions(card){
    if(!card||card.dataset.belmActionsMoved==='1')return;
    const info=card.querySelector('.belm-technician-machine-info');
    if(!info)return;
    const candidates=[...card.querySelectorAll('button,a')].filter(el=>{
      if(el===card)return false;
      const text=(el.textContent||'').trim().replace(/\s+/g,' ');
      return /^(Report|Check Up|Service Parts|Machine Job Cards|Job Cards)$/i.test(text);
    });
    if(!candidates.length)return;
    const wrap=document.createElement('div');wrap.className='belm-tech-machine-actions-top';
    const ordered=['Check Up','Service Parts','Machine Job Cards','Job Cards','Report'];
    candidates.sort((a,b)=>{
      const at=(a.textContent||'').trim().replace(/\s+/g,' '),bt=(b.textContent||'').trim().replace(/\s+/g,' ');
      const ai=ordered.findIndex(x=>x.toLowerCase()===at.toLowerCase()),bi=ordered.findIndex(x=>x.toLowerCase()===bt.toLowerCase());
      return (ai<0?99:ai)-(bi<0?99:bi);
    }).forEach(el=>wrap.appendChild(el));
    info.before(wrap);
    card.classList.add('belm-tech-machine-compact');
    card.dataset.belmActionsMoved='1';
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
      grid.classList.remove('belm-technician-machine-grid-collapsed');grid.hidden=false;
      [...grid.children].forEach(moveMachineActions);
    }
    if(heading){
      heading.classList.remove('belm-technician-machine-list-heading-collapsed');
      if(!document.getElementById('belmTechMachinesPageHead')){
        const head=document.createElement('div');head.id='belmTechMachinesPageHead';head.className='belm-tech-machines-page-head';
        head.innerHTML='<a href="/tech" aria-label="Back to Technician Dashboard">←</a><div><b>MY MACHINES</b><span>Assigned machines only</span></div>';
        heading.before(head);
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  const mo=new MutationObserver(wire);mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>mo.disconnect(),18000);
})();