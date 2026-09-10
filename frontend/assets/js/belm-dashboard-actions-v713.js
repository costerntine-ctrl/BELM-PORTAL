(function(){
  'use strict';

  var path=location.pathname;

  /*
   * V714 LIVE READABILITY LAYER
   * Keep every supplied dashboard's original colours/layout.  This layer only
   * improves legibility, touch targets and focus states, and is intentionally
   * injected from the shared dashboard action file so all role dashboards get
   * the same fix without replacing their own CSS.
   */
  function installReadabilityLayer(){
    if(document.getElementById('belm-dashboard-readability-v714')) return;
    var style=document.createElement('style');
    style.id='belm-dashboard-readability-v714';
    style.textContent=[
      'body{text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;}',
      '.belm-nav__item,.nav-item{font-size:14px!important;font-weight:600!important;line-height:1.3!important;}',
      'a[class*="btn"],button[class*="btn"],.belm-panel__link,.panel-link{text-rendering:optimizeLegibility;text-decoration:none;}',
      '.belm-btn-gold,.belm-btn-blue,.belm-btn,.belm-btn-start,.belm-btn-panel,.belm-btn-report,.belm-btn-add,.belm-btn-next,.belm-btn-row,.belm-btn-view-details,.belm-btn-outline-blue,.belm-btn-solid-gold,.setting-card-btn,.qa-btn,.fin-qa-btn,.wm-qa-btn,.btn-role,.btn-logout{font-weight:800!important;line-height:1.25!important;min-height:38px;}',
      '.belm-btn-xs{font-size:12.5px!important;font-weight:800!important;line-height:1.25!important;min-height:32px;}',
      '.belm-btn-sm{font-size:13px!important;font-weight:800!important;line-height:1.25!important;min-height:34px;}',
      '.belm-btn-lg{font-size:14px!important;font-weight:800!important;line-height:1.25!important;min-height:44px;}',
      '.belm-btn-row,.belm-btn-outline-blue,.belm-btn-solid-gold,.belm-btn-view-details,.belm-btn-next{font-size:13px!important;}',
      '.setting-card-btn,.qa-btn,.fin-qa-btn,.wm-qa-btn{font-size:13.5px!important;}',
      '.btn-role,.btn-logout{font-size:13.5px!important;}',
      '.belm-action-group{row-gap:7px;}',
      '.belm-action-cell{row-gap:7px;}',
      'button,a[class*="btn"]{cursor:pointer;}',
      'button:disabled,a[aria-disabled="true"]{cursor:not-allowed;opacity:.62;}',
      'button:focus-visible,a:focus-visible{outline:3px solid rgba(47,134,214,.38);outline-offset:2px;}',
      '@media(max-width:900px){.belm-btn-xs,.belm-btn-sm,.belm-btn-lg,.belm-btn-row,.belm-btn-outline-blue,.belm-btn-solid-gold,.belm-btn-view-details,.belm-btn-next,.setting-card-btn,.qa-btn,.fin-qa-btn,.wm-qa-btn,.btn-role,.btn-logout{white-space:normal!important;text-align:center;}.belm-action-group{flex-wrap:wrap!important;}}'
    ].join('');
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-belm-dashboard-readability','714');

    // Icon-only controls remain visually identical but become self-explanatory on hover.
    document.querySelectorAll('button[aria-label],a[aria-label]').forEach(function(el){
      if(!el.getAttribute('title')) el.setAttribute('title',el.getAttribute('aria-label'));
    });
  }

  installReadabilityLayer();

  function go(url){ if(url) location.href=url; }

  /*
   * Dashboards 01-08 are owned by dashboard-live-v710.js.  Older V713 code
   * duplicated their click handlers, so one click could produce two different
   * destinations or two exports.  Keep this shared file as the fallback only
   * for Finance and Workshop Manager, whose supplied dashboards use cell links.
   */
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href="#"]');
    if(a){
      if(path.indexOf('/09-finance-accounts/')>=0 && a.classList.contains('cell-link')){
        e.preventDefault(); go('invoices-proforma.html'); return;
      }
      if(path.indexOf('/11-workshop-manager/')>=0 && a.classList.contains('cell-link')){
        e.preventDefault(); go('job-cards.html'); return;
      }
    }

    var action=e.target.closest('.row-action');
    if(!action) return;
    if(path.indexOf('/09-finance-accounts/')>=0) go('invoices-proforma.html');
    else if(path.indexOf('/11-workshop-manager/')>=0) go('job-cards.html');
  });
})();
