/* One role-owned navigation rail across dashboards, records and report routes. */
(function(){
 'use strict';
 if(window.__belmPersistentSidebar||window.top!==window.self||new URLSearchParams(location.search).get('embed')==='1')return;
 if(/^\/(?:login|logout|customer-app|forgot-password|reset-password)(?:[/.]|$)/.test(location.pathname))return;
 const active=localStorage.getItem('belm_active_account_type')||'';
 const preferred={admin:'belm_admin_token',technician:'belm_tech_token',customer:'belm_customer_token',operator:'belm_operator_token'}[active];
 const token=[preferred,'belm_admin_token','belm_tech_token','belm_customer_token','belm_operator_token'].filter(Boolean).map(k=>localStorage.getItem(k)).find(Boolean);
 let user;try{let raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');user=JSON.parse(atob(raw+'='.repeat((4-raw.length%4)%4)));}catch(_){return;}
 if(user.exp&&user.exp*1000<=Date.now())return;
 const customer=user.type==='customer'||user.type==='operator';
 const staff={'Super Admin':'admin','Workshop Manager':'workshop','Engineer':'workshop','Technician':'technician','Operator':'operator','Machine Operator':'operator','Procurement':'procurement','Store Keeper':'store','Registration & Sales':'registration','Finance / Accounts':'finance','Bank Controller':'bank','System Coordinator':'system'};
 const customers={owner:'admin',admin:'admin',customer_admin:'admin',workshop_manager:'workshop',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store',accounts:'finance',finance:'finance',accountant:'finance'};
 const role=customer?(user.type==='operator'?'operator':customers[String(user.customerRole||(user.actorType==='owner'?'owner':'')).toLowerCase()]):staff[user.roleName];
 if(!role)return;
 const home=customer?{admin:'/customer-admin-dashboard/',workshop:'/customer-workshop-manager/',technician:'/customer-technician-dashboard/',operator:'/customer-operator-dashboard/',procurement:'/customer-procurement-dashboard/',store:'/customer-store-dashboard/',finance:'/customer-finance/'}[role]:{admin:'/concept-dashboards/01-admin-home/',workshop:'/concept-dashboards/11-workshop-manager/',technician:'/concept-dashboards/02-technician/',operator:'/concept-dashboards/07-operator/',procurement:'/concept-dashboards/03-procurement/',store:'/concept-dashboards/06-storekeeper/',registration:'/concept-dashboards/04-customer-registration/',finance:'/concept-dashboards/09-finance-accounts/',bank:'/bank-controller/',system:'/settings-manager/'}[role];
 if(!home)return;
 window.__belmPersistentSidebar=true;
 const routeAliases={"/concept-dashboards/01-admin-home/workshop-manager.php":"/concept-dashboards/11-workshop-manager/","/concept-dashboards/01-admin-home/customer-registration.php":"/concept-dashboards/04-customer-registration/","/concept-dashboards/01-admin-home/customers.php":"/customers-manager/?embed=1&module=customer-overview","/concept-dashboards/01-admin-home/roles-users.php":"/roles-manager/?module=roles-users","/concept-dashboards/01-admin-home/workshop-jobcards.php":"/concept-dashboards/05-inspection-repair/","/concept-dashboards/01-admin-home/spare-parts.php":"/concept-dashboards/06-storekeeper/?inventory=1","/concept-dashboards/01-admin-home/procurement.php":"/concept-dashboards/03-procurement/","/concept-dashboards/01-admin-home/finance-accounts.php":"/concept-dashboards/09-finance-accounts/","/concept-dashboards/01-admin-home/bank-control.php":"/bank-controller/?module=bank","/concept-dashboards/01-admin-home/general-report.php":"/reports-manager/?module=reports","/concept-dashboards/01-admin-home/system-settings.php":"/concept-dashboards/10-system-settings/","/concept-dashboards/01-admin-home/logout.php":"/logout.php","/concept-dashboards/02-technician/my-job-cards.php":"/technician-job-cards/","/concept-dashboards/02-technician/testing-completion.php":"/technician-job-cards/?view=testing","/concept-dashboards/02-technician/communication.php":"/role-communications/","/concept-dashboards/02-technician/my-reports.php":"/role-reports/","/concept-dashboards/02-technician/my-profile.php":"/my-profile/","/concept-dashboards/02-technician/logout.php":"/logout.php","/concept-dashboards/03-procurement/spare-purchase-requests.php":"/workshop-requests/?source=procurement","/concept-dashboards/03-procurement/purchase-records.php":"/belm-procurement/?view=records&module=procurement","/concept-dashboards/03-procurement/pending-proforma.php":"/belm-procurement/?view=proforma&module=procurement","/concept-dashboards/03-procurement/purchase-orders.php":"/belm-procurement/?view=orders&module=procurement","/concept-dashboards/03-procurement/suppliers.php":"/suppliers-manager/?module=procurement","/concept-dashboards/03-procurement/delivery-tracking.php":"/belm-procurement/?view=delivery&module=procurement","/concept-dashboards/03-procurement/purchase-reports.php":"/role-reports/","/concept-dashboards/03-procurement/department-analysis.php":"/department-analysis/?module=procurement","/concept-dashboards/03-procurement/my-profile.php":"/my-profile/","/concept-dashboards/03-procurement/logout.php":"/logout.php","/concept-dashboards/04-customer-registration/dashboard.php":"/concept-dashboards/01-admin-home/","/concept-dashboards/04-customer-registration/all-customers.php":"/customers-manager/?module=registration","/concept-dashboards/04-customer-registration/pending-approvals.php":"/admin-applications/?module=registration","/concept-dashboards/04-customer-registration/portal-access.php":"/customers-manager/?module=registration","/concept-dashboards/04-customer-registration/customer-users.php":"/roles-manager/?module=registration","/concept-dashboards/04-customer-registration/contracts-service.php":"/contracts-workshops/?module=registration","/concept-dashboards/04-customer-registration/customer-machines.php":"/customers-manager/?view=machines&module=registration","/concept-dashboards/04-customer-registration/communication.php":"/customers-manager/?module=registration","/concept-dashboards/04-customer-registration/customer-reports.php":"/role-reports/","/concept-dashboards/04-customer-registration/activity-log.php":"/reports-manager/?view=activity","/concept-dashboards/04-customer-registration/my-profile.php":"/my-profile/","/concept-dashboards/04-customer-registration/logout.php":"/logout.php","/concept-dashboards/06-storekeeper/spare-parts-inventory.php":"/concept-dashboards/06-storekeeper/?inventory=1","/concept-dashboards/06-storekeeper/stock-in.php":"/spare-parts-manager/?view=stock-in&module=inventory","/concept-dashboards/06-storekeeper/stock-out-issues.php":"/spare-parts-manager/?view=stock-out&module=inventory","/concept-dashboards/06-storekeeper/spare-requests.php":"/workshop-requests/?source=store","/concept-dashboards/06-storekeeper/low-stock-shortages.php":"/spare-parts-manager/?view=low-stock&module=inventory","/concept-dashboards/06-storekeeper/tools-register.php":"/spare-parts-manager/?view=tools&module=inventory","/concept-dashboards/06-storekeeper/stock-audit.php":"/spare-parts-manager/?view=audit&module=inventory","/concept-dashboards/06-storekeeper/inventory-reports.php":"/role-reports/","/concept-dashboards/06-storekeeper/department-analysis.php":"/department-analysis/?module=inventory","/concept-dashboards/06-storekeeper/my-profile.php":"/my-profile/","/concept-dashboards/06-storekeeper/logout.php":"/logout.php","/concept-dashboards/07-operator/my-machine.php":"/operator/","/concept-dashboards/07-operator/daily-checklist.php":"/concept-dashboards/08-daily-checklist/","/concept-dashboards/07-operator/operation-log.php":"/operator/#operation-log","/concept-dashboards/07-operator/fuel-consumption.php":"/customer-fuel-usage/","/concept-dashboards/07-operator/machine-alerts.php":"/operator/#alerts","/concept-dashboards/07-operator/service-status.php":"/operator/#service","/concept-dashboards/07-operator/report-issue.php":"/operator/#report","/concept-dashboards/07-operator/communication.php":"/role-communications/","/concept-dashboards/07-operator/operator-reports.php":"/role-reports/","/concept-dashboards/07-operator/my-profile.php":"/my-profile/","/concept-dashboards/07-operator/logout.php":"/logout.php"};
 const originalSelector='aside.belm-sidebar,aside.sidebar,#belmAdminSidebar,[data-role-sidebar],.cm-side,.csx-sidebar';
 const report=role==='admin'?'/reports-manager/?module=reports':'/role-reports/';
 function entry(label,href){return {label,href};}
 function fallback(){
  const rows=[entry('Dashboard',home)];
  if(role==='bank')rows.push(entry('Bank Accounts','/bank-controller/'),entry('Withdrawals','/bank-controller/#withdrawalRows'),entry('Bank Audit','/bank-controller/#bankEditAuditPanel'));
  if(role==='system')rows.push(entry('System Settings','/settings-manager/'),entry('Users & Roles','/roles-manager/'),entry('Notification Configuration','/coordinator/notifications/'));
  return rows;
 }
 function extract(doc){
  const sidebar=doc.querySelector(originalSelector);if(!sidebar)return [];
  const rows=[];
  sidebar.querySelectorAll('a[href]').forEach(a=>{
   if(a.closest('[hidden]')||a.matches('[data-bank-control]')&&role!=='bank'&&role!=='admin')return;
   let label=a.textContent.replace(/\s+/g,' ').trim();if(!label)return;
   const raw=a.getAttribute('href');if(!raw||raw==='#'||/logout|log out|sign out/i.test(label+' '+raw))return;
   let url=new URL(raw,new URL(home,location.origin));if(routeAliases[url.pathname])url=new URL(routeAliases[url.pathname],location.origin);if(url.origin!==location.origin||!/^https?:$/.test(url.protocol))return;
   if(/^\/(role-reports|reports-manager|general-report)\/?$/.test(url.pathname)||/(?:my-|purchase-|inventory-|customer-|operator-|general-)?reports?\.(php|html)$/.test(url.pathname)||/^(general report|my reports?|reports)$/i.test(label)){label=role==='admin'?'General Report':'My Reports';rows.push(entry(label,report));return;}
   if(/\/index\.html$/.test(url.pathname))url.pathname=url.pathname.replace(/index\.html$/,'');
   rows.push(entry(label,url.pathname+url.search+url.hash));
  });return rows;
 }
 function hideOriginals(){
  document.querySelectorAll(originalSelector).forEach(el=>{
   if(el.closest('#belmPersistentNav'))return;
   if(!el.classList.contains('belm-replaced-sidebar')){el.classList.add('belm-replaced-sidebar');el.setAttribute('aria-hidden','true');el.parentElement?.classList.add('belm-single-content');}
  });
 }
 function selected(href){const u=new URL(href,location.origin),p=location.pathname.replace(/\/+$/,'');return p===u.pathname.replace(/\/+$/,'')&&[...u.searchParams].every(([k,v])=>new URLSearchParams(location.search).get(k)===v)&&(!u.hash||u.hash===location.hash);}
 function render(rows){
  const nav=document.querySelector('#belmPersistentNav nav');nav.replaceChildren();const seen=new Set();
  rows=[...rows,entry(role==='admin'?'General Report':'My Reports',report)];
  rows.forEach(row=>{const u=new URL(row.href,location.origin);u.searchParams.delete('returnTo');const key=u.pathname+u.search+u.hash;if(seen.has(key))return;seen.add(key);const a=document.createElement('a');a.href=row.href;a.textContent=row.label;if(selected(row.href))a.setAttribute('aria-current','page');nav.appendChild(a);});
  // A single best match, so Dashboard does not highlight alongside its sections.
  const matches=[...nav.querySelectorAll('[aria-current]')];if(!matches.length&&/^\/(?:general-report|completed-maintenance-reports|store-audit-report|role-reports)(?:\/|$)/.test(location.pathname)){const reportsLink=[...nav.querySelectorAll('a')].find(a=>a.getAttribute('href')===report);reportsLink?.setAttribute('aria-current','page');}matches.sort((a,b)=>b.href.length-a.href.length).slice(1).forEach(a=>a.removeAttribute('aria-current'));
 }
 function boot(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='/persistent-role-sidebar.css?v=77';document.head.appendChild(css);
  const aside=document.createElement('aside');aside.id='belmPersistentNav';aside.setAttribute('aria-label','Role menu');
  const brand=document.createElement('strong');brand.className='belm-persistent-brand';brand.textContent=(customer?'Customer':'BELM')+' · '+({admin:'Admin',workshop:'Workshop Manager',technician:'Technician',operator:'Operator',procurement:'Procurement',store:'Store Keeper',finance:'Finance / Accounts',bank:'Bank Controller',registration:'Registration & Sales',system:'System Coordinator'}[role]);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Main menu');
  const logout=document.createElement('button');logout.type='button';logout.textContent='Log out';logout.className='belm-persistent-logout';logout.onclick=()=>{['belm_customer_token','belm_tech_token','belm_tech_user','belm_admin_token','belm_admin_user','belm_operator_token','belm_active_account_type','belm_preview_token'].forEach(k=>localStorage.removeItem(k));location.replace('/login?signed_out=1');};
  aside.append(brand,nav,logout);document.body.appendChild(aside);
  const toggle=document.createElement('button');toggle.id='belmPersistentMenu';toggle.type='button';toggle.textContent='☰ Menu';toggle.setAttribute('aria-controls',aside.id);toggle.setAttribute('aria-expanded','false');
  const scrim=document.createElement('button');scrim.id='belmPersistentScrim';scrim.type='button';scrim.setAttribute('aria-label','Close menu');scrim.hidden=true;
  let previousFocus;
  function open(value){if(value)previousFocus=document.activeElement;document.body.classList.toggle('belm-persistent-open',value);toggle.setAttribute('aria-expanded',String(value));toggle.textContent=value?'✕ Close':'☰ Menu';scrim.hidden=!value;if(value)nav.querySelector('a')?.focus();else previousFocus?.focus();}
  toggle.onclick=()=>open(toggle.getAttribute('aria-expanded')!=='true');scrim.onclick=()=>open(false);
  document.addEventListener('keydown',e=>{if(toggle.getAttribute('aria-expanded')!=='true')return;if(e.key==='Escape'){open(false);return;}if(e.key==='Tab'){const focusable=[toggle,...aside.querySelectorAll('a,button')],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  window.addEventListener('resize',()=>{if(window.innerWidth>=768&&toggle.getAttribute('aria-expanded')==='true')open(false);});
  nav.addEventListener('click',e=>{if(e.target.closest('a'))open(false);});
  window.addEventListener('hashchange',()=>{nav.querySelectorAll('a').forEach(a=>{if(selected(a.href))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});});
  document.body.append(toggle,scrim);document.body.classList.add('belm-persistent-ready');
  render(fallback());hideOriginals();
  const currentHome=location.pathname.replace(/(?:index\.html)?\/?$/,'/')===home;
  const initial=currentHome?extract(document):[];if(initial.length)render(initial);
  if(!initial.length)fetch(home,{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Menu unavailable');return r.text();}).then(html=>{const rows=extract(new DOMParser().parseFromString(html,'text/html'));if(rows.length)render(rows);}).catch(()=>{});
  // Conditional writes prevent recursive mutation observer loops.
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;hideOriginals();});}).observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
