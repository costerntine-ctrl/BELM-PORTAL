(function(){
  'use strict';
  const q=new URLSearchParams(location.search);
  if(!/^\/portal\/dashboard\/?$/.test(location.pathname)||q.get('view')!=='machines'||!localStorage.getItem('belm_customer_token'))return;
  const items=[
    ['machines','🏗️','Customer Machines','/portal/dashboard?view=machines'],
    ['jobs','📋','Open Job Cards','/breakdown-workflow/?actor=customer'],
    ['store','📦','Store & Spares','/customer-store/'],
    ['procurement','🛒','Procurement','/customer-procurement-home/'],
    ['technicians','👥','Technicians','/customer-technicians/'],
    ['analysis','📈','Workshop Analysis','/workshop-analysis/'],
    ['reports','📄','General Report','/general-report/'],
    ['petty','👛','Petty Cash','/customer-petty-cash/'],
    ['general','📊','General Analysis','/general-analysis/'],
    ['settings','⚙️','Settings','/customer-settings-center/']
  ];
  const shade=document.createElement('div');shade.className='cwm-machine-shade';
  const menu=document.createElement('button');menu.type='button';menu.className='cwm-machine-menu';menu.setAttribute('aria-expanded','false');menu.innerHTML='<b>☰</b> Menu';
  const side=document.createElement('aside');side.className='cwm-machine-side';side.setAttribute('aria-label','Coordinator navigation');side.innerHTML='<button class="cwm-machine-side-close" type="button" aria-label="Close menu">×</button><div class="cwm-machine-side-head"><small>WORKSHOP CONTROL</small><strong id="cwmMachineSideTitle">Coordinator Menu</strong></div><nav>'+items.map(x=>`<a data-side-key="${x[0]}" class="${x[0]==='machines'?'is-active':''}" href="${x[3]}"><i>${x[1]}</i>${x[2]}</a>`).join('')+'</nav>';
  document.body.append(shade,menu,side);document.body.classList.add('cwm-machine-sidebar-ready');
  const setOpen=open=>{side.classList.toggle('is-open',open);shade.classList.toggle('is-open',open);menu.setAttribute('aria-expanded',String(open));document.body.style.overflow=open?'hidden':''};
  menu.onclick=()=>setOpen(true);shade.onclick=()=>setOpen(false);side.querySelector('.cwm-machine-side-close').onclick=()=>setOpen(false);side.querySelectorAll('a').forEach(a=>a.onclick=()=>setOpen(false));addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});addEventListener('resize',()=>{if(innerWidth>900)setOpen(false)});
  fetch('/api/customer-portal/dashboard',{cache:'no-store',headers:{Authorization:`Bearer ${localStorage.getItem('belm_customer_token')}`}}).then(r=>r.ok?r.json():null).then(d=>{if(!d)return;const p=d.customer||{},role=String(p.actorRole||'assistant').toLowerCase().replace(/\s+/g,'_'),owner=['owner','admin'].includes(role),manager=owner||role==='workshop_manager';document.getElementById('cwmMachineSideTitle').textContent=(p.name||'Customer')+' Menu';const show=(k,on)=>{const a=side.querySelector(`[data-side-key="${k}"]`);if(a)a.hidden=!on};show('jobs',manager);show('store',owner||['store_keeper','workshop_manager','procurement'].includes(role));show('procurement',owner||['procurement','workshop_manager'].includes(role));show('technicians',!p.belmServiceProviderActive&&manager);show('analysis',manager);show('reports',role!=='operator');show('petty',owner||role==='accounts');show('general',owner||['workshop_manager','accounts'].includes(role));show('settings',manager)}).catch(()=>{});
})();
