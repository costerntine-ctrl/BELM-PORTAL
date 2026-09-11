(()=>{
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||params.get('source')||'').toLowerCase();
  const isWorkshopJobCards=params.get('embed')==='1'&&actor==='admin'&&String(params.get('view')||'').toLowerCase()==='job-cards';
  if(!isWorkshopJobCards||window.__belmJobCardApprovalV739)return;
  window.__belmJobCardApprovalV739=true;

  let currentRef=null;
  let hooked=false;
  let busy=false;
  const token=()=>localStorage.getItem('belm_admin_token')||'';
  const norm=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,'_');

  function installStyle(){
    if(document.getElementById('belm-jc-approval-v739-style'))return;
    const style=document.createElement('style');
    style.id='belm-jc-approval-v739-style';
    style.textContent=`
      .belm-jc-approval-panel{margin:16px 22px 0;padding:16px;border:1px solid rgba(240,196,0,.55);border-radius:13px;background:rgba(240,196,0,.08);box-sizing:border-box}
      .belm-jc-approval-panel h3{margin:0 0 5px;font-size:15px;letter-spacing:.02em}
      .belm-jc-approval-panel p{margin:0 0 11px;color:#62748a;font-size:12px;line-height:1.45}
      .belm-jc-approval-panel textarea{display:block;width:100%;min-height:72px;resize:vertical;box-sizing:border-box;border:1px solid #b9c7d8;border-radius:9px;padding:10px 12px;font:inherit;background:#fff;color:#102033;outline:none}
      .belm-jc-approval-panel textarea:focus{border-color:#2577d8;box-shadow:0 0 0 2px rgba(37,119,216,.12)}
      .belm-jc-approval-controls{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:11px}
      .belm-jc-review-return,.belm-jc-review-approve{min-height:42px;padding:0 18px;border-radius:9px;font-weight:900;cursor:pointer}
      .belm-jc-review-return{border:1px solid #d78b24;background:#fff7e9;color:#9a5700}
      .belm-jc-review-approve{border:1px solid #15944e;background:#19a85a;color:#fff}
      .belm-jc-review-return:disabled,.belm-jc-review-approve:disabled{opacity:.55;cursor:wait}
      .belm-jc-approval-message{min-height:18px;margin-top:8px!important;font-weight:800!important}
      .belm-jc-approval-message.is-error{color:#c62828!important}.belm-jc-approval-message.is-ok{color:#128348!important}
      @media(max-width:600px){.belm-jc-approval-panel{margin:12px 12px 0}.belm-jc-approval-controls{display:grid;grid-template-columns:1fr}.belm-jc-review-return,.belm-jc-review-approve{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function currentStatus(dialog){
    const facts=[...dialog.querySelectorAll('.belm-jc-job-fact')];
    const item=facts.find(f=>norm(f.querySelector('span')?.textContent)==='CURRENT_STATUS');
    return norm(item?.querySelector('b')?.textContent||'');
  }

  async function resolveJobId(){
    if(currentRef?.id)return String(currentRef.id);
    const no=String(currentRef?.jobCardNo||'').trim();
    if(!no)return'';
    const r=await fetch(`/api/job-card-detail?jobCardNo=${encodeURIComponent(no)}`,{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!r.ok)throw new Error(data?.error||`Could not load Job Card (${r.status}).`);
    const id=data?.job?.id||'';
    if(id)currentRef={...currentRef,id};
    return String(id||'');
  }

  async function review(approve,panel){
    if(busy)return;
    const note=String(panel.querySelector('[data-jc-review-note]')?.value||'').trim();
    const message=panel.querySelector('[data-jc-review-message]');
    message.className='belm-jc-approval-message';
    message.textContent='';
    if(!approve&&!note){message.classList.add('is-error');message.textContent='Enter a reason before returning the Job Card to the Technician.';return;}
    if(approve&&!confirm('Approve this Technician report and mark the Job Card COMPLETED?'))return;
    try{
      busy=true;
      panel.querySelectorAll('button').forEach(b=>b.disabled=true);
      const id=await resolveJobId();
      if(!id)throw new Error('Job Card ID was not found. Close and open the Job Card again.');
      const response=await fetch(`/api/breakdown-workflow/job-cards/${encodeURIComponent(id)}/review`,{
        method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token()}`},body:JSON.stringify({approve:Boolean(approve),note})
      });
      const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
      if(!response.ok)throw new Error(data?.error||`Review failed (${response.status}).`);
      message.classList.add('is-ok');
      message.textContent=approve?'Approved. Job Card is now COMPLETED.':'Returned to Technician for correction / additional work.';
      document.getElementById('refreshButton')?.click();
      document.getElementById('refreshJobProcess')?.click();
      window.dispatchEvent(new CustomEvent('belm-job-card-changed'));
      if(window.BELMJobCardDetail?.open)await window.BELMJobCardDetail.open({id});
    }catch(error){
      message.classList.add('is-error');
      message.textContent=error.message||'Approval could not be saved.';
    }finally{
      busy=false;
      panel.querySelectorAll('button').forEach(b=>b.disabled=false);
    }
  }

  function enhance(){
    installStyle();
    const dialog=document.getElementById('belmJobCardDetailDialog');
    if(!dialog?.open)return;
    const status=currentStatus(dialog);
    const old=dialog.querySelector('.belm-jc-approval-panel');
    if(status!=='PENDING_APPROVAL'){old?.remove();return;}
    if(old)return;
    const actions=dialog.querySelector('.belm-jc-detail-actions');
    if(!actions)return;
    const panel=document.createElement('section');
    panel.className='belm-jc-approval-panel';
    panel.innerHTML=`<h3>WORK APPROVAL</h3><p>Technician has submitted this Job Card for review. Approve to complete the work, or return it to the Technician with a reason.</p><textarea data-jc-review-note placeholder="Review note (required when returning)"></textarea><p class="belm-jc-approval-message" data-jc-review-message></p><div class="belm-jc-approval-controls"><button type="button" class="belm-jc-review-return" data-jc-return>Return to Technician</button><button type="button" class="belm-jc-review-approve" data-jc-approve>Approve & Complete</button></div>`;
    actions.before(panel);
    panel.querySelector('[data-jc-return]').addEventListener('click',()=>review(false,panel));
    panel.querySelector('[data-jc-approve]').addEventListener('click',()=>review(true,panel));
  }

  function hookDetail(){
    if(hooked)return;
    const api=window.BELMJobCardDetail;
    if(!api||typeof api.open!=='function')return;
    const original=api.open.bind(api);
    api.open=async ref=>{currentRef=ref||{};const out=await original(ref);requestAnimationFrame(enhance);return out};
    hooked=true;
  }

  installStyle();
  const observer=new MutationObserver(()=>{hookDetail();enhance()});
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  const timer=setInterval(()=>{hookDetail();enhance();if(hooked)clearInterval(timer)},150);
  hookDetail();
})();