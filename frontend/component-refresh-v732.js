(()=>{
  if(window.__belmComponentRefreshV732)return;
  window.__belmComponentRefreshV732=true;

  const CANONICAL_LOGO='/concept-dashboards/10-system-settings/assets/img/belm-logo-v2.png?v=732-system-logo';
  const path=location.pathname;
  const params=new URLSearchParams(location.search);

  // Canonical BELM logo only. Dimensions/layout are inherited from the existing dashboard.
  function syncLogo(root=document){
    root.querySelectorAll?.('img').forEach(img=>{
      const src=String(img.getAttribute('src')||'').toLowerCase();
      const alt=String(img.getAttribute('alt')||'').toLowerCase();
      if(src.includes('belm-logo-v2.png') || (alt.includes('belm general technical service') && !src.includes('watermark'))){
        if(img.getAttribute('src')!==CANONICAL_LOGO) img.setAttribute('src',CANONICAL_LOGO);
      }
    });
    // Technician Job Card used a letter B as its mark. Replace only that component mark.
    if(path.startsWith('/technician-job-cards/')){
      const mark=root.querySelector?.('.topbar .brand .mark');
      if(mark && mark.dataset.belmLogo732!=='1'){
        mark.dataset.belmLogo732='1';
        mark.textContent='';
        const img=document.createElement('img');
        img.src=CANONICAL_LOGO;img.alt='BELM';
        img.style.cssText='width:100%;height:100%;object-fit:contain;display:block';
        mark.appendChild(img);
      }
    }
  }

  const style=document.createElement('style');
  style.id='belm-component-refresh-v732';
  style.textContent=`
    /* ================================================================
       V732 COMPONENT REFRESH ONLY
       DO NOT alter dashboard shells, sidebars, role cards or dashboard grids.
       ================================================================ */

    /* MACHINE CARDS — approved BELM dark machine-card language */
    .machine-card,.belm-customer-machine-card,.belm-technician-machine-card{
      --belm-machine-yellow:#ffe400;--belm-machine-green:#0f8f2e;--belm-machine-red:#e5484d;--belm-machine-border:#23262b;
      border-radius:12px!important;
      background:linear-gradient(180deg,#101113 0%,#0a0a0a 100%)!important;
      border-color:var(--belm-machine-border)!important;
      color:#eaf0f7!important;
      box-shadow:0 5px 18px rgba(0,0,0,.30)!important;
    }
    .machine-card:hover,.belm-customer-machine-card:hover,.belm-technician-machine-card:hover{
      border-color:rgba(255,228,0,.42)!important;box-shadow:0 10px 26px rgba(0,0,0,.40)!important;
    }
    .machine-card .belm-machine-display,.belm-customer-machine-card .belm-machine-display,.belm-technician-machine-card .belm-machine-display{
      background:#0b0d10!important;border-color:#2b3037!important;border-radius:10px!important;box-shadow:none!important;
    }
    .machine-card .belm-machine-display.display-green{border-color:#0f8f2e!important}
    .machine-card .belm-machine-display.display-yellow{border-color:#ffe400!important}
    .machine-card .belm-machine-display.display-red{border-color:#e5484d!important}
    .machine-card button,.machine-card a[class*="btn"],.belm-customer-machine-card button,.belm-technician-machine-card button{
      border-radius:8px!important;font-weight:800!important;
    }

    /* TECHNICIAN JOB CARD — restyle card only; page/dashboard structure untouched */
    body .job-card{
      --jc-yellow:#ffe400;--jc-green:#0f8f2e;--jc-red:#e5484d;--jc-border:#23262b;--jc-muted:#8fa3bd;
      background:linear-gradient(180deg,#101113,#0b0c0e)!important;border:1px solid var(--jc-border)!important;
      border-radius:12px!important;box-shadow:0 8px 24px rgba(0,0,0,.28)!important;overflow:hidden!important;
    }
    body .job-card::before{content:"";display:block;height:3px;background:var(--jc-yellow)}
    body .job-card .job-head{background:#0d0f12!important;border-bottom-color:var(--jc-border)!important}
    body .job-card .job-head h2{color:#fff!important}
    body .job-card .job-head small,body .job-card .fact span,body .job-card .process-title span{color:var(--jc-muted)!important}
    body .job-card .fact,body .job-card .fault,body .job-card .job-location,body .job-card .job-report>div{
      background:#0d0f12!important;border-color:var(--jc-border)!important;border-radius:9px!important;
    }
    body .job-card .process-bar span.done{background:var(--jc-green)!important}
    body .job-card .process-bar span.current{background:var(--jc-yellow)!important;box-shadow:0 0 10px rgba(255,228,0,.32)!important}
    body .job-card .actions button{border-radius:8px!important;font-weight:850!important}
    body .job-card .actions .green{background:var(--jc-green)!important;border-color:var(--jc-green)!important}
    body .job-card .actions .yellow{background:var(--jc-yellow)!important;border-color:var(--jc-yellow)!important;color:#080b0f!important}

    /* WORKSHOP MANAGER JOB CARD surfaces only. Dashboard cards/sidebar remain exactly as supplied. */
    html.admin-job-cards-full-view .job-process-panel,html.belm-jc-dashboard-v731 .job-process-panel{
      background:linear-gradient(180deg,#101113 0%,#0a0a0a 100%)!important;border:1px solid #23262b!important;
      border-radius:12px!important;box-shadow:0 8px 24px rgba(0,0,0,.24)!important;
    }
    html.admin-job-cards-full-view .job-process-table thead th,html.belm-jc-dashboard-v731 .job-process-table thead th{
      background:#0d0f12!important;color:#8fa3bd!important;border-color:#23262b!important;
    }
    html.admin-job-cards-full-view .job-process-table tbody td,html.belm-jc-dashboard-v731 .job-process-table tbody td{border-color:#23262b!important}
    html.admin-job-cards-full-view .job-process-table tbody tr:hover,html.belm-jc-dashboard-v731 .job-process-table tbody tr:hover{background:rgba(255,228,0,.045)!important}
    html.admin-job-cards-full-view .workflow-dispatch,html.belm-jc-dashboard-v731 .workflow-dispatch{border-radius:12px!important}

    /* Use the actual BELM logo inside the technician Job Card mark without resizing the topbar. */
    .technician-job-cards .mark img,.topbar .brand .mark img{max-width:100%;max-height:100%}
  `;
  document.head.appendChild(style);

  function boot(){
    syncLogo(document);
    const observer=new MutationObserver(records=>{
      for(const record of records){for(const node of record.addedNodes){if(node.nodeType===1)syncLogo(node)}}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();