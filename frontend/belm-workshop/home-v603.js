(()=>{
  const fallbackMessages=[
    {type:'info',title:'WORKSHOP STATUS',text:'No active machine alert is currently recorded.',by:'BELM Workshop'},
    {type:'info',title:'WORKSHOP CONTROL',text:'Every Job Card must have a clear owner, status and next action.',by:'BELM Workshop'}
  ];
  let homeMessages=[...fallbackMessages];
  let index=0,timer=null,refreshTimer=null;

  const mainMenuBack=document.getElementById('mainMenuBackButton');
  let currentUser=null;
  try{currentUser=JSON.parse(localStorage.getItem('belm_admin_user')||'null');}catch(_){ }
  const role=String(currentUser?.role||'').trim().toLowerCase();
  const isMainBelmAccount=role==='super admin'||currentUser?.allowedPages===null;
  if(mainMenuBack){
    mainMenuBack.hidden=!isMainBelmAccount;
    mainMenuBack.style.display=isMainBelmAccount?'inline-flex':'none';
    if(isMainBelmAccount)mainMenuBack.setAttribute('href','/overview-manager/');
  }

  document.getElementById('bwLogoutButton')?.addEventListener('click',()=>{
    localStorage.removeItem('belm_admin_token');
    localStorage.removeItem('belm_admin_user');
    localStorage.removeItem('belm_active_account_type');
    location.replace('/login');
  });

  const root=document.querySelector('.bw-home-message-v603');
  if(!root)return;
  const textEl=root.querySelector('[data-bw-message-text]');
  const byEl=root.querySelector('[data-bw-message-by]');
  const dots=root.querySelector('[data-bw-message-dots]');
  const quote=root.querySelector('.bw-home-quote-mark-v603');

  const machineLabel=(machine)=>{
    const name=[machine.brand,machine.model].filter(Boolean).join(' ').trim()||machine.machineType||'Machine';
    const fleet=machine.fleetNumber||machine.regNumber||machine.serialNumber||'';
    return fleet?`${name} · Fleet ${fleet}`:name;
  };

  const buildMessages=(machines)=>{
    const rows=[];
    (Array.isArray(machines)?machines:[]).forEach(machine=>{
      const title=machineLabel(machine);
      const customer=machine.customerName?` · ${machine.customerName}`:'';
      const operatorText=String(machine.operatorMessage||'').trim();
      const operatorStatus=String(machine.operatorStatus||'').trim().toUpperCase();
      const serviceKit=String(machine.serviceKit||'').trim().toUpperCase();
      const openJobs=Number(machine.openJobCards||0);
      const pendingSpares=Number(machine.pendingSpares||0);
      const latestJob=String(machine.latestJobStatus||'').trim();

      if(operatorText){
        const danger=/critical|stop|stopped|breakdown|danger|fault|failed|urgent|not working/i.test(`${operatorStatus} ${operatorText}`);
        rows.push({type:danger?'danger':'warning',title,text:operatorText,by:`Operator Report${machine.operatorName?` · ${machine.operatorName}`:''}${customer}`});
      }
      if(openJobs>0){
        rows.push({type:'warning',title,text:`${openJobs} open Job Card${openJobs===1?'':'s'}${latestJob?` · Latest status: ${latestJob}`:''}.`,by:`Job Card Movement${customer}`});
      }
      if(pendingSpares>0){
        rows.push({type:'warning',title,text:`${pendingSpares} spare request${pendingSpares===1?' is':'s are'} waiting for action.`,by:`Store / Procurement${customer}`});
      }
      if(/NEW|DUE|OVERDUE|REQUIRED/i.test(serviceKit)){
        rows.push({type:/OVERDUE/i.test(serviceKit)?'danger':'warning',title,text:`Service status: ${serviceKit}.`,by:`Service Tracking${customer}`});
      }
    });
    if(!rows.length && Array.isArray(machines) && machines.length){
      machines.slice(0,6).forEach(machine=>rows.push({type:'good',title:machineLabel(machine),text:'No active alert is currently recorded for this machine.',by:`Live Machine Status${machine.customerName?` · ${machine.customerName}`:''}`}));
    }
    return rows.length?rows:[...fallbackMessages];
  };

  const render=()=>{
    if(!homeMessages.length)homeMessages=[...fallbackMessages];
    if(index>=homeMessages.length)index=0;
    const item=homeMessages[index];
    root.dataset.alertType=item.type||'info';
    if(quote)quote.textContent=item.type==='good'?'✓':'⚠';
    if(textEl)textEl.innerHTML=`<span class="bw-alert-title-v614">${String(item.title||'MACHINE ALERT').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span><span class="bw-alert-text-v614">${String(item.text||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</span>`;
    if(byEl)byEl.textContent=`— ${item.by}`;
    if(dots){
      dots.innerHTML=homeMessages.map((_,i)=>`<button type="button" aria-label="Machine alert ${i+1}" class="${i===index?'active':''}" data-bw-dot="${i}"></button>`).join('');
      dots.querySelectorAll('[data-bw-dot]').forEach(button=>button.addEventListener('click',()=>{index=Number(button.dataset.bwDot);render();restart();}));
    }
  };

  const next=()=>{index=(index+1)%homeMessages.length;render();};
  const prev=()=>{index=(index-1+homeMessages.length)%homeMessages.length;render();};
  const restart=()=>{if(timer)clearInterval(timer);timer=setInterval(next,6500);};

  const loadAlerts=async(showError=false)=>{
    const token=localStorage.getItem('belm_admin_token')||'';
    if(!token)return;
    try{
      const response=await fetch('/api/belm-workshop-home',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error||`Request failed (${response.status})`);
      homeMessages=buildMessages(data?.machines||[]);
      index=0;
      render();
      restart();
    }catch(error){
      if(showError){
        const box=document.getElementById('bwAlert');
        if(box){box.textContent=`Could not refresh machine alerts: ${error.message}`;box.classList.remove('hidden');box.classList.add('error');}
      }
    }
  };

  root.querySelector('[data-bw-message-next]')?.addEventListener('click',()=>{next();restart();});
  root.querySelector('[data-bw-message-prev]')?.addEventListener('click',()=>{prev();restart();});
  document.getElementById('workshopSyncButton')?.addEventListener('click',()=>loadAlerts(true));

  render();
  restart();
  loadAlerts(false);
  refreshTimer=setInterval(()=>loadAlerts(false),30000);
  window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);if(refreshTimer)clearInterval(refreshTimer);});
})();
