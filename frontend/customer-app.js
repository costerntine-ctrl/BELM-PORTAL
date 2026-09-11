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
  const confirmDialog=document.getElementById('loginConfirmDialog');
  const confirmAccount=document.getElementById('loginConfirmAccount');
  const confirmLoginButton=document.getElementById('confirmLoginButton');
  const cancelLoginButton=document.getElementById('cancelLoginButton');
  let installPrompt=null;
  let loginPending=false;

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

  async function loadContext(){
    if(isBelm){companyName.textContent=isTechBelm?'TECH@BELM':(slug==='belm'?'BELM General Tech':slug.toUpperCase());companyNote.textContent=isTechBelm?'BELM Technician workspace.':'BELM staff operations workspace.';chip.textContent=isTechBelm?'TECH@BELM':'@BELM STAFF';chip.hidden=false;return}
    if(!slug){companyName.textContent='BELM Portal Login';companyNote.textContent='One secure login for BELM staff, Technicians and customer teams.';hint.textContent='Enter your account details, tap Continue, then confirm before the password is submitted. Saved passwords never sign in automatically.';return}
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
  function requestLoginConfirmation(){
    if(loginPending||!form.reportValidity())return;
    clearError();
    confirmAccount.textContent=email.value.trim();
    if(confirmDialog&&typeof confirmDialog.showModal==='function'){
      if(!confirmDialog.open)confirmDialog.showModal();
      setTimeout(()=>confirmLoginButton?.focus(),0);
      return;
    }
    if(window.confirm('Confirm Login? You will first open your Home Dashboard.'))login();
  }
  async function login(){
    if(loginPending)return;
    loginPending=true;
    if(confirmDialog?.open)confirmDialog.close();
    clearError(); button.disabled=true; button.textContent='Opening Home Dashboard...';
    if(confirmLoginButton){confirmLoginButton.disabled=true;confirmLoginButton.textContent='Signing in…';}
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
      // Every account type opens the same shared Home Dashboard first.
      // View My Role on that dashboard performs role-specific routing.
      location.replace('/portal-v2/');
    }catch(err){
      const timedOut=err&&err.name==='AbortError';
      showError(timedOut?'Server did not respond in time. Tap Continue and confirm again.':(err.message||'Login failed.'));
      loginPending=false;button.disabled=false;button.textContent='Continue';
      if(confirmLoginButton){confirmLoginButton.disabled=false;confirmLoginButton.textContent='Confirm Login';}
    }
  }
  // V718: Continue only opens the review step. Credentials are sent to the
  // backend after the user explicitly chooses Confirm Login. A browser-saved
  // password may autofill the fields, but it must never submit or resume an
  // existing portal session automatically from the login page.
  form.addEventListener('submit',event=>{event.preventDefault();requestLoginConfirmation()});
  confirmLoginButton?.addEventListener('click',login);
  cancelLoginButton?.addEventListener('click',()=>{confirmDialog?.close();password.focus()});
  confirmDialog?.addEventListener('cancel',()=>setTimeout(()=>password.focus(),0));

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installButton.hidden=false});
  installButton.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installButton.hidden=true});
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/belm-sw.js?v=718-manual-login-confirm').catch(()=>{}))}

  (async()=>{
    // Always show the login page, even when a valid token or saved password
    // already exists. The user decides which account to use on every login.
    await loadContext();
  })();
})();
