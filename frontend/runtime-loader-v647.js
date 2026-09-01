(function(){
  if(window.__belmRuntimeLoader647)return;
  window.__belmRuntimeLoader647=true;

  const admin=!!localStorage.getItem('belm_admin_token');
  const customer=!!localStorage.getItem('belm_customer_token');

  function loadScript(src){
    return new Promise((resolve)=>{
      if(document.querySelector('script[src^="'+src.split('?')[0]+'"]')) return resolve();
      const s=document.createElement('script');
      s.src=src;
      s.defer=true;
      s.onload=()=>resolve();
      s.onerror=()=>resolve();
      document.body.appendChild(s);
    });
  }

  async function bootNonCritical(){
    // Load only after the main app has had a chance to paint. These are
    // enhancement/legacy compatibility layers and must not compete with the
    // primary Vite bundle during startup.
    await loadScript('/portal-tools.js?v=647-lazy');
    await loadScript('/v520-upgrades.js?v=647-lazy');

    if(admin){
      await loadScript('/admin-sidebar.js?v=647-lazy');
    }

    // Machine/checklist helpers are useful for both BELM staff and customer
    // sessions, but can safely attach after the first paint.
    if(admin||customer){
      await Promise.all([
        loadScript('/customer-checkup-runtime-v623.js?v=647-lazy'),
        loadScript('/machine-report-center-override.js?v=647-lazy'),
        loadScript('/machine-status-row-v554.js?v=647-lazy'),
        loadScript('/cwm-machine-brand-v619.js?v=647-lazy')
      ]);
    }
  }

  function schedule(){
    const run=()=>bootNonCritical().catch(()=>{});
    if('requestIdleCallback' in window){
      requestIdleCallback(run,{timeout:1200});
    }else{
      setTimeout(run,250);
    }
  }

  if(document.readyState==='complete') schedule();
  else window.addEventListener('load',schedule,{once:true});
})();
