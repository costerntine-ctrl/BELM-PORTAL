(()=>{
  const sidebar=document.querySelector('.workspace>.card');
  if(!sidebar)return;

  sidebar.id='wmSidebar';
  sidebar.setAttribute('aria-label','BELM role workspaces');

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[character]);
  const currentUser=(()=>{
    try{return JSON.parse(localStorage.getItem('belm_admin_user')||'{}')||{};}
    catch(_){return {};}
  })();
  const assignedRoles=[...new Set(
    (Array.isArray(currentUser.roleNames)?currentUser.roleNames:[currentUser.role])
      .filter(Boolean)
      .map(role=>role==='Engineer'?'Workshop Manager':String(role))
  )];
  const assignedRoleText=assignedRoles.length?assignedRoles.join(' / '):'BELM staff';
  const assignedRoleKey=(()=>{
    const value=assignedRoles.join(' ').toLowerCase();
    if(/super admin|belm admin|administrator/.test(value))return'super';
    if(/workshop manager|engineer|technical dep/.test(value))return'workshop';
    if(/technician/.test(value))return'technician';
    if(/procurement/.test(value))return'procurement';
    if(/store keeper/.test(value))return'store';
    if(/registration|sales/.test(value))return'sales';
    if(/finance|accounts|accountant/.test(value))return'finance';
    if(/bank control/.test(value))return'bank';
    if(/coordinator/.test(value))return'coordinator';
    return'workshop';
  })();

  const header=sidebar.querySelector('.head');
  const headerIcon=header?.querySelector('.icon');
  const headerEyebrow=header?.querySelector('.eyebrow');
  const headerTitle=header?.querySelector('h1');
  if(headerIcon)headerIcon.textContent='B';
  if(headerEyebrow)headerEyebrow.textContent='BELM ROLE WORKSPACES';
  if(headerTitle)headerTitle.textContent='BELM Operations Menu';

  const roleWorkspaces=[
    {key:'super',code:'SA',label:'BELM Super Admin',note:'Company control, approvals & users',href:'/workshop-management-home/?module=overview',className:'wm-role-super'},
    {key:'workshop',code:'WM',label:'Workshop Manager / Technical Dep',note:'Job Cards, technicians & repair control',href:'#workshop-manager',className:'wm-role-workshop'},
    {key:'technician',code:'TC',label:'Technician',note:'Diagnosis, repair, testing & updates',href:'/tech',className:'wm-role-technician'},
    {key:'procurement',code:'PR',label:'Procurement',note:'Purchasing, shortage & suppliers',href:'/belm-procurement/',className:'wm-role-procurement'},
    {key:'store',code:'SK',label:'Store Keeper',note:'Stock, tools, issue & return control',href:'/spare-parts-manager/?from=belm-workshop',className:'wm-role-store'},
    {key:'sales',code:'RS',label:'Registration & Sales',note:'Customers, requests, quotations & sales',href:'/workshop-management-home/?module=registration',className:'wm-role-sales'},
    {key:'finance',code:'FN',label:'Finance / Accounts',note:'Invoices, payments, VAT & petty cash',href:'/workshop-management-home/?module=finance',className:'wm-role-finance'},
    {key:'bank',code:'BC',label:'Bank Controller',note:'Protected balances and withdrawals',href:'/workshop-management-home/?module=bank',className:'wm-role-bank'},
    {key:'coordinator',code:'SC',label:'System Coordinator',note:'Portal, customer access & service settings',href:'/coordinator/',className:'wm-role-coordinator'},
  ];
  const navigation=sidebar.querySelector('.grid');
  if(navigation){
    navigation.setAttribute('aria-label','BELM role workspaces');
    navigation.innerHTML=roleWorkspaces.map(role=>`<a class="${role.className}${role.key===assignedRoleKey?' wm-role-active':''}" href="${role.href}"><i class="navicon">${role.code}</i><span class="wm-nav-copy"><b>${role.label}</b><small>${role.note}</small></span></a>`).join('');
  }

  const flow=document.querySelector('.workspace>.flow');
  if(flow){
    flow.id='workshop-manager';
    const dashboard=document.createElement('section');
    dashboard.className='wm-dashboard-hero';
    dashboard.innerHTML=`<div class="wm-dashboard-heading"><p>BELM COMPANY WORKSPACE</p><h1>BELM <em>OPERATIONS</em> DASHBOARD</h1><span>Live company operations and role-controlled workspaces.</span></div><div class="wm-dashboard-details"><div><small>LOCATION</small><b>Temeke, Dar es Salaam</b></div><div><small>CONTACT MAIL</small><b>info@belmgeneral.co.tz</b></div><div><small>PHONE</small><b>+255 713 309 529</b></div><div><small>YOUR ROLE</small><b>${escapeHtml(assignedRoleText)}</b></div></div><div class="wm-dashboard-strip"><article><span>ROLE WORKSPACES</span><strong>${roleWorkspaces.length}</strong><small>One entry for each BELM role</small></article><article><span>WORKSHOP CONTROL</span><strong>LIVE</strong><small>Job Card responsibility flow</small></article><article><span>ACCESS</span><strong>SECURE</strong><small>Role-based portal permissions</small></article></div>`;
    flow.before(dashboard);
  }
  document.title='BELM Operations Dashboard — PORTAL-BELM';

  const menuButton=document.createElement('button');
  menuButton.id='wmMenuButton';
  menuButton.className='wm-menu-button';
  menuButton.type='button';
  menuButton.textContent='☰';
  menuButton.setAttribute('aria-label','Open Workshop menu');
  menuButton.setAttribute('aria-controls','wmSidebar');
  menuButton.setAttribute('aria-expanded','false');

  const scrim=document.createElement('div');
  scrim.id='wmMenuScrim';
  scrim.className='wm-menu-scrim';
  scrim.hidden=true;

  const closeButton=document.createElement('button');
  closeButton.id='wmSidebarClose';
  closeButton.className='wm-side-close';
  closeButton.type='button';
  closeButton.textContent='×';
  closeButton.setAttribute('aria-label','Close BELM role menu');
  sidebar.querySelector('.head')?.append(closeButton);
  document.body.prepend(scrim);
  document.body.prepend(menuButton);

  const setOpen=open=>{
    document.body.classList.toggle('wm-menu-open',open);
    menuButton.setAttribute('aria-expanded',String(open));
    scrim.hidden=!open;
    if(open)closeButton.focus();
  };

  menuButton.addEventListener('click',()=>setOpen(true));
  closeButton.addEventListener('click',()=>setOpen(false));
  scrim.addEventListener('click',()=>setOpen(false));
  sidebar.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setOpen(false)));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('wm-menu-open'))setOpen(false);
  });
  window.addEventListener('resize',()=>{
    if(innerWidth>820){
      document.body.classList.remove('wm-menu-open');
      menuButton.setAttribute('aria-expanded','false');
      scrim.hidden=true;
    }
  });
})();
