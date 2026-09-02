(function(){
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  if(customerToken||!adminToken)return;
  let syncing=false;
  async function syncCustomers(){
    if(syncing)return;
    syncing=true;
    try{
      const r=await fetch('/api/customers?action=cwm-overview&_='+Date.now(),{cache:'no-store',headers:{Authorization:`Bearer ${adminToken}`}});
      const data=await r.json().catch(()=>null);
      if(!r.ok||!Array.isArray(data))return;
      const input=document.getElementById('cwmSearch');
      const needle=String(input?.value||'').trim().toLowerCase();
      const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const rows=data.filter(c=>!needle||[c.name,c.address,c.email,c.phone].some(v=>String(v||'').toLowerCase().includes(needle)));
      const grid=document.getElementById('cwmCardGrid');
      if(!grid)return;
      grid.innerHTML=rows.length?rows.map(c=>`<article class="cwm-welcome-card cwm-list-card-v621" data-customer-card="${esc(c.id||'')}"><div class="cwm-welcome-copy"><p class="cwm-welcome-kicker">CUSTOMER WORKSHOP</p><h2>${esc((c.name||'Customer').toUpperCase())}</h2></div><div class="cwm-welcome-details"><div><span>ADDRESS:</span><b>${esc(c.address||'Not recorded')}</b></div><div><span>EMAIL:</span><b>${esc(c.email||'Not recorded')}</b></div><div><span>PHONE:</span><b>${esc(c.phone||'Not recorded')}</b></div></div><a class="cwm-open-workshop" href="/customer-workshop/?actor=belm&customerId=${encodeURIComponent(c.id||'')}">OPEN WORKSHOP</a></article>`).join(''):'<p class="muted">No customer record found.</p>';
    }catch(_){
    }finally{syncing=false;}
  }
  window.addEventListener('focus',syncCustomers);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCustomers();});
  document.getElementById('cwmSearch')?.addEventListener('input',syncCustomers);
  setTimeout(syncCustomers,300);
})();
