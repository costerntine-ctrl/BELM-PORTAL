(()=>{
 const token=localStorage.getItem('belm_admin_token')||'';
 if(!token){location.replace('/login');return;}
 const $=id=>document.getElementById(id);
 const initial=new URLSearchParams(location.search);
 $('from').value=initial.get('dateFrom')||'';
 $('to').value=initial.get('dateTo')||'';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[];
 async function api(path){const r=await fetch('/api'+path,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}if(!r.ok)throw Error(d?.error||`Request failed (${r.status}).`);return d;}
 function machineLabel(m){return [m.brand,m.model].filter(Boolean).join(' ')||m.machineType||m.machine_type||'Machine';}
 function dateOnly(v){if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v).slice(0,10);const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),get=t=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}
 function dateTime(v){if(!v)return'-';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleString('en-GB',{timeZone:'Africa/Dar_es_Salaam',hour12:false});}
 function render(){
   const from=$('from').value,to=$('to').value,machine=$('machine').value,status=$('status').value;
   const filtered=rows.filter(r=>{
     const day=dateOnly(r.createdAt||r.created_at);
     if(from&&day<from)return false;if(to&&day>to)return false;if(machine&&r.machineId!==machine)return false;if(status&&String(r.overallStatus||'').toUpperCase()!==status)return false;return true;
   });
   $('summary').textContent=`${filtered.length} checked report${filtered.length===1?'':'s'} found.`;
   $('list').innerHTML=filtered.length?filtered.map(r=>`<article class="report"><div><h3>${esc(r.checklistNo||r.templateName||'Checked Report')}</h3><small>${esc(r.customerName||'Customer')} · ${esc(r.machineName||'Machine')}</small></div><div class="meta"><b>Filled By</b><span>${esc(r.filledBy||'Not recorded')}</span></div><div class="meta"><b>Hour Meter</b><span>${esc(r.hourMeterReading??'-')}</span></div><div><span class="status ${esc(String(r.overallStatus||'GREEN').toUpperCase())}">${esc(String(r.overallStatus||'GREEN').toUpperCase())}</span><div class="meta" style="margin-top:7px"><span>${esc(dateTime(r.createdAt))}</span></div></div><button class="view-report" type="button" data-view-report="${esc(r.id)}" data-machine-id="${esc(r.machineId)}">View Report</button></article>`).join(''):'<div class="empty">No checked reports match the selected filters.</div>';
   $('list').querySelectorAll('[data-view-report]').forEach(button=>button.addEventListener('click',()=>{
     const url=`/tech-checked-report/?machineId=${encodeURIComponent(button.dataset.machineId)}&reportId=${encodeURIComponent(button.dataset.viewReport)}&source=coordinator&v=670`;
     window.open(url,'_blank','noopener');
   }));
 }
 function filteredRows(){
   const from=$('from').value,to=$('to').value,machine=$('machine').value,status=$('status').value;
   return rows.filter(r=>{const day=dateOnly(r.createdAt||r.created_at);if(from&&day<from)return false;if(to&&day>to)return false;if(machine&&r.machineId!==machine)return false;if(status&&String(r.overallStatus||'').toUpperCase()!==status)return false;return true;});
 }
 function dateSuffix(){return `${$('from').value||'all'}-to-${$('to').value||'latest'}`;}
 function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function exportCsv(){
   const data=filteredRows();if(!data.length){alert('No checked reports to download for the selected period.');return;}
   const lines=[['BELM CHECKLIST REPORT'],['From',$('from').value||'All time','To',$('to').value||'Latest'],[],['Date','Customer','Machine','Checklist','Filled By','Hour Meter','Status'],...data.map(r=>[dateTime(r.createdAt),r.customerName||'Customer',r.machineName||'Machine',r.checklistNo||r.templateName||'Checked Report',r.filledBy||'Not recorded',r.hourMeterReading??'',String(r.overallStatus||'GREEN').toUpperCase()])];
   const csv=lines.map(line=>line.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\n');
   downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`BELM-checklist-${dateSuffix()}.csv`);
 }
 async function downloadPdf(){
   const machine=$('machine').value;if(!machine){alert('Select one machine before downloading PDF.');$('machine').focus();return;}
   const params=new URLSearchParams();if($('from').value)params.set('from',$('from').value);if($('to').value)params.set('to',$('to').value);
   const button=$('pdf');button.disabled=true;button.textContent='Preparing PDF…';
   try{const response=await fetch(`/api/checklist-reports/machine/${encodeURIComponent(machine)}/history-pdf?${params}`,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Could not prepare PDF.');}downloadBlob(await response.blob(),`BELM-checklist-${dateSuffix()}.pdf`);}catch(error){alert(error.message);}finally{button.disabled=false;button.textContent='Download PDF';}
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
 $('print').addEventListener('click',()=>window.print());
 $('pdf').addEventListener('click',downloadPdf);
 $('csv').addEventListener('click',exportCsv);
 load();
})();
