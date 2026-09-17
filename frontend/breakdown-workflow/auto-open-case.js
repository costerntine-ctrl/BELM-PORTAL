(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||'').toLowerCase();
  const embedded=params.get('embed')==='1';

  // V797: customer Job Cards now use the same BELM Workshop & Job Cards
  // navigation language as the BELM admin module. Keep the shared workflow
  // engine/data intact; only add the customer-scoped BELM mirror shell.
  if(actor==='customer'&&!embedded){
    import('/breakdown-workflow/customer-job-card-belm-v795.js?v=797').catch(function(error){
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
