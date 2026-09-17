(function(){
  'use strict';
  if(window.__belmCustomerCompanyRoleBrand810)return;
  window.__belmCustomerCompanyRoleBrand810=true;

  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const operatorToken=localStorage.getItem('belm_operator_token')||'';
  const token=customerToken||operatorToken;
  if(!token)return;

  function decode(value){try{let raw=(value.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')))}catch(_){return {}}}
  const session=decode(token);
  if(!customerToken&&session.type!=='operator')return;
  const roleAliases={owner:'CUSTOMER ADMIN',admin:'CUSTOMER ADMIN',customer_admin:'CUSTOMER ADMIN',workshop_manager:'WORKSHOP MANAGER',technician:'TECHNICIAN',operator:'MACHINE OPERATOR',procurement:'PROCUREMENT',store_keeper:'STORE KEEPER',accounts:'FINANCE / ACCOUNTS',finance:'FINANCE / ACCOUNTS',accountant:'FINANCE / ACCOUNTS'};
  const pathRoles=[['/customer-procurement','PROCUREMENT'],['/customer-store','STORE KEEPER'],['/customer-finance','FINANCE / ACCOUNTS'],['/customer-workshop-manager','WORKSHOP MANAGER'],['/customer-technician','TECHNICIAN'],['/customer-operator','MACHINE OPERATOR'],['/operator','MACHINE OPERATOR']];
  const rawRole=String(session.customerRole||session.role||session.roleName||(session.actorType==='owner'?'owner':'')).toLowerCase();
  const routeRole=(pathRoles.find(([prefix])=>location.pathname.startsWith(prefix))||[])[1];
  const role=routeRole||roleAliases[rawRole]||'CUSTOMER ADMIN';
  let company=String(session.customerName||session.companyName||session.assignedCustomerName||'').trim();

  function validCompany(value){const v=String(value||'').trim();return v&&!/^(customer|company|your company)$/i.test(v)?v:''}
  function discoverCompany(){
    if(validCompany(company))return company;
    const nodes=document.querySelectorAll('[data-company-name-upper],[data-company-name],[data-customer-name-upper]');
    for(const node of nodes){const found=validCompany(node.textContent);if(found)return found}
    return '';
  }
  function setText(selector,value){document.querySelectorAll(selector).forEach(el=>{if(el.textContent!==value)el.textContent=value})}
  function apply(){
    const found=discoverCompany();if(found)company=found;
    if(!validCompany(company))return;
    const upper=company.toUpperCase(),companyRole=`${upper} ${role}`;
    setText('[data-company-name]:not(.belm-user__role)',company);
    setText('[data-company-name-upper]:not(.belm-user__role),[data-customer-name-upper]:not(.belm-user__role)',upper);
    setText('[data-customer-role-label],[data-company-role]',companyRole);
    document.querySelectorAll('.belm-user__role').forEach(el=>{if(el.textContent!==companyRole)el.textContent=companyRole});
    let sidebarRole=document.querySelector('[data-sidebar-company-role]');
    if(!sidebarRole){
      const sidebar=document.querySelector('.belm-sidebar,.sidebar');
      const brand=sidebar?.querySelector('.belm-brand,.customer-sidebar-brand');
      if(sidebar&&brand){sidebarRole=document.createElement('div');sidebarRole.dataset.sidebarCompanyRole='1';sidebarRole.className='belm-sidebar-company-role-v810';brand.insertAdjacentElement('afterend',sidebarRole)}
    }
    if(sidebarRole&&sidebarRole.textContent!==companyRole)sidebarRole.textContent=companyRole;
    let badge=document.querySelector('[data-company-role-badge]');
    if(!badge){
      const host=document.querySelector('.belm-topbar__right,.header-right,.topbar-actions');
      if(host){badge=document.createElement('strong');badge.dataset.companyRoleBadge='1';badge.className='belm-company-role-badge-v810';host.insertBefore(badge,host.firstChild)}
    }
    if(badge&&badge.textContent!==companyRole)badge.textContent=companyRole;
    document.title=`${company} — ${role}`;
  }
  function installStyle(){if(document.getElementById('belmCompanyRoleBrandV810Style'))return;const s=document.createElement('style');s.id='belmCompanyRoleBrandV810Style';s.textContent='.belm-sidebar-company-role-v810{margin:0 12px 12px;padding:9px 10px;border:1px solid rgba(245,197,24,.42);border-radius:10px;background:rgba(245,197,24,.1);color:#f5c518;font:900 10px/1.35 Inter,Arial,sans-serif;letter-spacing:.045em;text-align:center;overflow-wrap:anywhere}.belm-company-role-badge-v810{display:inline-flex;align-items:center;min-height:34px;padding:7px 11px;border:1px solid rgba(116,169,220,.4);border-radius:999px;background:rgba(17,54,88,.75);color:#fff;font:800 10px/1.2 Inter,Arial,sans-serif;letter-spacing:.04em;white-space:nowrap}.belm-user__role{max-width:270px;white-space:normal!important;line-height:1.25}@media(max-width:650px){.belm-company-role-badge-v810{font-size:9px;max-width:190px;white-space:normal}}';document.head.appendChild(s)}
  async function loadCompany(){
    if(!customerToken)return;
    try{const r=await fetch('/api/customer-portal/dashboard',{cache:'no-store',headers:{Authorization:'Bearer '+customerToken}});if(!r.ok)return;const data=await r.json();const exact=validCompany(data?.customer?.name||data?.customerName);if(exact){company=exact;apply()}}catch(_){}
  }
  function boot(){installStyle();apply();new MutationObserver(apply).observe(document.body,{childList:true,subtree:true,characterData:true});setTimeout(apply,350);setTimeout(apply,1200);loadCompany()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
