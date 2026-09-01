(function(){
  function enhance(input){
    if(!(input instanceof HTMLInputElement)||input.dataset.belmEyeReady==='1'||input.type!=='password')return;
    input.dataset.belmEyeReady='1';
    const wrap=document.createElement('span');wrap.className='belm-secret-field';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    const button=document.createElement('button');button.type='button';button.className='belm-secret-toggle';button.setAttribute('aria-label','Show password or PIN');button.textContent='◉';wrap.appendChild(button);
    button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-label',show?'Hide password or PIN':'Show password or PIN');button.title=show?'Hide':'Show';input.focus({preventScroll:true});});
  }
  function scan(root=document){if(root.matches?.('input[type="password"]'))enhance(root);root.querySelectorAll?.('input[type="password"]').forEach(enhance);}
  function start(){scan(document);new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)scan(n)}).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  if(location.pathname.startsWith('/customers-manager/')){
    if(!document.querySelector('script[data-customer-overview-stability]')){const guard=document.createElement('script');guard.src='/customers-manager/stability-v640.js?v=640-customer-overview-stability';guard.dataset.customerOverviewStability='1';document.head.appendChild(guard);}
    if(!document.querySelector('link[data-machine-display-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/customers-manager/machine-display-v641.css?v=641-compact-random-display';style.dataset.machineDisplayStyle='1';document.head.appendChild(style);}
    if(!document.querySelector('script[data-machine-display]')){const display=document.createElement('script');display.src='/customers-manager/machine-display-v641.js?v=641-compact-random-display';display.defer=true;display.dataset.machineDisplay='1';document.head.appendChild(display);}
    if(!document.querySelector('script[data-machine-report-route-fix]')){const reportFix=document.createElement('script');reportFix.src='/customers-manager/machine-report-route-fix-v642.js?v=642-checklist-route';reportFix.dataset.machineReportRouteFix='1';document.head.appendChild(reportFix);}
  }

  // Store & Spare Parts is already protected by authenticated BELM role/page access.
  // Do not ask Store Keeper/Admin for a second edit PIN when opening or editing an
  // inventory record. The existing manager.js only needs a truthy confirmation token;
  // the backend spare-parts endpoint does not validate or require editPin.
  if(location.pathname.startsWith('/spare-parts-manager/')){
    const disableStoreEditPin=()=>{
      window.belmConfirmEdit=async()=>({editPin:'ROLE_AUTHORIZED'});
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',disableStoreEditPin,{once:true});
    else disableStoreEditPin();
  }

  if(!document.querySelector('script[data-v520-upgrades]')){const s=document.createElement('script');s.src='/v520-upgrades.js?v=520-latest';s.defer=true;s.dataset.v520Upgrades='1';document.head.appendChild(s);}
})();