(function(){
  if(document.readyState==='loading'){
    document.write('<script src="assets/js/belm-admin-dashboard-core-v808.js"><\/script>');
  } else {
    var core=document.createElement('script');
    core.src='assets/js/belm-admin-dashboard-core-v808.js';
    document.head.appendChild(core);
  }

  function addDailyChecklist(){
    if(location.pathname.indexOf('/concept-dashboards/01-admin-home/')!==0)return;
    var nav=document.querySelector('.belm-sidebar .belm-nav');
    if(!nav||nav.querySelector('[data-belm-daily-checklist="1"]'))return;

    var links=Array.prototype.slice.call(nav.querySelectorAll('a.belm-nav__item'));
    var customerOverview=links.find(function(a){return /Customer Overview/i.test(a.textContent||'');});
    var workshop=links.find(function(a){return /Workshop Manager/i.test(a.textContent||'');});
    var anchor=customerOverview||workshop;

    var link=document.createElement('a');
    link.className='belm-nav__item';
    link.href='/concept-dashboards/08-daily-checklist/';
    link.setAttribute('data-belm-daily-checklist','1');
    link.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v2h6V3M9 10l1.7 1.7L14 8.3M9 16h6"/></svg>Daily Checklist';

    if(anchor&&anchor.nextSibling)nav.insertBefore(link,anchor.nextSibling);
    else if(anchor)nav.appendChild(link);
    else nav.insertBefore(link,nav.children[1]||null);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addDailyChecklist,{once:true});
  else addDailyChecklist();
})();
