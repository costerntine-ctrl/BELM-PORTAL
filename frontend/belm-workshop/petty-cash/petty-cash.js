(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  const select=document.getElementById('customerSelect');
  const alertBox=document.getElementById('alertBox');
  const money=new Intl.NumberFormat('en-TZ',{style:'currency',currency:'TZS',maximumFractionDigits:2});
  let customers=[];

  if(!token){location.replace('/admin/login');return;}
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=(v)=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-GB')};
  function show(message,error=false){alertBox.textContent=message;alertBox.className=`alert${error?' error':''}`;clearTimeout(show.t);show.t=setTimeout(()=>alertBox.classList.add('hidden'),6000)}
  async function api(path,options={}){
    const response=await fetch(`/api${path}`,{...options,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!response.ok)throw new Error(data?.error||`Request failed (${response.status}).`);return data;
  }
  function spareSummary(items){
    if(!Array.isArray(items)||!items.length)return '—';
    return items.map(item=>[item.description,item.partNumber,item.quantity?`Qty ${item.quantity}${item.unit?` ${item.unit}`:''}`:''].filter(Boolean).join(' · ')).filter(Boolean).join('; ')||'—';
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
    const wanted=new URLSearchParams(location.search).get('customer'); if(wanted&&customers.some(c=>c.id===wanted))select.value=wanted;
    if(select.value)await loadAccount(); else clearData();
  }
  async function loadAccount(){
    const id=select.value;if(!id){clearData();return;}
    clearData('Loading…');
    try{render(await api(`/customers/${encodeURIComponent(id)}/workshop-petty-cash`));}
    catch(error){clearData(error.message);show(error.message,true);}
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
  select.addEventListener('change',loadAccount);
  document.getElementById('refreshButton').addEventListener('click',async()=>{try{await loadCustomers();show('Synchronized with current customer records.')}catch(e){show(e.message,true)}});
  document.getElementById('entryRows').addEventListener('click',e=>{const b=e.target.closest('[data-receipt]');if(b)viewReceipt(b.dataset.receipt)});
  document.getElementById('topupForm').addEventListener('submit',async e=>{
    e.preventDefault();const customerId=select.value;if(!customerId){show('Select a customer first.',true);return;}
    const amount=Number(document.getElementById('topupAmount').value||0),note=document.getElementById('topupNote').value.trim();
    const customer=customers.find(c=>c.id===customerId);
    const confirmation=await window.belmConfirmEdit({title:'Add Petty Cash funds?',message:`Add ${money.format(amount)} to ${customer?.name||'this customer'}? This uses the same balance visible in PORTAL-CWM.`});
    if(!confirmation)return;
    const button=document.getElementById('topupButton');button.disabled=true;
    try{await api(`/customers/${encodeURIComponent(customerId)}/workshop-petty-cash/topup`,{method:'POST',body:JSON.stringify({amount,note,...confirmation})});e.target.reset();await loadAccount();show('Funds added and synchronized with PORTAL-CWM.');}
    catch(error){show(error.message,true)}finally{button.disabled=false}
  });
  loadCustomers().catch(error=>{clearData(error.message);show(error.message,true)});
})();
