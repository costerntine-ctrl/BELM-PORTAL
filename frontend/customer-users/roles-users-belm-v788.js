(function(){'use strict';
  const ROLE_DESCRIPTIONS={
    workshop_manager:'Workshop control, Job Cards, technician assignment and maintenance supervision.',
    technician:'Diagnosis, repair, testing, Job Card progress and technical reports.',
    operator:'Machine operation, daily checks, fuel records and problem reporting.',
    store_keeper:'Store inventory, stock issue/receive, spare parts and tools control.',
    procurement:'Purchase requests, suppliers, proforma, orders and delivery tracking.',
    accounts:'Invoices, payments, expenses, VAT and customer financial records.'
  };
  const ROLE_LABELS={
    workshop_manager:'Workshop Manager',technician:'Technician',operator:'Machine Operator',store_keeper:'Store Keeper',procurement:'Procurement',accounts:'Finance / Accounts'
  };

  function roleKeyFromCard(card){
    const badge=card.querySelector('.badge');
    if(!badge)return'';
    return Object.keys(ROLE_DESCRIPTIONS).find(k=>badge.classList.contains(k))||'';
  }

  function enhanceRoles(){
    const container=document.getElementById('roleCards');
    if(!container)return;
    container.classList.add('role-grid');
    container.querySelectorAll('.role-card').forEach(card=>{
      const key=roleKeyFromCard(card);if(!key)return;
      const badge=card.querySelector('.badge');if(badge)badge.textContent=ROLE_LABELS[key];
      let desc=card.querySelector('.role-access-description');
      if(!desc){desc=document.createElement('p');desc.className='role-access-description';const head=card.querySelector('.role-card-head');head?.insertAdjacentElement('afterend',desc)}
      desc.textContent=ROLE_DESCRIPTIONS[key];
    });
  }

  function enhanceUsers(){
    const panel=document.getElementById('portalUserAccounts');
    const list=document.getElementById('userList');
    if(!panel||!list)return;
    let head=panel.querySelector('.customer-users-head');
    if(!head){
      head=document.createElement('div');
      head.className='customer-users-head';
      head.innerHTML='<span>Name</span><span>Email / Phone</span><span>Role</span><span>Status</span><span>Actions</span>';
      list.insertAdjacentElement('beforebegin',head);
    }
    list.querySelectorAll('.user-card').forEach(card=>{
      const badge=card.querySelector('.badge');
      if(!badge)return;
      const key=Object.keys(ROLE_LABELS).find(k=>badge.classList.contains(k));
      if(key)badge.textContent=ROLE_LABELS[key];
    });
  }

  function addSearch(){
    const panel=document.getElementById('portalUserAccounts');
    const head=panel?.querySelector('.panel-head');
    if(!head||document.getElementById('searchInput'))return;
    const input=document.createElement('input');input.id='searchInput';input.type='search';input.placeholder='Search name, email or role';input.setAttribute('aria-label','Search users');
    head.appendChild(input);
    input.addEventListener('input',()=>{
      const q=input.value.trim().toLowerCase();
      document.querySelectorAll('#userList .user-card').forEach(card=>{card.hidden=q&&!card.textContent.toLowerCase().includes(q)});
    });
  }

  function makeMetricFour(){
    const metrics=document.querySelector('.metrics');if(!metrics)return;
    if(document.getElementById('technicianMetricV788'))return;
    const total=document.getElementById('totalCount')?.closest('.metric');
    const active=document.getElementById('activeCount')?.closest('.metric');
    if(!total||!active)return;
    const tech=document.createElement('article');tech.className='metric';tech.id='technicianMetricV788';tech.innerHTML='<span>Technicians</span><strong id="technicianCountV788">0</strong>';
    active.insertAdjacentElement('beforebegin',tech);
    const roles=document.createElement('article');roles.className='metric';roles.innerHTML='<span>Operational roles</span><strong>6</strong>';
    active.insertAdjacentElement('afterend',roles);
    const update=()=>{document.getElementById('technicianCountV788').textContent=String(document.querySelectorAll('#roleCards .role-card .badge.technician').length?Array.from(document.querySelectorAll('#roleCards .role-card')).find(c=>c.querySelector('.badge.technician'))?.querySelector('.role-card-head strong')?.textContent||'0':'0')};
    update();
    new MutationObserver(update).observe(document.getElementById('roleCards'),{childList:true,subtree:true,characterData:true});
  }

  function enhance(){enhanceRoles();enhanceUsers();addSearch();makeMetricFour()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
  const obs=new MutationObserver(()=>requestAnimationFrame(enhance));
  obs.observe(document.body,{childList:true,subtree:true});
})();