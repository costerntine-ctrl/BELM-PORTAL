(()=>{
  if(window.__belmComponentRefreshV732)return;
  window.__belmComponentRefreshV732=true;

  const CANONICAL_LOGO='/concept-dashboards/10-system-settings/assets/img/belm-logo-v2.png?v=732-system-logo';
  const path=location.pathname;
  const params=new URLSearchParams(location.search);

  // Canonical BELM logo only. Dimensions/layout are inherited from the existing dashboard.
  function syncLogo(root=document){
    root.querySelectorAll?.('img').forEach(img=>{
      const src=String(img.getAttribute('src')||'').toLowerCase();
      const alt=String(img.getAttribute('alt')||'').toLowerCase();
      if(src.includes('belm-logo-v2.png') || (alt.includes('belm general technical service') && !src.includes('watermark'))){
        if(img.getAttribute('src')!==CANONICAL_LOGO) img.setAttribute('src',CANONICAL_LOGO);
      }
    });
    // Technician Job Card used a letter B as its mark. Replace only that component mark.
    if(path.startsWith('/technician-job-cards/')){
      const mark=root.querySelector?.('.topbar .brand .mark');
      if(mark && mark.dataset.belmLogo732!=='1'){
        mark.dataset.belmLogo732='1';
        mark.textContent='';
        const img=document.createElement('img');
        img.src=CANONICAL_LOGO;img.alt='BELM';
        img.style.cssText='width:100%;height:100%;object-fit:contain;display:block';
        mark.appendChild(img);
      }
    }
  }

  const style=document.createElement('style');
  style.id='belm-component-refresh-v732';
  style.textContent=`
    /* ================================================================
       V732 COMPONENT REFRESH ONLY
       DO NOT alter dashboard shells, sidebars, role cards or dashboard grids.
       ================================================================ */

    /* MACHINE CARDS — approved BELM dark machine-card language */
    .machine-card,.belm-customer-machine-card,.belm-technician-machine-card{
      --belm-machine-yellow:#ffe400;--belm-machine-green:#0f8f2e;--belm-machine-red:#e5484d;--belm-machine-border:#23262b;
      border-radius:12px!important;
      background:linear-gradient(180deg,#101113 0%,#0a0a0a 100%)!important;
      border-color:var(--belm-machine-border)!important;
      color:#eaf0f7!important;
      box-shadow:0 5px 18px rgba(0,0,0,.30)!important;
    }
    .machine-card:hover,.belm-customer-machine-card:hover,.belm-technician-machine-card:hover{
      border-color:rgba(255,228,0,.42)!important;box-shadow:0 10px 26px rgba(0,0,0,.40)!important;
    }
    .machine-card .belm-machine-display,.belm-customer-machine-card .belm-machine-display,.belm-technician-machine-card .belm-machine-display{
      background:#0b0d10!important;border-color:#2b3037!important;border-radius:10px!important;box-shadow:none!important;
    }
    .machine-card .belm-machine-display.display-green{border-color:#0f8f2e!important}
    .machine-card .belm-machine-display.display-yellow{border-color:#ffe400!important}
    .machine-card .belm-machine-display.display-red{border-color:#e5484d!important}
    .machine-card button,.machine-card a[class*="btn"],.belm-customer-machine-card button,.belm-technician-machine-card button{
      border-radius:8px!important;font-weight:800!important;
    }

    /* TECHNICIAN JOB CARD — restyle card only; page/dashboard structure untouched */
    body .job-card{
      --jc-yellow:#ffe400;--jc-green:#0f8f2e;--jc-red:#e5484d;--jc-border:#23262b;--jc-muted:#8fa3bd;
      background:linear-gradient(180deg,#101113,#0b0c0e)!important;border:1px solid var(--jc-border)!important;
      border-radius:12px!important;box-shadow:0 8px 24px rgba(0,0,0,.28)!important;overflow:hidden!important;
    }
    body .job-card::before{content:"";display:block;height:3px;background:var(--jc-yellow)}
    body .job-card .job-head{background:#0d0f12!important;border-bottom-color:var(--jc-border)!important}
    body .job-card .job-head h2{color:#fff!important}
    body .job-card .job-head small,body .job-card .fact span,body .job-card .process-title span{color:var(--jc-muted)!important}
    body .job-card .fact,body .job-card .fault,body .job-card .job-location,body .job-card .job-report>div{
      background:#0d0f12!important;border-color:var(--jc-border)!important;border-radius:9px!important;
    }
    body .job-card .process-bar span.done{background:var(--jc-green)!important}
    body .job-card .process-bar span.current{background:var(--jc-yellow)!important;box-shadow:0 0 10px rgba(255,228,0,.32)!important}
    body .job-card .actions button{border-radius:8px!important;font-weight:850!important}
    body .job-card .actions .green{background:var(--jc-green)!important;border-color:var(--jc-green)!important}
    body .job-card .actions .yellow{background:var(--jc-yellow)!important;border-color:var(--jc-yellow)!important;color:#080b0f!important}

    /* WORKSHOP MANAGER JOB CARD surfaces only. Dashboard cards/sidebar remain exactly as supplied. */
    html.admin-job-cards-full-view .job-process-panel,html.belm-jc-dashboard-v731 .job-process-panel{
      background:linear-gradient(180deg,#101113 0%,#0a0a0a 100%)!important;border:1px solid #23262b!important;
      border-radius:12px!important;box-shadow:0 8px 24px rgba(0,0,0,.24)!important;
    }
    html.admin-job-cards-full-view .job-process-table thead th,html.belm-jc-dashboard-v731 .job-process-table thead th{
      background:#0d0f12!important;color:#8fa3bd!important;border-color:#23262b!important;
    }
    html.admin-job-cards-full-view .job-process-table tbody td,html.belm-jc-dashboard-v731 .job-process-table tbody td{border-color:#23262b!important}
    html.admin-job-cards-full-view .job-process-table tbody tr:hover,html.belm-jc-dashboard-v731 .job-process-table tbody tr:hover{background:rgba(255,228,0,.045)!important}
    html.admin-job-cards-full-view .workflow-dispatch,html.belm-jc-dashboard-v731 .workflow-dispatch{border-radius:12px!important}

    /* Use the actual BELM logo inside the technician Job Card mark without resizing the topbar. */
    .technician-job-cards .mark img,.topbar .brand .mark img{max-width:100%;max-height:100%}
  `;
  document.head.appendChild(style);

  function boot(){
    syncLogo(document);
    const observer=new MutationObserver(records=>{
      for(const record of records){for(const node of record.addedNodes){if(node.nodeType===1)syncLogo(node)}}
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

// V733 - Workshop Manager Job Card Dashboard matched to the supplied reference image.
(()=>{
  const p=new URLSearchParams(location.search);
  const actor=String(p.get('actor')||p.get('source')||'').toLowerCase();
  const view=String(p.get('view')||'').toLowerCase();
  if(!location.pathname.startsWith('/breakdown-workflow')||actor!=='admin'||view!=='job-cards')return;

  const init=()=>{
    if(window.__belmJobCardReferenceV733)return;
    const summary=document.getElementById('summaryCards');
    const processPanel=document.getElementById('jobProcessPanel');
    const tbody=document.getElementById('jobProcessBody');
    const table=processPanel?.querySelector('.job-process-table');
    const filters=document.querySelector('main>.filters');
    const dispatch=document.getElementById('dispatchPanel');
    if(!summary||!processPanel||!tbody||!table||!filters){setTimeout(init,120);return;}
    window.__belmJobCardReferenceV733=true;
    document.documentElement.classList.add('belm-jc-reference-v733');

    const css=document.createElement('style');
    css.id='belm-job-card-reference-v733';
    css.textContent=`
      html.belm-jc-reference-v733 body{background:#eef3f7!important;color:#17324d!important}
      html.belm-jc-reference-v733 body>.topbar{display:none!important}
      html.belm-jc-reference-v733 main{max-width:none!important;width:100%!important;margin:0!important;padding:0 16px 22px!important;background:#eef3f7!important}
      html.belm-jc-reference-v733 main>.grid,html.belm-jc-reference-v733 #workshopReportPanel,html.belm-jc-reference-v733 .performance-panel,html.belm-jc-reference-v733 #technicianWorkloadPanel{display:none!important}
      html.belm-jc-reference-v733 #dispatchPanel:not(.jc-open){display:none!important}
      html.belm-jc-reference-v733 #dispatchPanel.jc-open{display:block!important;margin:14px 0!important}
      html.belm-jc-reference-v733 .jc-ref-head{margin:0 -16px 12px;padding:16px 24px;min-height:80px;background:#172232;border-bottom:3px solid #dfb600;display:flex;align-items:center;justify-content:space-between;gap:20px}
      html.belm-jc-reference-v733 .jc-ref-brand{display:flex;align-items:center;gap:12px;color:#fff}
      html.belm-jc-reference-v733 .jc-ref-brand img{width:52px;height:44px;object-fit:contain;background:#fff;border-radius:8px;padding:3px}
      html.belm-jc-reference-v733 .jc-ref-brand small{display:block;color:#b9c7d5;font-size:11px;margin-bottom:2px}
      html.belm-jc-reference-v733 .jc-ref-brand h1{margin:0;color:#fff!important;font-size:23px!important;line-height:1.1!important}
      html.belm-jc-reference-v733 .jc-ref-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex:1}
      html.belm-jc-reference-v733 .jc-ref-search{width:min(520px,48vw);height:38px;border:1px solid #34587d!important;border-radius:7px!important;background:#123b64!important;color:#fff!important;padding:0 13px!important;font-size:12px!important}
      html.belm-jc-reference-v733 .jc-ref-search::placeholder{color:#c1d2e3!important}
      html.belm-jc-reference-v733 .jc-ref-create{height:38px;border:0!important;border-radius:7px!important;background:#e4b900!important;color:#1c2530!important;padding:0 20px!important;font-weight:900!important;white-space:nowrap}
      html.belm-jc-reference-v733 .summary{display:grid!important;grid-template-columns:repeat(5,minmax(145px,1fr))!important;gap:9px!important;margin:0 0 11px!important}
      html.belm-jc-reference-v733 .jc-ref-kpi{min-height:66px!important;border:1px solid #dfe7ee!important;border-radius:8px!important;background:#fff!important;color:#17324d!important;text-align:left!important;padding:11px 14px!important;box-shadow:0 2px 9px rgba(33,60,86,.04)!important;cursor:pointer;position:relative;overflow:hidden}
      html.belm-jc-reference-v733 .jc-ref-kpi:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#8fa3b6}
      html.belm-jc-reference-v733 .jc-ref-kpi.blue:before{background:#2671d9}html.belm-jc-reference-v733 .jc-ref-kpi.purple:before{background:#7857d8}html.belm-jc-reference-v733 .jc-ref-kpi.green:before{background:#1ca66a}html.belm-jc-reference-v733 .jc-ref-kpi.amber:before{background:#d79a00}html.belm-jc-reference-v733 .jc-ref-kpi.red:before{background:#d43b3b}html.belm-jc-reference-v733 .jc-ref-kpi.orange:before{background:#e87b2f}
      html.belm-jc-reference-v733 .jc-ref-kpi b{display:block;color:#132943!important;font-size:23px!important;line-height:1!important;margin-bottom:5px!important}html.belm-jc-reference-v733 .jc-ref-kpi span{color:#63798e!important;font-size:11px!important;font-weight:750!important}
      html.belm-jc-reference-v733 .jc-ref-kpi.active{outline:2px solid #2369c9!important;outline-offset:1px;background:#f7fbff!important}
      html.belm-jc-reference-v733 .jc-ref-filters{display:grid!important;grid-template-columns:auto repeat(5,minmax(115px,1fr)) minmax(135px,.9fr) auto!important;gap:9px!important;align-items:end!important;background:#f8fafc!important;border:1px solid #dfe7ee!important;border-radius:8px!important;padding:11px 13px!important;margin:0 0 12px!important;box-shadow:none!important}
      html.belm-jc-reference-v733 .jc-ref-filters>strong{align-self:center;color:#264158!important;font-size:12px!important}
      html.belm-jc-reference-v733 .jc-ref-filters label{display:grid!important;gap:3px!important;margin:0!important;color:#63778a!important;font-size:9px!important;font-weight:800!important}
      html.belm-jc-reference-v733 .jc-ref-filters select,html.belm-jc-reference-v733 .jc-ref-filters input{height:33px!important;border:1px solid #d5e0e9!important;border-radius:6px!important;background:#fff!important;color:#30495f!important;padding:0 8px!important;font-size:10px!important;min-width:0!important}
      html.belm-jc-reference-v733 .jc-ref-clear{height:33px!important;border:1px solid #d5e0e9!important;border-radius:6px!important;background:#fff!important;color:#314b64!important;font-weight:800!important;padding:0 14px!important}
      html.belm-jc-reference-v733 #jobProcessPanel{display:block!important;margin:0!important;padding:0!important;background:#fff!important;border:1px solid #dfe7ee!important;border-radius:8px!important;box-shadow:0 2px 10px rgba(35,60,82,.04)!important;overflow:hidden!important}
      html.belm-jc-reference-v733 #jobProcessPanel>.panel-head{background:#fff!important;border-bottom:1px solid #e5ebf0!important;padding:10px 13px!important;min-height:46px!important;align-items:center!important}
      html.belm-jc-reference-v733 #jobProcessPanel>.panel-head h2{margin:0!important;color:#17324d!important;font-size:13px!important;font-weight:900!important}html.belm-jc-reference-v733 #jobProcessPanel>.panel-head p{display:none!important}
      html.belm-jc-reference-v733 #refreshJobProcess{margin-left:auto!important;background:#fff!important;color:#31506d!important;border:1px solid #d5e0ea!important;border-radius:6px!important;padding:6px 10px!important;font-size:10px!important}
      html.belm-jc-reference-v733 .job-process-table-wrap{overflow:auto!important;background:#fff!important}
      html.belm-jc-reference-v733 .job-process-table{min-width:1280px!important;width:100%!important;border-collapse:separate!important;border-spacing:0!important;background:#fff!important;color:#2f485f!important;font-size:10px!important}
      html.belm-jc-reference-v733 .job-process-table thead th{position:sticky;top:0;background:#14263a!important;color:#f0c500!important;border:0!important;padding:11px 9px!important;font-size:9px!important;font-weight:900!important;white-space:nowrap!important;text-align:left!important}
      html.belm-jc-reference-v733 .job-process-table tbody td{background:#fff!important;color:#30495f!important;border:0!important;border-bottom:1px solid #e8edf2!important;padding:9px!important;vertical-align:middle!important;line-height:1.25!important}
      html.belm-jc-reference-v733 .job-process-table tbody tr:nth-child(even) td{background:#fbfcfd!important}html.belm-jc-reference-v733 .job-process-table tbody tr:hover td{background:#f2f7fb!important}html.belm-jc-reference-v733 .job-process-table tbody tr[hidden]{display:none!important}
      html.belm-jc-reference-v733 .jc-ref-no{font-weight:900;color:#183b61!important;white-space:nowrap}html.belm-jc-reference-v733 .jc-ref-problem{min-width:160px;max-width:235px}html.belm-jc-reference-v733 td small{display:block;color:#788b9d!important;font-size:8.5px!important;margin-top:2px!important}
      html.belm-jc-reference-v733 .jc-pill{display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:4px 8px;border-radius:5px;font-size:8.5px;font-weight:900;white-space:nowrap}
      html.belm-jc-reference-v733 .pri-normal{background:#dcecff;color:#1761b1}.pri-high{background:#fff0c6;color:#916700}.pri-urgent,.pri-breakdown{background:#ffe0e0;color:#bd2828}.pri-low{background:#e9eef3;color:#607386}
      html.belm-jc-reference-v733 .proc-open{background:#e8eef5;color:#2d4b67}.proc-dispatched{background:#dcecff;color:#1761b1}.proc-received,.proc-completed{background:#d9f5e6;color:#13764b}.proc-under-diagnosis{background:#fff0c6;color:#986a00}.proc-waiting-for-spare{background:#ffe1e1;color:#bd2929}.proc-under-repair{background:#ffe8d7;color:#b45b18}.proc-testing{background:#dcecff;color:#1761b1}.proc-pending-approval{background:#eee2ff;color:#7142a9}
      html.belm-jc-reference-v733 .status-track,.status-completed{background:#d9f5e6;color:#137047}.status-overdue{background:#ffe1e1;color:#bd2929}
      html.belm-jc-reference-v733 .jc-ref-menu{width:26px!important;height:26px!important;border:0!important;background:transparent!important;color:#1c3a59!important;font-size:18px!important;padding:0!important;border-radius:5px!important}html.belm-jc-reference-v733 .jc-ref-menu:hover{background:#e9f1f7!important}
      html.belm-jc-reference-v733 .jc-ref-close{margin-left:auto!important;background:#fff!important;color:#243f59!important;border:1px solid #ccd8e3!important;border-radius:6px!important;padding:7px 12px!important;font-weight:800!important}
      @media(max-width:1180px){html.belm-jc-reference-v733 .summary{grid-template-columns:repeat(3,minmax(145px,1fr))!important}html.belm-jc-reference-v733 .jc-ref-filters{grid-template-columns:repeat(3,minmax(130px,1fr))!important}html.belm-jc-reference-v733 .jc-ref-filters>strong{grid-column:1/-1}}
      @media(max-width:760px){html.belm-jc-reference-v733 main{padding:0 7px 14px!important}html.belm-jc-reference-v733 .jc-ref-head{margin:0 -7px 9px;padding:12px 10px;display:grid!important}html.belm-jc-reference-v733 .jc-ref-actions{justify-content:stretch!important}html.belm-jc-reference-v733 .jc-ref-search{width:100%!important}html.belm-jc-reference-v733 .summary{grid-template-columns:repeat(2,minmax(125px,1fr))!important}html.belm-jc-reference-v733 .jc-ref-filters{grid-template-columns:repeat(2,minmax(120px,1fr))!important}}
    `;
    document.head.appendChild(css);

    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const text=v=>String(v??'').trim();
    const up=v=>text(v).toUpperCase();
    const localDate=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return text(v).slice(0,10);const z=d.getTimezoneOffset();return new Date(d.getTime()-z*60000).toISOString().slice(0,10)};
    const today=()=>localDate(new Date());
    const fmt=v=>{if(!v)return'—';const d=new Date(v);if(Number.isNaN(d.getTime()))return esc(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}<small>${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</small>`};
    const token=localStorage.getItem('belm_admin_token')||'';
    const get=async url=>{const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch{}if(!r.ok)throw new Error(d?.error||`Request failed (${r.status})`);return d};
    let rows=[];let active='ALL';

    const head=document.createElement('section');
    head.className='jc-ref-head';head.innerHTML=`<div class="jc-ref-brand"><img src="${CANONICAL_LOGO}" alt="BELM"><div><small>BELM Operations Portal / Workshop</small><h1>Job Card Dashboard</h1></div></div><div class="jc-ref-actions"><input id="jcRefSearch" class="jc-ref-search" type="search" placeholder="Tafuta Job Card No, Fleet No, Serial No, Customer, Technician..."><button id="jcRefCreate" class="jc-ref-create" type="button">Create Job Card</button></div>`;
    summary.before(head);

    filters.className='panel filters jc-ref-filters';filters.innerHTML=`<strong>Filters</strong><label>Customer<select id="jcRefCustomer"><option value="">Customer (Zote)</option></select></label><label>Machine<select id="jcRefMachine"><option value="">Machine (Zote)</option></select></label><label>Technician<select id="jcRefTech"><option value="">Technician (Wote)</option></select></label><label>Priority<select id="jcRefPriority"><option value="">Priority (Zote)</option></select></label><label>Service Provider<select id="jcRefProvider"><option value="">Service Provider (Zote)</option></select></label><label>Date<input id="jcRefDate" type="date"></label><button id="jcRefClear" class="jc-ref-clear" type="button">Futa</button>`;

    const openDispatch=(createMode,row)=>{
      if(!dispatch)return;dispatch.classList.add('jc-open');
      if(!dispatch.querySelector('.jc-ref-close')){const b=document.createElement('button');b.type='button';b.className='jc-ref-close';b.textContent='Close';b.onclick=()=>dispatch.classList.remove('jc-open');dispatch.querySelector('.workflow-dispatch-head')?.appendChild(b)}
      const mode=document.querySelector(`input[name="jobCardMode"][value="${createMode?'create':'existing'}"]`);if(mode){mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}))}
      if(row&&!createMode){const sel=document.getElementById('dispatchJobCard');if(sel&&row.jobId&&[...sel.options].some(o=>o.value===row.jobId)){sel.value=row.jobId;sel.dispatchEvent(new Event('change',{bubbles:true}))}else{const no=document.getElementById('dispatchJobCardNo');if(no){no.value=row.jobCardNo;no.dispatchEvent(new Event('change',{bubbles:true}))}}}
      dispatch.scrollIntoView({behavior:'smooth',block:'start'});
    };
    head.querySelector('#jcRefCreate').onclick=()=>openDispatch(true);

    const proc=(r,c)=>{const stage=up(r.current_stage||r.stage||c?.stage),status=up(r.status||c?.jobStatus),base=up(r.processCode).replaceAll('_','-');if(stage==='COMPLETED'||up(r.case_status||c?.status)==='COMPLETED'||status==='COMPLETED'||base==='COMPLETED')return'COMPLETED';if(status==='PENDING_APPROVAL'||stage==='PENDING_APPROVAL'||base==='PENDING-APPROVAL')return'PENDING_APPROVAL';if(stage==='TESTING'||base==='TESTING')return'TESTING';if(status==='WAITING_FOR_PARTS'||base==='WAITING-FOR-SPARE'||['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS'].includes(stage))return'WAITING_FOR_SPARE';if(stage==='REPAIR'||status==='IN_PROGRESS')return'UNDER_REPAIR';if(stage==='DIAGNOSIS'||base==='DIAGNOSIS-REPORT')return'UNDER_DIAGNOSIS';if(base==='OPENED'||status==='RECEIVED'||r.started_at)return'RECEIVED';if(r.technician_id||text(r.technicianName)||c?.technicianId)return'DISPATCHED';return'OPEN'};
    const procLabel=k=>({OPEN:'Open',DISPATCHED:'Dispatched',RECEIVED:'Received',UNDER_DIAGNOSIS:'Under Diagnosis',WAITING_FOR_SPARE:'Waiting for Spare',UNDER_REPAIR:'Under Repair',TESTING:'Testing',PENDING_APPROVAL:'Pending Approval',COMPLETED:'Completed'})[k]||'Open';

    const merge=(processRows,cases,dispatchData)=>{const byNo=new Map((cases||[]).filter(x=>x.jobCardNo).map(x=>[up(x.jobCardNo),x])),disp=new Map((dispatchData?.jobCards||dispatchData?.receivedJobCards||[]).filter(x=>x.jobCardNo).map(x=>[up(x.jobCardNo),x])),out=[],seen=new Set();for(const r of processRows||[]){const no=text(r.job_card_no||r.jobCardNo),k=up(no),c=byNo.get(k),d=disp.get(k),pk=proc(r,c);out.push({jobId:text(r.id||d?.id),jobCardNo:no||'Job Card',customer:text(r.companyName||c?.customerName||d?.customerName)||'Customer',machine:text(r.machine_type||c?.machineType||d?.machine_type||d?.machineLabel||r.brand||r.model)||'Machine',fleet:text(r.fleetNumber||c?.fleetNumber||d?.fleetNumber)||'—',serial:text(r.serial_number||c?.serialNumber||d?.machineSerial),technician:text(r.technicianName||c?.technicianName||d?.technicianName)||'Unassigned',problem:text(c?.description||c?.title||d?.title||r.blocker_reason||r.processDetail)||'—',priority:up(d?.priority)||((up(c?.sourceType)==='BREAKDOWN_CASE')?'BREAKDOWN':'NORMAL'),processKey:pk,process:procLabel(pk),created:c?.openedAt||d?.issuedAt||r.started_at||r.updated_at,updated:r.updated_at||c?.stageStartedAt||c?.openedAt,due:d?.due_date||'',delayed:!!c?.delayed,sourceType:up(c?.sourceType||d?.sourceType),provider:c?.customerManagesWorkshop?'Customer Workshop':'BELM',completedAt:r.completed_at||c?.closedAt||null});seen.add(k)}for(const c of cases||[]){const no=text(c.jobCardNo),k=up(no);if(!no||seen.has(k))continue;const d=disp.get(k),pk=proc({},c);out.push({jobId:text(c.jobCardId||d?.id),jobCardNo:no,customer:text(c.customerName)||'Customer',machine:text(c.machineType||c.machineLabel)||'Machine',fleet:text(c.fleetNumber)||'—',serial:text(c.serialNumber),technician:text(c.technicianName)||'Unassigned',problem:text(c.description||c.title)||'—',priority:up(d?.priority)||((up(c.sourceType)==='BREAKDOWN_CASE')?'BREAKDOWN':'NORMAL'),processKey:pk,process:procLabel(pk),created:c.openedAt,updated:c.stageStartedAt||c.openedAt,due:d?.due_date||'',delayed:!!c.delayed,sourceType:up(c.sourceType),provider:c.customerManagesWorkshop?'Customer Workshop':'BELM',completedAt:c.closedAt||null})}return out.sort((a,b)=>new Date(b.updated||b.created||0)-new Date(a.updated||a.created||0))};
    const state=r=>r.processKey==='COMPLETED'?{k:'completed',l:'Completed'}:((r.due&&localDate(r.due)<today())||r.delayed)?{k:'overdue',l:'OVERDUE'}:{k:'track',l:'On Track'};
    const cardMatch=r=>active==='ALL'||(active==='OPEN_JOBS'&&r.processKey!=='COMPLETED')||(active==='COMPLETED_TODAY'&&r.processKey==='COMPLETED'&&localDate(r.completedAt||r.updated)===today())||(active==='OVERDUE'&&state(r).k==='overdue')||(active==='BREAKDOWNS'&&(r.sourceType==='BREAKDOWN_CASE'||r.priority==='BREAKDOWN'))||r.processKey===active;
    const setOpts=(id,vals,label)=>{const e=document.getElementById(id);if(!e)return;const cur=e.value,u=[...new Set(vals.filter(Boolean))].sort();e.innerHTML=`<option value="">${label}</option>`+u.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(u.includes(cur))e.value=cur};
    const renderFilters=()=>{setOpts('jcRefCustomer',rows.map(r=>r.customer),'Customer (Zote)');setOpts('jcRefMachine',rows.map(r=>r.machine),'Machine (Zote)');setOpts('jcRefTech',rows.map(r=>r.technician).filter(x=>x!=='Unassigned'),'Technician (Wote)');setOpts('jcRefPriority',rows.map(r=>r.priority),'Priority (Zote)');setOpts('jcRefProvider',rows.map(r=>r.provider),'Service Provider (Zote)')};
    const apply=()=>{const q=up(document.getElementById('jcRefSearch')?.value),cu=text(document.getElementById('jcRefCustomer')?.value),ma=text(document.getElementById('jcRefMachine')?.value),te=text(document.getElementById('jcRefTech')?.value),pr=text(document.getElementById('jcRefPriority')?.value),pv=text(document.getElementById('jcRefProvider')?.value),dt=text(document.getElementById('jcRefDate')?.value);tbody.querySelectorAll('tr[data-ref-row]').forEach((tr,i)=>{const r=rows[i],hay=up([r.jobCardNo,r.customer,r.machine,r.fleet,r.serial,r.technician,r.problem,r.priority,r.process].join(' '));tr.hidden=!(cardMatch(r)&&(!q||hay.includes(q))&&(!cu||r.customer===cu)&&(!ma||r.machine===ma)&&(!te||r.technician===te)&&(!pr||r.priority===pr)&&(!pv||r.provider===pv)&&(!dt||localDate(r.created)===dt))})};
    const renderSummary=()=>{const n=f=>rows.filter(f).length,cards=[['OPEN_JOBS','Open Jobs',n(r=>r.processKey!=='COMPLETED'),'blue'],['DISPATCHED','Dispatched',n(r=>r.processKey==='DISPATCHED'),'purple'],['RECEIVED','Received',n(r=>r.processKey==='RECEIVED'),'green'],['UNDER_DIAGNOSIS','Under Diagnosis',n(r=>r.processKey==='UNDER_DIAGNOSIS'),'amber'],['WAITING_FOR_SPARE','Waiting for Spare',n(r=>r.processKey==='WAITING_FOR_SPARE'),'red'],['UNDER_REPAIR','Under Repair',n(r=>r.processKey==='UNDER_REPAIR'),'orange'],['TESTING','Testing',n(r=>r.processKey==='TESTING'),'blue'],['COMPLETED_TODAY','Completed Today',n(r=>r.processKey==='COMPLETED'&&localDate(r.completedAt||r.updated)===today()),'green'],['OVERDUE','Overdue Jobs',n(r=>state(r).k==='overdue'),'red'],['BREAKDOWNS','Breakdowns',n(r=>r.sourceType==='BREAKDOWN_CASE'||r.priority==='BREAKDOWN'),'']];summary.innerHTML=cards.map(([k,l,n,t])=>`<button class="jc-ref-kpi ${t} ${active===k?'active':''}" data-card="${k}" type="button"><b>${n}</b><span>${l}</span></button>`).join('');summary.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{active=active===b.dataset.card?'ALL':b.dataset.card;renderSummary();apply()})};
    const renderTable=()=>{processPanel.classList.remove('hidden');const h=processPanel.querySelector('.panel-head h2');if(h)h.textContent=`Job Cards (${rows.length})`;const d=processPanel.querySelector('.panel-head p');if(d)d.textContent='';const refresh=processPanel.querySelector('#refreshJobProcess');if(refresh){refresh.textContent='Refresh';refresh.onclick=load};table.querySelector('thead').innerHTML='<tr><th>JOB CARD NO.</th><th>CUSTOMER</th><th>MACHINE</th><th>FLEET NO.</th><th>TECHNICIAN</th><th>REPORTED PROBLEM</th><th>PRIORITY</th><th>CURRENT PROCESS</th><th>CREATED</th><th>UPDATED</th><th>STATUS</th><th>ACTIONS</th></tr>';tbody.innerHTML=rows.length?rows.map(r=>{const s=state(r),pc=r.priority.toLowerCase().replace(/[^a-z0-9]+/g,'-'),kc=r.processKey.toLowerCase().replaceAll('_','-');return `<tr data-ref-row="1"><td><span class="jc-ref-no">${esc(r.jobCardNo)}</span></td><td>${esc(r.customer)}</td><td>${esc(r.machine)}${r.serial?`<small>${esc(r.serial)}</small>`:''}</td><td><b>${esc(r.fleet)}</b></td><td>${esc(r.technician)}</td><td class="jc-ref-problem">${esc(r.problem)}</td><td><span class="jc-pill pri-${pc}">${esc(r.priority)}</span></td><td><span class="jc-pill proc-${kc}">${esc(r.process)}</span></td><td>${fmt(r.created)}</td><td>${fmt(r.updated)}</td><td><span class="jc-pill status-${s.k}">${esc(s.l)}</span></td><td><button class="jc-ref-menu" type="button">⋮</button></td></tr>`}).join(''):'<tr><td colspan="12">No Job Cards found.</td></tr>';tbody.querySelectorAll('.jc-ref-menu').forEach((b,i)=>b.onclick=()=>openDispatch(false,rows[i]));renderFilters();renderSummary();apply()};
    const load=async()=>{try{const [pr,ca,di]=await Promise.all([get(`/api/engineering?action=job-process&_=${Date.now()}`),get(`/api/breakdown-workflow?_=${Date.now()}`).catch(()=>[]),get(`/api/engineering?action=dispatch-options&skipSync=1&_=${Date.now()}`).catch(()=>({jobCards:[]}))]);rows=merge(pr,ca,di);renderTable()}catch(e){tbody.innerHTML=`<tr><td colspan="12">${esc(e.message||'Could not load Job Cards.')}</td></tr>`}};

    document.getElementById('jcRefSearch').oninput=apply;filters.querySelectorAll('select,input').forEach(x=>x.oninput=apply);document.getElementById('jcRefClear').onclick=()=>{filters.querySelectorAll('select,input').forEach(x=>x.value='');document.getElementById('jcRefSearch').value='';active='ALL';renderSummary();apply()};
    if(dispatch)dispatch.classList.remove('jc-open');
    new MutationObserver(()=>{if([...tbody.querySelectorAll('tr')].some(r=>r.children.length===6))setTimeout(load,30)}).observe(tbody,{childList:true});
    load();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();