(()=>{
 const token=localStorage.getItem('belm_admin_token')||'';
 if(!token){location.replace('/login');return;}
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[];
 async function api(path){const r=await fetch('/api'+path,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}if(!r.ok)throw Error(d?.error||`Request failed (${r.status}).`);return d;}
 function machineLabel(m){return [m.brand,m.model].filter(Boolean).join(' ')||m.machineType||m.machine_type||'Machine';}
 function dateOnly(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,10);return d.toLocaleDateString('en-GB',{timeZone:'Africa/Dar_es_Salaam'});}
 function dateTime(v){if(!v)return'-';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleString('en-GB',{timeZone:'Africa/Dar_es_Salaam',hour12:false});}
 function render(){
   const from=$('from').value,to=$('to').value,machine=$('machine').value,status=$('status').value;
   const filtered=rows.filter(r=>{
     const day=String(r.createdAt||'').slice(0,10);
     if(from&&day<from)return false;if(to&&day>to)return false;if(machine&&r.machineId!==machine)return false;if(status&&String(r.overallStatus||'').toUpperCase()!==status)return false;return true;
   });
   $('summary').textContent=`${filtered.length} checked report${filtered.length===1?'':'s'} found.`;
   $('list').innerHTML=filtered.length?filtered.map(r=>`<article class="report"><div><h3>${esc(r.checklistNo||r.templateName||'Checked Report')}</h3><small>${esc(r.customerName||'Customer')} · ${esc(r.machineName||'Machine')}</small></div><div class="meta"><b>Filled By</b><span>${esc(r.filledBy||'Not recorded')}</span></div><div class="meta"><b>Hour Meter</b><span>${esc(r.hourMeterReading??'-')}</span></div><div><span class="status ${esc(String(r.overallStatus||'GREEN').toUpperCase())}">${esc(String(r.overallStatus||'GREEN').toUpperCase())}</span><div class="meta" style="margin-top:7px"><span>${esc(dateTime(r.createdAt))}</span></div></div></article>`).join(''):'<div class="empty">No checked reports match the selected filters.</div>';
 }
 async function load(){
   $('summary').textContent='Loading checked reports…';$('list').innerHTML='';
   try{
     const customers=await api('/customers');
     const found=[];const machines=[];
     for(const c of (Array.isArray(customers)?customers:[])){
       let detail;try{detail=await api(`/customers/${encodeURIComponent(c.id)}`)}catch(_){continue;}
       const list=Array.isArray(detail?.machines)?detail.machines:[];
       for(const m of list){
         machines.push({id:m.id,label:`${c.name||'Customer'} — ${machineLabel(m)}`});
         try{
           const reports=await api(`/checklist-reports/machine/${encodeURIComponent(m.id)}`);
           for(const r of (Array.isArray(reports)?reports:[])) found.push({...r,customerName:r.customerName||c.name||'Customer',machineName:machineLabel(m),machineId:m.id});
         }catch(_){/* privacy/no-access records stay hidden */}
       }
     }
     rows=found.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
     $('machine').innerHTML='<option value="">All machines</option>'+machines.map(m=>`<option value="${esc(m.id)}">${esc(m.label)}</option>`).join('');
     render();
   }catch(e){$('summary').textContent='Could not load checked reports.';$('list').innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
 }
 ['from','to','machine','status'].forEach(id=>$(id).addEventListener('change',render));
 $('refresh').addEventListener('click',load);
 load();
})();
