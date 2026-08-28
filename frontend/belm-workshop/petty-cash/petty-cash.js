(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  const alertBox=document.getElementById('alertBox');
  const money=new Intl.NumberFormat('en-TZ',{style:'currency',currency:'TZS',maximumFractionDigits:2});
  if(!token){location.replace('/login');return;}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-GB')};
  function show(message,error=false){alertBox.textContent=message;alertBox.className=`alert${error?' error':''}`;clearTimeout(show.t);show.t=setTimeout(()=>alertBox.classList.add('hidden'),6000)}
  async function api(options={}){
    const response=await fetch('/api/belm-workshop-home?section=petty-cash',{...options,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const text=await response.text();let data=null;try{data=text?JSON.parse(text):null}catch{}
    if(!response.ok)throw new Error(data?.error||`Request failed (${response.status}).`);return data;
  }
  function render(data){
    const balance=Number(data.balance||0);
    const balanceEl=document.getElementById('balanceAmount');balanceEl.textContent=money.format(balance);balanceEl.classList.toggle('negative',balance<0);
    document.getElementById('totalToppedUp').textContent=money.format(Number(data.totalFunded||0));
    document.getElementById('totalUsed').textContent=money.format(Number(data.totalUsed||0));
    const entries=Array.isArray(data.entries)?data.entries:[];document.getElementById('recordCount').textContent=String(entries.length);
    document.getElementById('entryRows').innerHTML=entries.length?entries.map(e=>{
      const fund=String(e.entry_type||'').toUpperCase()==='FUND';
      return `<tr><td>${esc(date(e.created_at))}</td><td><strong>${fund?'BELM → WM':'WM EXPENSE'}</strong></td><td>${esc(e.category||'—')}</td><td>${esc(e.description||'—')}</td><td>${esc(e.reference||'—')}</td><td>${fund?'+':'−'} ${esc(money.format(Number(e.amount||0)))}</td><td>${esc(e.created_by_name||'BELM Workshop')}</td></tr>`;
    }).join(''):'<tr><td colspan="7" class="empty">No BELM WM Petty Cash transactions yet.</td></tr>';
  }
  async function load(){render(await api())}
  async function postEntry(type,amount,category,description,reference,button){
    if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter an amount greater than TZS 0.');
    if(!description)throw new Error('Description is required.');
    if(typeof window.belmConfirmEdit!=='function')throw new Error('Confirmation control did not load. Refresh and try again.');
    const confirmation=await window.belmConfirmEdit({title:type==='FUND'?'Add BELM Workshop funds?':'Record BELM Workshop expense?',message:`${type==='FUND'?'Add':'Use'} ${money.format(amount)} ${type==='FUND'?'from BELM to BELM WM':'from BELM WM Petty Cash'}?`});
    if(!confirmation)return false;
    button.disabled=true;
    try{const result=await api({method:'POST',body:JSON.stringify({type,amount,category,description,reference,...confirmation})});await load();show(result.message);return true}finally{button.disabled=false}
  }
  document.getElementById('refreshButton').addEventListener('click',()=>load().then(()=>show('BELM WM Petty Cash synchronized.')).catch(e=>show(e.message,true)));
  document.getElementById('fundForm').addEventListener('submit',async e=>{e.preventDefault();const b=document.getElementById('fundButton');try{const ok=await postEntry('FUND',Number(document.getElementById('fundAmount').value||0),'BELM FUNDING',document.getElementById('fundDescription').value.trim(),document.getElementById('fundReference').value.trim(),b);if(ok)e.currentTarget.reset()}catch(err){show(err.message,true)}});
  document.getElementById('expenseForm').addEventListener('submit',async e=>{e.preventDefault();const b=document.getElementById('expenseButton');try{const ok=await postEntry('EXPENSE',Number(document.getElementById('expenseAmount').value||0),document.getElementById('expenseCategory').value.trim(),document.getElementById('expenseDescription').value.trim(),document.getElementById('expenseReference').value.trim(),b);if(ok)e.currentTarget.reset()}catch(err){show(err.message,true)}});
  load().catch(e=>show(e.message,true));
})();