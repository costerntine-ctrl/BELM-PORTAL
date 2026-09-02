(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  const isMachinePage=()=>new URLSearchParams(location.search).get('view')==='machines';
  const style=document.createElement('style');
  style.textContent=`
    body:not(.belm-tech-machines-page) #belmTechnicianMachineGrid,body:not(.belm-tech-machines-page) #belmTechnicianMachineListHeading,body:not(.belm-tech-machines-page) #belmTechMachinesPageHead{display:none!important}
    body.belm-tech-machines-page #belmTechnicianCustomerCard,body.belm-tech-machines-page #belmTechnicianMachineListHeading,body.belm-tech-machines-page .belm-technician-dashboard-shell>div:first-child{display:none!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid{display:grid!important;grid-template-columns:minmax(0,540px)!important;justify-content:center!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;gap:16px!important;align-items:start!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid>button:not(.belm-technician-machine-card){display:none!important}
    .belm-tech-machines-page-head{display:flex;align-items:center;gap:12px;max-width:540px;margin:0 auto 12px;padding:11px 13px;border:1px solid #274b69;border-radius:14px;background:#071b2e;color:#fff}
    .belm-tech-machines-page-head a{display:grid;place-items:center;width:38px;height:38px;border:1px solid #355a78;border-radius:10px;color:#fff;text-decoration:none;font-size:21px}.belm-tech-machines-page-head span{display:block;color:#7fa2bf;font-size:11px;margin-top:2px}
    .belm-tech-machines-loading{display:none;max-width:540px;margin:0 auto 12px;padding:14px;border:1px solid #274b69;border-radius:14px;background:#071b2e;color:#9fb7cc;text-align:center;font-size:12px;font-weight:700}body.belm-tech-machines-page:not(.belm-tech-machines-ready) .belm-tech-machines-loading{display:block}

    /* Approved Technician Machine Card: compact vertical flow, no empty spacer. */
    body.belm-tech-machines-page .belm-technician-machine-card.belm-tech-approved-card{box-sizing:border-box!important;width:100%!important;height:auto!important;min-height:0!important;max-height:none!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;align-items:stretch!important;gap:0!important;padding:16px!important;padding-bottom:14px!important;border-radius:18px!important;overflow:visible!important;align-self:start!important}
    body.belm-tech-machines-page .belm-tech-approved-card>*{flex:0 0 auto!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-native-head{margin:0!important;padding-bottom:10px!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-last-checked{margin:0 0 8px!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info{display:flex!important;flex-direction:column!important;gap:9px!important;margin:0!important;height:auto!important;min-height:0!important;max-height:none!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-health{order:1!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:12px!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-operator-message{order:2!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:11px 12px!important;white-space:normal!important;overflow:visible!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-alert-copy,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-condition-message{order:3!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:10px 12px!important;white-space:normal!important;overflow:visible!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-machine-details-disclosure{order:4!important;margin:0!important;height:auto!important;min-height:0!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-op-status{order:5!important;margin:0!important;height:auto!important;min-height:0!important}
    body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info strong,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info p,body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}

    /* Exact approved bottom order: Report | Check Up | Service Parts | Machine Job Cards. */
    body.belm-tech-machines-page .belm-tech-approved-actions{position:static!important;inset:auto!important;transform:none!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;width:100%!important;height:auto!important;min-height:0!important;margin:11px 0 0!important;padding:0!important}
    body.belm-tech-machines-page .belm-tech-approved-actions>*{position:static!important;inset:auto!important;transform:none!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:auto!important;min-height:44px!important;margin:0!important;padding:8px 5px!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;line-height:1.12!important;white-space:normal!important}

    @media(min-width:1100px){body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:repeat(2,minmax(0,540px))!important;max-width:1100px!important;margin:auto!important}.belm-tech-machines-page-head,.belm-tech-machines-loading{max-width:1100px}}
    @media(max-width:649px){body.belm-tech-machines-page #belmTechnicianMachineGrid{grid-template-columns:minmax(0,1fr)!important;gap:10px!important}.belm-tech-machines-page-head{margin-bottom:9px;padding:9px 10px}body.belm-tech-machines-page .belm-technician-machine-card.belm-tech-approved-card{padding:11px!important;border-radius:16px!important}body.belm-tech-machines-page .belm-tech-approved-card .belm-technician-machine-info{gap:7px!important}body.belm-tech-machines-page .belm-tech-approved-actions{gap:5px!important;margin-top:8px!important}body.belm-tech-machines-page .belm-tech-approved-actions>*{min-height:40px!important;padding:6px 3px!important;font-size:10px!important}}
    @media(max-width:390px){body.belm-tech-machines-page .belm-tech-approved-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}body.belm-tech-machines-page .belm-tech-approved-actions>*{font-size:11px!important}}
  `;
  document.head.appendChild(style);

  const norm=s=>(s||'').trim().replace(/\s+/g,' ').toLowerCase();
  function actionKind(el){const t=norm(el?.textContent);if(t==='report')return 1;if(t==='check up'||t==='check-up')return 2;if(t==='service parts')return 3;if(t==='machine job cards'||t==='job cards'||t==='job card')return 4;return 0}
  function prepareCard(card){
    if(!card||!card.classList.contains('belm-technician-machine-card'))return;
    card.classList.add('belm-tech-approved-card');
    const actions=[...card.querySelectorAll('button,a,[role="button"]')].filter(el=>el!==card&&actionKind(el)).sort((a,b)=>actionKind(a)-actionKind(b));
    if(actions.length){let bar=card.querySelector(':scope > .belm-tech-approved-actions');if(!bar){bar=document.createElement('div');bar.className='belm-tech-approved-actions';card.appendChild(bar)}actions.forEach(el=>bar.appendChild(el));card.appendChild(bar)}
  }
  function ensureHead(anchor){if(document.getElementById('belmTechMachinesPageHead'))return;const head=document.createElement('div');head.id='belmTechMachinesPageHead';head.className='belm-tech-machines-page-head';head.innerHTML='<a href="/tech" aria-label="Back to Technician Dashboard">←</a><div><b>MY MACHINES</b><span>Assigned machines only</span></div>';anchor?.before(head);const load=document.createElement('div');load.className='belm-tech-machines-loading';load.textContent='Loading machine cards…';head.after(load)}
  function wire(){
    const view=document.querySelector('[data-technician-view-machines]');if(view&&!view.dataset.belmDedicatedMachinePage){view.dataset.belmDedicatedMachinePage='1';view.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();location.href='/tech?view=machines'},true)}
    const grid=document.getElementById('belmTechnicianMachineGrid'),heading=document.getElementById('belmTechnicianMachineListHeading');
    if(!isMachinePage()){document.body.classList.remove('belm-tech-machines-page','belm-tech-machines-ready');return}
    document.body.classList.add('belm-tech-machines-page');
    if(grid){grid.hidden=false;grid.classList.remove('belm-technician-machine-grid-collapsed');[...grid.querySelectorAll('.belm-technician-machine-card')].forEach(prepareCard);document.body.classList.toggle('belm-tech-machines-ready',grid.querySelectorAll('.belm-technician-machine-card').length>0)}
    if(heading)ensureHead(heading);else if(grid)ensureHead(grid);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});
})();