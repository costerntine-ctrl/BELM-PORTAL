(function(){
  'use strict';
  // V844: Ensure customer overview page scrolls properly after V843 card sizing
  // When machine card photo height was reduced, some pages may have CSS constraints
  // preventing vertical overflow. This ensures the main page shell allows scrolling.

  if(window.__belmCustomerOverviewScrollV844)return;
  window.__belmCustomerOverviewScrollV844=true;

  // Ensure html and body allow vertical scrolling
  const style=document.createElement('style');
  style.id='belm-overview-scroll-v844';
  style.textContent=`
    html{overflow-y:auto!important;overflow-x:hidden}
    body{overflow-y:auto!important;overflow-x:hidden;min-height:100vh}
    main.shell{min-height:auto;height:auto}
    section.customer-grid{min-height:auto}
  `;
  document.head.appendChild(style);

  // Clean up any inline overflow:hidden on body that might be set by JavaScript
  if(document.body.style.overflow==='hidden'){
    document.body.style.overflow='';
  }
})();
