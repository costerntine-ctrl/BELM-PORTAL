(function(){
  'use strict';
  const q=new URLSearchParams(location.search);
  if(!/^\/portal\/dashboard\/?$/.test(location.pathname)||q.get('view')!=='machines'||!localStorage.getItem('belm_customer_token'))return;
  const items=[
    ['machines','MC','Customer Machines','/portal/dashboard?view=machines'],
    ['jobs','JC','Open Job Cards','/breakdown-workflow/?actor=customer'],
    ['store','ST','Store & Spares','/customer-store/'],
    ['procurement','PR','Procurement','/customer-procurement-home/'],
    ['technicians','TC','Technicians','/customer-technicians/'],
    ['analysis','WA','Workshop Analysis','/workshop-analysis/'],
    ['reports','GR','General Report','/general-report/'],
    ['petty','PC','Petty Cash','/customer-petty-cash/'],
    ['general','GA','General Analysis','/general-analysis/'],
    ['settings','SE','Settings','/customer-settings-center/']
  ];
  // V700: same thin outline icon set as admin-sidebar.js, matched by key.
  const ICONS={
    machines:'<svg viewBox="0 0 20 20"><rect x="2.5" y="2.5" width="6" height="6" rx="1.3"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.3"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.3"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.3"/></svg>',
    jobs:'<svg viewBox="0 0 20 20"><path d="M13.5 3.5a4 4 0 0 0-5.4 4.6L3 13.2V17h3.8l5.1-5.1a4 4 0 0 0 4.6-5.4l-2.8 2.8-2-2z"/></svg>',
    store:'<svg viewBox="0 0 20 20"><path d="M10 2.5 17 6v8l-7 3.5L3 14V6z"/><path d="M3 6l7 3.5M17 6l-7 3.5M10 9.5V17"/></svg>',
    procurement:'<svg viewBox="0 0 20 20"><path d="M2 6h9v7H2z"/><path d="M11 9h4l3 3v1h-7z"/><circle cx="5.5" cy="15" r="1.5"/><circle cx="14.5" cy="15" r="1.5"/></svg>',
    technicians:'<svg viewBox="0 0 20 20"><circle cx="6.5" cy="6.5" r="2.7"/><circle cx="14" cy="7" r="2.3"/><path d="M2 17c0-2.8 2-4.7 4.5-4.7s4.5 1.9 4.5 4.7M11.5 17c0-2.3 1.7-4 4-4s4 1.7 4 4"/></svg>',
    analysis:'<svg viewBox="0 0 20 20"><path d="M3 17V9M9 17V3M15 17v-6"/></svg>',
    reports:'<svg viewBox="0 0 20 20"><path d="M3 17V9M9 17V3M15 17v-6"/></svg>',
    petty:'<svg viewBox="0 0 20 20"><path d="M5 2.5h10v15l-2-1.3-1.7 1.3-1.3-1.3-1.3 1.3-1.7-1.3-2 1.3z"/><path d="M7.5 7h5M7.5 10h5M10 6v2m0 3v1"/></svg>',
    general:'<svg viewBox="0 0 20 20"><path d="M3 17V9M9 17V3M15 17v-6"/></svg>',
    settings:'<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2.2M10 15.2v2.2M17.4 10h-2.2M4.8 10H2.6M15.1 4.9l-1.6 1.6M6.5 13.5l-1.6 1.6M15.1 15.1l-1.6-1.6M6.5 6.5 4.9 4.9"/></svg>'
  };
  const shade=document.createElement('div');shade.className='cwm-machine-shade';
  const menu=document.createElement('button');menu.type='button';menu.className='cwm-machine-menu';menu.setAttribute('aria-expanded','false');menu.innerHTML='<b>&#9776;</b> Menu';
  const side=document.createElement('aside');side.className='cwm-machine-side';side.setAttribute('aria-label','Coordinator navigation');side.innerHTML='<button class="cwm-machine-side-close" type="button" aria-label="Close menu">&times;</button><div class="cwm-machine-side-head"><small>WORKSHOP CONTROL</small><strong id="cwmMachineSideTitle">Coordinator Menu</strong></div><nav>'+items.map((x,i)=>`<a data-side-key="${x[0]}" class="${x[0]==='machines'?'is-active':''}" href="${x[3]}"><span class="cwm-num">${i+1}</span><i>${ICONS[x[0]]||''}</i><span>${x[2]}</span></a>`).join('')+'</nav>';
  document.body.append(shade,menu,side);document.body.classList.add('cwm-machine-sidebar-ready');
  const setOpen=open=>{side.classList.toggle('is-open',open);shade.classList.toggle('is-open',open);menu.setAttribute('aria-expanded',String(open));document.body.style.overflow=open?'hidden':''};
  menu.onclick=()=>setOpen(true);shade.onclick=()=>setOpen(false);side.querySelector('.cwm-machine-side-close').onclick=()=>setOpen(false);side.querySelectorAll('a').forEach(a=>a.onclick=()=>setOpen(false));addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});addEventListener('resize',()=>{if(innerWidth>900)setOpen(false)});
  fetch('/api/customer-portal/dashboard',{cache:'no-store',headers:{Authorization:`Bearer ${localStorage.getItem('belm_customer_token')}`}}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;const p=d.customer||{},role=String(p.actorRole||'assistant').toLowerCase().replace(/\s+/g,'_'),owner=['owner','admin'].includes(role),manager=owner||role==='workshop_manager';document.getElementById('cwmMachineSideTitle').textContent=(p.name||'Customer')+' Menu';const show=(k,on)=>{const a=side.querySelector(`[data-side-key="${k}"]`);if(a)a.hidden=!on};show('jobs',manager);show('store',owner||['store_keeper','workshop_manager','procurement'].includes(role));show('procurement',owner||['procurement','workshop_manager'].includes(role));show('technicians',!p.belmServiceProviderActive&&manager);show('analysis',manager);show('reports',role!=='operator');show('petty',owner||role==='accounts');show('general',owner||['workshop_manager','accounts'].includes(role));show('settings',manager)}).catch(()=>{});
})();
