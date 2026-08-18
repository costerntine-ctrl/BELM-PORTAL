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

  function clearRoleSessions(){['belm_customer_token','belm_tech_token','belm_tech_user','belm_admin_token','belm_admin_user','belm_operator_token'].forEach(k=>localStorage.removeItem(k))}
  function setActiveAccount(type){localStorage.setItem('belm_active_account_type',type)}

  async function loadContext(){
    if(isBelm){companyName.textContent=isTechBelm?'TECH@BELM':(slug==='belm'?'BELM General Tech':slug.toUpperCase());companyNote.textContent=isTechBelm?'BELM Technician workspace.':'BELM staff operations workspace.';chip.textContent=isTechBelm?'TECH@BELM':'@BELM STAFF';chip.hidden=false;return}
    if(!slug){companyName.textContent='BELM Portal Login';companyNote.textContent='One secure login for BELM staff, Technicians and customer teams.';hint.textContent='Enter your account email or Customer Portal ID and password, then click Open My Workspace.';return}
    try{
      const res=await fetch('/api/auth/customer-context?customer='+encodeURIComponent(slug),{cache:'no-store'});
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
      const res=await fetch('/api/auth/unified-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await res.json(); if(!res.ok)throw new Error(data.error||'Login failed.');
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
    }catch(err){showError(err.message||'Login failed.');button.disabled=false;button.textContent='Open My Workspace'}
  }
  // V320: saved credentials may be filled by the browser, but opening the login link
  // never resumes a stored portal session and never submits automatically.
  form.addEventListener('submit',event=>event.preventDefault());
  button.addEventListener('click',login);

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;installButton.hidden=false});
  installButton.addEventListener('click',async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installButton.hidden=true});
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/belm-sw.js').catch(()=>{}))}

  loadContext();
})();
