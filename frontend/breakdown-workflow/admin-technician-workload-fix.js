(()=>{
  const params=new URLSearchParams(location.search);
  const isAdminAssigned=params.get('embed')==='1'&&String(params.get('actor')||params.get('source')||'').toLowerCase()==='admin'&&String(params.get('view')||'').toLowerCase()==='assigned';
  if(!isAdminAssigned)return;

  const panel=document.getElementById('technicianWorkloadPanel');
  const grid=document.getElementById('technicianWorkloadGrid');
  if(!panel||!grid)return;
  panel.classList.remove('hidden');

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const availability=t=>{
    const active=Number(t.activeJobs||0);
    if(active>=5)return'FULL';
    if(active>=3)return'BUSY';
    return'AVAILABLE';
  };
  const render=rows=>{
    const list=Array.isArray(rows)?rows:[];
    grid.innerHTML=list.length?list.map(t=>{
      const active=Number(t.activeJobs||0);
      const state=availability(t);
      const cls=state.toLowerCase();
      const pct=Math.max(0,Math.min(100,Number(t.workloadPct??active*20)));
      return `<article class="technician-workload-card ${cls}"><div class="technician-workload-head"><strong>${esc(t.name||'Technician')}</strong><span class="workload-status ${cls}">${esc(state)}</span></div><div class="technician-workload-metrics"><span>Active Jobs <b>${active}</b></span><span>In Progress <b>${Number(t.inProgress||0)}</b></span><span>Waiting Parts <b>${Number(t.waitingParts||0)}</b></span><span>Delayed <b>${Number(t.delayedJobs||0)}</b></span><span>Completed Today <b>${Number(t.completedToday||0)}</b></span></div><div class="workload-label"><span>Workload</span><b>${pct}%</b></div><div class="workload-track"><i style="width:${pct}%"></i></div></article>`;
    }).join(''):'<div class="empty">No BELM Technician accounts are available.</div>';
  };

  async function load(){
    const token=localStorage.getItem('belm_admin_token')||'';
    if(!token){grid.innerHTML='<div class="empty">Administrator login required.</div>';return;}
    grid.innerHTML='<div class="empty">Loading Technician workload...</div>';
    try{
      const response=await fetch(`/api/breakdown-workflow/technicians?_=${Date.now()}`,{cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
      const text=await response.text();
      let data=null;try{data=text?JSON.parse(text):null}catch(_){ }
      if(!response.ok)throw new Error(data?.error||`Request failed (${response.status})`);
      render(Array.isArray(data)?data:(data?.items||data?.rows||[]));
    }catch(error){
      grid.innerHTML=`<div class="empty">Could not load Technician workload: ${esc(error.message||'Sync failed')}</div>`;
    }
  }

  load();
  addEventListener('focus',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden)load();},15000);
})();
// V626: Keep BELM Job Card assignment simple for existing cards.
// Existing Job Card = select card + select technician + assign. The stored
// customer, priority, due date and site remain on the Job Card automatically.
(()=>{
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||params.get('source')||'').toLowerCase();
  if(actor!=='admin')return;

  const byId=id=>document.getElementById(id);
  const fieldFor=id=>byId(id)?.closest('label')||null;
  const setHidden=(node,hidden)=>node?.classList.toggle('hidden',Boolean(hidden));
  const isExisting=()=>document.querySelector('input[name="jobCardMode"]:checked')?.value!=='create';

  function simplifyTechnicianOptions(){
    const select=byId('dispatchTechnician');
    if(!select)return;
    [...select.options].forEach((option,index)=>{
      if(index===0)return;
      option.textContent=String(option.textContent||'')
        .replace(/\s*·\s*Home:.*$/i,'')
        .replace(/\s*·\s*No home customer.*$/i,'')
        .trim();
    });
  }

  function applyAssignmentLayout(){
    const panel=byId('dispatchPanel');
    if(!panel)return;
    const existing=isExisting();

    const heading=panel.querySelector('.workflow-dispatch-head h2');
    const description=panel.querySelector('.workflow-dispatch-head p');
    if(heading)heading.textContent='Job Card Assignment';
    if(description)description.textContent='Select an existing Job Card, choose a BELM Technician, then assign. Job details are filled automatically.';

    const technicianLabel=fieldFor('dispatchTechnician');
    if(technicianLabel&&technicianLabel.firstChild?.nodeType===Node.TEXT_NODE){
      technicianLabel.firstChild.nodeValue='Assign Technician';
    }

    setHidden(byId('dispatchJobCardNoField'),existing);
    setHidden(byId('dispatchCustomerField'),existing);
    setHidden(fieldFor('dispatchPriority'),existing);
    setHidden(fieldFor('dispatchDueDate'),existing);
    setHidden(byId('dispatchLocationField'),existing);

    const note=byId('dispatchNote');
    if(note&&existing)note.textContent='Select Job Card and Technician, then click Assign Technician.';

    const submit=byId('dispatchSubmit');
    if(submit)submit.textContent=existing?'Assign Technician':'Create & Assign Job Card';

    simplifyTechnicianOptions();
  }

  document.addEventListener('change',event=>{
    if(event.target?.matches?.('input[name="jobCardMode"]'))setTimeout(applyAssignmentLayout,0);
  });

  const technicianSelect=byId('dispatchTechnician');
  if(technicianSelect){
    const observer=new MutationObserver(()=>simplifyTechnicianOptions());
    observer.observe(technicianSelect,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyAssignmentLayout,{once:true});
  else applyAssignmentLayout();
  setTimeout(applyAssignmentLayout,250);
  setTimeout(applyAssignmentLayout,1200);
})();
