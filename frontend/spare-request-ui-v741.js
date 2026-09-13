(function(){
  'use strict';

  const UNIT_OPTIONS = [
    ['pcs','pcs'],['set','sets'],['pair','pairs'],['liter','liters'],['ml','ml'],
    ['kg','kg'],['g','grams'],['meter','meters'],['cm','cm'],['mm','mm'],
    ['box','boxes'],['roll','rolls'],['bottle','bottles'],['bag','bags'],
    ['drum','drums'],['gallon','gallons']
  ];

  let technicianJobs = [];
  let latestCase = null;
  let latestCaseId = '';

  function parseToken(token){
    if(!token) return null;
    try{
      const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    }catch(_){return null;}
  }

  function activeActor(){
    const p=new URLSearchParams(location.search);
    const requested=String(p.get('actor')||p.get('source')||'').toLowerCase();
    const adminToken=localStorage.getItem('belm_admin_token')||'';
    const techToken=localStorage.getItem('belm_tech_token')||'';
    const customerToken=localStorage.getItem('belm_customer_token')||'';
    if(requested==='admin' && adminToken) return {kind:'admin',token:adminToken,payload:parseToken(adminToken)};
    if((requested==='tech'||requested==='technician') && techToken) return {kind:'tech',token:techToken,payload:parseToken(techToken)};
    if(requested==='customer' && customerToken) return {kind:'customer',token:customerToken,payload:parseToken(customerToken)};
    if(location.pathname.includes('/technician-job-cards/')){
      const t=parseToken(techToken),c=parseToken(customerToken);
      if(t && String(t.roleName||t.role||'').toLowerCase().includes('technician')) return {kind:'tech',token:techToken,payload:t};
      if(c && String(c.customerRole||c.roleName||c.role||'').toLowerCase().includes('technician')) return {kind:'customer-tech',token:customerToken,payload:c};
    }
    if(adminToken) return {kind:'admin',token:adminToken,payload:parseToken(adminToken)};
    if(customerToken) return {kind:'customer',token:customerToken,payload:parseToken(customerToken)};
    return {kind:'',token:'',payload:null};
  }

  function roleName(actor){
    const p=actor?.payload||{};
    return String(p.roleName||p.role||p.customerRole||'').trim().toLowerCase().replace(/[_-]+/g,' ');
  }

  function canApproveWaitingSpare(){
    const actor=activeActor();
    if(actor.kind==='admin'){
      const role=roleName(actor);
      if(['super admin','engineer','workshop manager'].includes(role)) return true;
      try{
        const user=JSON.parse(localStorage.getItem('belm_admin_user')||'null');
        const r=String(user?.role||user?.roleName||'').toLowerCase();
        return ['super admin','engineer','workshop manager'].includes(r) || user?.allowedPages===null;
      }catch(_){return false;}
    }
    if(actor.kind==='customer'){
      const p=actor.payload||{};
      const r=roleName(actor);
      return String(p.actorType||'').toLowerCase()==='owner' || ['admin','workshop manager'].includes(r);
    }
    return false;
  }

  function enhanceUnitField(){
    const current=document.getElementById('spareUnit');
    if(!current || current.tagName==='SELECT') return;
    const select=document.createElement('select');
    Array.from(current.attributes).forEach(a=>{
      if(a.name!=='type' && a.name!=='value') select.setAttribute(a.name,a.value);
    });
    select.id='spareUnit';
    const currentValue=String(current.value||'pcs').trim().toLowerCase();
    UNIT_OPTIONS.forEach(([value,label])=>{
      const option=document.createElement('option');
      option.value=value;
      option.textContent=label;
      if(value===currentValue || label===currentValue) option.selected=true;
      select.appendChild(option);
    });
    if(!Array.from(select.options).some(o=>o.selected)) select.value='pcs';
    current.replaceWith(select);
  }

  function injectStyles(){
    if(document.getElementById('spareUiV741Style')) return;
    const style=document.createElement('style');
    style.id='spareUiV741Style';
    style.textContent=`
      .spare-acceptance-state{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:9px;font-size:11px;font-weight:900;line-height:1;border:1px solid rgba(255,255,255,.2);background:rgba(27,93,164,.18);color:#dcecff}
      .spare-acceptance-state.waiting{background:rgba(244,197,28,.14);border-color:rgba(244,197,28,.55);color:#ffe487}
      .spare-acceptance-state.approved{background:rgba(40,190,113,.14);border-color:rgba(40,190,113,.55);color:#98f3bd}
      .spare-acceptance-state.rejected{background:rgba(231,76,60,.14);border-color:rgba(231,76,60,.55);color:#ffaaa1}
      .spare-v741-approve,.spare-v741-reject{border:0;border-radius:9px;padding:9px 12px;font-weight:900;cursor:pointer}
      .spare-v741-approve{background:#2fc16e;color:#07180f}.spare-v741-reject{background:#d94a4a;color:#fff}
      .spare-v741-approve[disabled],.spare-v741-reject[disabled]{opacity:.65;cursor:wait}
      #spareUnit{min-height:42px;width:100%;border-radius:9px}
    `;
    document.head.appendChild(style);
  }

  function spareStageLabel(job){
    const stage=String(job?.current_stage||job?.currentStage||'').toUpperCase();
    if(stage==='BOSS_APPROVAL') return {text:'Waiting Administration Approval',cls:'waiting'};
    if(stage==='STORE_CHECK') return {text:'Approved ✓ · Store Check',cls:'approved'};
    if(stage==='PROCUREMENT') return {text:'Approved ✓ · Procurement',cls:'approved'};
    if(stage==='ACCOUNTS') return {text:'Approved ✓ · Accounts / PI',cls:'approved'};
    if(stage==='PARTS_READY') return {text:'Parts Ready ✓',cls:'approved'};
    return {text:'Spare Request Active',cls:'waiting'};
  }

  function patchTechnicianCards(){
    if(!location.pathname.includes('/technician-job-cards/')) return;
    const cards=Array.from(document.querySelectorAll('#jobList .job-card'));
    cards.forEach(card=>{
      const heading=String(card.querySelector('h2')?.textContent||'');
      const job=technicianJobs.find(j=>{
        const no=String(j.job_card_no||j.jobCardNo||'');
        return no && heading.includes(no);
      });
      if(!job) return;
      card.querySelectorAll('.spare-acceptance-state[data-v741="tech"]').forEach(x=>x.remove());
      const button=card.querySelector('button[data-spare]');
      const open=Number(job.openSpareRequests||job.open_spare_requests||0);
      if(button) button.textContent=open>0?'Request Another Spare':'Request Spare';
      if(open<=0) return;
      const actions=button?.closest('.actions');
      if(!actions) return;
      const state=spareStageLabel(job);
      const badge=document.createElement('span');
      badge.className='spare-acceptance-state '+state.cls;
      badge.dataset.v741='tech';
      badge.textContent=state.text;
      actions.insertBefore(badge,button||actions.firstChild);
    });
  }

  function spareStatusClass(status){
    status=String(status||'').toUpperCase();
    if(status==='REJECTED') return 'rejected';
    if(['APPROVED','STORE_AVAILABLE','PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED','PARTS_READY'].includes(status)) return 'approved';
    return 'waiting';
  }

  function spareStatusText(status){
    const s=String(status||'').toUpperCase();
    const map={
      WAITING_BOSS_APPROVAL:'Waiting Administration Approval',
      APPROVED:'Approved ✓',
      STORE_AVAILABLE:'Approved ✓ · Available in Store',
      PROCUREMENT_REQUIRED:'Approved ✓ · Sent to Procurement',
      PI_WAITING_ACCOUNTS:'Approved ✓ · Accounts / PI',
      ORDERED:'Approved ✓ · Ordered',
      PARTS_READY:'Parts Ready ✓',
      REJECTED:'Rejected'
    };
    return map[s]||s.replaceAll('_',' ');
  }

  function patchWorkflowSpares(){
    if(!location.pathname.includes('/breakdown-workflow/')) return;
    if(!latestCase || !Array.isArray(latestCase.spares)) return;
    const rows=Array.from(document.querySelectorAll('#caseDetail .spare'));
    rows.forEach((row,index)=>{
      const spare=latestCase.spares[index];
      if(!spare) return;
      const status=String(spare.status||'').toUpperCase();
      const spareId=String(spare.id||'');
      const actions=row.querySelector('.actions');
      if(!actions) return;
      actions.querySelectorAll('[data-v741-acceptance]').forEach(x=>x.remove());

      const state=document.createElement('span');
      state.dataset.v741Acceptance='state';
      state.className='spare-acceptance-state '+spareStatusClass(status);
      state.textContent=spareStatusText(status);
      actions.prepend(state);

      if(status!=='WAITING_BOSS_APPROVAL' || !spareId || !canApproveWaitingSpare()) return;
      if(actions.querySelector('[data-approve],[data-spare-accept-v741]')) return;

      const approve=document.createElement('button');
      approve.type='button'; approve.className='spare-v741-approve';
      approve.dataset.spareAcceptV741=spareId; approve.textContent='Accept / Approve Spare';
      approve.dataset.v741Acceptance='button';
      const reject=document.createElement('button');
      reject.type='button'; reject.className='spare-v741-reject';
      reject.dataset.spareRejectV741=spareId; reject.textContent='Reject';
      reject.dataset.v741Acceptance='button';
      actions.append(approve,reject);
    });
  }

  function schedulePatch(){
    window.clearTimeout(schedulePatch.timer);
    schedulePatch.timer=window.setTimeout(()=>{
      enhanceUnitField();
      patchTechnicianCards();
      patchWorkflowSpares();
    },40);
  }

  async function actOnSpare(id,approve,button){
    const actor=activeActor();
    if(!actor.token){window.alert('Session expired. Please log in again.');return;}
    const note=window.prompt(approve?'Approval note (optional):':'Reason for rejection:')||'';
    if(!approve && !note.trim()) return;
    const original=button.textContent;
    button.disabled=true;
    button.textContent=approve?'Approving...':'Rejecting...';
    try{
      const response=await originalFetch('/api/spare-acceptance/'+encodeURIComponent(id),{
        method:'PUT',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+actor.token},
        body:JSON.stringify({approve:!!approve,note:note.trim()})
      });
      const text=await response.text();
      let data=null; try{data=text?JSON.parse(text):null}catch(_){data=null;}
      if(!response.ok) throw new Error(data?.error||'Spare acceptance action failed.');
      button.textContent=approve?'Approved ✓':'Rejected ✓';
      const caseId=latestCaseId;
      document.getElementById('refreshButton')?.click();
      window.setTimeout(()=>{
        if(caseId){
          const card=document.querySelector('[data-case="'+CSS.escape(caseId)+'"]');
          card?.click();
        }
      },550);
    }catch(error){
      button.disabled=false;
      button.textContent=original;
      window.alert(error.message||'Spare acceptance action failed.');
    }
  }

  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const method=String(init?.method||'GET').toUpperCase();
    const sendButton=(method==='POST' && /\/api\/breakdown-workflow\/spare(?:\?|$)/.test(url))
      ? document.querySelector('#spareForm button[type="submit"]') : null;
    if(sendButton){
      if(!sendButton.dataset.idleText) sendButton.dataset.idleText=sendButton.textContent.trim();
      sendButton.disabled=true;
      sendButton.textContent='Sending Spare Request...';
    }

    const response=await originalFetch(input,init);

    try{
      if(response.ok && /\/api\/breakdown-workflow\/technician-jobs(?:\?|$)/.test(url)){
        response.clone().json().then(data=>{
          if(Array.isArray(data)){technicianJobs=data;schedulePatch();}
        }).catch(()=>{});
      }
      const caseMatch=url.match(/\/api\/breakdown-workflow\/case\/([^/?#]+)/);
      if(response.ok && caseMatch){
        response.clone().json().then(data=>{
          latestCase=data||null;
          latestCaseId=decodeURIComponent(caseMatch[1]||'');
          schedulePatch();
        }).catch(()=>{});
      }
      if(sendButton){
        if(response.ok){
          sendButton.textContent='Sent ✓ · Waiting Approval';
        }else{
          sendButton.disabled=false;
          sendButton.textContent=sendButton.dataset.idleText||'Send Spare Request';
        }
      }
    }catch(_){/* UI helper must never block the real request */}
    return response;
  };

  document.addEventListener('click',event=>{
    const approve=event.target.closest('[data-spare-accept-v741]');
    const reject=event.target.closest('[data-spare-reject-v741]');
    if(approve){event.preventDefault();event.stopPropagation();actOnSpare(approve.dataset.spareAcceptV741,true,approve);}
    if(reject){event.preventDefault();event.stopPropagation();actOnSpare(reject.dataset.spareRejectV741,false,reject);}
  },true);

  document.addEventListener('click',event=>{
    const caseCard=event.target.closest('[data-case]');
    if(caseCard) latestCaseId=String(caseCard.dataset.case||'');
  },true);

  document.addEventListener('close',event=>{
    if(event.target?.id!=='spareDialog') return;
    const button=document.querySelector('#spareForm button[type="submit"]');
    if(button){
      button.disabled=false;
      button.textContent=button.dataset.idleText||button.textContent||'Send Spare Request';
    }
  },true);

  injectStyles();
  enhanceUnitField();
  const observer=new MutationObserver(schedulePatch);
  const root=document.getElementById('jobList')||document.getElementById('caseDetail')||document.body;
  observer.observe(root,{childList:true,subtree:true});
  schedulePatch();
})();
