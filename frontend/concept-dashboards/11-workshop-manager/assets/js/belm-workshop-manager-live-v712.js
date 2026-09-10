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

  function bindHeader(){
    const notification=document.querySelector('.header-right .icon-btn[aria-label="Notifications"]');
    if(notification)notification.addEventListener('click',()=>{location.href='/customers-manager/?module=customer-overview';});
    const account=document.querySelector('.header-right .icon-btn[aria-label="Account"]');
    if(account)account.addEventListener('click',()=>{location.href='/settings-manager/?module=profile';});
    const theme=document.getElementById('themeToggle');
    if(theme)theme.addEventListener('click',()=>{location.href='/concept-dashboards/10-system-settings/';});
  }

  const routeMap={
    'job-cards.html':'/belm-workshop/#job-cards',
    'machines.html':'/customers-manager/?view=all-machines&module=customer-overview',
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

  function updateClock(){const now=new Date(),d=document.getElementById('liveDate'),t=document.getElementById('liveTime');if(d)d.textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});if(t)t.textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
  updateClock();setInterval(updateClock,30000);

  function statusBucket(row){const c=String(row.processCode||'').toUpperCase();if(c==='COMPLETED')return'completed';if(c==='TESTING')return'testing';if(c==='WAITING_FOR_SPARE')return'waiting';if(c==='DIAGNOSIS_REPORT'||c==='OPENED')return'progress';return'open';}
  function applyStat(label,value){document.querySelectorAll('.wm-stat-card').forEach(card=>{const l=card.querySelector('.wm-stat-label'),v=card.querySelector('.wm-stat-value');if(l&&v&&l.textContent.trim().toUpperCase()===label.toUpperCase())v.textContent=String(value);});}
  function isThisMonth(value){if(!value)return false;const d=new Date(value),n=new Date();return !Number.isNaN(d.getTime())&&d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth();}

  async function load(){
    if(preview)return;
    const results=await Promise.allSettled([api('/engineering?action=job-process'),api('/belm-workshop-home.php')]);
    const rows=results[0].status==='fulfilled'&&Array.isArray(results[0].value)?results[0].value:[];
    const home=results[1].status==='fulfilled'?results[1].value:null;
    const counts={open:0,progress:0,waiting:0,testing:0,completed:0,completedMonth:0,overdue:0};
    rows.forEach(r=>{const bucket=statusBucket(r);counts[bucket]++;if(bucket==='completed'&&isThisMonth(r.completed_at||r.completedAt))counts.completedMonth++;if((r.due_date||r.dueDate)&&new Date(r.due_date||r.dueDate)<new Date()&&bucket!=='completed')counts.overdue++;});
    applyStat('Open Job Cards',counts.open);
    applyStat('In Progress',counts.progress);
    applyStat('Waiting for Spare',counts.waiting);
    applyStat('Completed (This Month)',counts.completedMonth);
    applyStat('Overdue',counts.overdue);

    const legend=[...document.querySelectorAll('.wm-donut-legend-row')];
    const vals=[counts.open,counts.progress,counts.waiting,counts.testing,counts.completed,counts.overdue];
    const total=Math.max(1,counts.open+counts.progress+counts.waiting+counts.testing+counts.completed);
    legend.forEach((r,i)=>{const s=r.querySelector('strong');if(s)s.textContent=(vals[i]||0)+' ('+Math.round((vals[i]||0)/total*100)+'%)';});
    const totalText=document.querySelector('.wm-donut-wrap svg text');if(totalText)totalText.textContent=String(total);

    if(home&&Array.isArray(home.machines)){
      const machines=home.machines;
      const alertRows=[...document.querySelectorAll('.alert-row2')];
      const service=machines.filter(m=>/DUE|OVERDUE|REQUIRED/i.test(String(m.serviceKit||''))).length;
      const values=[counts.overdue+' Job Cards Overdue',counts.waiting+' Waiting for Spare',service?service+' Service Due Soon':'No Service Due','Checklist Monitoring'];
      alertRows.forEach((r,i)=>{const x=r.querySelector('.alert-row2-title');if(x&&values[i])x.textContent=values[i];});
    }
  }
  bindHeader();
  load().catch(e=>console.warn('Workshop Manager live sync:',e));
  setInterval(()=>load().catch(()=>{}),60000);
})();
