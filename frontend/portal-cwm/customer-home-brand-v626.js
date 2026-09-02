(function(){
  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token)return;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function loadCustomer(){
    const r=await fetch('/api/customer-portal/dashboard',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    const text=await r.text();let d=null;try{d=text?JSON.parse(text):null}catch(_){}
    if(!r.ok)throw new Error(d?.error||`Customer dashboard failed (${r.status})`);
    return d?.customer||{};
  }

  function apply(customer){
    const name=String(customer.name||'Customer').trim()||'Customer';
    document.title=`${name} Workshop Portal — PORTAL-CWM`;

    const brand=document.querySelector('.topbar .brand');
    if(brand){
      brand.setAttribute('href','/portal-cwm/');
      const text=brand.querySelector('span:last-child');
      if(text)text.innerHTML=`${esc(name.toUpperCase())} <small>CUSTOMER WORKSHOP PORTAL</small>`;
    }

    const hero=document.querySelector('.cwm-home-hero-v556 h1');
    if(hero)hero.innerHTML=`${esc(name.toUpperCase())} <em>WORKSHOP</em> PORTAL`;

    const details=[
      ['ADDRESS',customer.address||'Not recorded'],
      ['EMAIL',customer.email||'Not recorded'],
      ['PHONE',customer.phone||'Not recorded']
    ];
    document.querySelectorAll('.cwm-company-details-v556>div').forEach((node,i)=>{
      if(!details[i])return;
      const label=node.querySelector('span'),value=node.querySelector('b');
      if(label)label.textContent=details[i][0];
      if(value)value.textContent=details[i][1];
    });

    const footer=document.querySelector('.cwm-home-footer-v556>div:first-child p');
    if(footer)footer.innerHTML=`<b>${esc(name.toUpperCase())}</b><small>CUSTOMER WORKSHOP PORTAL</small>`;
  }

  async function sync(){
    try{
      const customer=await loadCustomer();
      const run=()=>apply(customer);
      run();
      const observer=new MutationObserver(run);
      observer.observe(document.getElementById('cwmCardGrid')||document.body,{childList:true,subtree:true});
      setTimeout(()=>observer.disconnect(),8000);
    }catch(_){}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
