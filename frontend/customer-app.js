(function(){
  const parts=location.pathname.split('/').filter(Boolean);
  const slug=(parts[0]==='app' && parts[1] ? decodeURIComponent(parts[1]) : '').toLowerCase();
  const isBelm=slug==='belm'||/@belm$/i.test(slug);
  const isTechBelm=slug==='tech@belm';
  const companyName=document.getElementById('companyName');
  const companyNote=document.getElementById('companyNote');
  const chip=document.getElementById('customerChip');
  const hint=document.getElementById('loginHint');
  const form=document.getElementById('loginForm');
  const email=document.getElementById('email');
  const password=document.getElementById('password');
  const button=document.getElementById('loginButton');
  const errorBox=document.getElementById('errorBox');
  const installButton=document.getElementById('installButton');
  let installPrompt=null;

  async function fetchWithTimeout(url,options={},timeoutMs=70000,onSlow=null){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    let slowTimer=null;
    if(typeof onSlow==='function')slowTimer=setTimeout(onSlow,5000);
    try{return await fetch(url,{...options,signal:controller.signal})}
    finally{clearTimeout(timer);if(slowTimer)clearTimeout(slowTimer)}
  }


  async function readJsonResponse(res){
    const text=await res.text();
    try{return JSON.parse(text)}
    catch(_err){
      console.error('BELM API returned a non-JSON response',text.slice(0,240));
      throw new Error('Portal API response was invalid. Refresh once after deployment and try again.');
    }
  }

  function clearRoleSessions(){['belm_customer_token','belm_tech_token','belm_tech_user','belm_admin_token','belm_admin_user','belm_operator_token'].forEach(k=>localStorage.removeItem(k))}
  function setActiveAccount(type){localStorage.setItem('belm_active_account_type',type)}

  function decodeToken(token){
    try{
      const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.from(atob(padded)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')));
    }catch(_){return null}
  }

  async function resumeActiveSession(){
    // Only resume the account type that was explicitly active. Logout removes
    // its token, so this never prevents a deliberate account switch.
    const active=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
    const key=active==='customer'?'belm_customer_token':active==='technician'?'belm_tech_token':active==='admin'?'belm_admin_token':'';
    const token=key?localStorage.getItem(key):'';
    if(!token)return false;
    try{
      const res=await fetchWithTimeout('/api/auth/refresh',{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token}`}},12000);
      if(!res.ok){
        // Only a definite 401 means the stored login is no longer valid. A
        // network/Render problem leaves the session untouched.
        if(res.status===401){localStorage.removeItem(key);localStorage.removeItem(`belm_session_refreshed_${key}`)}
        return false;
      }
      const data=await readJsonResponse(res);
      if(!data.token)return false;
      localStorage.setItem(key,data.token);
      localStorage.setItem(`belm_session_refreshed_${key}`,String(Date.now()));
      if(active==='technician'){location.replace('/tech');return true}
      if(active==='admin'){location.replace('/overview-manager/');return true}
      if(active==='customer'){
        let destination='/portal/dashboard';
        const payload=decodeToken(data.token)||{};
        try{
          const dash=await fetchWithTimeout('/api/customer-portal/dashboard',{cache:'no-store',headers:{Authorization:`Bearer ${data.token}`}},12000);
          if(dash.ok){
            const info=await dash.json();
            const role=String(payload.customerRole||'owner').toLowerCase();
            if(info?.customer?.workshopModuleActive!==false && ['owner','admin','workshop_manager'].includes(role)) destination='/customer-workshop/?actor=customer';
          }
        }catch(_){}
        location.replace(destination);return true;
      }
    }catch(_){/* transient connectivity is not logout */}
    return false;
  }

  async function loadContext(){
    if(isBelm){companyName.textContent=isTechBelm?'TECH@BELM':(slug==='belm'?'BELM General Tech':slug.toUpperCase());companyNote.textContent=isTechBelm?'BELM Technician workspace.':'BELM staff operations workspace.';chip.textContent=isTechBelm?'TECH@BELM':'@BELM STAFF';chip.hidden=false;return}
    if(!slug){companyName.textContent='BELM Portal Login';companyNote.textContent='One secure login for BELM staff, Technicians and customer teams.';hint.textContent='Enter your account email or Customer Portal ID and password, then click Open My Workspace.';return}
    try{
      const res=await fetchWithTimeout('/api/auth/customer-context?customer='+encodeURIComponent(slug),{cache:'no-store'},70000);
      if(!res.ok)throw new Error('Customer app link was not found.');
      const data=await res.json();
      companyName.textContent=data.name;
      companyNote.textContent='Operations workspace powered by BELM General Tech.';
      chip.textContent=data.name.toUpperCase(); chip.hidden=false;
      document.title=data.name+' - BELM Operations';
    }catch(err){showError(err.message||'Customer app link was not found.');button.disabled=true}
  }
  function showError(msg){errorBox.textContent=msg;errorBox.hidden=false}
  function clearError(){errorBox.hidden=true;errorBox.textContent=''}
  async function login(){
    clearError(); button.disabled=true; button.textContent='Opening...';
    try{
      const payload={email:email.value.trim(),password:password.value};
      if(slug && !isBelm)payload.customerSlug=slug;
      if(isBelm)payload.customerSlug='belm';
      const res=await fetchWithTimeout('/api/auth/unified-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},70000,()=>{button.textContent='Server waking up…'});
      const data=await readJsonResponse(res); if(!res.ok)throw new Error(data.error||'Login failed.');
      clearRoleSessions();
      if(data.accountType==='customer'){
        localStorage.setItem('belm_customer_token',data.token); setActiveAccount('customer');
      }else if(data.accountType==='technician'){
        localStorage.setItem('belm_tech_token',data.token);
        localStorage.setItem('belm_tech_user',JSON.stringify(data.user||{})); setActiveAccount('technician');
      }else{
        localStorage.setItem('belm_admin_token',data.token);
        localStorage.setItem('belm_admin_user',JSON.stringify(data.user||{})); setActiveAccount('admin');
      }
      location.replace(data.destination||'/');
    }catch(err){const timedOut=err&&err.name==='AbortError';showError(timedOut?'Server did not respond in time. Tap Open My Workspace again.':(err.message||'Login failed.'));button.disabled=false;button.textContent='Open My Workspace'}
  }
  // V320: saved credentials may be filled by the browser, but opening the login link
  // never resumes a stored portal session and never submits automatically.
  form.addEventListener('submit',event=>event.preventDefault());
  button.addEventListener('click',login);

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installButton.hidden=false});
  installButton.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installButton.hidden=true});
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/belm-sw.js').catch(()=>{}))}

  // V475: the login screen is always manual. Browser/password-manager saved
  // credentials may autofill the fields, but an existing local portal token must
  // not skip this screen. Session persistence still applies everywhere after a
  // successful login; the user explicitly presses Open My Workspace to enter.
  (async()=>{await loadContext()})();
})();
