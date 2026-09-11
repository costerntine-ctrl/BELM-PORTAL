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
  }

  const routeMap={
    'job-cards.html':'/belm-workshop/#job-cards',
    'machines.html':'/concept-dashboards/11-workshop-manager/machines.html',
    'technicians.html':'/belm-workshop/#manage-technicians',
    'workshop-schedule.html':'/belm-workshop/#assigned-work',
    // These two pages are now first-class Workshop Manager modules. Do not
    // redirect them back into the old generic Inventory/Reports destinations.
    'spare-requests.html':'/concept-dashboards/11-workshop-manager/spare-requests.html',
    'service-maintenance.html':'/concept-dashboards/11-workshop-manager/service-maintenance.html',
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

  const scheduleTargets={
    'Team Briefing':'/belm-workshop/#assigned-work',
    'Job Card Assignment':'/belm-workshop/#job-cards',
    'Progress Review':'/belm-workshop/job-card-status/?status=progress',
    'End of Day Report':'/workshop-analysis/?actor=admin&module=workshop'
  };

  function scheduleLabel(row){
    if(row.dataset.scheduleLabel)return row.dataset.scheduleLabel;
    const label=String(row.querySelector('.schedule-text')?.textContent||'').trim();
    row.dataset.scheduleLabel=label;
    return label;
  }

  function bindScheduleLinks(){
    const viewAll=[...document.querySelectorAll('.wm-bottom-grid2 .panel-link')].find(a=>String(a.textContent||'').trim().toLowerCase()==='view all'&&a.closest('.panel')?.querySelector('.panel-title')?.textContent.includes("Today's Schedule"));
    if(viewAll){viewAll.href='/belm-workshop/#assigned-work';viewAll.setAttribute('aria-label','View full Workshop schedule and assigned work');}
    document.querySelectorAll('.schedule-list .schedule-row').forEach(row=>{
      const label=scheduleLabel(row),href=scheduleTargets[label];
      if(!href)return;
      row.dataset.scheduleHref=href;
      row.setAttribute('role','link');
      row.setAttribute('tabindex','0');
      row.setAttribute('aria-label',label+' - open linked Workshop module');
      row.style.cursor='pointer';
      row.style.borderRadius='7px';
      row.style.paddingLeft='6px';
      row.style.paddingRight='6px';
      if(row.dataset.scheduleBound==='1')return;
      row.dataset.scheduleBound='1';
      row.addEventListener('mouseenter',()=>{row.style.background='rgba(47,111,214,.08)';});
      row.addEventListener('mouseleave',()=>{row.style.background='';});
      row.addEventListener('click',()=>{location.href=row.dataset.scheduleHref;});
      row.addEventListener('keydown',event=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        event.preventDefault();
        location.href=row.dataset.scheduleHref;
      });
    });
  }

  function syncSchedule(metrics){
    bindScheduleLinks();
    const j=metrics&&metrics.jobCards?metrics.jobCards:{};
    const meta={
      'Team Briefing':'Daily',
      'Job Card Assignment':Number(j.open||0)+' open',
      'Progress Review':(Number(j.inProgress||0)+Number(j.testing||0))+' active',
      'End of Day Report':Number(j.overdue||0)>0?Number(j.overdue||0)+' overdue':'Daily report'
    };
    const now=new Date();
    const nowMinutes=now.getHours()*60+now.getMinutes();
    document.querySelectorAll('.schedule-list .schedule-row').forEach(row=>{
      const label=scheduleLabel(row);
      const text=row.querySelector('.schedule-text');
      if(!text)return;
      let badge=row.querySelector('.schedule-live-meta');
      if(!badge){
        badge=document.createElement('span');
        badge.className='schedule-live-meta';
        badge.style.marginLeft='auto';
        badge.style.fontSize='10px';
        badge.style.fontWeight='800';
        badge.style.padding='3px 7px';
        badge.style.borderRadius='999px';
        badge.style.background='rgba(47,111,214,.11)';
        badge.style.color='#2f6fd6';
        badge.style.whiteSpace='nowrap';
        row.appendChild(badge);
      }
      badge.textContent=meta[label]||'Live';
      const time=String(row.querySelector('.schedule-time')?.textContent||'').trim().match(/^(\d{1,2}):(\d{2})/);
      if(time){
        const eventMinutes=Number(time[1])*60+Number(time[2]);
        const delta=nowMinutes-eventMinutes;
        row.dataset.scheduleState=delta>=60?'done':delta>=-30?'current':'upcoming';
        if(delta>=-30&&delta<60){
          row.setAttribute('aria-current','true');
          badge.style.background='rgba(30,164,90,.14)';
          badge.style.color='#168148';
        }else{
          row.removeAttribute('aria-current');
          badge.style.background='rgba(47,111,214,.11)';
          badge.style.color='#2f6fd6';
        }
      }
      const operational=meta[label]||'Live Workshop schedule';
      row.title=label+' · '+operational+' · Click to open';
    });
  }

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
    if(preview){syncSchedule(null);return;}
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
    syncSchedule(metrics);
    const alertRows=[...document.querySelectorAll('.alert-row2')];
    const overdue=Number(metrics&&metrics.jobCards&&metrics.jobCards.overdue||0);
    const waiting=Number(metrics&&metrics.jobCards&&metrics.jobCards.waitingForSpare||0);
    const service=Number(metrics&&metrics.alerts&&metrics.alerts.serviceDue||0);
    const values=[overdue+' Job Cards Overdue',waiting+' Waiting for Spare',service?service+' Service Due Soon':'No Service Due','Checklist Monitoring'];
    alertRows.forEach((r,i)=>{const x=r.querySelector('.alert-row2-title');if(x&&values[i])x.textContent=values[i];});
    if(home&&Array.isArray(home.machines))document.documentElement.setAttribute('data-belm-workshop-machines',String(home.machines.length));
  }
  bindHeader();bindTechnicianDispatch();bindStatusCards();bindScheduleLinks();
  load().catch(e=>console.warn('Workshop Manager live sync:',e));
  setInterval(()=>load().catch(()=>{}),60000);
})();