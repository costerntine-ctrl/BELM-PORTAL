(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token){location.href='/login';return}

  let adminUser=null;try{adminUser=JSON.parse(localStorage.getItem('belm_admin_user')||'null')}catch{}
  const isSuperAdmin=adminUser?.role==='Super Admin'||adminUser?.allowedPages===null;
  const adminRole=String(adminUser?.role||'').toLowerCase();
  const isWorkshopController=['super admin','engineer','workshop manager'].includes(adminRole);
  const isProcurementController=adminRole==='procurement';
  const allowedPages=Array.isArray(adminUser?.allowedPages)?adminUser.allowedPages:[];
  const params=new URLSearchParams(location.search);
  const machine=params.get('machine')||'';
  let activeMachine=machine;
  const dialog=document.getElementById('workshopWindow');
  const frame=document.getElementById('workshopWindowFrame');
  const loading=document.getElementById('workshopWindowLoading');
  const title=document.getElementById('workshopWindowTitle');
  const subtitle=document.getElementById('workshopWindowSubtitle');
  const alertBox=document.getElementById('bwAlert');
  const customerOverviewAction=document.querySelector('.bw-customer-overview-action');
  if(customerOverviewAction && !isSuperAdmin && !allowedPages.includes('customers')) customerOverviewAction.hidden=true;
  let activeKey='';

  const modules={
    'job-cards':{
      title:'Job Cards',
      subtitle:'Create, receive, assign and follow the live Digital Job Card process.',
      hash:'#job-cards',
      permissions:['roles','job-cards','service-requests'],
      url:()=>`/breakdown-workflow/?actor=admin&embed=1&view=job-cards${activeMachine?`&machine=${encodeURIComponent(activeMachine)}`:''}`
    },
    analysis:{
      title:'Workshop Analysis',
      subtitle:'Daily / monthly workshop performance using the same Job Card records.',
      hash:'#workshop-analysis',
      permissions:['roles','job-cards','service-requests'],
      url:()=>'/breakdown-workflow/?actor=admin&embed=1&view=analysis'
    },
    procurement:{
      title:'BELM Procurement',
      subtitle:'Supplier sourcing, Accounts / PI handoff, purchase order tracking and Store handover.',
      hash:'#procurement',
      permissions:['spare-parts','suppliers','job-cards','service-requests'],
      namedAccess:'procurement-controller',
      url:()=>'/belm-procurement/?embed=1'
    },
    suppliers:{
      title:'Supplier Directory',
      subtitle:'BELM supplier directory for sourcing and procurement decisions.',
      hash:'#suppliers',
      permissions:['suppliers'],
      namedAccess:'procurement-controller',
      url:()=>'/belm-procurement/?embed=1#suppliers'
    },
    store:{
      title:'Store & Spare Parts',
      subtitle:'BELM workshop inventory, spare requests, stock and equivalent parts.',
      hash:'#store-spares',
      permissions:['spare-parts'],
      url:()=>'/spare-parts-manager/?embed=1&from=belm-workshop'
    },
    tools:{
      title:'Tool Issue Documents',
      subtitle:'Issue BELM workshop tools to Technicians and record every return.',
      hash:'#tool-issue-documents',
      permissions:['roles','job-cards','service-requests','spare-parts'],
      url:()=>'/belm-workshop/tool-issues/?embed=1'
    },
    'delivery-notes':{
      title:'Delivery Notes',
      subtitle:'Prepare, sign, store, print and manage customer Delivery Note records.',
      hash:'#delivery-notes',
      permissions:['roles','job-cards','service-requests','spare-parts'],
      url:()=>'/delivery-notes/?embed=1'
    },
    technicians:{
      title:'Manage Technicians',
      subtitle:'BELM Technician users, roles and customer assignment.',
      hash:'#manage-technicians',
      permissions:['roles'],
      url:()=>'/roles-manager/?embed=1&from=belm-workshop&role=Technician&technical=1'
    },
    assigned:{
      title:'Assigned Work',
      subtitle:'Live Job Card process and Technician workload without leaving BELM Workshop.',
      hash:'#assigned-work',
      permissions:['roles','job-cards','service-requests'],
      url:()=>'/breakdown-workflow/?actor=admin&embed=1&view=assigned'
    },
    'customer-overview':{
      title:'Customer Overview',
      subtitle:'Customers, machine fleet and service controls inside PORTAL-BELM WM.',
      hash:'#customer-overview',
      permissions:['customers'],
      url:()=>'/customers-manager/?embed=1&from=belm-workshop'
    },
    'checklist-template':{
      title:'Checklist Template',
      subtitle:'Create, edit and maintain machine inspection Checklist Templates inside PORTAL-BELM WM.',
      hash:'#checklist-template',
      permissions:['checklist-templates'],
      url:()=>'/checklist-manager/?embed=1&from=belm-workshop'
    },
    'general-report':{
      title:'General Report',
      subtitle:'BELM workshop and customer service reports inside the Workshop workspace.',
      hash:'#general-report',
      permissions:['reports'],
      url:()=>'/reports-manager/?embed=1&from=belm-workshop'
    },
    'petty-cash':{
      title:'Petty Cash',
      subtitle:'Customer-linked Petty Cash balances and top-ups using the shared portal records.',
      hash:'#petty-cash',
      permissions:['customers'],
      namedAccess:'workshop-controller',
      url:()=>'/belm-workshop/petty-cash/?embed=1'
    },
    'general-analysis':{
      title:'General Analysis',
      subtitle:'BELM operational overview and performance analysis inside the Workshop workspace.',
      hash:'#general-analysis',
      permissions:['overview','customers','reports'],
      url:()=>'/overview-manager/?embed=1&from=belm-workshop'
    },
    settings:{
      title:'Settings',
      subtitle:'BELM portal and Workshop settings without leaving the Workshop shell.',
      hash:'#settings',
      permissions:['settings'],
      url:()=>'/settings-manager/?embed=1&from=belm-workshop'
    }
  };

  function show(message,error=false){
    alertBox.textContent=message;
    alertBox.className=`bw-alert${error?' error':''}`;
    clearTimeout(show.timer);
    show.timer=setTimeout(()=>alertBox.classList.add('hidden'),4200);
  }
  function keyFromHash(hash){
    const h=String(hash||'').replace(/^#/,'').toLowerCase();
    const map={'job-cards':'job-cards','workshop-analysis':'analysis','procurement':'procurement','suppliers':'suppliers','store-spares':'store','tool-issue-documents':'tools','manage-technicians':'technicians','delivery-notes':'delivery-notes','assigned-work':'assigned','general-report':'general-report','petty-cash':'petty-cash','general-analysis':'general-analysis','settings':'settings','customer-overview':'customer-overview','checklist-template':'checklist-template'};
    return map[h]||'';
  }
  function openModule(key,{pushHash=true,machineId=''}={}){
    const module=modules[key];if(!module)return;
    const namedPermitted=(module.namedAccess==='workshop-controller'&&isWorkshopController)||(module.namedAccess==='procurement-controller'&&isProcurementController);
    const permitted=isSuperAdmin||namedPermitted||!module.permissions?.length||module.permissions.some(p=>allowedPages.includes(p));
    if(!permitted){show(`Your BELM role does not have access to ${module.title}.`,true);return}
    const wasWorkspaceOpen=dialog.open||!!activeKey;
    activeKey=key;
    if(machineId) activeMachine=machineId;
    title.textContent=module.title;
    subtitle.textContent=module.subtitle;
    loading.classList.remove('hidden');
    // V494: never navigate through about:blank. It causes a visible white
    // frame between Workshop modules on dark displays. Remove any temporary
    // srcdoc and navigate directly to the real module.
    frame.removeAttribute('srcdoc');
    frame.src=module.url();
    if(pushHash && location.hash!==module.hash){
      const nextUrl=`${location.pathname}${location.search}${module.hash}`;
      if(wasWorkspaceOpen && history.state?.belmWorkshopModule) history.replaceState({belmWorkshopModule:key},'',nextUrl);
      else history.pushState({belmWorkshopModule:key},'',nextUrl);
    }
    if(!dialog.open)dialog.showModal();
    document.body.classList.add('bw-workspace-open');
  }
  function resetWorkspace(){
    // V494: Back must be deterministic. Close the workspace immediately and
    // leave the user on the BELM Main Home (PORTAL-BELM WM), instead of relying on browser
    // history state that can be stale after refresh/back-forward cache restores.
    if(dialog.open)dialog.close();
    document.body.classList.remove('bw-workspace-open');
    activeKey='';
    activeMachine=machine;
  }
  function closeModule({clearHash=true}={}){
    resetWorkspace();
    if(clearHash && location.hash){
      history.replaceState(null,'',`${location.pathname}${location.search}`);
    }
  }

  document.querySelectorAll('[data-workshop-window]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();openModule(link.dataset.workshopWindow);
  }));
  document.getElementById('workshopWindowClose').addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopPropagation();
    closeModule();
  });
  document.getElementById('workshopWindowReload').addEventListener('click',()=>{
    if(!activeKey)return;
    loading.classList.remove('hidden');
    // V494: reloading through about:blank produced the white page the user
    // could see. Reload the current same-origin module in place.
    try{
      frame.contentWindow.location.reload();
    }catch(_){
      const current=modules[activeKey]?.url?.() || frame.src;
      const next=new URL(current,location.origin);
      next.searchParams.set('_sync',String(Date.now()));
      frame.removeAttribute('srcdoc');
      frame.src=next.pathname+next.search+next.hash;
    }
  });
  frame.addEventListener('load',()=>{
    if(frame.src==='about:blank')return;
    loading.classList.add('hidden');
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeModule()});
  dialog.addEventListener('close',()=>document.body.classList.remove('bw-workspace-open'));
  document.getElementById('workshopSyncButton').addEventListener('click',()=>{
    if(activeKey){loading.classList.remove('hidden');frame.contentWindow?.location?.reload();show('Workshop module synchronized.');return}
    show('Workshop is connected to the live BELM operational database. Open a module and use Sync / Refresh for its latest records.');
  });

  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='belm-engineering-open-service-requests'||event.data?.type==='belm-workshop-back-home'){closeModule();return}
    if(event.data?.type==='belm-workshop-open-module'&&event.data?.module)openModule(String(event.data.module),{machineId:String(event.data.machine||'')});
  });

  function syncWorkspaceFromLocation(){
    const key=keyFromHash(location.hash);
    if(key){
      if(activeKey!==key || !dialog.open) openModule(key,{pushHash:false});
      return;
    }
    if(dialog.open || activeKey) resetWorkspace();
  }
  window.addEventListener('hashchange',syncWorkspaceFromLocation);
  window.addEventListener('popstate',syncWorkspaceFromLocation);

  const initialKey=keyFromHash(location.hash);
  if(initialKey)openModule(initialKey,{pushHash:false});
})();
