(function(){
  'use strict';
  if(window.__belmCustomerRoleParityV781)return;
  window.__belmCustomerRoleParityV781=true;

  const path=location.pathname.replace(/\/+$/,'')+'/';
  const cssByPath={
    '/customer-technician-dashboard/':'/concept-dashboards/02-technician/assets/css/belm-technician-dashboard.css',
    '/customer-procurement-dashboard/':'/concept-dashboards/03-procurement/assets/css/belm-procurement-dashboard.css',
    '/customer-store-dashboard/':'/concept-dashboards/06-storekeeper/assets/css/belm-storekeeper-dashboard.css',
    '/customer-operator-dashboard/':'/concept-dashboards/07-operator/assets/css/belm-operator-dashboard.css'
  };
  const href=cssByPath[path];
  if(!href)return;

  document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link){
    if((link.getAttribute('href')||'').includes('customer-belm-shell-v770.css')) link.disabled=true;
  });
  if(!document.querySelector('link[data-belm-customer-parity]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href+'?v=781-customer-parity';
    link.dataset.belmCustomerParity='1';
    document.head.appendChild(link);
  }

  const patch=document.createElement('style');
  patch.textContent=`
    .belm-brand__name[data-company-name-upper],.belm-brand__name[data-customer-name-upper]{font-size:18px;line-height:1.1;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .belm-brand__tag{letter-spacing:1.15px}
    .belm-user__name{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .belm-sidebar{z-index:30}
    .belm-nav{overflow-y:auto;scrollbar-width:thin}
    .belm-nav__item{min-height:42px}
    .belm-panel,.belm-stat-card,.belm-hero{box-shadow:0 8px 24px rgba(2,10,22,.24)}
    .belm-content{padding-bottom:46px}
    .belm-table-wrap{overflow:auto}
    .belm-table{min-width:680px}
    .belm-role-card{margin-bottom:14px}
    @media(max-width:900px){.belm-shell{display:block}.belm-sidebar{position:fixed;left:-290px;top:0;width:270px;transition:left .2s ease}.belm-shell.is-sidebar-open .belm-sidebar{left:0}.belm-main{min-width:0}.belm-content{padding:18px}.belm-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.belm-stats{grid-template-columns:1fr}.belm-grid-2,.belm-grid-bottom,.belm-status-grid{grid-template-columns:1fr!important}.belm-hero{padding:24px 20px}.belm-hero__wireframe,.belm-hero__silhouette{opacity:.22}.belm-topbar{padding:12px 16px}}
  `;
  document.head.appendChild(patch);

  function addTheme(){
    if(document.getElementById('customerParityThemeToggle'))return;
    const foot=document.querySelector('.belm-sidebar__foot');
    if(!foot)return;
    const button=document.createElement('button');
    button.id='customerParityThemeToggle';
    button.type='button';
    button.className='belm-nav__item';
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg> Light / Dark';
    button.addEventListener('click',function(){
      if(window.BELMTheme&&typeof window.BELMTheme.toggle==='function')window.BELMTheme.toggle();
      else document.documentElement.classList.toggle('customer-parity-light');
    });
    foot.insertBefore(button,foot.firstChild);
  }

  function refineCopy(){
    const title=document.querySelector('.belm-hero__title');
    const subtitle=document.querySelector('.belm-hero__subtitle');
    if(path==='/customer-technician-dashboard/'&&subtitle) subtitle.textContent=subtitle.textContent||'My assigned work and service progress';
    if(path==='/customer-procurement-dashboard/'&&subtitle) subtitle.textContent=subtitle.textContent||'Spare parts purchasing, suppliers and delivery tracking';
    if(path==='/customer-store-dashboard/'&&subtitle) subtitle.textContent=subtitle.textContent||'Stock, tools, spare requests and inventory control';
    if(path==='/customer-operator-dashboard/'&&title) title.textContent='Machine Operator Dashboard';
  }

  addTheme();
  refineCopy();
})();
