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
 const customer=user.type==='customer'||user.type==='operator'||(user.type==='staff'&&!!user.isCustomerManaged&&!!user.assignedCustomerId);
 const staff={'Super Admin':'admin','Workshop Manager':'workshop','Engineer':'workshop','Technician':'technician','Operator':'operator','Machine Operator':'operator','OPERATION':'operator','Procurement':'procurement','Store Keeper':'store','Registration & Sales':'registration','Finance / Accounts':'finance','Bank Controller':'bank','System Coordinator':'system'};
 const customers={owner:'admin',admin:'admin',customer_admin:'admin',workshop_manager:'workshop',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store',accounts:'finance',finance:'finance',accountant:'finance'};
 const staffRole=Object.entries(staff).find(([label])=>label.toLowerCase()===String(user.roleName||'').trim().toLowerCase())?.[1];
 const role=customer?(user.type==='operator'?'operator':user.type==='staff'&&staffRole==='technician'?'technician':customers[String(user.customerRole||(user.actorType==='owner'?'owner':'')).toLowerCase()]):staffRole;
 if(!role)return;
 const home=customer?{admin:'/customer-admin-dashboard/',workshop:'/customer-workshop-manager/',technician:'/customer-technician-dashboard/',operator:'/customer-operator-dashboard/',procurement:'/customer-procurement-dashboard/',store:'/customer-store-dashboard/',finance:'/customer-finance/'}[role]:{admin:'/concept-dashboards/01-admin-home/',workshop:'/concept-dashboards/11-workshop-manager/',technician:'/concept-dashboards/02-technician/',operator:'/concept-dashboards/07-operator/',procurement:'/concept-dashboards/03-procurement/',store:'/concept-dashboards/06-storekeeper/',registration:'/concept-dashboards/04-customer-registration/',finance:'/concept-dashboards/09-finance-accounts/',bank:'/bank-controller/',system:'/settings-manager/'}[role];
 if(!home)return;
 window.__belmPersistentSidebar=true;
 const menus={
  belm:{
   admin:[['Workshop Manager','/concept-dashboards/11-workshop-manager/'],['Customers & Machines','/customers-manager/?module=customer-overview'],['Registration & Sales','/concept-dashboards/04-customer-registration/'],['Roles & Users','/roles-manager/'],['Job Cards','/concept-dashboards/11-workshop-manager/job-cards.html'],['Store & Inventory','/concept-dashboards/06-storekeeper/'],['Procurement','/concept-dashboards/03-procurement/'],['Finance','/concept-dashboards/09-finance-accounts/'],['Bank Account Management','/bank-controller/'],['System Settings','/settings-manager/']],
   workshop:[['Job Cards','/concept-dashboards/11-workshop-manager/job-cards.html','service-requests'],['Customers & Machines','/customers-manager/?module=workshop','customers'],['Technicians','/concept-dashboards/11-workshop-manager/technicians.html','roles'],['Workshop Schedule','/concept-dashboards/11-workshop-manager/workshop-schedule.html','service-requests'],['Spare Requests','/workshop-requests/?source=workshop','spare-parts'],['Service & Maintenance','/concept-dashboards/11-workshop-manager/service-maintenance.html','service-requests']],
   technician:[['My Job Cards','/technician-job-cards/'],['Assigned Machines','/concept-dashboards/02-technician/customer-machines.php','customers'],['Testing & Completion','/technician-job-cards/?view=testing']],
   procurement:[['Purchase Requests','/workshop-requests/?source=procurement','service-requests'],['Purchase Records','/belm-procurement/?view=records','suppliers'],['Pending Proforma','/belm-procurement/?view=proforma','suppliers'],['Purchase Orders','/belm-procurement/?view=orders','suppliers'],['Suppliers','/suppliers-manager/','suppliers'],['Delivery Tracking','/belm-procurement/?view=delivery','suppliers']],
   store:[['Inventory','/spare-parts-manager/','spare-parts'],['Stock In','/spare-parts-manager/?view=stock-in','spare-parts'],['Stock Out & Issues','/spare-parts-manager/?view=stock-out','spare-parts'],['Spare Requests','/spare-parts-manager/?view=requests','spare-parts'],['Low Stock','/spare-parts-manager/?view=low-stock','spare-parts'],['Tools Register','/spare-parts-manager/?view=tools','spare-parts'],['Stock Audit','/store-audit-report/','spare-parts']],
   registration:[['Customers','/customers-manager/?module=registration','customers'],['Pending Applications','/admin-applications/?module=registration','customers'],['Customer Machines','/customers-manager/?view=machines&module=registration','customers'],['Contracts & Service','/contracts-workshops/?module=registration','customers']],
   finance:[['Proforma','/billing-manager/?tab=proformas','billing'],['Invoices','/billing-manager/?tab=invoices','billing'],['Payments','/billing-manager/?tab=payments','billing'],['Receipts','/billing-manager/?tab=receipts','billing'],['Expenses','/billing-manager/?tab=expenses','billing']],
   bank:[['Withdrawals','/bank-controller/#withdrawalRows','bank-manager'],['Bank Audit','/bank-controller/#bankEditAuditPanel','bank-manager']],
   system:[['Users & Roles','/roles-manager/','roles'],['Checklist Templates','/checklist-manager/','checklist-templates'],['Notification Configuration','/coordinator/notifications/','settings'],['Activity Log','/reports-manager/?view=activity','activity-log']],
   operator:[['Machines','/customers-manager/?module=operator','customers']]
  },
  customer:{
   admin:[['Company Machines','/portal/dashboard?view=machines',null,'technical'],['Workshop Manager','/customer-workshop-manager/',null,'technical','workshop_manager'],['Roles & Users','/customer-users/',null,'administration'],['Procurement','/customer-procurement-dashboard/',null,'procurement','procurement'],['Store Keeper','/customer-store-dashboard/',null,'store','store_keeper'],['Finance / Accounts','/customer-finance/',null,'finance','accounts'],['System Settings','/customer-settings-center/',null,'administration','settings']],
   workshop:[['Company Machines','/portal/dashboard?view=machines',null,'technical'],['Job Cards','/breakdown-workflow/?actor=customer',null,'technical'],['Technicians','/customer-workshop-manager/#technicians-on-duty',null,'technical'],['Workshop Schedule','/customer-workshop-manager/#workshop-schedule',null,'technical'],['Workshop Requirements','/customer-procurement-workspace/?view=queue',null,'procurement'],['Service & Maintenance','/customer-inspection-repair/',null,'technical']],
   technician:[['My Job Cards','/technician-job-cards/',null,'technical'],['Assigned Machines','/portal/dashboard?view=machines',null,'technical'],['Daily Checklists','/customer-checkup/',null,'technical']],
   operator:[['Company Machines','/portal/dashboard?view=machines',null,'operator'],['Daily Checklist','/customer-checkup/',null,'operator'],['Fuel Consumption','/customer-fuel-usage/',null,'operator'],['Operator Reports','/general-report/report/?type=operator',null,'operator']],
   procurement:[['Spare Requests','/customer-procurement-home/',null,'procurement'],['Purchase Records','/customer-procurement-workspace/?view=records',null,'procurement'],['Pending Proforma','/customer-procurement-workspace/?view=proforma',null,'procurement'],['Purchase Orders','/customer-procurement-workspace/?view=orders',null,'procurement'],['Suppliers','/customer-procurement-workspace/?view=suppliers',null,'procurement'],['Delivery Tracking','/customer-procurement-workspace/?view=delivery',null,'procurement']],
   store:[['Inventory','/customer-store/',null,'store'],['Stock In','/customer-store/?view=stock-in',null,'store'],['Stock Out & Issues','/customer-store/?view=issues',null,'store'],['Spare Requests','/customer-store/?view=requests',null,'store'],['Tools Register','/customer-tools-register/',null,'store'],['Stock Audit','/customer-store-audit/',null,'store']],
   finance:[['Invoices & Proforma','/customer-sales-documents/',null,'finance'],['Payments & Receipts','/customer-finance-workspace/?view=payments',null,'finance'],['Expenses','/customer-finance-workspace/?view=expenses',null,'finance'],['VAT / Tax','/customer-finance-workspace/?view=vat',null,'finance'],['Petty Cash','/customer-petty-cash/',null,'finance'],['Clients','/customer-finance-workspace/?view=clients',null,'finance'],['Suppliers','/customer-finance-workspace/?view=suppliers',null,'finance'],['Audit Logs','/customer-finance-workspace/?view=audit',null,'finance']]
  }
 };
 const originalSelector='aside.belm-sidebar,aside.sidebar,#belmAdminSidebar,[data-role-sidebar],.cm-side,.csx-sidebar';
 const settingsModule=!customer&&(role==='system'||/^\/(settings-manager|checklist-manager)(?:\/|$)/.test(location.pathname)||location.pathname.startsWith('/coordinator/notifications')||new URLSearchParams(location.search).get('module')==='settings');
 const report=role==='admin'?'/reports-manager/?module=reports':'/role-reports/';
 function entry(label,href,group='Workspace'){return {label,href,group};}
 const grantedPages=Array.isArray(user.allowedPages)?user.allowedPages:null;
 let departmentStates=null,modeState=null;
 const employeeFeature={ 'Daily Checklist':'check-up','Fuel Consumption':'fuel-usage','Operator Reports':'operator-reports'};
 function rowsForRole(){
  if(settingsModule){
   const entries=[['System Settings','/settings-manager/','settings'],['Users & Roles','/roles-manager/?module=settings','roles'],['Checklist Templates','/checklist-manager/?module=settings','checklist-templates'],['Notification Configuration','/coordinator/notifications/?module=settings','settings'],['Activity Log','/reports-manager/?view=activity&module=settings','activity-log']];
   return [...entries.filter(([, ,page])=>role==='admin'||!grantedPages||grantedPages.includes(page)).map(([label,href])=>entry(label,href,'System Settings')),entry('Back to Main Menu','/portal-v2/','Navigation')];
  }
  const rows=[entry('Dashboard',home)];
  for(const [label,href,page,department,modeRole] of menus[customer?'customer':'belm'][role]||[]){
   if(!customer&&role!=='admin'&&page&&grantedPages&&!grantedPages.includes(page))continue;
   if(customer&&departmentStates&&departmentStates[department]==='REMOVED')continue;
   if(customer&&modeState&&modeRole==='settings'&&modeState.customerSettings?.available===false)continue;
   if(customer&&modeState&&modeRole&&modeState.roles?.some(r=>r.key===modeRole&&r.enabled===false))continue;
   if(customer&&role==='operator'&&Array.isArray(user.permissions)&&employeeFeature[label]&&!user.permissions.includes(employeeFeature[label]))continue;
   rows.push(entry(label,href));
  }
  if(user.type==='operator')return [entry('Dashboard',home),entry('Machine Operations','/operator/')];
  rows.push(entry(role==='store'?'Spare Request Notifications':'Communication','/role-communications/'));
  if(!customer||!departmentStates||departmentStates.generalReport!=='REMOVED'){
   rows.push(entry(role==='admin'?'General Report':'My Reports',report,'Reports'));
   if(!['admin','system','registration'].includes(role))rows.push(entry('My Analysis','/role-analysis/','Reports'));
  }
  rows.push(entry('My Profile','/my-profile/','Account'));
  return rows;
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
  let lastGroup='';
  rows.forEach(row=>{const u=new URL(row.href,location.origin);u.searchParams.delete('returnTo');const key=u.pathname+u.search+u.hash;if(seen.has(key))return;seen.add(key);if(row.group!==lastGroup){const label=document.createElement('span');label.className='belm-persistent-group';label.textContent=row.group;nav.appendChild(label);lastGroup=row.group;}const a=document.createElement('a');a.href=row.href;a.textContent=row.label;if(selected(row.href))a.setAttribute('aria-current','page');nav.appendChild(a);});
  // A single best match, so Dashboard does not highlight alongside its sections.
  const matches=[...nav.querySelectorAll('[aria-current]')];if(!matches.length&&/^\/(?:general-report|completed-maintenance-reports|store-audit-report|role-reports)(?:\/|$)/.test(location.pathname)){const reportsLink=[...nav.querySelectorAll('a')].find(a=>a.getAttribute('href')===report);reportsLink?.setAttribute('aria-current','page');}matches.sort((a,b)=>b.href.length-a.href.length).slice(1).forEach(a=>a.removeAttribute('aria-current'));
 }
 function boot(){
  const css=document.createElement('link');css.rel='stylesheet';css.href='/persistent-role-sidebar.css?v=86-system-settings-module';document.head.appendChild(css);
  const aside=document.createElement('aside');aside.id='belmPersistentNav';aside.setAttribute('aria-label','Role menu');
  const brand=document.createElement('strong');brand.className='belm-persistent-brand';brand.textContent=settingsModule?'System Settings':(customer?'Customer':'BELM')+' · '+({admin:'Admin',workshop:'Workshop Manager',technician:'Technician',operator:'Operator',procurement:'Procurement',store:'Store Keeper',finance:'Finance / Accounts',bank:'Bank Controller',registration:'Registration & Sales',system:'System Coordinator'}[role]);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Main menu');
  const logout=document.createElement('button');logout.type='button';logout.textContent='Log out';logout.className='belm-persistent-logout';logout.onclick=()=>{['belm_customer_token','belm_tech_token','belm_tech_user','belm_admin_token','belm_admin_user','belm_operator_token','belm_active_account_type','belm_preview_token'].forEach(k=>localStorage.removeItem(k));location.replace('/login?signed_out=1');};
  aside.append(brand,nav);if(!settingsModule)aside.appendChild(logout);document.body.appendChild(aside);
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
  render(rowsForRole());hideOriginals();
  if(customer&&user.type!=='operator'){
    const headers={Authorization:'Bearer '+token};
    const read=async path=>{const response=await fetch(path,{cache:'no-store',headers});if(!response.ok)throw Error('Menu settings unavailable');return response.json();};
    Promise.allSettled([read('/api/customer-portal/coordinator-features'),read('/api/customer-mode')]).then(([features,mode])=>{
      if(features.status==='fulfilled')departmentStates=features.value.departments||null;
      if(mode.status==='fulfilled')modeState=mode.value;
      render(rowsForRole());
      if(features.status==='rejected'||mode.status==='rejected'){const note=document.createElement('small');note.className='belm-persistent-menu-note';note.textContent='Menu settings could not refresh. Page access is checked when opened.';aside.appendChild(note);}
    });
  }
  if(!customer&&role==='operator'&&grantedPages&&grantedPages.length===0){const note=document.createElement('p');note.className='belm-persistent-menu-note';note.textContent='No work modules assigned yet. Ask Admin to assign your machine and role access.';aside.appendChild(note);}
  // Conditional writes prevent recursive mutation observer loops.
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;hideOriginals();});}).observe(document.body,{childList:true,subtree:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
