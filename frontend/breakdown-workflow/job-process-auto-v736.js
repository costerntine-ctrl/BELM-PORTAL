(()=>{
  if(window.__belmJobProcessAutoV736)return;
  window.__belmJobProcessAutoV736=true;
  const token=()=>localStorage.getItem('belm_admin_token')||'';
  if(!token())return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  const cls=v=>String(v||'ASSIGNED').toLowerCase().replaceAll('_','-');
  const traffic=v=>String(v||'YELLOW').toLowerCase();
  let busy=false;

  function ensureHead(){
    const table=document.querySelector('.job-process-table');
    const thead=table?.querySelector('thead');
    if(!thead)return;
    thead.innerHTML='<tr><th>Job Card No.</th><th>Customer</th><th>Machine</th><th>Fleet No.</th><th>Technician</th><th>Reported Problem</th><th>Priority</th><th>Current Process</th><th>Created</th><th>Updated</th><th>Status</th></tr>';
    table.style.minWidth='1380px';
  }

  function consumeTechnicianAssign(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem('belm_assign_technician')||'null')}catch(_){saved=null}
    const p=new URLSearchParams(location.search);
    const paramId=p.get('technician')||'';
    const paramName=p.get('technicianName')||'';
    const id=String(saved?.id||paramId||'').trim();
    const name=String(saved?.name||paramName||'Technician').trim();
    if(!id)return;
    if(saved?.ts && Date.now()-Number(saved.ts)>5*60*1000){localStorage.removeItem('belm_assign_technician');return}

    const panel=document.getElementById('dispatchPanel');
    const select=document.getElementById('dispatchTechnician');
    if(!panel||!select){setTimeout(consumeTechnicianAssign,180);return}

    panel.classList.remove('hidden');
    panel.classList.add('jc-open');
    const setSelected=()=>{
      const option=[...select.options].find(o=>String(o.value)===id);
      if(!option){setTimeout(setSelected,180);return}
      select.value=id;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      const existing=document.querySelector('input[name="jobCardMode"][value="existing"]');
      if(existing){existing.checked=true;existing.dispatchEvent(new Event('change',{bubbles:true}))}
      const note=document.getElementById('dispatchNote');
      if(note)note.textContent=`Assign Job Card to ${name}. Select the Job Card, then confirm assignment.`;
      localStorage.removeItem('belm_assign_technician');
      panel.scrollIntoView({behavior:'smooth',block:'start'});
    };
    setSelected();
  }

  async function load(){
    if(busy||document.hidden)return;
    const body=document.getElementById('jobProcessBody');
    if(!body)return;
    busy=true;
    try{
      const r=await fetch('/api/job-process-auto',{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw new Error(data?.error||`Request failed (${r.status})`);
      const rows=Array.isArray(data)?data:[];
      ensureHead();
      body.innerHTML=rows.length?rows.map(row=>{
        const t=traffic(row.trafficColor);
        const processButton=row.processAction==='VIEW_REPORT'
          ? `<button type="button" class="job-process-auto-button ${cls(row.processCode)} traffic-${t}" data-process-action="VIEW_REPORT" data-job-id="${esc(row.id)}">${esc(row.processLabel||'View Report')}</button>`
          : `<span class="job-process-auto-button ${cls(row.processCode)} traffic-${t}">${esc(row.processLabel||'Assigned')}</span>`;
        return `<tr data-auto-jc="${esc(row.id)}" data-traffic="${esc(t)}">
          <td><b>${esc(row.jobCardNo||'Job Card')}</b></td>
          <td>${esc(row.companyName||'Customer')}</td>
          <td>${esc(row.machineLabel||'Machine')}</td>
          <td><b>${esc(row.fleetNumber||'—')}</b></td>
          <td>${esc(row.technicianName||'Unassigned')}</td>
          <td class="job-process-problem">${esc(row.reportedProblem||'—')}</td>
          <td><span class="job-process-priority pri-${cls(row.priority)}">${esc(row.priority||'NORMAL')}</span></td>
          <td>${processButton}${row.processDetail?`<small class="job-process-detail">${esc(row.processDetail)}</small>`:''}</td>
          <td>${esc(fmt(row.createdAt))}</td>
          <td>${esc(fmt(row.updatedAt))}</td>
          <td><span class="job-process-status status-${t} traffic-${t}">${esc(row.statusLabel||row.status||'In Progress')}</span></td>
        </tr>`;
      }).join(''):'<tr><td colspan="11" class="job-process-empty">No assigned Job Card process yet.</td></tr>';
    }catch(e){
      ensureHead();
      body.innerHTML=`<tr><td colspan="11" class="job-process-empty">${esc(e.message||'Could not load Job Card process.')}</td></tr>`;
    }finally{busy=false}
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-process-action="VIEW_REPORT"]');
    if(!b)return;
    const id=b.dataset.jobId||'';
    if(id&&window.BELMJobCardDetail?.open)window.BELMJobCardDetail.open({id});
  });

  const style=document.createElement('style');
  style.textContent=`
    .job-process-table{min-width:1380px!important}
    .job-process-table th,.job-process-table td{white-space:nowrap}
    .job-process-table .job-process-problem{white-space:normal;min-width:220px;max-width:330px;line-height:1.35}
    .job-process-auto-button{display:inline-flex;align-items:center;border:0;border-radius:999px;padding:7px 11px;font:900 10px/1 Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;background:#173e68;color:#fff;cursor:default}
    .job-process-auto-button.received{background:#1769aa}.job-process-auto-button.on-process{background:#d49b00;color:#182033}.job-process-auto-button.view-report{background:#0b63ce;cursor:pointer;box-shadow:0 0 0 2px rgba(11,99,206,.13)}
    .job-process-auto-button.waiting-spare{background:#b42318}.job-process-auto-button.spare-approved{background:#159447}.job-process-auto-button.on-test{background:#d49b00;color:#182033}.job-process-auto-button.pending-approval{background:#d49b00;color:#182033}.job-process-auto-button.complete{background:#138447}.job-process-auto-button.assigned{background:#d49b00;color:#182033}
    .job-process-auto-button.view-report:hover{filter:brightness(1.08);transform:translateY(-1px)}
    .job-process-priority,.job-process-status{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;font:900 10px/1 Inter,Arial,sans-serif;text-transform:uppercase;white-space:nowrap}
    .job-process-priority.pri-normal{background:#e9f0fb;color:#1f5fb7}.job-process-priority.pri-low{background:#edf4ee;color:#3c6b48}.job-process-priority.pri-high{background:#fff0bf;color:#8a6100}.job-process-priority.pri-urgent,.job-process-priority.pri-breakdown{background:#ffe0dd;color:#b42318}
    .job-process-status.status-red{background:#ffe0dd;color:#b42318;border:1px solid #ffc4bf}.job-process-status.status-yellow{background:#fff0bf;color:#8a6100;border:1px solid #f2d675}.job-process-status.status-green{background:#d9f7e5;color:#11743d;border:1px solid #a9e5bf}
    .job-process-auto-button.traffic-red{background:#b42318!important;color:#fff!important;animation:belmProcessRed 1.05s ease-in-out infinite}
    .job-process-auto-button.traffic-yellow{background:#d49b00!important;color:#182033!important;animation:belmProcessYellow 1.2s ease-in-out infinite}
    .job-process-auto-button.traffic-green{background:#138447!important;color:#fff!important;animation:belmProcessGreen 1.35s ease-in-out infinite}
    .job-process-status.traffic-red{animation:belmStatusRed 1.05s ease-in-out infinite}
    .job-process-status.traffic-yellow{animation:belmStatusYellow 1.2s ease-in-out infinite}
    .job-process-status.traffic-green{animation:belmStatusGreen 1.35s ease-in-out infinite}
    @keyframes belmProcessRed{0%,100%{box-shadow:0 0 0 rgba(180,35,24,0)}50%{box-shadow:0 0 15px rgba(180,35,24,.72)}}
    @keyframes belmProcessYellow{0%,100%{box-shadow:0 0 0 rgba(212,155,0,0)}50%{box-shadow:0 0 14px rgba(212,155,0,.58)}}
    @keyframes belmProcessGreen{0%,100%{box-shadow:0 0 0 rgba(19,132,71,0)}50%{box-shadow:0 0 13px rgba(19,132,71,.50)}}
    @keyframes belmStatusRed{0%,100%{opacity:1}50%{opacity:.48;box-shadow:0 0 12px rgba(180,35,24,.45)}}
    @keyframes belmStatusYellow{0%,100%{opacity:1}50%{opacity:.55;box-shadow:0 0 11px rgba(212,155,0,.38)}}
    @keyframes belmStatusGreen{0%,100%{opacity:1}50%{opacity:.62;box-shadow:0 0 10px rgba(19,132,71,.34)}}
    .job-process-detail{display:block;margin-top:4px;color:#70849a;font-size:9px;white-space:normal;max-width:220px}
    @media(prefers-reduced-motion:reduce){.job-process-auto-button[class*="traffic-"],.job-process-status[class*="traffic-"]{animation:none!important}}
  `;
  document.head.appendChild(style);

  window.addEventListener('belm-job-card-changed',load);
  window.addEventListener('focus',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  document.getElementById('refreshJobProcess')?.addEventListener('click',()=>setTimeout(load,150));
  document.getElementById('refreshButton')?.addEventListener('click',()=>setTimeout(load,250));
  setInterval(load,15000);
  setTimeout(load,300);
  setTimeout(consumeTechnicianAssign,450);
})();