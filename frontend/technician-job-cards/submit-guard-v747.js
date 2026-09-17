(function(){
  const previousFetch=window.fetch.bind(window);
  const inFlight=new Set();
  let technicianJobs=[];
  let patchQueued=false;

  function requestUrl(input){
    return typeof input==='string'?input:(input&&input.url)||'';
  }
  function methodOf(init){
    return String(init?.method||'GET').toUpperCase();
  }
  function clean(v){
    return String(v??'').trim();
  }
  function normalizedName(v){
    return clean(v).toLowerCase().replace(/\s+/g,' ');
  }
  function firstValue(...values){
    return values.find(value=>value!==undefined&&value!==null);
  }
  function errorResponse(message,status=409){
    return new Response(JSON.stringify({error:message}),{
      status,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }
  function mirror(row,target,snake,camel){
    const value=firstValue(row?.[snake],row?.[camel]);
    if(value!==undefined){target[snake]=value;target[camel]=value;}
  }
  function normalizeJob(row={}){
    const job={...row};
    [
      ['job_card_no','jobCardNo'],['current_stage','currentStage'],['case_status','caseStatus'],
      ['started_at','startedAt'],['technician_name','technicianName'],['customer_name','customerName'],
      ['fault_description','faultDescription'],['issued_by_name','issuedByName'],['issued_at','issuedAt'],
      ['due_date','dueDate'],['work_done','workDone'],['test_result','testResult'],
      ['completion_note','completionNote'],['repeat_issue','repeatIssue'],['review_note','reviewNote'],
      ['reviewed_by_name','reviewedByName'],['reviewed_at','reviewedAt'],['case_id','caseId'],
      ['blocker_reason','blockerReason'],['created_at','createdAt'],['machine_label','machineLabel'],
      ['assigned_technician_name','assignedTechnicianName'],['job_location','jobLocation'],
      ['open_spare_requests','openSpareRequests'],['required_spare','requiredSpare']
    ].forEach(([snake,camel])=>mirror(row,job,snake,camel));
    return job;
  }
  function normalizeJobsResponse(response,rows){
    const headers=new Headers(response.headers);
    headers.set('Content-Type','application/json');
    headers.set('Cache-Control','no-store');
    return new Response(JSON.stringify(rows),{status:response.status,statusText:response.statusText,headers});
  }
  function resetSpareForm(){
    const form=document.getElementById('spareForm');
    if(form)form.reset();
    const job=document.getElementById('spareJobId');
    const caseId=document.getElementById('spareCaseId');
    if(job)job.value='';
    if(caseId)caseId.value='';
    const qty=document.getElementById('spareQty');
    if(qty)qty.value='1';
    const unit=document.getElementById('spareUnit');
    if(unit)unit.value='pcs';
  }
  function resetReportForm(){
    const form=document.getElementById('reportForm');
    if(form)form.reset();
    const id=document.getElementById('reportJobId');
    if(id)id.value='';
    const qty=document.getElementById('reportRequiredSpareQty');
    if(qty)qty.value='1';
  }

  function ensureProcessStyle(){
    if(document.getElementById('belm-job-card-process-v812-style'))return;
    const style=document.createElement('style');
    style.id='belm-job-card-process-v812-style';
    style.textContent=`
      .process-bar{grid-template-columns:repeat(6,1fr)!important}
      .process-steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin-top:6px}
      .process-steps span{min-width:0;text-align:center;color:var(--muted,#9eb0c7);font-size:8px;font-weight:850;line-height:1.2;text-transform:uppercase}
      .process-steps span.done{color:var(--green,#00b864)}
      .process-steps span.current{color:var(--yellow,#f4cf00)}
      @media(max-width:720px){.process-steps span{font-size:7px}}
    `;
    document.head.appendChild(style);
  }
  function processState(job){
    const stage=clean(job.current_stage??job.currentStage).toUpperCase();
    const status=clean(job.status).toUpperCase();
    const caseStatus=clean(job.case_status??job.caseStatus).toUpperCase();
    const hasDiagnosis=clean(job.diagnosis)!=='';
    const hasTest=clean(job.test_result??job.testResult)!=='';
    const openSpares=Number(job.openSpareRequests??job.open_spare_requests??0);
    if(caseStatus==='COMPLETED'||stage==='COMPLETED'||status==='COMPLETED')return {index:6,label:'Completed / Approved'};
    if(stage==='PENDING_APPROVAL'||status==='PENDING_APPROVAL')return {index:5,label:'Pending Approval · Workshop Manager review'};
    if(stage==='TESTING'||hasTest)return {index:4,label:'Testing · test result recorded'};
    if(status==='WAITING_FOR_PARTS'||openSpares>0||['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS'].includes(stage))return {index:3,label:`Waiting for Spare${clean(job.requiredSpare??job.required_spare)?` · ${clean(job.requiredSpare??job.required_spare)}`:''}`};
    if(hasDiagnosis)return {index:2,label:`Diagnosis Report · Repeated issue: ${Number(job.repeat_issue??job.repeatIssue??0)?'YES':'NO'}`};
    if(job.started_at??job.startedAt)return {index:1,label:'Opened · Job in progress'};
    if(status==='RECEIVED')return {index:1,label:'Received · Ready to open Diagnosis'};
    return {index:1,label:'Assigned · Waiting Technician to Receive'};
  }
  function patchProcessCards(){
    patchQueued=false;
    ensureProcessStyle();
    const list=document.getElementById('jobList');
    if(!list||!technicianJobs.length)return;
    const steps=['Opened','Diagnosis','Spare / Parts','Testing','Approval','Completed'];
    list.querySelectorAll('.job-card').forEach(card=>{
      const heading=clean(card.querySelector('.job-head h2')?.textContent);
      const job=technicianJobs.find(row=>{
        const no=clean(row.job_card_no??row.jobCardNo);
        return no!==''&&(heading===no||heading.startsWith(no+' ·'));
      });
      if(!job)return;
      const state=processState(job);
      const process=card.querySelector('.process');
      const title=process?.querySelector('.process-title b');
      const bar=process?.querySelector('.process-bar');
      if(!process||!title||!bar)return;
      title.textContent=state.label;
      bar.innerHTML=steps.map((_,i)=>`<span class="${i+1<state.index?'done':i+1===state.index?'current':''}"></span>`).join('');
      let labels=process.querySelector('.process-steps');
      if(!labels){labels=document.createElement('div');labels.className='process-steps';bar.insertAdjacentElement('afterend',labels);}
      labels.innerHTML=steps.map((label,i)=>`<span class="${i+1<state.index?'done':i+1===state.index?'current':''}">${label}</span>`).join('');
    });
  }
  function queueProcessPatch(){
    if(patchQueued)return;
    patchQueued=true;
    requestAnimationFrame(patchProcessCards);
  }
  const jobList=document.getElementById('jobList');
  if(jobList)new MutationObserver(queueProcessPatch).observe(jobList,{childList:true,subtree:true});

  async function prepareSpareRequest(init){
    let payload={};
    try{payload=JSON.parse(String(init?.body||'{}'))}catch{
      return {error:errorResponse('Spare request data is invalid. Re-open the Job Card and try again.',422)};
    }
    const jobCardId=clean(payload.jobCardId);
    const spareName=clean(payload.spareName);
    if(!jobCardId)return {error:errorResponse('Job Card reference is missing. Re-open the Job Card and try again.',422)};
    if(!spareName)return {error:errorResponse('Spare name is required.',422)};

    const headers=new Headers(init?.headers||{});
    let rows=[];
    try{
      const jobsResponse=await previousFetch('/api/breakdown-workflow/technician-jobs',{
        method:'GET',cache:'no-store',headers
      });
      if(!jobsResponse.ok){
        const data=await jobsResponse.clone().json().catch(()=>({}));
        return {error:errorResponse(data?.error||'Could not confirm this Job Card before sending the spare request.',jobsResponse.status||422)};
      }
      rows=(await jobsResponse.json()).map(normalizeJob);
    }catch{
      return {error:errorResponse('Could not confirm this Job Card. Check the connection and try again.',503)};
    }

    const job=(Array.isArray(rows)?rows:[]).find(row=>clean(row?.id)===jobCardId);
    if(!job)return {error:errorResponse('This Job Card is no longer in your assigned work list. Refresh My Job Cards.',409)};

    const authoritativeCaseId=clean(job.caseId??job.case_id);
    if(!authoritativeCaseId)return {error:errorResponse('This Job Card has no linked Breakdown Case. Ask Workshop Manager to resync the Job Card.',422)};
    payload.caseId=authoritativeCaseId;

    const pendingNames=clean(job.requiredSpare??job.required_spare)
      .split(',').map(normalizedName).filter(Boolean);
    if(pendingNames.includes(normalizedName(spareName))){
      return {error:errorResponse(`${spareName} is already an active spare request for this Job Card.`,409)};
    }

    const nextInit={...init,body:JSON.stringify(payload)};
    const fingerprint=[jobCardId,normalizedName(spareName),normalizedName(payload.partNumber),Number(payload.quantity||1),normalizedName(payload.unit||'pcs')].join('|');
    return {nextInit,fingerprint};
  }

  function prepareReportRequest(url,init){
    let payload={};
    try{payload=JSON.parse(String(init?.body||'{}'))}catch{
      return {error:errorResponse('Job Report data is invalid. Re-open the Job Card and try again.',422)};
    }
    if(!payload.complete)return {nextInit:init};
    if(!clean(payload.diagnosis))return {error:errorResponse('Diagnosis is required before submitting the Job Card for approval.',422)};
    if(!clean(payload.workDone))return {error:errorResponse('Work done is required before submitting the Job Card for approval.',422)};
    if(clean(payload.requiredSpare))return {error:errorResponse('This Job Card cannot be submitted as complete while a Required Spare is being requested.',409)};
    if(!clean(payload.testResult))return {error:errorResponse('Testing is required. Enter the Test result before submitting the Job Card for approval.',422)};
    const id=decodeURIComponent((url.split('/job-report/')[1]||'').split(/[?#]/)[0]||'');
    const job=technicianJobs.find(row=>clean(row.id)===clean(id));
    if(job&&Number(job.openSpareRequests??job.open_spare_requests??0)>0){
      return {error:errorResponse('This Job Card still has an active Spare Request. Wait until the parts are ready before submitting for approval.',409)};
    }
    return {nextInit:{...init,body:JSON.stringify(payload)}};
  }

  window.fetch=async function(input,init={}){
    const url=requestUrl(input);
    const method=methodOf(init);
    const technicianJobsRequest=method==='GET'&&/\/api\/breakdown-workflow\/technician-jobs(?:\?|$)/.test(url);
    const spareRequest=method==='POST'&&/\/api\/breakdown-workflow\/spare(?:\?|$)/.test(url);
    const reportRequest=method==='PUT'&&/\/api\/breakdown-workflow\/job-report\//.test(url);

    if(technicianJobsRequest){
      const response=await previousFetch(input,init);
      if(!response.ok)return response;
      try{
        const data=await response.clone().json();
        technicianJobs=(Array.isArray(data)?data:[]).map(normalizeJob);
        window.__belmTechnicianJobs=technicianJobs;
        queueProcessPatch();
        return normalizeJobsResponse(response,technicianJobs);
      }catch{
        return response;
      }
    }

    if(!spareRequest&&!reportRequest)return previousFetch(input,init);

    let nextInit=init;
    let key=`${method}:${url}`;
    if(spareRequest){
      const prepared=await prepareSpareRequest(init);
      if(prepared.error)return prepared.error;
      nextInit=prepared.nextInit;
      key=`SPARE:${prepared.fingerprint}`;
    }
    if(reportRequest){
      const prepared=prepareReportRequest(url,init);
      if(prepared.error)return prepared.error;
      nextInit=prepared.nextInit;
    }

    if(inFlight.has(key)){
      return errorResponse(spareRequest?'This spare request is already being sent.':'This Job Report is already being sent.',409);
    }
    inFlight.add(key);
    try{
      const response=await previousFetch(input,nextInit);
      if(response.ok){
        window.setTimeout(()=>{
          if(spareRequest)resetSpareForm();
          if(reportRequest)resetReportForm();
        },0);
      }
      return response;
    }finally{
      inFlight.delete(key);
    }
  };
})();