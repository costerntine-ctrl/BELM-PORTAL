(function(){
  'use strict';
  const nav=document.querySelector('.belm-sidebar .belm-nav');
  if(!nav)return;

  const reportIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>';
  const links=Array.from(nav.querySelectorAll('a'));
  const analysisLink=links.find(a=>(a.getAttribute('href')||'').startsWith('/general-analysis/'))||null;
  const settingsLink=links.find(a=>(a.getAttribute('href')||'').startsWith('/customer-settings-center/'))||null;

  if(analysisLink){
    const svg=analysisLink.querySelector('svg');
    analysisLink.innerHTML=(svg?svg.outerHTML:'')+'Analysis';
  }

  if(!links.some(a=>(a.getAttribute('href')||'').startsWith('/customer-general-report/'))){
    const link=document.createElement('a');
    link.href='/customer-general-report/';
    link.className='belm-nav__item';
    link.setAttribute('data-customer-general-report','1');
    link.innerHTML=reportIcon+'General Report';
    nav.insertBefore(link,analysisLink||settingsLink||null);
  }
})();
