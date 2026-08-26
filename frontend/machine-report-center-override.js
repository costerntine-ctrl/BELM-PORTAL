(function(){
  'use strict';
  if(location.pathname!=='/portal/dashboard'&&location.pathname!=='/portal/dashboard/') return;
  document.addEventListener('click',function(event){
    const btn=event.target.closest('[data-customer-report-menu]');
    if(!btn) return;
    const machineId=btn.getAttribute('data-customer-report-menu');
    if(!machineId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href='/general-report/?machine='+encodeURIComponent(machineId);
  },true);
})();
