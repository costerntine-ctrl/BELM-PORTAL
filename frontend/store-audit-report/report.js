(()=>{'use strict';
const token=localStorage.getItem('belm_admin_token');
if(!token){location.replace('/login');return;}
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['from','storeAuditFrom'],['to','storeAuditTo'],['type','storeAuditType'],['user','storeAuditUser'],['search','storeAuditSearch']];
const incoming=new URLSearchParams(location.search);
try{const back=new URL(incoming.get('returnTo')||'/spare-parts-manager/',location.origin);if(back.origin===location.origin&&/^\/spare-parts-manager\/?$/.test(back.pathname))$('auditBack').href=back.pathname+back.search;}catch{}
fields.forEach(([key,id])=>{if(incoming.has(key))$(id).value=incoming.get(key)});
let applied=new URLSearchParams(),loading=false;
const controls=['storeAuditCsv','storeAuditPdf','storeAuditPrint'];
function ready(value){controls.forEach(id=>$(id).disabled=!value)}
function query(action){const q=new URLSearchParams(applied);q.set('action',action);return q;}
async function request(action){const r=await fetch('/api/spare-parts?'+query(action),{cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!r.ok){const error=await r.json().catch(()=>({}));throw Error(error.error||'Could not load Store audit report.');}return r;}
  const auditDate=(value)=>{if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString()};
  function renderStoreAudit(out){
    const rows=out?.rows||[],summary=out?.summary||{};
    document.getElementById("storeAuditSummary").innerHTML=`<div><span>Records</span><b>${Number(summary.rows||rows.length)}</b></div><div><span>Stock In</span><b>${Number(summary.stockIn||0)}</b></div><div><span>Stock Out</span><b>${Number(summary.stockOut||0)}</b></div><div><span>Other Changes</span><b>${Number(summary.edits||0)}</b></div>`;
    document.getElementById("storeAuditRows").innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeHtml(auditDate(r.eventDate))}</td><td><b>${escapeHtml(r.type||"—")}</b></td><td>${escapeHtml(r.partNumber||"—")}</td><td>${escapeHtml(r.partName||"—")}</td><td>${r.quantityChange===null||r.quantityChange===undefined?"—":escapeHtml(r.quantityChange>0?`+${r.quantityChange}`:r.quantityChange)}</td><td>${r.balanceAfter===null||r.balanceAfter===undefined?"—":escapeHtml(r.balanceAfter)}</td><td>${r.currentStock===null||r.currentStock===undefined?"—":escapeHtml(r.currentStock)}</td><td>${escapeHtml(r.actor||"—")}</td><td>${escapeHtml(r.note||"")}</td></tr>`).join(""):'<tr><td colspan="9">No Store audit records match the selected filters.</td></tr>';
  }

async function load(){if(loading)return;loading=true;ready(false);$('auditNotice').textContent='Loading audit report…';$('storeAuditRows').innerHTML='<tr><td colspan="9">Loading…</td></tr>';applied=new URLSearchParams();fields.forEach(([key,id])=>{const value=$(id).value.trim();if(value&&value!=='ALL')applied.set(key,value)});
try{if(applied.get('from')&&applied.get('to')&&applied.get('from')>applied.get('to'))throw Error('From date must be on or before To date.');const r=await request('audit');const data=await r.json();renderStoreAudit(data);const url=new URL(location.href);fields.forEach(([key])=>{url.searchParams.delete(key);if(applied.has(key))url.searchParams.set(key,applied.get(key))});history.replaceState(null,'',url.pathname+url.search);$('auditNotice').textContent=(data.rows||[]).length+' audit records';ready(true);}catch(error){$('auditNotice').textContent=error.message;$('storeAuditSummary').textContent='';$('storeAuditRows').innerHTML='<tr><td colspan="9">'+escapeHtml(error.message)+'</td></tr>';}finally{loading=false;}}
async function download(action,extension){ready(false);try{const r=await request(action),mime=r.headers.get('content-type')||'';if(extension==='pdf'&&!mime.includes('application/pdf')||extension==='csv'&&!mime.includes('text/csv'))throw Error('Unexpected report format. Please try again.');const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BELM-Store-Keeper-Audit-Report.'+extension;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){$('auditNotice').textContent=error.message;}finally{ready(true);}}
$('auditFilters').addEventListener('submit',e=>{e.preventDefault();load()});
$('storeAuditCsv').addEventListener('click',()=>download('audit-csv','csv'));
$('storeAuditPdf').addEventListener('click',()=>download('audit-pdf','pdf'));
$('storeAuditPrint').addEventListener('click',()=>window.print());
load();
})();
