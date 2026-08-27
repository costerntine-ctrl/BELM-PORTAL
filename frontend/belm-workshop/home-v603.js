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
  if(mainMenuBack){mainMenuBack.hidden=!isMainBelmAccount;mainMenuBack.style.display=isMainBelmAccount?'inline-flex':'none';if(isMainBelmAccount)mainMenuBack.setAttribute('href','/overview-manager/');}
  document.getElementById('bwLogoutButton')?.addEventListener('click',()=>{localStorage.removeItem('belm_admin_token');localStorage.removeItem('belm_admin_user');localStorage.removeItem('belm_active_account_type');location.replace('/login');});

  const root=document.querySelector('.bw-home-message-v603');
  if(!root)return;
  const titleEl=root.querySelector('[data-bw-message-title]'),textEl=root.querySelector('[data-bw-message-text]'),byEl=root.querySelector('[data-bw-message-by]'),dots=root.querySelector('[data-bw-message-dots]'),heading=root.querySelector('.cwm-alert-heading-v610 span');
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const machineLabel=machine=>{const name=[machine.brand,machine.model].filter(Boolean).join(' ').trim()||machine.machineType||'Machine';const fleet=machine.fleetNumber||machine.regNumber||machine.serialNumber||'';return fleet?`${name} · Fleet ${fleet}`:name;};
  const isDontOperate=value=>/DON'?T\s*OPERATE|DO\s*NOT\s*OPERATE|STOPPED|OUT\s*OF\s*SERVICE|BREAKDOWN|NOT\s*OPERATIONAL|NOT\s*WORKING/i.test(String(value||''));

  const buildMessages=machines=>{
    const rows=[];
    (Array.isArray(machines)?machines:[]).forEach(machine=>{
      const title=machineLabel(machine),customer=machine.customerName?` · ${machine.customerName}`:'';
      const operational=String(machine.operationalStatus||machine.status||'').trim();
      const operationalNote=String(machine.operationalStatusNote||'').trim();
      const operatorText=String(machine.operatorMessage||'').trim(),operatorStatus=String(machine.operatorStatus||'').trim().toUpperCase();
      const serviceKit=String(machine.serviceKit||'').trim().toUpperCase(),openJobs=Number(machine.openJobCards||0),pendingSpares=Number(machine.pendingSpares||0),latestJob=String(machine.latestJobStatus||'').trim();
      if(isDontOperate(`${operational} ${operationalNote}`)) rows.push({priority:100,type:'danger',blink:true,title,text:`DON'T OPERATE${operationalNote?` — ${operationalNote}`:''}`,by:`Machine Operational Status${customer}`});
      else if(operational&&!/OPERATE|OPERATIONAL|WORKING|ACTIVE|NORMAL|GOOD|OK/i.test(operational)) rows.push({priority:80,type:'warning',title,text:`Machine status: ${operational}${operationalNote?` — ${operationalNote}`:''}`,by:`Machine Operational Status${customer}`});
      if(operatorText){const danger=isDontOperate(`${operatorStatus} ${operatorText}`)||/critical|danger|fault|failed|urgent/i.test(`${operatorStatus} ${operatorText}`);rows.push({priority:danger?90:50,type:danger?'danger':'warning',blink:danger,title,text:operatorText,by:`Operator Report${machine.operatorName?` · ${machine.operatorName}`:''}${customer}`});}
      if(openJobs>0)rows.push({priority:40,type:'warning',title,text:`${openJobs} open Job Card${openJobs===1?'':'s'}${latestJob?` · Latest status: ${latestJob}`:''}.`,by:`Job Card Movement${customer}`});
      if(pendingSpares>0)rows.push({priority:35,type:'warning',title,text:`${pendingSpares} spare request${pendingSpares===1?' is':'s are'} waiting for action.`,by:`Store / Procurement${customer}`});
      if(/NEW|DUE|OVERDUE|REQUIRED/i.test(serviceKit))rows.push({priority:/OVERDUE/i.test(serviceKit)?70:30,type:/OVERDUE/i.test(serviceKit)?'danger':'warning',title,text:`Service status: ${serviceKit}.`,by:`Service Tracking${customer}`});
    });
    rows.sort((a,b)=>(b.priority||0)-(a.priority||0));
    if(!rows.length&&Array.isArray(machines)&&machines.length)machines.slice(0,6).forEach(machine=>rows.push({priority:0,type:'good',title:machineLabel(machine),text:'No active alert is currently recorded for this machine.',by:`Live Machine Status${machine.customerName?` · ${machine.customerName}`:''}`}));
    return rows.length?rows:[...fallbackMessages];
  };

  const render=()=>{if(!homeMessages.length)homeMessages=[...fallbackMessages];if(index>=homeMessages.length)index=0;const item=homeMessages[index];root.dataset.alertType=item.type||'info';root.classList.toggle('is-critical-blink',!!item.blink);if(heading)heading.textContent=item.type==='good'?'✓':'⚠';if(titleEl)titleEl.textContent=item.title||'MACHINE ALERT';if(textEl)textEl.textContent=item.text||'';if(byEl)byEl.textContent=`— ${item.by}`;if(dots){dots.innerHTML=homeMessages.map((_,i)=>`<button type="button" aria-label="Machine alert ${i+1}" class="${i===index?'active':''}" data-bw-dot="${i}"></button>`).join('');dots.querySelectorAll('[data-bw-dot]').forEach(button=>button.addEventListener('click',()=>{index=Number(button.dataset.bwDot);render();restart();}));}};
  const next=()=>{index=(index+1)%homeMessages.length;render();},prev=()=>{index=(index-1+homeMessages.length)%homeMessages.length;render();},restart=()=>{if(timer)clearInterval(timer);timer=setInterval(next,6500);};
  const loadAlerts=async(showError=false)=>{const token=localStorage.getItem('belm_admin_token')||'';if(!token)return;try{const response=await fetch('/api/belm-workshop-home',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error||`Request failed (${response.status})`);homeMessages=buildMessages(data?.machines||[]);index=0;render();restart();}catch(error){if(showError){const box=document.getElementById('bwAlert');if(box){box.textContent=`Could not refresh machine alerts: ${escapeHtml(error.message)}`;box.classList.remove('hidden');box.classList.add('error');}}}};
  root.querySelector('[data-bw-message-next]')?.addEventListener('click',()=>{next();restart();});root.querySelector('[data-bw-message-prev]')?.addEventListener('click',()=>{prev();restart();});document.getElementById('workshopSyncButton')?.addEventListener('click',()=>loadAlerts(true));render();restart();loadAlerts(false);refreshTimer=setInterval(()=>loadAlerts(false),30000);window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer);if(refreshTimer)clearInterval(refreshTimer);});
})();