(function(){
  if(!location.pathname.startsWith('/customers-manager/')) return;
  const nativeFetch=window.fetch.bind(window);
  const isChecklistAction=(input)=>{try{const u=new URL(typeof input==='string'?input:input.url,location.origin);return u.pathname==='/api/checklist-reports'&&['for-machine','pdf'].includes(u.searchParams.get('action'));}catch(_){return false;}};
  window.fetch=async function(input,options={}){
    const response=await nativeFetch(input,options);
    if(!isChecklistAction(input)||response.ok)return response;
    let body='';try{body=await response.clone().text();}catch(_){}
    if(!/unknown request/i.test(body))return response;
    const original=new URL(typeof input==='string'?input:input.url,location.origin);
    const fallback=new URL('/api/checklist_reports.php',location.origin);
    original.searchParams.forEach((value,key)=>fallback.searchParams.set(key,value));
    return nativeFetch(fallback.pathname+fallback.search,options);
  };
})();