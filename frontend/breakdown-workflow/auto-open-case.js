(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||'').toLowerCase();
  const embedded=params.get('embed')==='1';
  const view=String(params.get('view')||'job-cards').toLowerCase();

  // V803: mirror Customer Job Cards using the exact BELM Workshop Manager
  // Job Cards wrapper pattern. The wrapper embeds this shared workflow with
  // actor=customer&embed=1, so customer data/permissions remain unchanged.
  if(actor==='customer'&&!embedded&&view==='job-cards'){
    const out=new URL('/customer-workshop-manager/job-cards.html',location.origin);
    params.forEach((value,key)=>{
      if(key==='actor'||key==='embed'||key==='view')return;
      out.searchParams.set(key,value);
    });
    location.replace(out.pathname+out.search);
    return;
  }

  // Non-Job-Card customer workflow views keep the customer-scoped BELM
  // contextual navigation shell already used for Diagnosis/Testing/etc.
  if(actor==='customer'&&!embedded){
    import('/breakdown-workflow/customer-job-card-belm-v795.js?v=803').catch(function(error){
      console.warn('Customer Job Card BELM mirror failed to load:',error);
    });
  }

  const caseId=params.get('case')||'';
  const jobId=params.get('job')||'';
  const action=String(params.get('action')||'').toLowerCase();
  if(!caseId&&!jobId)return;

  function openSelected(){
    if(caseId){
      const card=document.querySelector(`[data-case="${CSS.escape(caseId)}"]`);
      if(card){card.click();return true;}
    }
    if(jobId){
      const processRow=document.querySelector(`[data-job-card="${CSS.escape(jobId)}"]`);
      if(processRow){processRow.click();return true;}
    }
    return false;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries+=1;
    if(openSelected()||tries>100){
      clearInterval(timer);
      if(action==='checking'){
        window.setTimeout(()=>{
          const detail=document.getElementById('caseDetail');
          if(detail)detail.scrollIntoView({behavior:'smooth',block:'start'});
        },250);
      }
    }
  },100);
})();
