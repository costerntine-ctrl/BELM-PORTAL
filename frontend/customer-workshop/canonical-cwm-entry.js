/* V609 - Canonical PORTAL-CWM workshop entry and approved dashboard appearance. */
(function () {
  const params = new URLSearchParams(window.location.search);
  const actor = String(params.get('actor') || '').toLowerCase();
  const hasValidWorkspaceEntry = actor === 'customer' || actor === 'belm';

  if (!hasValidWorkspaceEntry) {
    window.location.replace('/portal-cwm/');
    return;
  }

  document.documentElement.dataset.cwmWorkspace = 'true';

  /* Approved CWM workshop appearance from the visual sample. Functions and routes stay unchanged. */
  const style = document.createElement('style');
  style.id = 'cwm-approved-layout-v609';
  style.textContent = `
    #cwmMainDashboard .cwm-wm-main-card{background:linear-gradient(180deg,#075d82 0%,#064d72 58%,#063e61 100%)!important;border:1px solid #0ba5e8!important;box-shadow:0 16px 38px rgba(0,0,0,.24)!important}
    #cwmMainDashboard .cwm-main-action-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important}
    #cwmMainDashboard .cwm-main-action-grid>a{margin:0!important;min-height:86px!important;border:1px solid #0ba5e8!important;box-shadow:0 8px 18px rgba(0,0,0,.14)!important}
    #cwmMainDashboard .cwm-main-action-grid .bw-work-action{background:linear-gradient(135deg,#00a65a,#00d177)!important;color:#061525!important}
    #cwmMainDashboard .cwm-main-action-grid .bw-store-entry{background:linear-gradient(135deg,#08a99a,#08d4b8)!important;color:#fff!important}
    #cwmMainDashboard .cwm-main-action-grid .bw-proc-entry{background:linear-gradient(135deg,#5b38c9,#8a61f2)!important;color:#fff!important}
    #cwmMainDashboard .cwm-main-action-grid .bw-tech-entry{background:linear-gradient(135deg,#087ac9,#109cff)!important;color:#fff!important}
    #cwmMainDashboard .cwm-main-action-grid .bw-analysis-entry,#cwmMainDashboard .cwm-main-action-grid .bw-manager-utility{background:linear-gradient(135deg,#073866,#07528a)!important;color:#fff!important}
    #cwmMainDashboard #cwmSettingsLink{grid-column:auto!important;background:linear-gradient(135deg,#617f94,#4d6f88)!important;color:#fff!important}
    #cwmMainDashboard #cwmMachinesLink{display:flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:0!important;min-height:72px!important;margin:0!important;padding:12px 40px 12px 48px!important;border-radius:20px!important;background:linear-gradient(135deg,#f5b900,#ffd126)!important;color:#061525!important;border:1px solid #ffe067!important;box-shadow:0 10px 20px rgba(0,0,0,.22)!important;font-size:12px!important;font-weight:950!important;text-align:center!important}
    #cwmMainDashboard #cwmMachinesLink::before{content:'🏗️';position:absolute;left:24px;font-size:27px}
    #cwmMainDashboard #cwmMachinesLink::after{content:'›';position:absolute;right:25px;font-size:36px;line-height:1}
    @media(max-width:560px){#cwmMainDashboard .cwm-role-functions{grid-template-columns:repeat(2,minmax(0,1fr))!important}#cwmMainDashboard .cwm-top-actions-pair{display:contents!important}#cwmMainDashboard #cwmSettingsLink{grid-column:auto!important}#cwmMainDashboard .cwm-main-action-grid{gap:10px!important}#cwmMainDashboard .cwm-main-action-grid>a{min-height:82px!important;padding:12px 40px 12px 64px!important;font-size:14px!important}#cwmMainDashboard .cwm-action-icon{left:10px!important;width:44px!important;height:44px!important}#cwmMainDashboard #cwmMachinesLink{min-height:70px!important;font-size:11px!important;padding:10px 34px 10px 44px!important}}
  `;
  document.head.appendChild(style);

  /* Legacy workshop-v524.js intercepts Store and Settings and tries dead inline views. */
  document.addEventListener('click', function (event) {
    if (actor !== 'customer') return;
    const store = event.target.closest('#storeLink');
    if (store) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/customer-store/';
      return;
    }
    const settings = event.target.closest('#cwmSettingsLink');
    if (settings) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = '/customer-settings-center/';
    }
  }, true);
})();
