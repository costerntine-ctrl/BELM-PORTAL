(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const caseId=params.get('case')||'';
  const jobId=params.get('job')||'';
  const action=params.get('action')||'';
  if(!caseId&&!jobId)return;

  function apply(){
    const frame=document.getElementById('workshopWindowFrame');
    if(!frame||!frame.src||frame.src==='about:blank')return false;
    let u;
    try{u=new URL(frame.src,location.origin)}catch(_){return false}
    if(!u.pathname.includes('/breakdown-workflow/'))return false;
    let changed=false;
    if(caseId&&u.searchParams.get('case')!==caseId){u.searchParams.set('case',caseId);changed=true}
    if(jobId&&u.searchParams.get('job')!==jobId){u.searchParams.set('job',jobId);changed=true}
    if(action&&u.searchParams.get('action')!==action){u.searchParams.set('action',action);changed=true}
    if(changed)frame.src=u.pathname+u.search+u.hash;
    return true;
  }

  if(!apply()){
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(apply()||tries>40)clearInterval(timer);
    },100);
  }
})();
