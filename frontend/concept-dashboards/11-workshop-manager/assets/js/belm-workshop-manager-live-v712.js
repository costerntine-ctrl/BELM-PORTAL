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
  function applyStat(label,value){document.querySelectorAll('.wm-stat-card').forEach(card=>{const l=card.querySelector('.wm-stat-label'),v=card.querySelector('.wm-stat-value');if(l&&v&&l.textContent.trim().toUpperCase()===label.toUpperCase())v.textContent=String(value);});}

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
    }
    const alertRows=[...document.querySelectorAll('.alert-row2')];
    const overdue=Number(metrics&&metrics.jobCards&&metrics.jobCards.overdue||0);
    const waiting=Number(metrics&&metrics.jobCards&&metrics.jobCards.waitingForSpare||0);
    const service=Number(metrics&&metrics.alerts&&metrics.alerts.serviceDue||0);
    const values=[overdue+' Job Cards Overdue',waiting+' Waiting for Spare',service?service+' Service Due Soon':'No Service Due','Checklist Monitoring'];
    alertRows.forEach((r,i)=>{const x=r.querySelector('.alert-row2-title');if(x&&values[i])x.textContent=values[i];});
    if(home&&Array.isArray(home.machines))document.documentElement.setAttribute('data-belm-workshop-machines',String(home.machines.length));
  }
  bindHeader();
  load().catch(e=>console.warn('Workshop Manager live sync:',e));
  setInterval(()=>load().catch(()=>{}),60000);
})();
