(()=>{
  const params=new URLSearchParams(location.search);
  const isAdminAssigned=params.get('embed')==='1'&&String(params.get('actor')||params.get('source')||'').toLowerCase()==='admin'&&String(params.get('view')||'').toLowerCase()==='assigned';
  if(!isAdminAssigned)return;

  const panel=document.getElementById('technicianWorkloadPanel');
  const grid=document.getElementById('technicianWorkloadGrid');
  if(!panel||!grid)return;
  panel.classList.remove('hidden');

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
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

// V731 - Canonical BELM Workshop Manager Job Card dashboard.
// The Job Card process table is the single source of truth; these cards summarize
// and filter the same live rows instead of showing the legacy Breakdown summary.
(()=>{
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||params.get('source')||'').toLowerCase();
  const isJobCards=params.get('embed')==='1'&&actor==='admin'&&String(params.get('view')||'').toLowerCase()==='job-cards';
  if(!isJobCards)return;

  const summary=document.getElementById('summaryCards');
  const body=document.getElementById('jobProcessBody');
  const panel=document.getElementById('jobProcessPanel');
  if(!summary||!body||!panel)return;

  document.documentElement.classList.add('belm-jc-dashboard-v731');
  const style=document.createElement('style');
  style.textContent=`
    html.belm-jc-dashboard-v731 .filters{display:none!important}
    html.belm-jc-dashboard-v731 .summary{grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin:2px 0 14px}
    html.belm-jc-dashboard-v731 .jc-summary-card{appearance:none;width:100%;text-align:left;cursor:pointer;font:inherit;color:var(--ink);transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}
    html.belm-jc-dashboard-v731 .jc-summary-card:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(10,30,55,.10)}
    html.belm-jc-dashboard-v731 .jc-summary-card.active{outline:2px solid var(--blue);outline-offset:1px}
    html.belm-jc-dashboard-v731 .jc-summary-card b{line-height:1;font-size:25px}
    html.belm-jc-dashboard-v731 .jc-summary-card span{display:block;margin-top:6px;font-weight:850;letter-spacing:.01em}
    html.belm-jc-dashboard-v731 #jobProcessPanel{margin-top:12px!important}
    html.belm-jc-dashboard-v731 #jobProcessPanel>.panel-head h2{font-size:20px}
    html.belm-jc-dashboard-v731 #jobProcessPanel>.panel-head p{max-width:780px;font-size:12px}
    html.belm-jc-dashboard-v731 .job-process-table tbody tr[hidden]{display:none!important}
    @media(max-width:980px){html.belm-jc-dashboard-v731 .summary{grid-template-columns:repeat(2,minmax(140px,1fr))}}
    @media(max-width:540px){html.belm-jc-dashboard-v731 .summary{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);

  const head=panel.querySelector('.panel-head h2');
  const desc=panel.querySelector('.panel-head p');
  if(head)head.textContent='Job Card Dashboard';
  if(desc)desc.textContent='One live Job Card workflow from Technician Dispatch through diagnosis, parts, testing, approval and completion.';

  let activeFilter='ALL';
  const rows=()=>Array.from(body.querySelectorAll('tr')).filter(row=>row.querySelector('.job-process-state'));
  const code=row=>String(row.querySelector('.job-process-state')?.className||'').replace('job-process-state','').trim().split(/\s+/)[0]||'assigned';
  const count=(list,predicate)=>list.filter(predicate).length;
  const isCompleted=row=>code(row)==='completed';

  function matches(row,filter){
    const c=code(row);
    if(filter==='ALL')return true;
    if(filter==='OPEN')return c!=='completed';
    if(filter==='ASSIGNED')return c==='assigned';
    if(filter==='OPENED')return c==='opened';
    if(filter==='DIAGNOSIS')return c==='diagnosis-report';
    if(filter==='WAITING')return c==='waiting-for-spare';
    if(filter==='TESTING')return c==='testing';
    if(filter==='PENDING')return c==='pending-approval';
    if(filter==='COMPLETED')return c==='completed';
    return true;
  }

  function applyFilter(){
    rows().forEach(row=>{row.hidden=!matches(row,activeFilter)});
    summary.querySelectorAll('[data-jc-filter]').forEach(button=>button.classList.toggle('active',button.dataset.jcFilter===activeFilter));
  }

  function render(){
    const list=rows();
    const stats=[
      ['OPEN','Open Jobs',count(list,r=>!isCompleted(r)),''],
      ['ASSIGNED','Dispatched',count(list,r=>code(r)==='assigned'),''],
      ['OPENED','Received',count(list,r=>code(r)==='opened'),'green'],
      ['DIAGNOSIS','Under Diagnosis',count(list,r=>code(r)==='diagnosis-report'),''],
      ['WAITING','Waiting Spare',count(list,r=>code(r)==='waiting-for-spare'),'yellow'],
      ['TESTING','Testing',count(list,r=>code(r)==='testing'),'yellow'],
      ['PENDING','Pending Approval',count(list,r=>code(r)==='pending-approval'),'yellow'],
      ['COMPLETED','Completed',count(list,r=>isCompleted(r)),'green']
    ];
    summary.innerHTML=stats.map(([filter,label,value,tone])=>`<button type="button" class="summary-card jc-summary-card ${tone} ${activeFilter===filter?'active':''}" data-jc-filter="${filter}"><b>${value}</b><span>${label}</span></button>`).join('');
    applyFilter();
  }

  summary.addEventListener('click',event=>{
    const button=event.target.closest('[data-jc-filter]');
    if(!button)return;
    const next=button.dataset.jcFilter||'ALL';
    activeFilter=activeFilter===next?'ALL':next;
    render();
  });

  new MutationObserver(render).observe(body,{childList:true,subtree:true,characterData:true});
  render();
})();

// V734 - add the Job Card detail/dispatch component only to the existing
// Workshop Manager Job Card view. It does not replace the dashboard.
(()=>{
  const p=new URLSearchParams(location.search);
  const actor=String(p.get('actor')||p.get('source')||'').toLowerCase();
  const isJobCards=p.get('embed')==='1'&&actor==='admin'&&String(p.get('view')||'').toLowerCase()==='job-cards';
  if(!isJobCards)return;
  if(!document.querySelector('link[href*="job-card-detail-v734.css"]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/job-card-detail-v734.css?v=734-job-card-detail';document.head.appendChild(link);
  }
  if(!document.querySelector('script[src*="job-card-detail-v734.js"]')){
    const script=document.createElement('script');script.src='/job-card-detail-v734.js?v=738-job-card-detail-fit';script.defer=true;document.body.appendChild(script);
  }
  if(!document.querySelector('script[src*="job-card-approval-v739.js"]')){
    const approval=document.createElement('script');approval.src='/job-card-approval-v739.js?v=739-job-card-approval';approval.defer=true;document.body.appendChild(approval);
  }
})();