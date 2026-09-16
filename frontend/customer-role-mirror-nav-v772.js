(function(){
  'use strict';
  if(window.__belmCustomerRoleMirrorV772)return;
  window.__belmCustomerRoleMirrorV772=true;

  const path=location.pathname.replace(/\/+$/,'')+'/';
  if(path.startsWith('/customer-checkup/')||path.startsWith('/customer-workshop-checklists/')||path.startsWith('/concept-dashboards/08-daily-checklist/'))return;

  const icons={
    home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    machine:'<path d="M3 17l3-7h5l2 4h6l2 3"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>',
    job:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    tool:'<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>',
    users:'<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
    cart:'<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.5a2 2 0 002 1.5h8.4a2 2 0 002-1.6L21 7H6"/>',
    box:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    chart:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    money:'<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    message:'<path d="M4 4h16v12H8l-4 4V4z"/>',
    alert:'<path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6"/>',
    check:'<path d="M20 6L9 17l-5-5"/>'
  };
  const I=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icons[name]||icons.home}</svg>`;
  const item=(label,href,icon,role)=>({label,href,icon,role});

  const configs={
    '/customer-admin-dashboard/':[
      item('Dashboard','/customer-admin-dashboard/','home'),
      item('Customer Machines','/portal/dashboard?view=machines','machine'),
      item('Workshop Manager','/customer-workshop-manager/','tool','workshop_manager'),
      item('Technician','/customer-technician-dashboard/','tool','technician'),
      item('Operator','/customer-operator-dashboard/','machine','operator'),
      item('Roles & Users','/customer-users/','users'),
      item('Workshop & Job Cards','/breakdown-workflow/?actor=customer','job'),
      item('Spare Parts Inventory','/customer-store/','box','store_keeper'),
      item('Procurement','/customer-procurement-dashboard/','cart','procurement'),
      item('Store Keeper','/customer-store-dashboard/','box','store_keeper'),
      item('Finance / Accounts','/customer-finance/','money','accounts'),
      item('Communication','/role-communications/','message'),
      item('Reports & Analysis','/general-analysis/?module=overview&analysisOnly=1','chart'),
      item('System Settings','/customer-settings-center/','settings','settings')
    ],
    '/customer-workshop-manager/':[
      item('Home Dashboard','/customer-workshop-manager/','home'),
      item('Job Cards','/breakdown-workflow/?actor=customer','job'),
      item('Machines','/portal/dashboard?view=machines','machine'),
      item('Technicians','/customer-technicians/','users'),
      item('Inspection & Repair','/customer-inspection-repair/','tool'),
      item('My Reports','/role-reports/','chart'),
      item('Checklist Monitoring','/customer-workshop-checklists/','check'),
      item('Communication','/role-communications/','message'),
      item('Tools & Equipment','/customer-tools-register/','tool'),
      item('Workshop Settings','/customer-settings-center/','settings')
    ],
    '/customer-technician-dashboard/':[
      item('Home','/customer-technician-dashboard/','home'),
      item('My Job Cards','/technician-job-cards/','job'),
      item('Customer Machines','/portal/dashboard?view=machines','machine'),
      item('Daily Checklists','/customer-checkup/','check'),
      item('Communication','/role-communications/','message'),
      item('My Reports','/role-reports/','chart'),
      item('My Profile','/portal-v2/','users')
    ],
    '/customer-procurement-dashboard/':[
      item('Home','/customer-procurement-dashboard/','home'),
      item('Spare Purchase Requests','/customer-procurement-workspace/?view=queue','job'),
      item('Purchase Records','/customer-procurement-workspace/?view=records','job'),
      item('Pending Proforma','/customer-procurement-workspace/?view=proforma','job'),
      item('Purchase Orders','/customer-procurement-workspace/?view=orders','cart'),
      item('Suppliers','/customer-procurement-workspace/?view=suppliers','users'),
      item('Delivery Tracking','/customer-procurement-workspace/?view=delivery','machine'),
      item('My Reports','/role-reports/','chart'),
      item('Department Analysis','/general-analysis/?module=procurement&analysisOnly=1','chart'),
      item('My Profile','/portal-v2/','users')
    ],
    '/customer-store-dashboard/':[
      item('Home','/customer-store-dashboard/','home'),
      item('Spare Parts Inventory','/customer-store/#stockRows','box'),
      item('Stock In','/customer-store/#receiveBtn','box'),
      item('Spare Requests','/customer-store/#requestRows','job'),
      item('Low Stock & Shortages','/customer-store-dashboard/#alertList','alert'),
      item('Tools Register','/customer-tools-register/','tool'),
      item('Stock Audit','/customer-store-audit/','chart'),
      item('My Reports','/role-reports/','chart'),
      item('Department Analysis','/general-analysis/?module=store&analysisOnly=1','chart'),
      item('My Profile','/portal-v2/','users')
    ],
    '/customer-operator-dashboard/':[
      item('Home','/customer-operator-dashboard/','home'),
      item('My Machine','/customer-operator-dashboard/#machineLabel','machine'),
      item('Operation & Daily Check','/operator/','check'),
      item('Machine Alerts','/customer-operator-dashboard/#alertList','alert'),
      item('Communication','/role-communications/','message'),
      item('Operator Reports','/role-reports/','chart')
    ]
  };

  const cfg=configs[path];
  if(!cfg)return;
  const nav=document.querySelector('.belm-nav,.sidebar-nav');
  if(!nav)return;
  const cls=nav.classList.contains('sidebar-nav')?'nav-item':'belm-nav__item';
  nav.innerHTML=cfg.map((x,n)=>`<a href="${x.href}" class="${cls}${n===0?' is-active':''}"${x.role?` data-customer-role="${x.role}"`:''}>${I(x.icon)}${x.label}</a>`).join('');
})();
