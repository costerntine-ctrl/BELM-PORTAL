(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
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
