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
    // V658 bypasses the legacy portal-tools bundle for Technician pages so
    // a stale/invalid legacy bundle cannot leave raw machine buttons visible.
    await loadScript('/technician-dashboard-v658.js?v=675-random-display');
  }

  async function bootNonCritical(){
    if(!technician){
      await loadScript('/portal-tools.js?v=658-lazy');
    }
    await loadScript('/v520-upgrades.js?v=658-lazy');

    if(admin){
      await loadScript('/admin-sidebar.js?v=658-lazy');
    }

    if(admin||customer){
      await Promise.all([
        loadScript('/customer-checkup-runtime-v623.js?v=658-lazy'),
        loadScript('/machine-report-center-override.js?v=658-lazy'),
        loadScript('/machine-status-row-v554.js?v=658-lazy'),
        loadScript('/cwm-machine-brand-v619.js?v=658-lazy')
      ]);
    }
  }

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