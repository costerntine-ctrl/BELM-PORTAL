(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  if(window.__belmTechnicianFullCardBootstrap654)return;
  window.__belmTechnicianFullCardBootstrap654=true;
  window.__belmTechBootstrapHandlesPortalTools=true;

  const started=Date.now();
  let loading=false;
  let observer=null;
  let timer=null;

  function hasTechnicianMachineButtons(){
    const buttons=[...document.querySelectorAll('button')];
    return buttons.some(button=>{
      const text=(button.textContent||'').trim();
      if(!text)return false;
      if(button.closest('header,nav,dialog'))return false;
      return /Reach Stacker|Forklift|Crane|Loader|Excavator|Stacker|Machine/i.test(text)
        || /\b\d{5,}\b/.test(text);
    });
  }

  function loadScript(src){
    return new Promise(resolve=>{
      const base=src.split('?')[0];
      if([...document.scripts].some(s=>(s.getAttribute('src')||'').split('?')[0]===base))return resolve();
      const script=document.createElement('script');
      script.src=src;
      script.async=false;
      script.onload=resolve;
      script.onerror=resolve;
      document.body.appendChild(script);
    });
  }

  async function boot(){
    if(loading)return;
    loading=true;
    observer?.disconnect();
    clearInterval(timer);
    await loadScript('/portal-tools.js?v=654-tech-dom-ready');
    await loadScript('/technician-machine-page-v651.js?v=654-tech-dom-ready');
    document.documentElement.dataset.belmTechFullCardBoot='ready';
  }

  function check(){
    if(hasTechnicianMachineButtons()){
      boot();
      return;
    }
    if(Date.now()-started>12000){
      // Fallback: start enhancer even if machine list is empty/error state.
      boot();
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',check,{once:true});
  }else check();

  observer=new MutationObserver(check);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  timer=setInterval(check,250);
})();