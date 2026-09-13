(()=>{
  if(window.__belmBreakdownReportV746)return;
  window.__belmBreakdownReportV746=true;
  const token=localStorage.getItem('belm_admin_token')||'';
  let rows=[];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString()};
  const normalize=s=>String(s||'').toLowerCase();

  function ensureStyle(){
    if(document.getElementById('belm-breakdown-v746-style'))return;
    const s=document.createElement('style');s.id='belm-breakdown-v746-style';s.textContent=`
      .belm-view-report{border:0;border-radius:8px;padding:8px 11px;background:#111827;color:#fff;font-weight:900;cursor:pointer;white-space:nowrap}.belm-view-report:hover{filter:brightness(1.15)}
      #belmBreakdownReportDialog{width:min(1080px,94vw);max-height:92vh;border:0;border-radius:16px;padding:0;background:#0d1a2d;color:#eaf2fb;box-shadow:0 30px 90px rgba(0,0,0,.42)}#belmBreakdownReportDialog::backdrop{background:rgba(2,8,20,.72)}
      .bdr-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:20px 22px;border-bottom:3px solid #f2c318;background:#081426;position:sticky;top:0;z-index:2}.bdr-head h2{margin:0 0 5px;font-size:22px}.bdr-head p{margin:0;color:#aac0d8}.bdr-close{border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer}.bdr-body{padding:20px 22px;overflow:auto;max-height:calc(92vh - 150px)}
      .bdr-banner{padding:10px 12px;border:1px solid #35526f;border-radius:10px;background:#102842;margin-bottom:14px;font-size:12px}.bdr-banner.historical{border-color:#b88d13;background:#322909;color:#ffe37a}
      .bdr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.bdr-card{border:1px solid #29415c;background:#102138;border-radius:11px;padding:12px}.bdr-card span{display:block;color:#88a0ba;font-size:9px;text-transform:uppercase;font-weight:900}.bdr-card strong{display:block;margin-top:5px;font-size:13px;overflow-wrap:anywhere}
      .bdr-section{margin-top:15px;border:1px solid #29415c;border-radius:12px;background:#0f2036;padding:15px}.bdr-section h3{margin:0 0 10px;font-size:14px;color:#fff}.bdr-text{white-space:pre-wrap;line-height:1.5;color:#d9e5f2}.bdr-table{width:100%;border-collapse:collapse;min-width:720px}.bdr-table th,.bdr-table td{padding:8px;border-bottom:1px solid #29415c;text-align:left;font-size:11px;vertical-align:top}.bdr-table th{color:#92abc5;text-transform:uppercase;font-size:9px}.bdr-table-wrap{overflow:auto}
      .bdr-event{padding:10px 0;border-bottom:1px solid #29415c}.bdr-event:last-child{border-bottom:0}.bdr-event b{display:block;color:#fff}.bdr-event small{color:#8ea6bf}.bdr-event p{margin:4px 0 0;color:#cbd9e7;white-space:pre-wrap}.bdr-actions{display:flex;gap:8px;flex-wrap:wrap;padding:14px 22px;border-top:1px solid #29415c;background:#081426;position:sticky;bottom:0}.bdr-actions button{border:0;border-radius:9px;padding:10px 13px;font-weight:900;cursor:pointer}.bdr-actions .download{background:#1477da;color:#fff}.bdr-actions .close{margin-left:auto;background:#e8edf3;color:#213044}
      @media(max-width:760px){.bdr-grid{grid-template-columns:1fr}#belmBreakdownReportDialog{width:96vw}.bdr-body{padding:14px}}
    `;document.head.appendChild(s);
  }

  function isBreakdownResponse(url,data){return /\/api\/workshop-service-maintenance/.test(url)&&normalize(url).includes('reporttype=breakdown')&&Array.isArray(data?.rows)}
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await nativeFetch(input,init);const url=typeof input==='string'?input:(input?.url||'');
    if(response.ok&&/\/api\/workshop-service-maintenance/.test(url)){
      response.clone().json().then(data=>{if(isBreakdownResponse(url,data)){rows=data.rows||[];setTimeout(patchTable,0)}}).catch(()=>{});
    }
    return response;
  };

  function patchTable(){
    const title=document.getElementById('reportTitle');if(!title||!normalize(title.textContent).includes('breakdown'))return;
    const table=document.querySelector('#reportTable table');if(!table)return;
    const head=table.querySelector('thead tr');if(head&&!head.querySelector('[data-bdr-report-head]')){const th=document.createElement('th');th.dataset.bdrReportHead='1';th.textContent='Report';head.appendChild(th)}
    [...table.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      if(tr.querySelector('[data-bdr-view]'))return;const row=rows[i];if(!row)return;
      const td=document.createElement('td');const b=document.createElement('button');b.type='button';b.className='belm-view-report';b.dataset.bdrView=String(row.snapshotId||'');b.dataset.caseId=String(row.caseId||'');b.textContent='View Report';td.appendChild(b);tr.appendChild(td);
    });
  }

  function dialog(){
    let d=document.getElementById('belmBreakdownReportDialog');if(d)return d;
    d=document.createElement('dialog');d.id='belmBreakdownReportDialog';d.innerHTML='<div class="bdr-head"><div><h2>Breakdown Case Report</h2><p id="bdrSub">Machine / Job Card detailed record</p></div><button type="button" class="bdr-close" data-bdr-close>×</button></div><div class="bdr-body" id="bdrBody">Loading…</div><div class="bdr-actions"><button type="button" class="download" data-bdr-pdf>Download PDF</button><button type="button" class="download" data-bdr-csv>Download CSV</button><button type="button" class="close" data-bdr-close>Close</button></div>';document.body.appendChild(d);return d;
  }
  function detailUrl(action,snapshotId,caseId,format=''){const q=new URLSearchParams({section:'reports',reportType:'breakdown',action,snapshotId:snapshotId||'',caseId:caseId||''});if(format)q.set('format',format);return'/api/workshop-service-maintenance?'+q.toString()}
  async function authJson(url){const r=await nativeFetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){d=null}if(!r.ok)throw new Error(d?.error||'Could not load Breakdown report.');return d}
  function value(v){return v===null||v===undefined||String(v).trim()===''?'—':String(v)}

  function renderDetail(d){
    const j=d.job||{};const sp=Array.isArray(d.spares)?d.spares:[];const ev=Array.isArray(d.events)?d.events:[];
    const historical=!!d.historicalSnapshot;
    return `<div class="bdr-banner ${historical?'historical':''}">${historical?'Historical daily record — preserved as it stood on '+esc(d.snapshotDate||'this date'):'Current daily record — progress is updated for today and preserved by date.'}</div>
      <div class="bdr-grid">
        <div class="bdr-card"><span>Report Date</span><strong>${esc(value(d.snapshotDate))}</strong></div><div class="bdr-card"><span>Customer</span><strong>${esc(value(d.customer))}</strong></div><div class="bdr-card"><span>Machine</span><strong>${esc(value(d.machine))}</strong></div>
        <div class="bdr-card"><span>Fleet No.</span><strong>${esc(value(d.fleetNumber))}</strong></div><div class="bdr-card"><span>Serial No.</span><strong>${esc(value(d.serialNumber))}</strong></div><div class="bdr-card"><span>Job Card</span><strong>${esc(value(j.job_card_no))}</strong></div>
        <div class="bdr-card"><span>Technician</span><strong>${esc(value(j.technician_name))}</strong></div><div class="bdr-card"><span>Current Stage</span><strong>${esc(value(d.currentStage))}</strong></div><div class="bdr-card"><span>Status</span><strong>${esc(value(d.caseStatus))}</strong></div>
      </div>
      <section class="bdr-section"><h3>Problem Description</h3><div class="bdr-text">${esc(value(d.problemDescription||j.fault_description))}</div></section>
      <section class="bdr-section"><h3>Technician Diagnosis</h3><div class="bdr-text">${esc(value(j.diagnosis))}</div></section>
      <section class="bdr-section"><h3>Work / Repair Action</h3><div class="bdr-text">${esc(value(j.work_done))}</div></section>
      <section class="bdr-section"><h3>Testing & Completion</h3><div class="bdr-grid"><div class="bdr-card"><span>Test Result</span><strong>${esc(value(j.test_result))}</strong></div><div class="bdr-card"><span>Completion Note</span><strong>${esc(value(j.completion_note))}</strong></div><div class="bdr-card"><span>Approved By</span><strong>${esc(value(j.reviewed_by_name))}</strong></div></div></section>
      <section class="bdr-section"><h3>Spare Parts Information</h3><div class="bdr-table-wrap"><table class="bdr-table"><thead><tr><th>Spare</th><th>Part / Ref</th><th>Qty</th><th>Unit</th><th>Reason</th><th>Status</th><th>Requested</th><th>Approved / Fulfilled</th></tr></thead><tbody>${sp.length?sp.map(s=>`<tr><td>${esc(value(s.spare_name))}</td><td>${esc(value(s.part_number))}</td><td>${esc(value(s.quantity))}</td><td>${esc(value(s.unit))}</td><td>${esc(value(s.reason))}</td><td>${esc(value(s.status))}</td><td>${esc(value(s.requested_by_name))}<br><small>${esc(fmt(s.requested_at))}</small></td><td>${esc(value(s.approved_by_name))}<br><small>${esc(fmt(s.approved_at||s.fulfilled_at))}</small></td></tr>`).join(''):'<tr><td colspan="8">No spare parts recorded for this Job Card.</td></tr>'}</tbody></table></div></section>
      <section class="bdr-section"><h3>Job Procedures / Activity Timeline</h3>${ev.length?ev.map(e=>`<div class="bdr-event"><b>${esc(value(e.action))} · ${esc(value(e.stage))}</b><small>${esc(value(e.department))} · ${esc(value(e.actor_name))} · ${esc(fmt(e.created_at))}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</div>`).join(''):'<div class="bdr-text">No workflow activity recorded yet.</div>'}</section>`;
  }

  async function openReport(button){
    const d=dialog(),body=d.querySelector('#bdrBody');const snapshotId=button.dataset.bdrView||'',caseId=button.dataset.caseId||'';d.dataset.snapshotId=snapshotId;d.dataset.caseId=caseId;body.textContent='Loading machine / Job Card report…';if(!d.open)d.showModal();
    try{const data=await authJson(detailUrl('detail',snapshotId,caseId));body.innerHTML=renderDetail(data);d.querySelector('#bdrSub').textContent=[data.customer,data.machine,data.fleetNumber?`Fleet ${data.fleetNumber}`:'',data.job?.job_card_no].filter(Boolean).join(' · ')}catch(e){body.innerHTML='<div class="bdr-banner historical">'+esc(e.message)+'</div>'}
  }
  async function download(format){const d=dialog();const url=detailUrl('detail-export',d.dataset.snapshotId||'',d.dataset.caseId||'',format);const r=await nativeFetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+token}});if(!r.ok){let msg='Download failed.';try{msg=(await r.json()).error||msg}catch(_){}alert(msg);return}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`BELM-breakdown-${d.dataset.snapshotId||d.dataset.caseId||'report'}.${format}`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}

  document.addEventListener('click',e=>{const v=e.target.closest?.('[data-bdr-view]');if(v){e.preventDefault();openReport(v);return}if(e.target.closest?.('[data-bdr-close]'))dialog().close();if(e.target.closest?.('[data-bdr-pdf]'))download('pdf');if(e.target.closest?.('[data-bdr-csv]'))download('csv')});
  ensureStyle();
  [200,600,1200,2500].forEach(ms=>setTimeout(patchTable,ms));
})();