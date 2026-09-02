(function(){
  if(!location.pathname.startsWith('/customers-manager')) return;
  if(window.__belmCustomerOverviewFetchGuard) return;
  window.__belmCustomerOverviewFetchGuard=true;

  const nativeFetch=window.fetch.bind(window);
  let mainCustomersPromise=null;
  let initialCustomersSettled=false;
  let releaseInitial;
  const initialReady=new Promise(resolve=>{releaseInitial=resolve;});

  function isGet(options){return String(options?.method||'GET').toUpperCase()==='GET';}
  function parseUrl(input){try{return new URL(typeof input==='string'?input:input.url,location.origin);}catch(_){return null;}}
  function isExactCustomers(url){return url&&url.pathname==='/api/customers'&&!url.search;}
  function isMachineSync(url){return url&&url.pathname==='/api/customers'&&url.searchParams.get('action')==='machine-type-sync';}
  function isFeed(url){return url&&url.pathname==='/api/customers/communication-feed';}

  async function waitInitial(maxMs=14000){
    if(initialCustomersSettled)return;
    await Promise.race([initialReady,new Promise(resolve=>setTimeout(resolve,maxMs))]);
  }

  async function guardedNative(input,options={}){
    const url=parseUrl(input);
    if((isMachineSync(url)||isFeed(url))&&isGet(options)){
      await waitInitial();
      if(isFeed(url)) await new Promise(resolve=>setTimeout(resolve,180));
    }

    const controller=new AbortController();
    const timeoutMs=(url&&url.pathname.startsWith('/api/customers'))?15000:30000;
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    if(options.signal){
      if(options.signal.aborted)controller.abort();
      else options.signal.addEventListener('abort',()=>controller.abort(),{once:true});
    }
    try{
      return await nativeFetch(input,{...options,signal:controller.signal});
    }catch(error){
      if(error?.name==='AbortError'&&url?.pathname.startsWith('/api/customers')){
        throw new Error('Customer data request timed out. Tap Refresh customers to retry.');
      }
      throw error;
    }finally{clearTimeout(timer);}
  }

  window.fetch=function(input,options={}){
    const url=parseUrl(input);
    if(isExactCustomers(url)&&isGet(options)){
      if(mainCustomersPromise)return mainCustomersPromise.then(response=>response.clone());
      mainCustomersPromise=guardedNative(input,options).then(response=>{
        initialCustomersSettled=true;
        releaseInitial();
        return response;
      }).catch(error=>{
        initialCustomersSettled=true;
        releaseInitial();
        throw error;
      }).finally(()=>{
        setTimeout(()=>{mainCustomersPromise=null;},250);
      });
      return mainCustomersPromise.then(response=>response.clone());
    }
    return guardedNative(input,options);
  };

  window.addEventListener('unhandledrejection',event=>{
    if(String(event.reason?.message||'').includes('Customer data request timed out')) event.preventDefault();
  });
})();