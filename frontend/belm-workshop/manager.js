(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token){location.href='/login';return}

  let adminUser=null;try{adminUser=JSON.parse(localStorage.getItem('belm_admin_user')||'null')}catch{}
  const isSuperAdmin=adminUser?.role==='Super Admin'||adminUser?.allowedPages===null;
  const allowedPages=Array.isArray(adminUser?.allowedPages)?adminUser.allowedPages:[];
  const params=new URLSearchParams(location.search);
  const machine=params.get('machine')||'';
  const dialog=document.getElementById('workshopWindow');
  const frame=document.getElementById('workshopWindowFrame');
  const loading=document.getElementById('workshopWindowLoading');
  const title=document.getElementById('workshopWindowTitle');
  const subtitle=document.getElementById('workshopWindowSubtitle');
  const alertBox=document.getElementById('bwAlert');
  let activeKey='';

  const modules={
    'job-cards':{
      title:'Job Cards',
      subtitle:'Create, receive, assign and follow the live Digital Job Card process.',
      hash:'#job-cards',
      permissions:['roles','job-cards','service-requests'],
      url:()=>`/breakdown-workflow/?actor=admin&embed=1&view=job-cards${machine?`&machine=${encodeURIComponent(machine)}`:''}`
    },
    analysis:{
      title:'Workshop Analysis',
      subtitle:'Daily / monthly workshop performance using the same Job Card records.',
      hash:'#workshop-analysis',
      permissions:['roles','job-cards','service-requests'],
      url:()=>'/breakdown-workflow/?actor=admin&embed=1&view=analysis'
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
    const map={'job-cards':'job-cards','workshop-analysis':'analysis','store-spares':'store','tool-issue-documents':'tools','manage-technicians':'technicians','assigned-work':'assigned'};
    return map[h]||'';
  }
  function openModule(key,{pushHash=true}={}){
    const module=modules[key];if(!module)return;
    const permitted=isSuperAdmin||!module.permissions?.length||module.permissions.some(p=>allowedPages.includes(p));
    if(!permitted){show(`Your BELM role does not have access to ${module.title}.`,true);return}
    activeKey=key;
    title.textContent=module.title;
    subtitle.textContent=module.subtitle;
    loading.classList.remove('hidden');
    frame.src=module.url();
    if(pushHash && location.hash!==module.hash)history.replaceState(null,'',`${location.pathname}${location.search}${module.hash}`);
    if(!dialog.open)dialog.showModal();
    document.body.classList.add('bw-workspace-open');
  }
  function closeModule({clearHash=true}={}){
    if(dialog.open)dialog.close();
    document.body.classList.remove('bw-workspace-open');
    frame.src='about:blank';
    activeKey='';
    if(clearHash && location.hash)history.replaceState(null,'',`${location.pathname}${location.search}`);
  }

  document.querySelectorAll('[data-workshop-window]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();openModule(link.dataset.workshopWindow);
  }));
  document.getElementById('workshopWindowClose').addEventListener('click',()=>closeModule());
  document.getElementById('workshopWindowReload').addEventListener('click',()=>{
    if(!activeKey)return;
    loading.classList.remove('hidden');
    const current=frame.src;
    frame.src='about:blank';
    requestAnimationFrame(()=>{frame.src=current});
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

  window.addEventListener('hashchange',()=>{
    const key=keyFromHash(location.hash);
    if(key)openModule(key,{pushHash:false});
    else if(dialog.open)closeModule({clearHash:false});
  });

  const initialKey=keyFromHash(location.hash);
  if(initialKey)openModule(initialKey,{pushHash:false});
})();
