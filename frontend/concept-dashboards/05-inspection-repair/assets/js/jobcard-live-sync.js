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

  function normalizeStage(j){
    const group=String(j&&j.stageGroup||'').toUpperCase();
    const stage=String(j&&j.stage||'').toUpperCase();
    const label=String(j&&j.stageLabel||'').toUpperCase();
    const action=String(j&&j.nextAction||'').toUpperCase();
    const all=[group,stage,label].join(' ');
    if(/COMPLETED|CLOSED/.test(all))return 'Completed';
    if(/PENDING_APPROVAL|COMPLETION REPORT|AWAITING APPROVAL/.test(all)||/APPROVAL/.test(action))return 'Completion Report';
    if(/TEST/.test(all))return 'Testing';
    if(/REPAIR/.test(all))return 'Repair';
    if(/WAITING.*SPARE|WAITING.*PART|PROCUREMENT|STORE_CHECK|BOSS_APPROVAL/.test(all))return 'Waiting for Spare';
    if(/DIAGNOSIS REPORT/.test(all)||/REVIEW DIAGNOSIS|VIEW DIAGNOSIS/.test(action))return 'Diagnosis Report';
    if(/DIAGNOS/.test(all))return 'Inspection / Diagnosis';
    if(/INSPECT/.test(all))return 'Inspection / Diagnosis';
    return 'Opened';
  }

  function stageClass(stage){
    if(stage==='Waiting for Spare'||stage==='Diagnosis Report')return 'waiting';
    if(stage==='Testing'||stage==='Completed'||stage==='Completion Report')return 'testing';
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

  function normalizedAction(j,stage){
    const action=String(j&&j.nextAction||'').trim();
    if(stage==='Diagnosis Report'&&/review diagnosis/i.test(action))return 'Review Diagnosis Report';
    if(stage==='Completion Report')return 'Review Completion Report';
    if(stage==='Inspection / Diagnosis'&&!action)return 'Open Inspection / Diagnosis';
    return action||'Open Job Card';
  }

  function renderRows(rows){
    const body=document.querySelector('.belm-table tbody');
    if(!body)return;
    if(!Array.isArray(rows)||!rows.length){body.innerHTML='<tr><td colspan="7">No active Job Cards.</td></tr>';return;}
    body.innerHTML=rows.map(j=>{
      const href='/belm-workshop/#job-cards';
      const stage=normalizeStage(j);
      return '<tr data-job-card="'+esc(j.id)+'">'+
        '<td><a href="'+href+'" class="cell-link">'+esc(j.jobCardNo||'—')+'</a></td>'+
        '<td>'+esc(j.machine||'—')+'</td>'+
        '<td>'+esc(j.customer||'—')+'</td>'+
        '<td>'+esc(j.technician||'Unassigned')+'</td>'+
        '<td><span class="belm-stage-badge belm-stage-badge--'+stageClass(stage)+'">'+esc(stage)+'</span></td>'+
        '<td><span class="belm-priority-badge belm-priority-badge--'+priorityClass(j.priority)+'">'+priorityIcon(j.priority)+esc(j.priority||'NORMAL')+'</span></td>'+
        '<td><a href="'+href+'" class="belm-btn-next">'+esc(normalizedAction(j,stage))+'</a></td>'+
      '</tr>';
    }).join('');
  }

  function rebuildWorkflow(){
    const host=document.querySelector('.belm-workflow__steps');
    if(!host)return;
    const steps=[
      ['Opened','blue'],
      ['Inspection / Diagnosis','blue'],
      ['Diagnosis Report','gold'],
      ['Waiting for Spare','gold'],
      ['Repair','blue'],
      ['Testing','green'],
      ['Completion Report','green'],
      ['Completed','green']
    ];
    host.innerHTML=steps.map((step,index)=>{
      const modifier=step[1]==='gold'?' belm-workflow__step--gold':step[1]==='green'?' belm-workflow__step--green':'';
      const line=index<steps.length-1?'<div class="belm-workflow__line'+(step[1]==='gold'?' belm-workflow__line--gold':step[1]==='green'?' belm-workflow__line--green':'')+'"></div>':'';
      const optional=step[0]==='Waiting for Spare'?'<small style="display:block;margin-top:4px;color:#f5c518;font-size:8px;font-weight:800">IF REQUIRED</small>':'';
      return '<div class="belm-workflow__step'+modifier+'"><div class="belm-workflow__circle"><span style="font-weight:900">'+(index+1)+'</span></div><div class="belm-workflow__label">'+step[0]+'</div>'+optional+'</div>'+line;
    }).join('');
  }

  function syncWorkflowCounts(counts,rows){
    const derived={
      'Opened':Number(counts.pendingInspection||0),
      'Inspection / Diagnosis':0,
      'Diagnosis Report':0,
      'Waiting for Spare':Number(counts.waitingSpare||0),
      'Repair':Number(counts.repair||0),
      'Testing':Number(counts.testing||0),
      'Completion Report':0,
      'Completed':Number(counts.completed||0)
    };
    (Array.isArray(rows)?rows:[]).forEach(j=>{
      const stage=normalizeStage(j);
      if(stage==='Inspection / Diagnosis')derived[stage]+=1;
      else if(stage==='Diagnosis Report')derived[stage]+=1;
      else if(stage==='Completion Report')derived[stage]+=1;
    });
    document.querySelectorAll('.belm-workflow__step').forEach(step=>{
      const label=step.querySelector('.belm-workflow__label');
      if(!label)return;
      const name=label.textContent.replace(/\s*\(\d+\)\s*$/,'').trim();
      if(Object.prototype.hasOwnProperty.call(derived,name))label.textContent=name+' ('+Number(derived[name]||0)+')';
    });
  }

  function apply(data){
    const c=data&&data.counts||{};
    const rows=data&&Array.isArray(data.activeJobCards)?data.activeJobCards:[];
    setStat('Pending Inspection',Number(c.pendingInspection||0));
    setStat('Under Diagnosis',rows.filter(j=>['Inspection / Diagnosis','Diagnosis Report'].includes(normalizeStage(j))).length||Number(c.diagnosis||0));
    setStat('Repair in Progress',Number(c.repair||0));
    setStat('Ready for Testing',Number(c.testing||0));
    rebuildWorkflow();
    syncWorkflowCounts(c,rows);
    renderRows(rows);
    document.documentElement.setAttribute('data-jobcard-sync-at',data.generatedAt||new Date().toISOString());
  }

  async function load(){if(preview){rebuildWorkflow();return;}apply(await api());}
  document.addEventListener('DOMContentLoaded',()=>{
    rebuildWorkflow();
    load().catch(e=>console.warn('Inspection/Repair Job Card sync:',e));
    setInterval(()=>load().catch(()=>{}),30000);
  });
})();
