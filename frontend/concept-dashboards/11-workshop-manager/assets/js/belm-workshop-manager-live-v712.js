(function () {
  "use strict";
  const params=new URLSearchParams(location.search);
  const preview=params.get('preview')==='1'||/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!preview&&!token){location.replace('/login');return;}

  function readUser(){try{return JSON.parse(localStorage.getItem('belm_admin_user')||'null')}catch(_){return null}}
  async function api(path){const r=await fetch('/api'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}if(!r.ok)throw new Error(d&&d.error||('Request failed ('+r.status+')'));return d;}
  const user=readUser();
  if(user){
    const name=String(user.name||user.fullName||'').trim();
    const role=String(user.role||user.roleName||'Workshop Manager').trim();
    const copy=document.querySelector('.user-chip .user-copy');
    if(copy){const strong=copy.querySelector('strong'),small=copy.querySelector('small');if(strong&&name)strong.textContent=name;if(small)small.textContent=/engineer/i.test(role)?'Workshop Manager':(role||'Workshop Manager');}
    const avatar=document.querySelector('.user-chip .user-avatar');
    if(avatar&&name)avatar.textContent=name.split(/\s+/).slice(0,2).map(p=>p.charAt(0).toUpperCase()).join('')||'WM';
  }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtDate(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
  function initials(name){return String(name||'T').trim().split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('')||'T';}

  function bindHeader(){
    const notification=document.querySelector('.header-right .icon-btn[aria-label="Notifications"]');
    if(notification)notification.addEventListener('click',()=>{location.href='/customers-manager/?module=customer-overview';});
    const account=document.querySelector('.header-right .icon-btn[aria-label="Account"]');
    if(account)account.addEventListener('click',()=>{location.href='/settings-manager/?module=profile';});
    const theme=document.getElementById('themeToggle');
    if(theme)theme.addEventListener('click',(event)=>{
      event.preventDefault();
      if(window.BELMTheme&&typeof window.BELMTheme.toggle==='function')window.BELMTheme.toggle();
    });
  }

  const routeMap={
    'job-cards.html':'/belm-workshop/#job-cards',
    // Keep the Workshop Manager shell and open its dedicated Machines page.
    // That page renders every registered machine card directly using the live
    // all-machines customer-manager view; no Customer card is shown first.
    'machines.html':'/concept-dashboards/11-workshop-manager/machines.html',
    'technicians.html':'/belm-workshop/#manage-technicians',
    'workshop-schedule.html':'/belm-workshop/#assigned-work',
    'spare-requests.html':'/spare-parts-manager/?view=requests&module=workshop',
    'service-maintenance.html':'/reports-manager/?view=service&module=workshop',
    'reports-analysis.html':'/workshop-analysis/?actor=admin&module=workshop',
    'checklist-monitoring.html':'/reports-manager/?view=checklists&module=workshop',
    'customers.html':'/customers-manager/?module=customer-overview',
    'communication.html':'/customers-manager/?module=customer-overview',
    'tools-equipment.html':'/belm-workshop/#tool-issue-documents',
    'workshop-settings.html':'/concept-dashboards/10-system-settings/',
    'my-profile.html':'/settings-manager/?module=profile',
    'help-support.html':'/settings-manager/?module=support',
    'logout.html':'/logout.php'
  };
  document.querySelectorAll('a[href]').forEach(a=>{const raw=a.getAttribute('href')||'';const base=raw.split('?')[0].split('#')[0];if(routeMap[base])a.href=routeMap[base];});

  function bindTechnicianDispatch(){
    const action=document.querySelector('.wm-qa-grid .wm-qa-btn--green');
    if(!action)return;
    action.href='/belm-workshop/#job-cards';
    action.setAttribute('aria-label','Technician Dispatch');
    const textNode=[...action.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.nodeValue.trim());
    if(textNode)textNode.nodeValue='Technician Dispatch';
  }

  function bindStatusCards(){
    const cards=[...document.querySelectorAll('.wm-stat-card')];
    const byLabel=label=>cards.find(card=>card.querySelector('.wm-stat-label')?.textContent.trim().toLowerCase()===label.toLowerCase());
    const open=byLabel('Open Job Cards');
    if(open){open.removeAttribute('href');open.setAttribute('role','status');open.setAttribute('aria-label','Open Job Cards synchronized information');open.style.cursor='default';open.style.pointerEvents='none';const chev=open.querySelector('.wm-stat-chev');if(chev)chev.style.visibility='hidden';}
    const progress=byLabel('In Progress');if(progress)progress.href='/belm-workshop/job-card-status/?status=progress';
    const waiting=byLabel('Waiting for Spare');if(waiting)waiting.href='/belm-workshop/job-card-status/?status=waiting';
    const completed=byLabel('Completed (This Month)');if(completed)completed.href='/belm-workshop/job-card-status/?status=completed';
  }

  function updateClock(){const now=new Date(),d=document.getElementById('liveDate'),t=document.getElementById('liveTime');if(d)d.textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});if(t)t.textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
  updateClock();setInterval(updateClock,30000);
  function applyStat(label,value){document.querySelectorAll('.wm-stat-card').forEach(card=>{const l=card.querySelector('.wm-stat-label'),v=card.querySelector('.wm-stat-value');if(l&&v&&l.textContent.trim().toUpperCase()===label.toUpperCase())v.textContent=String(value);});}

  function statusClass(status){
    const s=String(status||'OPEN').toUpperCase();
    return s==='PROGRESS'?'progress':s==='WAITING'?'waiting':s==='TESTING'?'testing':s==='COMPLETED'?'completed':s==='OVERDUE'?'overdue':'open';
  }
  function statusLabel(status){
    const s=String(status||'OPEN').toUpperCase();
    return s==='PROGRESS'?'In Progress':s==='WAITING'?'Waiting Spare':s==='TESTING'?'Testing':s==='COMPLETED'?'Completed':s==='OVERDUE'?'Overdue':'Open';
  }
  function renderRecentJobCards(rows){
    const tbody=document.querySelector('.wm-bottom-grid1 .panel .data-table tbody');
    if(!tbody)return;
    if(!Array.isArray(rows)||!rows.length){tbody.innerHTML='<tr><td colspan="9">No Job Cards found.</td></tr>';return;}
    tbody.innerHTML=rows.slice(0,6).map((j,i)=>{
      const assigned=String(j.technicianName||'').trim()||'Unassigned';
      return '<tr><td>'+(i+1)+'</td><td><a href="/belm-workshop/#job-cards" class="cell-link">'+esc(j.jobCardNo||'—')+'</a></td><td>'+esc(j.machine||'—')+'</td><td>'+esc(j.customer||'—')+'</td><td>'+esc(j.issue||'—')+'</td><td><span class="jc-pill jc-pill--'+statusClass(j.status)+'">'+esc(statusLabel(j.status))+'</span></td><td>'+esc(assigned)+'</td><td>'+esc(fmtDate(j.date))+'</td><td class="row-action">···</td></tr>';
    }).join('');
  }

  function renderTechnicians(rows){
    const holder=document.querySelector('.wm-bottom-grid2 .tech-row');
    if(!holder)return;
    if(!Array.isArray(rows)||!rows.length){holder.innerHTML='<div class="tech-chip"><span class="tech-name">No active technicians registered.</span></div>';return;}
    holder.innerHTML=rows.slice(0,8).map(t=>{
      const assigned=Number(t.assignedJobs||0)>0;
      const sub=assigned?('Assigned · '+Number(t.assignedJobs||0)+' Job'+(Number(t.assignedJobs||0)===1?'':'s')):'Available';
      return '<div class="tech-chip"><span class="tech-avatar'+(assigned?'':' off-duty')+'">'+esc(initials(t.name))+'</span><span class="tech-name">'+esc(t.name||'Technician')+'</span><span class="tech-status '+(assigned?'on':'off')+'">'+esc(sub)+'</span></div>';
    }).join('');
  }

  async function load(){
    if(preview)return;
    const results=await Promise.allSettled([api('/workshop-dashboard-metrics.php'),api('/belm-workshop-home.php')]);
    const metrics=results[0].status==='fulfilled'?results[0].value:null;
    const home=results[1].status==='fulfilled'?results[1].value:null;
    if(metrics&&metrics.jobCards){
      const j=metrics.jobCards;
      applyStat('Open Job Cards',Number(j.open||0));
      applyStat('In Progress',Number(j.inProgress||0));
      applyStat('Waiting for Spare',Number(j.waitingForSpare||0));
      applyStat('Completed (This Month)',Number(j.completedThisMonth||0));
      applyStat('Overdue',Number(j.overdue||0));
      const vals=[Number(j.open||0),Number(j.inProgress||0),Number(j.waitingForSpare||0),Number(j.testing||0),Number(j.completed||0),Number(j.overdue||0)];
      const total=Math.max(1,Number(j.open||0)+Number(j.inProgress||0)+Number(j.waitingForSpare||0)+Number(j.testing||0)+Number(j.completed||0));
      [...document.querySelectorAll('.wm-donut-legend-row')].forEach((r,i)=>{const s=r.querySelector('strong');if(s)s.textContent=(vals[i]||0)+' ('+Math.round((vals[i]||0)/total*100)+'%)';});
      const totalText=document.querySelector('.wm-donut-wrap svg text');if(totalText)totalText.textContent=String(total);
      renderRecentJobCards(metrics.recentJobCards||[]);
      renderTechnicians(metrics.technicians||[]);
    }
    const alertRows=[...document.querySelectorAll('.alert-row2')];
    const overdue=Number(metrics&&metrics.jobCards&&metrics.jobCards.overdue||0);
    const waiting=Number(metrics&&metrics.jobCards&&metrics.jobCards.waitingForSpare||0);
    const service=Number(metrics&&metrics.alerts&&metrics.alerts.serviceDue||0);
    const values=[overdue+' Job Cards Overdue',waiting+' Waiting for Spare',service?service+' Service Due Soon':'No Service Due','Checklist Monitoring'];
    alertRows.forEach((r,i)=>{const x=r.querySelector('.alert-row2-title');if(x&&values[i])x.textContent=values[i];});
    if(home&&Array.isArray(home.machines))document.documentElement.setAttribute('data-belm-workshop-machines',String(home.machines.length));
  }
  bindHeader();bindTechnicianDispatch();bindStatusCards();
  load().catch(e=>console.warn('Workshop Manager live sync:',e));
  setInterval(()=>load().catch(()=>{}),60000);
})();