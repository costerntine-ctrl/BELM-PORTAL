(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const machineId=params.get('machine')||'';
  const existingToken=localStorage.getItem('belm_operator_token')||'';
  if(!machineId||existingToken)return;

  const loginSection=document.getElementById('loginSection');
  const signupSection=document.getElementById('signupSection');
  const signupForm=document.getElementById('signupForm');
  const context=document.getElementById('signupMachineContext');
  const signupError=document.getElementById('signupError');
  const showLoginButton=document.getElementById('showOperatorLogin');
  const showSignupButton=document.getElementById('showOperatorSignup');

  function showSignup(){
    if(loginSection)loginSection.classList.add('hidden');
    if(signupSection)signupSection.classList.remove('hidden');
  }
  function showLogin(){
    if(signupSection)signupSection.classList.add('hidden');
    if(loginSection)loginSection.classList.remove('hidden');
  }
  function setError(message){
    if(!signupError)return;
    signupError.textContent=message||'';
    signupError.classList.toggle('hidden',!message);
  }

  async function loadContext(){
    showSignup();
    try{
      const res=await fetch('/api/operator-signup?action=context&machine='+encodeURIComponent(machineId),{cache:'no-store'});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||'Could not open this operator link.');
      const m=data.machine||{};
      const label=[m.brand,m.model].filter(Boolean).join(' ')||m.machineType||'Machine';
      if(context)context.innerHTML='<strong>'+escapeHtml(data.customerName||'Customer')+'</strong><span>'+escapeHtml(label)+(m.fleetNumber?' · Fleet '+escapeHtml(m.fleetNumber):'')+(m.serialNumber?' · Serial '+escapeHtml(m.serialNumber):'')+'</span>';
    }catch(error){
      setError(error.message||'Could not open this operator link.');
      if(signupForm)Array.from(signupForm.elements).forEach(el=>el.disabled=true);
    }
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  signupForm?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    setError('');
    const name=document.getElementById('signupName').value.trim();
    const contact=document.getElementById('signupContact').value.trim();
    const pin=document.getElementById('signupPin').value.trim();
    const confirmPin=document.getElementById('signupConfirmPin').value.trim();
    if(pin!==confirmPin){setError('PINs do not match.');return;}
    const button=document.getElementById('signupButton');
    button.disabled=true;button.textContent='Creating account…';
    try{
      const res=await fetch('/api/operator-signup?action=signup',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({machineId,name,contact,pin})
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(data.error||'Could not register operator.');
      localStorage.setItem('belm_operator_token',data.token);
      localStorage.setItem('belm_active_account_type','operator');
      localStorage.setItem('belm_operator_name',data.operator?.name||name);
      localStorage.setItem('belm_operator_machine_name',data.operator?.machineName||'Machine');
      location.reload();
    }catch(error){
      setError(error.message||'Could not register operator.');
      button.disabled=false;button.textContent='Sign up';
    }
  });

  showLoginButton?.addEventListener('click',showLogin);
  showSignupButton?.addEventListener('click',showSignup);
  loadContext();
})();
