(()=>{
  if(window.__belmJobProcessAutoV736)return;
  window.__belmJobProcessAutoV736=true;
  const token=()=>localStorage.getItem('belm_admin_token')||'';
  if(!token())return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};
  const cls=v=>String(v||'ASSIGNED').toLowerCase().replaceAll('_','-');
  let busy=false;

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
      body.innerHTML=rows.length?rows.map(row=>`<tr data-auto-jc="${esc(row.id)}">
        <td>${esc(row.jobCardNo||'Job Card')}<span class="job-process-updated">${esc(fmt(row.updatedAt))}</span></td>
        <td>${esc(row.technicianName||'Unassigned')}</td>
        <td><b>${esc(row.fleetNumber||'—')}</b></td>
        <td>${esc(row.companyName||'Customer')}</td>
        <td class="job-process-address">${esc(row.address||'—')}</td>
        <td><button type="button" class="job-process-auto-button ${cls(row.processCode)}" data-process-action="${esc(row.processAction||'')}" data-job-id="${esc(row.id)}">${esc(row.processLabel||'Assigned')}</button>${row.processDetail?`<small class="job-process-detail">${esc(row.processDetail)}</small>`:''}</td>
      </tr>`).join(''):'<tr><td colspan="6" class="job-process-empty">No assigned Job Card process yet.</td></tr>';
    }catch(e){
      body.innerHTML=`<tr><td colspan="6" class="job-process-empty">${esc(e.message||'Could not load Job Card process.')}</td></tr>`;
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
    .job-process-auto-button{border:0;border-radius:999px;padding:7px 11px;font:900 10px/1 Inter,Arial,sans-serif;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;background:#173e68;color:#fff;cursor:default}
    .job-process-auto-button.received{background:#1769aa}.job-process-auto-button.on-process{background:#0b7c49}.job-process-auto-button.view-report{background:#0b63ce;cursor:pointer;box-shadow:0 0 0 2px rgba(11,99,206,.13)}
    .job-process-auto-button.waiting-spare{background:#b27b00}.job-process-auto-button.spare-approved{background:#159447}.job-process-auto-button.on-test{background:#6f45b5}.job-process-auto-button.pending-approval{background:#d49b00;color:#182033}.job-process-auto-button.complete{background:#138447}.job-process-auto-button.assigned{background:#315c86}
    .job-process-auto-button.view-report:hover{filter:brightness(1.08);transform:translateY(-1px)}
  `;
  document.head.appendChild(style);

  window.addEventListener('belm-job-card-changed',load);
  window.addEventListener('focus',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  document.getElementById('refreshJobProcess')?.addEventListener('click',()=>setTimeout(load,150));
  document.getElementById('refreshButton')?.addEventListener('click',()=>setTimeout(load,250));
  setInterval(load,15000);
  setTimeout(load,300);
})();
