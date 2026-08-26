(function(){
  'use strict';
  if(location.pathname!=='/portal/dashboard'&&location.pathname!=='/portal/dashboard/') return;
  document.addEventListener('click',function(event){
    const checkup=event.target.closest('[data-customer-checkup]');
    if(checkup){
      const machineId=checkup.getAttribute('data-customer-checkup');
      if(!machineId)return;
      event.preventDefault();event.stopImmediatePropagation();
      location.href='/customer-checkup/?machine='+encodeURIComponent(machineId);
      return;
    }
    const btn=event.target.closest('[data-customer-report-menu]');
    if(!btn)return;
    const machineId=btn.getAttribute('data-customer-report-menu');
    if(!machineId)return;
    event.preventDefault();event.stopImmediatePropagation();
    location.href='/general-report/?machine='+encodeURIComponent(machineId);
  },true);
})();
