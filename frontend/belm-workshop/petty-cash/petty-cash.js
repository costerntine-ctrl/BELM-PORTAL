(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  const select=document.getElementById('customerSelect');
  const alertBox=document.getElementById('alertBox');
  const amountInput=document.getElementById('topupAmount');
  const noteInput=document.getElementById('topupNote');
  const topupButton=document.getElementById('topupButton');
  const topupTarget=document.getElementById('topupTarget');
  const money=new Intl.NumberFormat('en-TZ',{style:'currency',currency:'TZS',maximumFractionDigits:2});
  let customers=[];

  if(!token){location.replace('/login');return;}
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=(v)=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-GB')};
  function show(message,error=false){
    alertBox.textContent=message;
    alertBox.className=`alert${error?' error':''}`;
    clearTimeout(show.t);
    show.t=setTimeout(()=>alertBox.classList.add('hidden'),7000);
  }
  async function api(path,options={}){
    const response=await fetch(`/api${path}`,{...options,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!response.ok){const error=new Error(data?.error||`Request failed (${response.status}).`);error.status=response.status;throw error;}return data;
  }
  function spareSummary(items){
    if(!Array.isArray(items)||!items.length)return '—';
    return items.map(item=>[item.description,item.partNumber,item.quantity?`Qty ${item.quantity}${item.unit?` ${item.unit}`:''}`:''].filter(Boolean).join(' · ')).filter(Boolean).join('; ')||'—';
  }
  function selectedCustomer(){return customers.find(c=>String(c.id)===String(select.value))||null;}
  function updateTopupState(errorMessage=''){
    const customer=selectedCustomer();
    const ready=Boolean(customer);
    amountInput.disabled=!ready;
    noteInput.disabled=!ready;
    topupButton.disabled=!ready;
    select.classList.toggle('needs-selection',!ready && Boolean(errorMessage));
    topupTarget.className=`topup-target${ready?' ready':''}${errorMessage?' error':''}`;
    if(errorMessage){topupTarget.textContent=errorMessage;return;}
    topupTarget.textContent=ready
      ? `Funds will be added to: ${customer.name}. This balance is synchronized with the same customer's PORTAL-CWM Petty Cash.`
      : 'Select a customer first. Funds cannot be posted without a customer account.';
  }
  function clearData(message='Select a customer.'){
    ['balanceAmount','totalToppedUp','totalUsed'].forEach(id=>document.getElementById(id).textContent='TZS 0');
    document.getElementById('recordCount').textContent='0';
    document.getElementById('customerState').classList.add('hidden');
    document.getElementById('entryRows').innerHTML=`<tr><td colspan="7" class="empty">${esc(message)}</td></tr>`;
    document.getElementById('topupRows').innerHTML=`<tr><td colspan="4" class="empty">${esc(message)}</td></tr>`;
  }
  function render(data){
    const account=data.account||{}; const customer=data.customer||{}; const balance=Number(account.balance||0);
    const balanceEl=document.getElementById('balanceAmount'); balanceEl.textContent=money.format(balance); balanceEl.classList.toggle('negative',balance<0);
    document.getElementById('totalToppedUp').textContent=money.format(Number(account.totalToppedUp||0));
    document.getElementById('totalUsed').textContent=money.format(Number(account.totalUsed||0));
    document.getElementById('recordCount').textContent=String(account.recordCount||0);
    const state=document.getElementById('customerState');state.classList.remove('hidden');
    state.innerHTML=`<span class="state-pill ${customer.isActive?'on':'off'}">Portal ${customer.isActive?'ON':'LOCKED'}</span><span class="state-pill ${customer.belmServiceProviderActive?'on':'off'}">BELM Service ${customer.belmServiceProviderActive?'ON':'OFF'}</span><span class="state-pill ${customer.workshopModuleActive?'on':'off'}">PORTAL-CWM ${customer.workshopModuleActive?'ON':'OFF'}</span>`;
    const entries=Array.isArray(data.entries)?data.entries:[];
    document.getElementById('entryRows').innerHTML=entries.length?entries.map(e=>`<tr><td>${esc(date(e.date))}</td><td>${esc(e.machineName||'Machine')}${e.fleetNumber?`<br><small>${esc(e.fleetNumber)}</small>`:''}</td><td>${esc(e.description||'—')}</td><td class="spares">${esc(spareSummary(e.spareItems))}</td><td>${esc(money.format(Number(e.cost||0)))}</td><td>${e.hasReceipt?`<button class="receipt-btn" type="button" data-receipt="${esc(e.id)}">View</button>`:'—'}</td><td>${esc(e.loggedBy||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No Petty Cash expenses yet.</td></tr>';
    const topups=Array.isArray(account.topups)?account.topups:[];
    document.getElementById('topupRows').innerHTML=topups.length?topups.map(t=>`<tr><td>${esc(date(t.createdAt))}</td><td>${esc(money.format(Number(t.amount||0)))}</td><td>${esc(t.note||'—')}</td><td>${esc(t.addedBy||'—')}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">No top-ups yet.</td></tr>';
  }
  async function loadCustomers(){
    customers=await api('/customers?action=cwm-overview');
    select.innerHTML='<option value="">Select customer…</option>'+customers.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const queryWanted=new URLSearchParams(location.search).get('customer')||'';
    const savedWanted=sessionStorage.getItem('belm_workshop_petty_customer')||'';
    const wanted=[queryWanted,savedWanted].find(id=>id&&customers.some(c=>String(c.id)===String(id)))||'';
    if(wanted) select.value=wanted;
    else if(customers.length===1) select.value=customers[0].id;
    updateTopupState();
    if(select.value)await loadAccount(); else clearData();
  }
  async function loadAccount(retry=0){
    const id=select.value;
    updateTopupState();
    if(!id){clearData();return;}
    sessionStorage.setItem('belm_workshop_petty_customer',id);
    clearData(retry?'Database update is finishing. Reconnecting Petty Cash…':'Loading…');
    try{render(await api(`/customers/${encodeURIComponent(id)}/workshop-petty-cash`));}
    catch(error){
      if(Number(error.status||0)===503&&retry<8){
        updateTopupState('Database update is finishing. Reconnecting Petty Cash…');
        setTimeout(()=>{if(String(select.value)===String(id))loadAccount(retry+1)},2500);
        return;
      }
      clearData(error.message);show(error.message,true);updateTopupState(error.message);
    }
  }
  async function viewReceipt(id){
    const customerId=select.value;if(!customerId)return;
    const tab=window.open('about:blank','_blank');
    if(tab)tab.opener=null;
    try{
      const response=await fetch(`/api/customers/${encodeURIComponent(customerId)}/workshop-petty-cash/receipt?expenseId=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok){let msg='Could not load receipt.';try{msg=(await response.json()).error||msg}catch{}throw new Error(msg)}
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      if(tab)tab.location.href=url;else location.href=url;
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(error){if(tab)tab.close();show(error.message,true)}
  }
  select.addEventListener('change',async()=>{
    select.classList.remove('needs-selection');
    updateTopupState();
    await loadAccount();
  });
  document.getElementById('refreshButton').addEventListener('click',async()=>{try{await loadCustomers();show('Synchronized with current customer records.')}catch(e){show(e.message,true)}});
  document.getElementById('entryRows').addEventListener('click',e=>{const b=e.target.closest('[data-receipt]');if(b)viewReceipt(b.dataset.receipt)});
  document.getElementById('topupForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const customerId=select.value;
    if(!customerId){
      updateTopupState('Select the customer whose Petty Cash account you want to fund.');
      select.focus();
      show('Select a customer before adding funds.',true);
      return;
    }
    const amount=Number(amountInput.value||0),note=noteInput.value.trim();
    if(!Number.isFinite(amount)||amount<=0){
      updateTopupState('Enter an amount greater than TZS 0.');
      amountInput.focus();
      show('Enter a valid Petty Cash amount.',true);
      return;
    }
    const customer=selectedCustomer();
    topupButton.disabled=true;
    try{
      if(typeof window.belmConfirmEdit!=='function') throw new Error('Confirmation control did not load. Refresh this Workshop window and try again.');
      const confirmation=await window.belmConfirmEdit({title:'Add Petty Cash funds?',message:`Add ${money.format(amount)} to ${customer?.name||'this customer'}? This will update the same balance visible in PORTAL-CWM.`});
      if(!confirmation){updateTopupState();return;}
      await api(`/customers/${encodeURIComponent(customerId)}/workshop-petty-cash/topup`,{method:'POST',body:JSON.stringify({amount,note,...confirmation})});
      amountInput.value='';noteInput.value='';
      await loadAccount();
      updateTopupState();
      show(`Funds added to ${customer?.name||'customer'} and synchronized with PORTAL-CWM.`);
    }catch(error){
      updateTopupState(error.message||'Could not add funds.');
      show(error.message||'Could not add funds.',true);
    }finally{
      topupButton.disabled=!Boolean(select.value);
    }
  });
  loadCustomers().catch(error=>{clearData(error.message);updateTopupState(error.message);show(error.message,true)});
})();
