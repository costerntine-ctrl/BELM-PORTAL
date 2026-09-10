(function(){
  'use strict';
  const token=localStorage.getItem('belm_admin_token')||'';
  const preview=new URLSearchParams(location.search).get('preview')==='1'||/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if(!preview&&!token)return;

  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(){
    const r=await fetch('/api/inspection-repair-dashboard.php',{cache:'no-store',headers:{Authorization:'Bearer '+token}});
    const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}
    if(!r.ok)throw new Error(d&&d.error||('Request failed ('+r.status+')'));
    return d;
  }

  function setStat(label,value){
    document.querySelectorAll('.belm-stat-card').forEach(card=>{
      const l=card.querySelector('.belm-stat-card__label');
      const v=card.querySelector('.belm-stat-card__value');
      if(l&&v&&l.textContent.trim().toLowerCase()===label.toLowerCase())v.textContent=String(value);
    });
  }

  function stageClass(group){
    const g=String(group||'INSPECTION').toUpperCase();
    if(g==='DIAGNOSIS')return 'diagnosis';
    if(g==='WAITING_SPARE')return 'waiting';
    if(g==='TESTING')return 'testing';
    return 'diagnosis';
  }
  function priorityClass(p){
    p=String(p||'NORMAL').toLowerCase();
    return ['urgent','high','normal'].includes(p)?p:'normal';
  }
  function priorityIcon(p){
    p=String(p||'NORMAL').toUpperCase();
    if(p==='URGENT')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
    if(p==='HIGH')return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>';
  }

  function renderRows(rows){
    const body=document.querySelector('.belm-table tbody');
    if(!body)return;
    if(!Array.isArray(rows)||!rows.length){body.innerHTML='<tr><td colspan="7">No active Job Cards.</td></tr>';return;}
    body.innerHTML=rows.map(j=>{
      const href='/belm-workshop/#job-cards';
      return '<tr data-job-card="'+esc(j.id)+'">'+
        '<td><a href="'+href+'" class="cell-link">'+esc(j.jobCardNo||'—')+'</a></td>'+
        '<td>'+esc(j.machine||'—')+'</td>'+
        '<td>'+esc(j.customer||'—')+'</td>'+
        '<td>'+esc(j.technician||'Unassigned')+'</td>'+
        '<td><span class="belm-stage-badge belm-stage-badge--'+stageClass(j.stageGroup)+'">'+esc(j.stageLabel||j.stage||'—')+'</span></td>'+
        '<td><span class="belm-priority-badge belm-priority-badge--'+priorityClass(j.priority)+'">'+priorityIcon(j.priority)+esc(j.priority||'NORMAL')+'</span></td>'+
        '<td><a href="'+href+'" class="belm-btn-next">'+esc(j.nextAction||'Open Job Card')+'</a></td>'+
      '</tr>';
    }).join('');
  }

  function syncWorkflowCounts(counts){
    const map={
      'Opened':counts.pendingInspection,
      'Inspection':counts.pendingInspection,
      'Diagnosis':counts.diagnosis,
      'Waiting for Spare':counts.waitingSpare,
      'Repair':counts.repair,
      'Testing':counts.testing,
      'Completed':counts.completed
    };
    document.querySelectorAll('.belm-workflow__step').forEach(step=>{
      const label=step.querySelector('.belm-workflow__label');
      if(!label)return;
      const name=label.textContent.replace(/\s*\(\d+\)\s*$/,'').trim();
      if(Object.prototype.hasOwnProperty.call(map,name))label.textContent=name+' ('+Number(map[name]||0)+')';
    });
  }

  function apply(data){
    const c=data&&data.counts||{};
    setStat('Pending Inspection',Number(c.pendingInspection||0));
    setStat('Under Diagnosis',Number(c.diagnosis||0));
    setStat('Repair in Progress',Number(c.repair||0));
    setStat('Ready for Testing',Number(c.testing||0));
    syncWorkflowCounts(c);
    renderRows(data.activeJobCards||[]);
    document.documentElement.setAttribute('data-jobcard-sync-at',data.generatedAt||new Date().toISOString());
  }

  async function load(){if(preview)return;apply(await api());}
  document.addEventListener('DOMContentLoaded',()=>{load().catch(e=>console.warn('Inspection/Repair Job Card sync:',e));setInterval(()=>load().catch(()=>{}),30000);});
})();
