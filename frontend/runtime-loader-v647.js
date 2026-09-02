(function(){
  if(window.__belmRuntimeLoader647)return;
  window.__belmRuntimeLoader647=true;

  const admin=!!localStorage.getItem('belm_admin_token');
  const customer=!!localStorage.getItem('belm_customer_token');
  const technician=!!localStorage.getItem('belm_tech_token')||location.pathname.startsWith('/tech');

  function loadScript(src){
    return new Promise((resolve)=>{
      if(document.querySelector('script[src^="'+src.split('?')[0]+'"]')) return resolve();
      const s=document.createElement('script');
      s.src=src;
      s.async=false;
      s.onload=()=>resolve();
      s.onerror=()=>resolve();
      document.body.appendChild(s);
    });
  }

  async function bootTechnicianCritical(){
    if(!technician)return;
    // Technician cards are part of the primary UI, not a cosmetic enhancement.
    // Load them immediately so the raw React machine buttons never remain visible.
    await loadScript('/portal-tools.js?v=655-tech-approved');
    await loadScript('/technician-machine-page-v655.js?v=655-tech-approved');
  }

  async function bootNonCritical(){
    if(!technician){
      await loadScript('/portal-tools.js?v=655-lazy');
    }
    await loadScript('/v520-upgrades.js?v=655-lazy');

    if(admin){
      await loadScript('/admin-sidebar.js?v=655-lazy');
    }

    if(admin||customer){
      await Promise.all([
        loadScript('/customer-checkup-runtime-v623.js?v=655-lazy'),
        loadScript('/machine-report-center-override.js?v=655-lazy'),
        loadScript('/machine-status-row-v554.js?v=655-lazy'),
        loadScript('/cwm-machine-brand-v619.js?v=655-lazy')
      ]);
    }
  }

  // Start Technician UI immediately after this deferred loader executes.
  if(technician) bootTechnicianCritical().catch(()=>{});

  function schedule(){
    const run=()=>bootNonCritical().catch(()=>{});
    if('requestIdleCallback' in window){
      requestIdleCallback(run,{timeout:1000});
    }else{
      setTimeout(run,200);
    }
  }

  if(document.readyState==='complete') schedule();
  else window.addEventListener('load',schedule,{once:true});
})();