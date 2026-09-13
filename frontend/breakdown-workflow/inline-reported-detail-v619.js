(()=>{
  const list=document.getElementById('caseList');
  const detailPanel=document.querySelector('.detail-panel');
  const detail=document.getElementById('caseDetail');
  const grid=document.querySelector('.grid');
  if(!list||!detailPanel||!detail||!grid)return;

  const fullQueueMode=document.documentElement.classList.contains('admin-job-cards-full-view');
  let pendingCard=null;
  const originalNext=detailPanel.nextSibling;

  const keepRightWorkspace=()=>{
    if(detailPanel.parentElement!==grid){
      if(originalNext&&originalNext.parentNode===grid)grid.insertBefore(detailPanel,originalNext);
      else grid.appendChild(detailPanel);
    }
    detailPanel.classList.remove('inline-case-detail');
    detailPanel.classList.add('reported-workspace-open');
  };

  const showFullProcess=()=>{
    document.documentElement.classList.add('belm-job-detail-full');
    detailPanel.classList.remove('inline-case-detail','reported-workspace-open');
    const root=detail.querySelector('.detail');
    if(root&&!root.querySelector('.belm-back-to-job-list')){
      const back=document.createElement('button');
      back.type='button';
      back.className='belm-back-to-job-list';
      back.textContent='← Back to Job Cards';
      back.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        document.documentElement.classList.remove('belm-job-detail-full');
        const card=pendingCard;
        pendingCard=null;
        requestAnimationFrame(()=>{
          if(card&&document.body.contains(card))card.scrollIntoView({behavior:'smooth',block:'center'});
          else grid.scrollIntoView({behavior:'smooth',block:'start'});
        });
      });
      root.insertBefore(back,root.firstChild);
    }
    requestAnimationFrame(()=>detailPanel.scrollIntoView({behavior:'smooth',block:'start',inline:'nearest'}));
  };

  if(fullQueueMode){
    document.documentElement.classList.add('belm-job-queue-full');
    detailPanel.classList.remove('inline-case-detail','reported-workspace-open');
  }else{
    keepRightWorkspace();
  }

  list.addEventListener('click',event=>{
    const card=event.target.closest('[data-case]');
    if(!card)return;
    pendingCard=card;

    const report=event.target.closest('.queue-message-block.report-message');
    if(!report)return;
    event.preventDefault();
    event.stopPropagation();
    card.click();
  },true);

  const observer=new MutationObserver(()=>{
    if(!pendingCard||!detail.children.length)return;
    if(fullQueueMode){
      showFullProcess();
      return;
    }
    keepRightWorkspace();
    pendingCard=null;
    requestAnimationFrame(()=>{
      detailPanel.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
    });
  });
  observer.observe(detail,{childList:true,subtree:false});
})();

