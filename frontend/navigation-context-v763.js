(function(){
  'use strict';
  if(window.__belmNavigationContext763)return;
  window.__belmNavigationContext763=true;

  function sessionToken(){
    const active=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
    const activeKey={customer:'belm_customer_token',technician:'belm_tech_token',admin:'belm_admin_token',operator:'belm_operator_token'}[active]||'';
    const keys=[activeKey,'belm_admin_token','belm_tech_token','belm_customer_token','belm_operator_token'].filter((v,i,a)=>v&&a.indexOf(v)===i);
    for(const key of keys){
      const value=localStorage.getItem(key)||'';
      if(!value)continue;
      try{let raw=value.split('.')[1]||'';raw=raw.replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);const payload=JSON.parse(atob(raw));if(payload.exp&&payload.exp*1000<=Date.now())continue;}catch(_){}
      return value;
    }
    return '';
  }
  const token=sessionToken();
  if(!token)return;

  function decode(value){
    try{let raw=value.split('.')[1]||'';raw=raw.replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')))}catch(_){return {}}
  }
  const session=decode(token);
  const cleanPath=(location.pathname.replace(/\/+$/,'')||'/');
  const query=new URLSearchParams(location.search);

  const customerAliases={owner:'customer_admin',admin:'customer_admin',customer_admin:'customer_admin',workshop_manager:'workshop_manager',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store_keeper',accounts:'accounts',finance:'accounts',accountant:'accounts'};
  const staffAliases={'Super Admin':'super_admin','Workshop Manager':'workshop_manager','Engineer':'workshop_manager','Technician':'technician','Procurement':'procurement','Store Keeper':'store_keeper','Registration & Sales':'registration_sales','Finance / Accounts':'finance_accounts','Bank Controller':'bank_controller','System Coordinator':'system_coordinator'};

  function roleKey(){
    if(session.type==='customer')return customerAliases[String(session.customerRole||(session.actorType==='owner'?'owner':'')).toLowerCase()]||'customer_admin';
    if(session.type==='operator')return 'operator';
    return staffAliases[String(session.roleName||'')]||'super_admin';
  }
  function roleHome(){
    const r=roleKey();
    if(session.type==='customer'||session.type==='operator'){
      return ({customer_admin:'/customer-admin-dashboard/',workshop_manager:'/customer-workshop/?actor=customer',technician:'/concept-dashboards/02-technician/',operator:'/customer-operator-dashboard/',procurement:'/customer-procurement-dashboard/',store_keeper:'/customer-store-dashboard/',accounts:'/customer-finance/'})[r]||'/portal-cwm/';
    }
    return ({super_admin:'/concept-dashboards/01-admin-home/',workshop_manager:'/concept-dashboards/11-workshop-manager/',technician:'/concept-dashboards/02-technician/',procurement:'/concept-dashboards/03-procurement/',store_keeper:'/concept-dashboards/06-storekeeper/',registration_sales:'/concept-dashboards/04-customer-registration/',finance_accounts:'/concept-dashboards/09-finance-accounts/',bank_controller:'/bank-controller/',system_coordinator:'/settings-manager/'})[r]||'/concept-dashboards/01-admin-home/';
  }

  const moduleParents={settings:'/settings-manager/',registration:'/concept-dashboards/04-customer-registration/',finance:'/concept-dashboards/09-finance-accounts/',workshop:'/concept-dashboards/11-workshop-manager/',inventory:'/concept-dashboards/06-storekeeper/',procurement:'/concept-dashboards/03-procurement/',bank:'/bank-controller/',reports:'/role-reports/','customer-overview':'/customers-manager/','roles-users':'/roles-manager/'};
  const prefixes=[
    ['/general-report/report','/general-report/'],['/general-report/record','/general-report/'],
    ['/tech-checked-report','/tech'],['/tech-record-detail','/tech'],['/tech-report','/tech'],['/technician-job-cards','/tech'],['/technician-tasks','/tech'],
    ['/customer-procurement-workspace','/customer-procurement-dashboard/'],['/customer-procurement-home','/customer-procurement-dashboard/'],
    ['/customer-finance-workspace','/customer-finance/'],['/customer-sales-documents','/customer-finance/'],['/customer-petty-cash','/customer-finance/'],
    ['/customer-store-audit','/customer-store-dashboard/'],['/customer-tools-register','/customer-store-dashboard/'],['/customer-store','/customer-store-dashboard/'],
    ['/customer-checkup','/portal/dashboard?view=machines'],['/customer-fuel-usage','/customer-operator-dashboard/'],['/customer-job-card','/customer-workshop/?actor=customer'],
    ['/workshop-analysis','/concept-dashboards/11-workshop-manager/'],['/workshop-communication','/concept-dashboards/11-workshop-manager/'],['/workshop-requests','/concept-dashboards/11-workshop-manager/'],
    ['/billing-manager','/concept-dashboards/09-finance-accounts/'],['/suppliers-manager','/belm-procurement/'],['/spare-parts-manager','/concept-dashboards/06-storekeeper/'],
    ['/checklist-manager','/settings-manager/'],['/recycle-bin','/settings-manager/'],['/coordinator/','/settings-manager/'],
    ['/role-communications',null],['/role-reports',null],['/general-report','/role-reports/']
  ];
  const roots=new Set(['/','/login','/portal-cwm','/customer-admin-dashboard','/customer-operator-dashboard','/customer-procurement-dashboard','/customer-store-dashboard','/customer-finance','/customer-workshop','/belm-workshop','/belm-procurement','/bank-controller','/settings-manager','/customers-manager','/roles-manager','/reports-manager','/concept-dashboards/01-admin-home','/concept-dashboards/02-technician','/concept-dashboards/03-procurement','/concept-dashboards/04-customer-registration','/concept-dashboards/05-inspection-repair','/concept-dashboards/06-storekeeper','/concept-dashboards/07-operator','/concept-dashboards/08-daily-checklist','/concept-dashboards/09-finance-accounts','/concept-dashboards/10-system-settings','/concept-dashboards/11-workshop-manager','/tech']);

  function safeLocal(url){try{const u=new URL(url,location.origin);return u.origin===location.origin&&u.pathname!==location.pathname?u.pathname+u.search+u.hash:''}catch(_){return ''}}
  const requestedBack=safeLocal(query.get('returnTo')||query.get('back')||'');
  function destination(){
    if(requestedBack)return requestedBack;
    if(cleanPath==='/tech-checked-report'||cleanPath.startsWith('/tech-checked-report/')||cleanPath==='/tech-record-detail'||cleanPath.startsWith('/tech-record-detail/')||cleanPath==='/tech-report'||cleanPath.startsWith('/tech-report/')){
      if(String(query.get('source')||'').toLowerCase()==='coordinator')return '/coordinator/general-report/checklist-report/';
      if(session.type==='customer'||session.type==='operator')return roleHome();
      return '/tech';
    }
    const mod=String(query.get('module')||'').toLowerCase();
    if(mod&&moduleParents[mod]&&cleanPath.replace(/\/+$/,'')!==moduleParents[mod].replace(/\/+$/,''))return moduleParents[mod];
    for(const [prefix,parent] of prefixes){if(cleanPath===prefix||cleanPath.startsWith(prefix+'/'))return parent||roleHome();}
    try{const ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin&&ref.pathname!==location.pathname&&!/\/(login|forgot-password)\/?$/.test(ref.pathname))return ref.pathname+ref.search+ref.hash}catch(_){}
    return roleHome();
  }
  function labelFor(target){
    if(target.includes('role-reports'))return '← My Reports';
    if(target.includes('settings-manager'))return '← System Settings';
    if(target.includes('customer-procurement-dashboard'))return '← Procurement';
    if(target.includes('customer-store-dashboard'))return '← Store';
    if(target.includes('customer-finance'))return '← Finance';
    if(target.includes('customer-workshop'))return '← Workshop';
    if(target.includes('belm-workshop'))return '← Workshop';
    if(target==='/tech'||target.startsWith('/tech?'))return '← Technician Dashboard';
    return '← Back';
  }
  const target=destination();

  function go(e){if(e){e.preventDefault();e.stopImmediatePropagation();}location.assign(target)}
  function install(){
    if(!document.body)return;
    // A role/dashboard root keeps its own designed Home/Role back control.
    // Only an explicit returnTo/back context may override a root page.
    if(roots.has(cleanPath)&&!requestedBack)return;
    const header=document.querySelector('header,.topbar,.management-topbar,.topheader,.head,.belm-topbar');
    const candidates=header?Array.from(header.querySelectorAll('a[href],button')):[];
    let existing=candidates.find(el=>{
      const text=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      const cls=String(el.className||'').toLowerCase();
      return text.startsWith('←')||text==='back'||text.startsWith('back to ')||cls.includes('back-button')||cls.split(/\s+/).includes('back');
    });
    if(existing){
      existing.dataset.belmContextBack='1';
      existing.setAttribute('title','Return to the correct parent dashboard');
      if(existing.tagName==='A')existing.setAttribute('href',target);
      existing.textContent=labelFor(target);
      existing.addEventListener('click',go,true);
      return;
    }
    if(document.getElementById('belmContextBackV763'))return;
    const a=document.createElement('a');a.id='belmContextBackV763';a.href=target;a.textContent=labelFor(target);a.className='belm-context-back-v763';a.addEventListener('click',go,true);document.body.appendChild(a);
    if(!document.getElementById('belmContextBackV763Style')){const s=document.createElement('style');s.id='belmContextBackV763Style';s.textContent='.belm-context-back-v763{position:fixed;left:12px;top:12px;z-index:99997;display:inline-flex;align-items:center;min-height:38px;padding:8px 12px;border:1px solid #49657d;border-radius:10px;background:#0d2742;color:#fff;text-decoration:none;font:800 12px Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18)}.belm-context-back-v763:hover{background:#123859}@media(max-width:600px){.belm-context-back-v763{left:8px;top:8px;min-height:34px;padding:6px 9px;font-size:11px}}';document.head.appendChild(s)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  setTimeout(install,250);
})();
