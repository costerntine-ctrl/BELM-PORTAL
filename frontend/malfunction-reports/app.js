(()=>{'use strict';
const q=new URLSearchParams(location.search),g=k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}};
const actor=q.get('actor')||'',active=g('belm_active_account_type');
const token=(actor==='customer'||(!actor&&active==='customer'))?g('belm_customer_token'):(actor==='admin'?g('belm_admin_token'):actor==='technician'?g('belm_tech_token'):'')||g('belm_admin_token')||g('belm_tech_token')||g('belm_customer_token');
if(!token){location.replace('/login');return;}
const isCustomer=token===g('belm_customer_token')||actor==='customer';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=s=>s?new Date(s).toLocaleString():'';
const view=q.get('view')||'dashboard',state=q.get('state')||'',reportId=q.get('report')||'';
const A=isCustomer?'customer':(actor||'technician');
const url=(v,extra={})=>{const u=new URLSearchParams({view:v,actor:A,...extra});return '/malfunction-reports/?'+u};
async function api(path,opt={}){const r=await fetch('/api/malfunction-reports/'+path,{...opt,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
const post=(p,b)=>api(p,{method:'POST',body:JSON.stringify(b)});
const note=m=>{$('notice').textContent=m||''};
const home=isCustomer?(A==='customer'?'/customer-workshop-manager/':'/customer-technician-dashboard/'):(actor==='admin'?'/concept-dashboards/11-workshop-manager/':'/concept-dashboards/02-technician/');
const STATUS={ASSIGNED:['Assigned','info'],RECEIVED:['Assigned','info'],OPEN:['Assigned','info'],CREATED:['Assigned','info'],IN_PROGRESS:['In Progress','info'],WAITING_FOR_PARTS:['Pending',''],COMPLETED:['Completed','ok'],CANCELLED:['Cancelled','bad']};
const pill=s=>{const x=STATUS[String(s).toUpperCase()]||[s,''];return '<span class="mf-pill '+x[1]+'">'+esc(x[0])+'</span>'};
const mpill=s=>'<span class="mf-pill '+(s==='Under Repair'?'bad':s==='In Maintenance'?'info':'ok')+'">'+esc(s)+'</span>';
const STEPS=[['INITIAL_INSPECTION','1. Initial Inspection'],['FINDINGS_REPORT','2. Findings Report'],['SOLUTION','3. Solution'],['PENDING','4. Pending (if applicable)'],['SOLVED','5. Solved (Job Completion)']];
let me={manager:false,tech:false},counts={};

function menu(){
  const m=me.manager,out=[];
  const link=(label,href,key,sub,cnt)=>'<a '+(sub?'class="mf-sub" ':'')+'href="'+esc(href)+'"'+(key&&key===cur()?' aria-current="page"':'')+'>'+esc(label)+(cnt!==undefined?'<span class="mf-count">'+cnt+'</span>':'')+'</a>';
  const ext=(label,href)=>'<a href="'+esc(href)+'">'+esc(label)+'</a>';
  const comm='/role-communications/?actor='+A,rep='/role-reports/?actor='+A,ana='/role-analysis/?actor='+A,prof='/my-profile/?actor='+A;
  const jobCtx=['jobs','job'].includes(view)||view==='create';
  out.push('<div class="mf-brand">BELM PORTAL<small>'+(m?'Workshop Manager':'Technician')+'</small></div>');
  out.push('<a class="mf-backlink" href="'+(view==='dashboard'?home:url('dashboard'))+'">← '+(view==='dashboard'?'Back':'Back to Dashboard')+'</a>');
  if(view==='create'&&m){
    out.push(link('Create Job Card',url('create'),'create'),link('Job Cards',url('jobs',{state:'all'}),'jobs-all'),
      link('Active',url('jobs',{state:'assigned'}),'jobs-assigned',true,counts.assigned),link('Pending',url('jobs',{state:'pending'}),'jobs-pending',true,counts.pending),link('Completed',url('jobs',{state:'completed'}),'jobs-completed',true,counts.completed),link('History',url('jobs',{state:'history'}),'jobs-history',true),
      link('Machine Reports',url('machine-reports'),'machine-reports'),link('Assignments',url('assignments'),'assignments'),ext('Operational Communication',comm),ext('My Report',rep),ext('My Analysis',ana));
  }else if(jobCtx){
    out.push(link('Job Card',url('jobs',{state:'all'}),'jobs-all'),
      link('Assigned Jobs',url('jobs',{state:'assigned'}),'jobs-assigned',true,counts.assigned),link('In Progress',url('jobs',{state:'in_progress'}),'jobs-in_progress',true,counts.in_progress),
      link('Pending Jobs',url('jobs',{state:'pending'}),'jobs-pending',true,counts.pending),link('Completed Jobs',url('jobs',{state:'completed'}),'jobs-completed',true,counts.completed),link('Job Card History',url('jobs',{state:'history'}),'jobs-history',true));
    if(m)out.push('<hr>',link('Create Job Card',url('create'),'create'));
  }else{
    const daily=isCustomer?'/customer-workshop-checklists/':'/tech-checked-report/',maint='/completed-maintenance-reports/?actor='+A;
    out.push(link('Dashboard',url('dashboard'),'dashboard'),link(m?'Machines':'My Machines',url('machines'),'machines'),ext('Daily Check List Report',daily),
      link('Machine Malfunctioning Report',url('machine-reports'),'machine-reports'),link('Job Card',url('jobs',{state:'all'}),'jobs-all'),ext('Maintenance Report',maint),
      link('Alerts',url('alerts'),'alerts',false,counts.alerts||undefined),'<hr>');
    if(m)out.push(link('Create Job Card',url('create'),'create'),link('Technicians',url('technicians'),'technicians'),link('Assignments',url('assignments'),'assignments'));
    else out.push(ext('Machine Check-up',isCustomer?'/customer-checkup/':'/tech?view=machines'));
    out.push(ext('Operational Communication',comm),ext('My Report',rep),ext('My Analysis',ana),'<hr>');
    out.push(m?ext('Settings','/settings-manager/'):ext('My Profile',prof));
    if(!m)out.push(ext('Logout','/logout.php'));
  }
  $('side').innerHTML=out.join('');
}
function cur(){return view==='jobs'?'jobs-'+(state||'all'):view==='job'?'jobs-all':view}
function title(t){$('title').textContent=t;document.title=t+' — BELM'}

const V={};
const WORKFLOW=[['Machine Check-up','Oil is low – reported by RS 1. After submitting the check-up report, it is saved to the Daily Check List Report.'],['Technician or Machine Operator clicks Report It','Write the machine problem description.'],['Submit','Saved as Machine Malfunctioning Report for that machine.'],['Send Alert','Sent directly to the Workshop Manager as an alert.'],['Create Job Card','The alert asks the Workshop Manager to create a Job Card.']];
function portalSwitch(){const hasB=!!(g('belm_admin_token')||g('belm_tech_token')),hasC=!!g('belm_customer_token');if(!(hasB&&hasC))return '';
  const href=(a)=>'/malfunction-reports/?view=dashboard&actor='+a;return '<div class="mf-actions"><a class="mf-btn '+(isCustomer?'ghost':'')+'" href="'+href(me.manager?'admin':'technician')+'">BELM Portal</a><a class="mf-btn '+(isCustomer?'':'ghost')+'" href="'+href('customer')+'">Customer Portal</a></div>'}
function alertCard(r){return '<div class="mf-card" style="border-color:var(--bad)"><b style="color:var(--bad)">⚠ Alert to Workshop Manager</b><div>Machine: <b>'+esc(r.fleetNumber||r.machineLabel)+'</b> · '+esc(r.machineLabel)+'</div><div>From: '+esc(r.reporterName)+'</div><div>Issue: '+esc(r.description)+'</div><div class="mf-mute">Time: '+esc(fmt(r.createdAt))+'</div>'+(me.manager?'<a class="mf-btn" href="'+url('create',{report:r.id})+'">Action Required: Create a Job Card</a>':'')+'</div>'}
function workflowCard(){return '<section class="mf-card"><h2>Workflow – Job Card &amp; Maintenance Process</h2><ol class="mf-steps">'+WORKFLOW.map(([a,b],i)=>'<li class="mf-step"><h3>'+(i+1)+'. '+esc(a)+'</h3><div class="mf-mute">'+esc(b)+'</div></li>').join('')+'</ol><div class="mf-mute">After solved: hidden from alerts and saved in Job Card and Maintenance Report.</div></section>'}
function machineGrid(list){const f=$('flt')?$('flt').value:'';return list.filter(m=>!f||m.status===f).map(machineCard).join('')||'<p class="mf-mute">No machines for this filter.</p>'}
V.dashboard=async()=>{title(me.manager?'Workshop Manager Dashboard':'Technician Dashboard');const d=await api('dashboard');
  const c=d.counts,st=(l,v)=>'<div class="mf-stat"><span>'+l+'</span><b>'+v+'</b></div>';
  let h=portalSwitch()+'<div class="mf-stats">'+(me.manager?st('Total Machines',c.machines)+st('Technicians',c.technicians??0):st('My Machines',c.machines))+st('Active Jobs',c.active)+st('Pending',c.pending)+st('Completed',c.completed)+'</div>';
  h+='<section class="mf-card"><div class="mf-row"><h2>Machine Cards ('+d.machines.length+' Machines)</h2><select id="flt" aria-label="Status filter" style="width:auto"><option value="">All Status</option><option>Operational</option><option>Under Repair</option><option>In Maintenance</option></select></div><div class="mf-grid" id="mgrid">'+(d.machines.length?machineGrid(d.machines):'<p class="mf-mute">No machine is assigned to you yet. Ask the Workshop Manager.</p>')+'</div></section>';
  if(me.manager){
    h+='<section class="mf-card"><h2>Technician Summary</h2><table class="mf-t"><thead><tr><th>Machine (RS)</th><th>Assigned Technician</th></tr></thead><tbody>'+d.machines.map(m=>'<tr><td><b>'+esc(m.fleetNumber||m.label)+'</b></td><td>= '+esc(m.technicians||'Unassigned')+'</td></tr>').join('')+'</tbody></table></section>';
    h+='<div class="mf-grid"><section class="mf-card"><div class="mf-row"><h2>Alerts</h2><a href="'+url('alerts')+'">View All</a></div>'+((d.recentReports||[]).filter(r=>r.status==='OPEN').map(alertCard).join('')||'<p class="mf-mute">No active alerts.</p>')+'</section><section class="mf-card"><div class="mf-row"><h2>Active Job Cards</h2><a href="'+url('jobs',{state:'assigned'})+'">View All</a></div>'+(d.activeJobs.length?d.activeJobs.map(j=>'<a class="mf-row" href="'+url('job',{report:j.reportId})+'"><span><b>'+esc(j.jobCardNo)+'</b> · '+esc(j.machineLabel)+'<div class="mf-mute">'+esc(j.technicianName||'')+'</div></span>'+pill(j.status)+'</a>').join(''):'<p class="mf-mute">No active Job Cards.</p>')+'</section></div>';
  }
  h+=workflowCard();
  $('view').innerHTML=h;bindMachine();$('flt').onchange=()=>{$('mgrid').innerHTML=machineGrid(d.machines);bindMachine()};
};
V.alerts=async()=>{title('Alerts');
  if(me.manager){const d=await api('list?status=OPEN');$('view').innerHTML=(d.reports.map(alertCard).join('')||'<p class="mf-mute">No active alerts. Solved reports are hidden from alerts and saved in Job Card and Maintenance Report.</p>');return}
  const d=await api('jobs?state=assigned');$('view').innerHTML=d.jobs.length?d.jobs.map(j=>'<a class="mf-card" href="'+url('job',{report:j.reportId})+'" style="text-decoration:none;color:inherit;border-color:var(--bad)"><b style="color:var(--bad)">New Job Card '+esc(j.jobCardNo)+'</b><div>'+esc(j.machineLabel)+' – '+esc(j.description)+'</div><div class="mf-mute">'+esc(fmt(j.createdAt))+'</div></a>').join(''):'<p class="mf-mute">No new Job Cards waiting for you.</p>';};
function machineCard(m){const checkup=isCustomer?'/customer-checkup/':'/tech?view=machines';
  return '<div class="mf-card"><div class="mf-row"><b>'+esc(m.fleetNumber||m.label)+'</b>'+mpill(m.status)+'</div><div>'+esc(m.label)+'</div><div class="mf-mute">Assigned Technician: <b>'+esc(m.technicians||'—')+'</b></div><div class="mf-mute">Customer: '+esc(m.customerName)+' · Serial: '+esc(m.serialNumber||'—')+'</div><div class="mf-actions"><a class="mf-btn" href="'+checkup+'">Machine Check-up</a><button class="mf-btn warn" data-report="'+esc(m.id)+'" data-label="'+esc(m.label)+'">Report It</button></div></div>'}
function bindMachine(){document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>window.BelmReportIt&&window.BelmReportIt(b.dataset.report,b.dataset.label))}

V.machines=async()=>{title(me.manager?'Machines':'My Machines');const d=await api('machines');
  $('view').innerHTML='<div class="mf-grid">'+(d.machines.length?d.machines.map(m=>machineCard(m).replace('</div></div>','</div>'+''+'</div>')).join(''):'<p class="mf-mute">No machines to show. Technicians see only machines assigned to them.</p>')+'</div>';bindMachine();};

V.technicians=async()=>{title('Technicians');const d=await api('technicians');
  $('view').innerHTML='<section class="mf-card"><table class="mf-t"><thead><tr><th>Technician</th><th>Machines</th><th>Active jobs</th></tr></thead><tbody>'+(d.technicians.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+t.machines+'</td><td>'+t.activeJobs+'</td></tr>').join('')||'<tr><td colspan="3" class="mf-mute">No technicians.</td></tr>')+'</tbody></table></section>';};

V.assignments=async()=>{title('Assignments');const [d,t]=await Promise.all([api('machines'),api('technicians')]);
  const opts=t.technicians.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  $('view').innerHTML='<section class="mf-card"><table class="mf-t"><thead><tr><th>Machine</th><th>Assigned</th><th>Change</th></tr></thead><tbody>'+d.machines.map(m=>'<tr><td><b>'+esc(m.fleetNumber||m.label)+'</b><div class="mf-mute">'+esc(m.label)+' · '+esc(m.customerName)+'</div></td><td>'+esc(m.technicians||'—')+'</td><td><div class="mf-actions"><select data-sel="'+esc(m.id)+'" aria-label="Technician">'+opts+'</select><button class="mf-btn" data-as="'+esc(m.id)+'">Assign</button><button class="mf-btn ghost" data-un="'+esc(m.id)+'">Remove</button></div></td></tr>').join('')+'</tbody></table></section>';
  const go=(b,act)=>b.onclick=async()=>{const id=b.dataset.as||b.dataset.un,sel=document.querySelector('[data-sel="'+id+'"]');b.disabled=true;try{await post(act,{machineId:id,technicianId:sel.value});V.assignments()}catch(e){note(e.message);b.disabled=false}};
  document.querySelectorAll('[data-as]').forEach(b=>go(b,'assign'));document.querySelectorAll('[data-un]').forEach(b=>go(b,'unassign'));};

V['machine-reports']=async()=>{title('Machine Reports');const tab=q.get('tab')==='RESOLVED'?'RESOLVED':'ALERTS';const d=await api('list?status='+tab);
  let h='<div class="mf-actions"><a class="mf-btn '+(tab==='ALERTS'?'':'ghost')+'" href="'+url('machine-reports')+'">Active</a><a class="mf-btn '+(tab==='RESOLVED'?'':'ghost')+'" href="'+url('machine-reports',{tab:'RESOLVED'})+'">Solved</a></div>';
  h+=d.reports.length?d.reports.map(r=>'<article class="mf-card"><div class="mf-row"><div><b>'+esc(r.machineLabel)+'</b><div class="mf-mute">'+esc(r.customerName)+' · Fleet '+esc(r.fleetNumber||'—')+'</div></div>'+(r.status==='OPEN'?'<span class="mf-pill bad">Action Required</span>':r.status==='RESOLVED'?'<span class="mf-pill ok">Solved</span>':pill(r.jobStatus))+'</div><div>'+esc(r.description)+'</div><div class="mf-mute">From: '+esc(r.reporterName)+' · '+esc(fmt(r.createdAt))+(r.jobCardNo?' · '+esc(r.jobCardNo):'')+'</div>'+(r.status==='OPEN'&&me.manager?'<a class="mf-btn" href="'+url('create',{report:r.id})+'">Create Job Card</a>':r.jobCardId?'<a class="mf-btn ghost" href="'+url('job',{report:r.id})+'">Open Job Card</a>':'')+'</article>').join(''):'<p class="mf-mute">'+(tab==='ALERTS'?'No active reports.':'No solved reports yet. Solved work is saved in Completed Maintenance Reports.')+'</p>';
  $('view').innerHTML=h;};

V.create=async()=>{if(!me.manager)throw new Error('Only the Workshop Manager can create a Job Card.');title('Create Job Card');
  const [md,t]=await Promise.all([api('machines'),api('technicians')]);let rep=null;
  if(reportId){rep=(await api('job?id='+encodeURIComponent(reportId))).report;if(rep.status!=='OPEN')throw new Error('A Job Card already exists for this report.')}
  const machines=rep?md.machines.filter(m=>m.id===rep.machineId):md.machines;
  $('view').innerHTML='<form class="mf-card" id="f"><h2>Create Job Card</h2><div class="mf-grid"><label>Machine *<select name="m" required>'+machines.map(m=>'<option value="'+esc(m.id)+'">'+esc((m.fleetNumber?m.fleetNumber+' – ':'')+m.label)+'</option>').join('')+'</select></label><label>Assign Technician *<select name="t" required><option value="">Select technician</option>'+t.technicians.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' ('+x.activeJobs+' active)</option>').join('')+'</select></label><label>Priority<select name="p"><option value="NORMAL">Normal</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label></div>'+(rep?'<div class="mf-mute">Reported problem: '+esc(rep.description)+'</div>':'')+'<label>Job Description / Work Order *<textarea name="d" rows="4" maxlength="1000" required placeholder="What must the Technician check and do?"></textarea></label><div><b>Job Workflow (to be completed by Technician)</b><div class="mf-stepper"><span>Initial Inspection</span><span>Findings Report</span><span>Solution</span><span>Pending<br>(Reason required)</span><span>Solved<br>(Complete Job)</span></div></div><div class="mf-actions"><a class="mf-btn ghost" href="'+url('dashboard')+'">Cancel</a><button class="mf-btn" type="submit">Create Job Card</button></div></form>';
  const f=$('f');f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;try{const body={technicianId:f.t.value,instruction:f.d.value.trim(),priority:f.p.value};if(rep)body.id=rep.id;else body.machineId=f.m.value;const r=await post('create-job-card',body);location.href=url('job',{report:r.id})}catch(err){note(err.message);b.disabled=false}};};