// V742: the Job Card detail footer is for reviewing the assigned Technician's
// report. Dispatch stays in the dedicated Technician Dispatch workspace.
(()=>{
  const cache=new Map();
  let latest=null;
  const previousFetch=window.fetch.bind(window);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString([],{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})};

  function remember(data){
    if(!data?.job)return;
    latest=data;
    const j=data.job;
    if(j.id)cache.set(String(j.id),data);
    if(j.jobCardNo||j.job_card_no)cache.set(String(j.jobCardNo||j.job_card_no),data);
    queueMicrotask(patchModal);
  }

  window.fetch=async function(input,init){
    const response=await previousFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(response.ok&&/\/api\/job-card-detail(?:\?|$)/.test(url)){
        response.clone().json().then(remember).catch(()=>{});
      }
    }catch(_){/* review helper must never block the live request */}
    return response;
  };

  function addStyle(){
    if(document.getElementById('belm-tech-report-v742-style'))return;
    const style=document.createElement('style');
    style.id='belm-tech-report-v742-style';
    style.textContent=`
      .belm-tech-report-v742{margin-top:24px;padding:20px;border:1px solid #dbe5ef;border-radius:14px;background:#f8fbff;scroll-margin-top:16px}
      .belm-tech-report-v742 h3{margin:0 0 6px;color:#14375f;font-size:17px}.belm-tech-report-v742 .report-meta{margin:0 0 16px;color:#718399;font-size:12px;font-weight:700}
      .belm-tech-report-v742 .report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.belm-tech-report-v742 .report-field{padding:13px;border:1px solid #e0e7ef;border-radius:10px;background:#fff;min-width:0}
      .belm-tech-report-v742 .report-field.wide{grid-column:1/-1}.belm-tech-report-v742 .report-field span{display:block;margin-bottom:6px;color:#8090a5;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
      .belm-tech-report-v742 .report-field p{margin:0;color:#27384d;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.belm-tech-report-v742 .report-empty{padding:16px;border-radius:10px;background:#fff7d6;color:#745d00;font-weight:800}
      .belm-jc-btn-tech-report{background:#ffd400!important;color:#111!important}
      @media(max-width:700px){.belm-tech-report-v742 .report-grid{grid-template-columns:1fr}.belm-tech-report-v742 .report-field.wide{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function reportData(){
    const dialog=document.getElementById('belmJobCardDetailDialog');
    const no=String(dialog?.querySelector('.belm-jc-detail-head h2')?.textContent||'').trim();
    return cache.get(no)||latest;
  }

  function reportHtml(data){
    const j=data?.job||{};
    const diagnosis=String(j.diagnosis||'').trim();
    const work=String(j.work_done||j.workDone||'').trim();
    const test=String(j.test_result||j.testResult||'').trim();
    const note=String(j.completion_note||j.completionNote||'').trim();
    const hasReport=Boolean(diagnosis||work||test||note);
    const tech=String(j.technicianName||j.technician_name||'Technician');
    const repeated=Number(j.repeat_issue||j.repeatIssue||0)?'YES — repeated / rework':'NO';
    const status=String(j.status||j.current_stage||'OPEN').replaceAll('_',' ');
    if(!hasReport){
      return `<section id="belmTechReportV742" class="belm-tech-report-v742"><h3>TECHNICIAN REPORT</h3><p class="report-meta">${esc(tech)} · ${esc(status)}</p><div class="report-empty">Technician has not submitted a diagnosis / repair report yet.</div></section>`;
    }
    return `<section id="belmTechReportV742" class="belm-tech-report-v742"><h3>TECHNICIAN REPORT</h3><p class="report-meta">${esc(tech)} · Last update ${esc(fmt(j.updated_at||j.updatedAt))} · ${esc(status)}</p><div class="report-grid">
      <div class="report-field wide"><span>Diagnosis</span><p>${esc(diagnosis||'Not recorded')}</p></div>
      <div class="report-field wide"><span>Work / Repair Action</span><p>${esc(work||'Not recorded yet')}</p></div>
      <div class="report-field"><span>Test Result</span><p>${esc(test||'Not recorded yet')}</p></div>
      <div class="report-field"><span>Repeated Issue</span><p>${esc(repeated)}</p></div>
      <div class="report-field wide"><span>Completion Note</span><p>${esc(note||'Not recorded yet')}</p></div>
    </div></section>`;
  }

  async function loadCurrentData(){
    const current=reportData();
    if(current)return current;
    const dialog=document.getElementById('belmJobCardDetailDialog');
    const no=String(dialog?.querySelector('.belm-jc-detail-head h2')?.textContent||'').trim();
    if(!no)return null;
    const token=localStorage.getItem('belm_admin_token')||localStorage.getItem('belm_customer_token')||localStorage.getItem('belm_tech_token')||'';
    const r=await previousFetch('/api/job-card-detail?jobCardNo='+encodeURIComponent(no),{cache:'no-store',headers:{Authorization:'Bearer '+token}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}
    if(!r.ok)throw new Error(data?.error||'Could not load Technician Report.');
    remember(data);return data;
  }

  async function showReport(button){
    const idle=button.textContent;
    button.disabled=true;button.textContent='Loading Report...';
    try{
      const data=await loadCurrentData();
      const scroll=document.querySelector('#belmJobCardDetailDialog .belm-jc-detail-scroll');
      if(!scroll)return;
      scroll.querySelector('#belmTechReportV742')?.remove();
      scroll.insertAdjacentHTML('beforeend',reportHtml(data));
      const report=scroll.querySelector('#belmTechReportV742');
      report?.scrollIntoView({behavior:'smooth',block:'start'});
      button.textContent='Technician Report ✓';
    }catch(error){
      window.alert(error.message||'Could not load Technician Report.');
      button.textContent=idle;
    }finally{
      button.disabled=false;
    }
  }

  function patchModal(){
    addStyle();
    const dialog=document.getElementById('belmJobCardDetailDialog');
    if(!dialog)return;
    const dispatch=dialog.querySelector('[data-jc-dispatch]');
    if(dispatch){
      const button=dispatch.cloneNode(true);
      button.removeAttribute('data-jc-dispatch');
      button.setAttribute('data-jc-tech-report','');
      button.classList.add('belm-jc-btn-tech-report');
      button.textContent='View Technician Report';
      button.addEventListener('click',()=>showReport(button));
      dispatch.replaceWith(button);
    }
    const existing=dialog.querySelector('[data-jc-tech-report]');
    if(existing&&!existing.dataset.v742Bound){
      existing.dataset.v742Bound='1';
      existing.addEventListener('click',()=>showReport(existing));
    }
  }

  addStyle();
  const observer=new MutationObserver(patchModal);
  observer.observe(document.body,{childList:true,subtree:true});
  patchModal();
})();