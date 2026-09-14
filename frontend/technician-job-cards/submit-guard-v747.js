(function(){
  const previousFetch=window.fetch.bind(window);
  const inFlight=new Set();

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
  function errorResponse(message,status=409){
    return new Response(JSON.stringify({error:message}),{
      status,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
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

  async function prepareSpareRequest(init){
    let payload={};
    try{payload=JSON.parse(String(init?.body||'{}'))}catch{
      return {error:errorResponse('Spare request data is invalid. Re-open the Job Card and try again.',422)};
    }
    const jobCardId=clean(payload.jobCardId);
    const spareName=clean(payload.spareName);
    if(!jobCardId)return {error:errorResponse('Job Card reference is missing. Re-open the Job Card and try again.',422)};
    if(!spareName)return {error:errorResponse('Spare name is required.',422)};

    // API responses are camelCased by api_shape(). Older technician UI used
    // j.case_id, which turns the hidden case field into "undefined" and the
    // backend correctly answers "Breakdown case not found". Resolve the case
    // from the authoritative assigned Job Card before every spare submission.
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
      rows=await jobsResponse.json();
    }catch{
      return {error:errorResponse('Could not confirm this Job Card. Check the connection and try again.',503)};
    }

    const job=(Array.isArray(rows)?rows:[]).find(row=>clean(row?.id)===jobCardId);
    if(!job)return {error:errorResponse('This Job Card is no longer in your assigned work list. Refresh My Job Cards.',409)};

    const authoritativeCaseId=clean(job.caseId??job.case_id);
    if(!authoritativeCaseId)return {error:errorResponse('This Job Card has no linked Breakdown Case. Ask Workshop Manager to resync the Job Card.',422)};
    payload.caseId=authoritativeCaseId;

    // Do not create a second active request for the same spare on one Job Card.
    const pendingNames=clean(job.requiredSpare??job.required_spare)
      .split(',').map(normalizedName).filter(Boolean);
    if(pendingNames.includes(normalizedName(spareName))){
      return {error:errorResponse(`${spareName} is already an active spare request for this Job Card.`,409)};
    }

    const nextInit={...init,body:JSON.stringify(payload)};
    const fingerprint=[jobCardId,normalizedName(spareName),normalizedName(payload.partNumber),Number(payload.quantity||1),normalizedName(payload.unit||'pcs')].join('|');
    return {nextInit,fingerprint};
  }

  window.fetch=async function(input,init={}){
    const url=requestUrl(input);
    const method=methodOf(init);
    const spareRequest=method==='POST'&&/\/api\/breakdown-workflow\/spare(?:\?|$)/.test(url);
    const reportRequest=method==='PUT'&&/\/api\/breakdown-workflow\/job-report\//.test(url);
    if(!spareRequest&&!reportRequest)return previousFetch(input,init);

    let nextInit=init;
    let key=`${method}:${url}`;
    if(spareRequest){
      const prepared=await prepareSpareRequest(init);
      if(prepared.error)return prepared.error;
      nextInit=prepared.nextInit;
      key=`SPARE:${prepared.fingerprint}`;
    }

    if(inFlight.has(key)){
      return errorResponse(spareRequest?'This spare request is already being sent.':'This Job Report is already being sent.',409);
    }
    inFlight.add(key);
    try{
      const response=await previousFetch(input,nextInit);
      if(response.ok){
        // Clear entry controls only after the server confirms success. Saved
        // report/spare history remains in the database and reloads from there.
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
