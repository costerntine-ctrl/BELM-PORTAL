// V624 — PORTAL-CWM Customer Machine Checklist Template live sync status.
// Read-only verification against BELM master checklist_templates. No customer copy is created.
(function(){
  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function json(url){
    const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}
    if(!r.ok)throw new Error(d?.error||`Sync failed (${r.status})`);
    return d;
  }
  function ensureCard(){
    let card=document.getElementById('cwmChecklistMasterSync');
    if(card)return card;
    const host=document.querySelector('.shell');
    const grid=document.getElementById('cwmCardGrid');
    if(!host||!grid)return null;
    card=document.createElement('button');
    card.type='button';
    card.id='cwmChecklistMasterSync';
    card.className='cwm-checklist-master-sync';
    card.innerHTML='<span class="sync-icon">⇄</span><span class="sync-copy"><b>Customer Machine ↔ Checklist Template Sync</b><small data-sync-status>Checking BELM master templates…</small></span><span class="sync-arrow">›</span>';
    host.insertBefore(card,grid);
    return card;
  }
  function ensureStyle(){
    if(document.getElementById('cwmChecklistSyncStyle'))return;
    const s=document.createElement('style');s.id='cwmChecklistSyncStyle';s.textContent=`
      .cwm-checklist-master-sync{width:100%;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;text-align:left;margin:0 0 16px;padding:16px 18px;border-radius:16px;border:1px solid #315a7d;border-left:5px solid #1684ff;background:linear-gradient(145deg,#0b1d31,#0d2740);color:#fff;box-shadow:0 8px 20px rgba(4,25,48,.18);cursor:pointer}
      .cwm-checklist-master-sync .sync-icon{font-size:22px;color:#16c778;font-weight:900}.cwm-checklist-master-sync b{display:block;font-size:14px;line-height:1.25}.cwm-checklist-master-sync small{display:block;margin-top:4px;color:#b8c8d8;font-size:12px}.cwm-checklist-master-sync .sync-arrow{font-size:26px;color:#f5c522}.cwm-checklist-master-sync.is-ok{border-left-color:#16c778}.cwm-checklist-master-sync.is-warn{border-left-color:#f5c522}.cwm-checklist-master-sync.is-error{border-left-color:#ff4657}
      .cwm-sync-dialog{border:0;border-radius:18px;background:#0b1d31;color:#fff;width:min(680px,calc(100% - 24px));max-height:82vh;padding:0;box-shadow:0 25px 70px rgba(0,0,0,.45)}.cwm-sync-dialog::backdrop{background:rgba(4,14,26,.72)}.cwm-sync-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:18px 20px;border-bottom:1px solid #244b69}.cwm-sync-head h2{margin:0;font-size:19px}.cwm-sync-head button{border:1px solid #315a7d;background:#071827;color:#fff;border-radius:10px;padding:7px 11px}.cwm-sync-body{padding:18px;overflow:auto}.cwm-sync-row{padding:13px 14px;margin-bottom:10px;border:1px solid #244b69;border-radius:13px;background:#0d2740}.cwm-sync-row strong{display:block}.cwm-sync-row small{display:block;color:#a8bacb;margin-top:4px}.cwm-sync-row.ok{border-left:4px solid #16c778}.cwm-sync-row.warn{border-left:4px solid #f5c522}.cwm-sync-note{font-size:12px;color:#9fb4c9;margin-top:12px;line-height:1.45}
    `;document.head.appendChild(s);
  }
  let result=[];
  async function sync(){
    ensureStyle();const card=ensureCard();if(!card)return;
    const status=card.querySelector('[data-sync-status]');card.classList.remove('is-ok','is-warn','is-error');status.textContent='Checking BELM master templates…';
    try{
      const dash=await json('/api/customer-portal/dashboard');
      const machines=Array.isArray(dash?.machines)?dash.machines:[];
      result=await Promise.all(machines.map(async m=>{
        try{
          const d=await json('/api/customer-checkup?machine='+encodeURIComponent(m.id));
          const templates=Array.isArray(d?.templates)?d.templates:[];
          return {machine:m,machineType:d?.machine?.machineType||m.machineType||m.machine_type||'',templates,ok:templates.length>0};
        }catch(error){return {machine:m,machineType:m.machineType||m.machine_type||'',templates:[],ok:false,error:error.message};}
      }));
      const ok=result.filter(x=>x.ok).length;
      if(!machines.length){status.textContent='No customer machines to check.';card.classList.add('is-warn');return;}
      if(ok===machines.length){status.textContent=`Synced · ${ok}/${machines.length} machine${machines.length===1?'':'s'} matched to active BELM template${ok===1?'':'s'}.`;card.classList.add('is-ok');}
      else{status.textContent=`${ok}/${machines.length} synced · ${machines.length-ok} machine${machines.length-ok===1?'':'s'} need a matching active template.`;card.classList.add('is-warn');}
    }catch(error){status.textContent=error.message||'Could not check template sync.';card.classList.add('is-error');}
  }
  function openDetails(){
    document.getElementById('cwmChecklistSyncDialog')?.remove();
    const d=document.createElement('dialog');d.id='cwmChecklistSyncDialog';d.className='cwm-sync-dialog';
    d.innerHTML=`<div class="cwm-sync-head"><h2>Checklist Template Sync</h2><button type="button">Close</button></div><div class="cwm-sync-body">${result.length?result.map(x=>{const name=[x.machine?.brand,x.machine?.model].filter(Boolean).join(' ')||x.machine?.model||'Machine';const names=x.templates.map(t=>t.name).filter(Boolean);return `<div class="cwm-sync-row ${x.ok?'ok':'warn'}"><strong>${esc(name)} · ${esc(x.machineType||'Machine type not set')}</strong><small>${x.ok?`BELM Master: ${esc(names.join(', ')||'Active template matched')}`:`No active BELM Checklist Template matches this Machine Type${x.error?` · ${esc(x.error)}`:''}.`}</small></div>`}).join(''):'<div class="cwm-sync-row warn"><strong>No sync result yet.</strong><small>Press Refresh to check the BELM master Checklist Templates.</small></div>'}<p class="cwm-sync-note">This is a live link to BELM Checklist Templates. CWM does not create a duplicate template. When BELM edits or activates the matching Machine Type template, Customer Check Up uses the updated master automatically.</p></div>`;
    document.body.appendChild(d);d.querySelector('button').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.showModal();
  }
  document.addEventListener('click',e=>{if(e.target.closest('#cwmChecklistMasterSync'))openDetails();});
  window.addEventListener('load',()=>setTimeout(sync,500));
  document.addEventListener('click',e=>{if(e.target.closest('#refreshButton,[data-cwm-refresh]'))setTimeout(sync,800);});
})();
