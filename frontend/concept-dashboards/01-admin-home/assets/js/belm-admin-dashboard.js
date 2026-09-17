(function(){
  if(document.readyState==='loading'){
    document.write('<script src="assets/js/belm-admin-dashboard-core-v808.js"><\/script>');
  } else {
    var core=document.createElement('script');
    core.src='assets/js/belm-admin-dashboard-core-v808.js';
    document.head.appendChild(core);
  }

  function addOperatorAndDailyChecklist(){
    if(location.pathname.indexOf('/concept-dashboards/01-admin-home/')!==0)return;
    var nav=document.querySelector('.belm-sidebar .belm-nav');
    if(!nav)return;

    var links=Array.prototype.slice.call(nav.querySelectorAll('a.belm-nav__item'));
    var workshop=links.find(function(a){return /Workshop Manager/i.test(a.textContent||'');});
    var customerOverview=links.find(function(a){return /Customer Overview/i.test(a.textContent||'');});

    var operatorLink=nav.querySelector('[data-belm-machine-operator="1"]');
    if(!operatorLink){
      operatorLink=document.createElement('a');
      operatorLink.className='belm-nav__item';
      operatorLink.href='/concept-dashboards/07-operator/';
      operatorLink.setAttribute('data-belm-machine-operator','1');
      operatorLink.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="3"/><path d="M5 20c0-4 3-7 7-7s7 3 7 7"/><path d="M8 17h8M12 17v3"/></svg>Machine Operator';
      if(workshop&&workshop.nextSibling)nav.insertBefore(operatorLink,workshop.nextSibling);
      else if(workshop)nav.appendChild(operatorLink);
      else nav.insertBefore(operatorLink,nav.children[1]||null);
    }

    if(!nav.querySelector('[data-belm-daily-checklist="1"]')){
      var checklistLink=document.createElement('a');
      checklistLink.className='belm-nav__item';
      checklistLink.href='/concept-dashboards/08-daily-checklist/';
      checklistLink.setAttribute('data-belm-daily-checklist','1');
      checklistLink.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v2h6V3M9 10l1.7 1.7L14 8.3M9 16h6"/></svg>Daily Checklist';
      if(operatorLink&&operatorLink.nextSibling)nav.insertBefore(checklistLink,operatorLink.nextSibling);
      else if(operatorLink)nav.appendChild(checklistLink);
      else if(customerOverview&&customerOverview.nextSibling)nav.insertBefore(checklistLink,customerOverview.nextSibling);
      else nav.appendChild(checklistLink);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addOperatorAndDailyChecklist,{once:true});
  else addOperatorAndDailyChecklist();
})();