V.jobs=async()=>{const s=state||'all';title({all:'Job Cards',assigned:'Assigned Jobs',in_progress:'In Progress',pending:'Pending Jobs',completed:'Completed Jobs',history:'Job Card History'}[s]||'Job Cards');
  const d=await api('jobs?state='+encodeURIComponent(s));
  $('view').innerHTML=d.jobs.length?d.jobs.map(j=>'<a class="mf-card" href="'+url('job',{report:j.reportId})+'" style="text-decoration:none;color:inherit"><div class="mf-row"><b>'+esc(j.jobCardNo)+' – '+esc(j.fleetNumber||j.machineLabel)+'</b>'+pill(j.status)+'</div><div>'+esc(j.description)+'</div><div class="mf-mute">'+esc(j.customerName)+' · '+esc(j.technicianName||'')+' · Priority '+esc(j.priority)+' · '+esc(fmt(j.completedAt||j.createdAt))+'</div></a>').join(''):'<p class="mf-mute">No Job Cards here.</p>';};

V.job=async()=>{title('Job Card');const d=await api('job?id='+encodeURIComponent(reportId));const r=d.report,j=d.job,S=d.steps||{};
  if(!j){$('view').innerHTML='<p class="mf-mute">No Job Card has been created for this report yet.</p>'+(me.manager?'<a class="mf-btn" href="'+url('create',{report:r.id})+'">Create Job Card</a>':'');return}
  title('Job Card – '+j.job_card_no);const closed=r.status==='RESOLVED';
  const done=k=>S[k]&&!S[k].draft&&!(k==='PENDING'&&S[k].cleared);
  let h='<article class="mf-card"><div class="mf-row"><b style="font-size:18px">'+esc(j.job_card_no)+' – '+esc(r.machineLabel)+'</b>'+pill(j.status)+'</div><div class="mf-mute">Customer: '+esc(r.customerName)+' · Assigned to: '+esc(j.technician_name||'')+' · Priority: '+esc(j.priority)+' · Issued: '+esc(fmt(j.created_at))+'</div><div><b>Job Description / Problem</b><br>'+esc(j.instruction||'—')+'<div class="mf-mute">Reported: '+esc(r.description)+'</div></div></article><h2 style="margin:0">Job Progress</h2><ol class="mf-steps">';
  let current=true;
  STEPS.forEach(([k,l],i)=>{const dn=done(k),dr=S[k]&&S[k].draft,pend=k==='PENDING'&&dn;const prevDone=i===0||i>2?true:done(STEPS[i-1][0]);const lock=!closed&&!dn&&!prevDone;
    let cls=pend?'pend':dn?'done':(!lock&&current&&!closed&&!(i===3||i===4)?'cur':lock?'lock':'');if(!dn&&!lock&&i<3)current=false;
    h+='<li class="mf-step '+cls+'"><h3>'+esc(l)+(dn?' ✅':dr?' (draft)':'')+'</h3>'+(S[k]&&S[k].note?'<div>'+(pend?'<span class="mf-why">Why pending: </span>':'')+esc(S[k].note)+'<div class="mf-mute">'+esc(S[k].by||'')+' · '+esc(fmt(S[k].at))+'</div></div>':'')+
    (!closed&&!lock?'<form data-step="'+k+'"><textarea name="n" rows="2" maxlength="2000" '+(k==='INITIAL_INSPECTION'?'':'required')+' placeholder="'+(k==='PENDING'?'Why is it pending? (parts, approval...)':k==='SOLVED'?'What was done to solve it?':'Write the note')+'">'+esc(S[k]?.note||'')+'</textarea><div class="mf-actions" style="margin-top:6px"><button class="mf-btn ghost" type="button" data-draft="'+k+'">Save Draft</button><button class="mf-btn ok" type="submit">'+(k==='SOLVED'?'Mark Solved ✅':'Update Progress')+'</button></div></form>':'')+'</li>';});
  h+='</ol>'+(closed?'<p class="mf-mute">Solved. Saved in Job Cards and Completed Maintenance Reports.</p>':'');
  $('view').innerHTML=h;
  const send=async(f,draft)=>{const bs=f.querySelectorAll('button');bs.forEach(b=>b.disabled=true);try{await post('step',{id:r.id,step:f.dataset.step,note:f.n.value.trim(),draft});V.job()}catch(e){note(e.message);bs.forEach(b=>b.disabled=false)}};
  document.querySelectorAll('form[data-step]').forEach(f=>{f.onsubmit=e=>{e.preventDefault();send(f,false)};f.querySelector('[data-draft]').onclick=()=>send(f,true)});};

async function boot(){
  try{
    const jd=await api('dashboard').catch(e=>{throw e});
    me={manager:!!jd.canManage,tech:!!jd.isTechnician};counts={};
    try{const c=await api('jobs?state=all');counts=c.counts||{}}catch(_){}
    counts.alerts=(jd.counts&&jd.counts.alerts)||0;
    $('who').textContent=me.manager?'Workshop Manager':'Technician';
    menu();
    const fn=V[view]||V.dashboard;
    if(me.tech&&['create','technicians','assignments','machine-reports'].includes(view)){throw new Error('This page is for the Workshop Manager.')}
    await fn();
  }catch(e){menu();note(e.message)}
}
boot();
})();
