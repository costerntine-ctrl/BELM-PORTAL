(function(){
  'use strict';
  if(window.__belmRoleReportNav819)return;
  window.__belmRoleReportNav819=true;

  function token(){
    const active=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
    const preferred={customer:'belm_customer_token',technician:'belm_tech_token',admin:'belm_admin_token',operator:'belm_operator_token'}[active]||'';
    return [preferred,'belm_admin_token','belm_tech_token','belm_customer_token','belm_operator_token']
      .filter((v,i,a)=>v&&a.indexOf(v)===i).map(k=>localStorage.getItem(k)||'').find(Boolean)||'';
  }
  function decode(v){try{let r=(v.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/');r+='='.repeat((4-r.length%4)%4);return JSON.parse(decodeURIComponent(Array.from(atob(r)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')))}catch(_){return{}}}
  const s=decode(token());if(!Object.keys(s).length)return;
  const customerAliases={owner:'customer_admin',admin:'customer_admin',customer_admin:'customer_admin',workshop_manager:'workshop_manager',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store_keeper',accounts:'accounts',finance:'accounts',accountant:'accounts'};
  const staffAliases={'Super Admin':'super_admin','Workshop Manager':'workshop_manager','Engineer':'workshop_manager','Technician':'technician','Procurement':'procurement','Store Keeper':'store_keeper','Registration & Sales':'registration_sales','Finance / Accounts':'finance_accounts','Bank Controller':'bank_controller','System Coordinator':'system_coordinator'};
  const isCustomer=s.type==='customer'||s.type==='operator';
  const role=isCustomer?(s.type==='operator'?'operator':customerAliases[String(s.customerRole||(s.actorType==='owner'?'owner':'')).toLowerCase()]||'customer_admin'):(staffAliases[String(s.roleName||'')]||'super_admin');
  const isAdmin=role==='super_admin'||role==='customer_admin';
  const path=(location.pathname.replace(/\/+$/,'')||'/');
  if(path==='/role-reports')return;

  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>';
  const reportText=/^(my reports|operator reports|purchase reports|inventory reports|customer reports|reports|role reports)$/i;
  const legacyHref=/(?:^|\/)(?:my-reports|purchase-reports|inventory-reports|customer-reports|operator-reports|reports)\.(?:php|html)(?:$|[?#])/i;
  const adminHome=(role==='super_admin'&&path==='/concept-dashboards/01-admin-home')||(role==='customer_admin'&&path==='/customer-admin-dashboard');

  function labelAnchor(a,label){
    const span=a.querySelector(':scope>span');
    if(span)span.textContent=label;
    else{
      const texts=Array.from(a.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE);
      const target=texts.find(n=>String(n.nodeValue||'').trim());
      if(target)target.nodeValue=' '+label;
      else a.insertAdjacentText('beforeend',' '+label);
    }
  }

  function normalizeNav(nav){
    if(!nav||nav.dataset.roleReport819Busy==='1')return;
    nav.dataset.roleReport819Busy='1';
    try{
      let my=null;
      Array.from(nav.querySelectorAll(':scope a[href],a[href]')).forEach(a=>{
        const text=String(a.textContent||'').replace(/\s+/g,' ').trim();
        const href=String(a.getAttribute('href')||'');
        const isGeneral=/general-report/i.test(href)||/^general report$/i.test(text);
        if(isGeneral){
          if(isAdmin&&adminHome){
            a.setAttribute('href','/general-report/');
            labelAnchor(a,'General Report');
            a.dataset.reportScope='general-admin';
          }else{
            a.setAttribute('href','/role-reports/');
            labelAnchor(a,'My Reports');
            a.dataset.reportScope='role';
            my=my||a;
          }
          return;
        }
        if(reportText.test(text)||legacyHref.test(href)){
          a.setAttribute('href','/role-reports/');
          labelAnchor(a,'My Reports');
          a.dataset.reportScope='role';
          my=my||a;
        }
      });

      if(!my){
        const a=document.createElement('a');
        a.href='/role-reports/';
        a.dataset.reportScope='role';
        const sample=nav.querySelector('a');
        a.className=sample?.classList.contains('nav-item')?'nav-item':'belm-nav__item';
        a.innerHTML=icon+'<span>My Reports</span>';
        const settings=Array.from(nav.querySelectorAll('a')).find(x=>/settings|profile/i.test(String(x.textContent||'')));
        if(settings)nav.insertBefore(a,settings);else nav.appendChild(a);
        my=a;
      }

      Array.from(nav.querySelectorAll('a[href]')).forEach(a=>{
        const text=String(a.textContent||'').replace(/\s+/g,' ').trim();
        const href=String(a.getAttribute('href')||'');
        if(/^my profile$/i.test(text)||/(?:^|\/)(?:my-profile\.(?:php|html)|portal-v2\/?(?:$|[?#]))/i.test(href)){
          a.setAttribute('href','/my-profile/');
          labelAnchor(a,'My Profile');
          a.dataset.profileScope='registration';
        }
      });

      if(isAdmin&&adminHome&&!Array.from(nav.querySelectorAll('a')).some(a=>a.dataset.reportScope==='general-admin'||/^general report$/i.test(String(a.textContent||'').trim()))){
        const a=document.createElement('a');
        a.href='/general-report/';
        a.dataset.reportScope='general-admin';
        const sample=nav.querySelector('a');
        a.className=sample?.classList.contains('nav-item')?'nav-item':'belm-nav__item';
        a.innerHTML=icon+'<span>General Report</span>';
        const settings=Array.from(nav.querySelectorAll('a')).find(x=>/settings/i.test(String(x.textContent||'')));
        if(settings)nav.insertBefore(a,settings);else nav.appendChild(a);
      }
    }finally{delete nav.dataset.roleReport819Busy}
  }

  function coordinatorCard(){
    if(role!=='system_coordinator')return;
    const grid=document.querySelector('.settings-card-grid');
    if(!grid||grid.querySelector('[data-role-my-reports]'))return;
    const a=document.createElement('a');
    a.className='settings-card blue';
    a.href='/role-reports/';
    a.dataset.roleMyReports='1';
    a.innerHTML='<span class="settings-card-icon">▤</span><h2>My Reports</h2><p>System access, user activity, configuration and audit reports for System Coordinator.</p><span class="settings-card-button">Open My Reports</span>';
    grid.appendChild(a);
  }

  function scan(){
    document.querySelectorAll('.belm-nav,.sidebar-nav,.sidebar nav').forEach(normalizeNav);
    coordinatorCard();
  }
  function boot(){scan();new MutationObserver(()=>requestAnimationFrame(scan)).observe(document.body,{childList:true,subtree:true});[300,900,1800,3200].forEach(ms=>setTimeout(scan,ms))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();