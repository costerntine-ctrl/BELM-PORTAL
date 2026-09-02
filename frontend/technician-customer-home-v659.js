(()=>{
  if(location.pathname!=='/tech'&&location.pathname!=='/tech/')return;
  const params=new URLSearchParams(location.search);
  if(params.get('view')==='machines'||params.has('machine')||params.has('machineId'))return;
  if(window.__belmTechnicianCustomerHome659)return;
  window.__belmTechnicianCustomerHome659=true;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const token=()=>localStorage.getItem('belm_tech_token')||'';
  const user=()=>{try{return JSON.parse(localStorage.getItem('belm_tech_user')||'{}')}catch(_){return{}}};
  const payload=()=>{try{const part=token().split('.')[1];if(!part)return{};const normalized=part.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);return JSON.parse(atob(padded))}catch(_){return{}}};
  const data=()=>({...payload(),...user()});
  const customerId=()=>data().assignedCustomerId||data().assigned_customer_id||'';
  const techId=()=>data().id||data().userId||data().user_id||'';
  const isTrue=v=>v===true||v===1||v==='1'||String(v||'').toLowerCase()==='true';
  const customerManaged=()=>isTrue(data().isCustomerManaged??data().is_customer_managed);
  const actionLabel=()=>customerManaged()?'VIEW MACHINE':'OPEN CUSTOMER MACHINE';
  const technicianLabel=()=>customerManaged()?'Customer Technician':'BELM Technician';
  const api=async url=>{const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${token()}`}});const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error||d?.message||`Request failed (${r.status})`);return d};

  function statusFor(machine){
    const raw=String(machine?.status||machine?.machineStatus||machine?.machine_status||'').toUpperCase();
    if(raw.includes('RED')||raw.includes('CRITICAL'))return{key:'red',label:'CRITICAL'};
    if(raw.includes('YELLOW')||raw.includes('WARNING'))return{key:'yellow',label:'ATTENTION'};
    if(raw.includes('GREEN')||raw.includes('NORMAL')||raw.includes('OK'))return{key:'green',label:'NORMAL'};
    return{key:'neutral',label:'NOT CHECKED'};
  }

  function machineSummary(machine,index,total,openJobs){
    const s=statusFor(machine);
    const model=machine?.model||machine?.machineModel||'Machine';
    const type=machine?.machineType||machine?.machine_type||'Machine';
    const fleet=machine?.fleetNumber||machine?.fleet_number||'—';
    const serial=machine?.serialNumber||machine?.serial_number||machine?.regNumber||machine?.reg_number||'—';
    const jobs=Number(openJobs?.get(String(machine?.id||''))||0);
    return `<article class="belm-tech-home-machine status-${s.key}" data-machine-index="${index}">
      <div class="belm-tech-home-machine-top">
        <div><small>${esc(type)}</small><h2>${esc(model)} · Fleet ${esc(fleet)}</h2></div>
        <span class="belm-tech-home-status">${esc(s.label)}</span>
      </div>
      <div class="belm-tech-home-machine-meta">
        <span><b>${jobs}</b> Open Job Card${jobs===1?'':'s'}</span>
        <span>Latest status: <b>${esc(s.label)}</b></span>
        <span>Serial/Reg: <b>${esc(serial)}</b></span>
      </div>
      <div class="belm-tech-home-pager"><span>${index+1} / ${total}</span></div>
    </article>`;
  }

  function render(customer,openJobs){
    const machines=Array.isArray(customer?.machines)?customer.machines:[];
    document.body.dataset.belmTech658Ready='1';
    document.body.classList.add('belm-tech-customer-home');

    const app=document.createElement('main');
    app.id='belmTechnicianCustomerHome659';
    app.className='belm-tech-home-shell';
    app.innerHTML=`
      <section class="belm-tech-home-hero">
        <div class="belm-tech-home-toolbar">
          <div class="belm-tech-home-company-mark"><span>B</span><div><b>BELM GENERAL TECH.LTD</b><small>${esc(technicianLabel())}</small></div></div>
          <div class="belm-tech-home-tools"><button type="button" data-tech-home-refresh>↻ Refresh</button><button type="button" data-tech-home-logout>Log out</button></div>
        </div>

        <div class="belm-tech-home-title"><span>WELCOME TO</span><h1>BELM <em>WORKSHOP</em> PORTAL</h1></div>

        <div class="belm-tech-home-contact">
          <div><i>●</i><span><small>ADDRESS</small><b>${esc(customer?.address||'Not recorded')}</b></span></div>
          <div><i>✉</i><span><small>EMAIL</small><b>${esc(customer?.email||'Not recorded')}</b></span></div>
          <div><i>●</i><span><small>PHONE</small><b>${esc(customer?.phone||customer?.contact||'Not recorded')}</b></span></div>
        </div>

        <section class="belm-tech-home-customer-card">
          <div class="belm-tech-home-card-head"><div><small>ASSIGNED CUSTOMER</small><h2>${esc(customer?.name||'Customer')}</h2></div><span>${machines.length} MACHINE${machines.length===1?'':'S'}</span></div>
          <div class="belm-tech-home-slider" data-tech-home-slider>${machines.length?machines.map((m,i)=>machineSummary(m,i,machines.length,openJobs)).join(''):'<div class="belm-tech-home-empty">No assigned machines found.</div>'}</div>
          ${machines.length>1?`<div class="belm-tech-home-nav"><button type="button" data-machine-prev aria-label="Previous machine">‹</button><div>${machines.map((_,i)=>`<i class="${i===0?'active':''}" data-dot="${i}"></i>`).join('')}</div><button type="button" data-machine-next aria-label="Next machine">›</button></div>`:''}
          <button class="belm-tech-home-open" type="button" data-open-customer-machine ${machines.length?'':'disabled'}>${esc(actionLabel())}</button>
        </section>
      </section>`;

    const root=document.getElementById('root');
    if(root){root.style.display='none';root.after(app)}else document.body.appendChild(app);

    let current=0;
    const cards=[...app.querySelectorAll('.belm-tech-home-machine')];
    const dots=[...app.querySelectorAll('[data-dot]')];
    const show=i=>{if(!cards.length)return;current=(i+cards.length)%cards.length;cards.forEach((c,n)=>c.classList.toggle('active',n===current));dots.forEach((d,n)=>d.classList.toggle('active',n===current))};
    show(0);
    app.querySelector('[data-machine-prev]')?.addEventListener('click',()=>show(current-1));
    app.querySelector('[data-machine-next]')?.addEventListener('click',()=>show(current+1));
    dots.forEach((d,i)=>d.addEventListener('click',()=>show(i)));

    app.querySelector('[data-open-customer-machine]')?.addEventListener('click',()=>{
      const machine=machines[current];
      if(machine?.id){try{sessionStorage.setItem('belm_selected_machine_id',String(machine.id))}catch(_){}}
      const url=new URL(location.href);url.searchParams.set('view','machines');if(machine?.id)url.searchParams.set('machine',String(machine.id));location.href=url.pathname+url.search;
    });
    app.querySelector('[data-tech-home-refresh]')?.addEventListener('click',()=>location.reload());
    app.querySelector('[data-tech-home-logout]')?.addEventListener('click',()=>{
      localStorage.removeItem('belm_tech_token');localStorage.removeItem('belm_tech_user');location.href='/login';
    });
  }

  async function boot(){
    const cid=customerId();if(!cid)return;
    try{
      const customer=await api(`/api/customers/${encodeURIComponent(cid)}`);
      const jobs=new Map();
      const uid=techId();
      if(uid){
        try{
          const rows=await api(`/api/tasks/user/${encodeURIComponent(uid)}`);
          (Array.isArray(rows)?rows:[]).forEach(item=>{
            const mid=String(item.machineId||item.machine_id||'');
            const st=String(item.status||'').toLowerCase();
            if(mid&&st!=='completed'&&st!=='closed')jobs.set(mid,(jobs.get(mid)||0)+1);
          });
        }catch(_){}
      }
      render(customer,jobs);
    }catch(_){}
  }

  const style=document.createElement('style');style.textContent=`
    body.belm-tech-customer-home{margin:0!important;background:#0b1d34!important;color:#fff!important;min-height:100vh!important}.belm-tech-home-shell{min-height:100vh;background:linear-gradient(135deg,#0789d4 0%,#0d8edb 48%,#0464ae 100%);font-family:Inter,system-ui,Arial,sans-serif;color:#fff}.belm-tech-home-hero{min-height:100vh;padding:0 4vw 50px}.belm-tech-home-toolbar{margin:0 -4vw;padding:13px 4vw;background:#19263a;border-bottom:3px solid #f3ad20;display:flex;justify-content:space-between;align-items:center;gap:20px}.belm-tech-home-company-mark{display:flex;align-items:center;gap:10px}.belm-tech-home-company-mark>span{display:grid;place-items:center;width:33px;height:33px;border-radius:50%;background:#8bc83f;color:#18243a;font-weight:950}.belm-tech-home-company-mark b{display:block;font-size:12px}.belm-tech-home-company-mark small{display:block;color:#a9b6c8;margin-top:2px;font-size:9px}.belm-tech-home-tools{display:flex;gap:9px}.belm-tech-home-tools button{border:1px solid #64758d;border-radius:999px;background:#1d2c43;color:#fff;padding:9px 14px;font-weight:800;font-size:11px}.belm-tech-home-title{text-align:center;padding:72px 10px 26px}.belm-tech-home-title>span{font-size:12px;font-weight:900;letter-spacing:.34em}.belm-tech-home-title h1{margin:12px auto 0;font-size:clamp(34px,5.6vw,70px);line-height:.95;letter-spacing:-.035em;font-weight:950}.belm-tech-home-title em{font-style:normal;color:#ffb829}.belm-tech-home-contact{max-width:900px;margin:22px auto 34px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.belm-tech-home-contact>div{display:flex;align-items:center;justify-content:center;gap:10px}.belm-tech-home-contact i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#ffb829;color:#17233a;font-style:normal;font-size:13px}.belm-tech-home-contact small{display:block;font-size:9px;font-weight:900;color:#d7e8f8}.belm-tech-home-contact b{display:block;font-size:11px;margin-top:3px}.belm-tech-home-customer-card{max-width:760px;margin:0 auto;background:#142844;border:2px solid #f0a62b;border-radius:28px;padding:28px;box-shadow:0 20px 55px rgba(4,25,50,.28)}.belm-tech-home-card-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.15)}.belm-tech-home-card-head small{display:block;color:#f5b532;font-weight:900;font-size:9px;letter-spacing:.12em}.belm-tech-home-card-head h2{margin:5px 0 0;font-size:25px}.belm-tech-home-card-head>span{border:1px solid #4b6d93;border-radius:999px;padding:8px 11px;font-size:9px;font-weight:900;color:#cad8e8}.belm-tech-home-slider{position:relative;min-height:190px;margin-top:18px}.belm-tech-home-machine{display:none;min-height:155px;border:1px solid #3d6288;border-radius:20px;background:#10233e;padding:22px;box-sizing:border-box}.belm-tech-home-machine.active{display:block}.belm-tech-home-machine.status-red{border-color:#ff3347}.belm-tech-home-machine.status-yellow{border-color:#f5b500}.belm-tech-home-machine.status-green{border-color:#16c44c}.belm-tech-home-machine-top{display:flex;justify-content:space-between;gap:15px}.belm-tech-home-machine small{color:#9fb5cb;font-size:9px;font-weight:900;letter-spacing:.07em}.belm-tech-home-machine h2{margin:5px 0 0;font-size:21px}.belm-tech-home-status{height:max-content;border:1px solid #5a7795;border-radius:999px;padding:7px 10px;font-size:9px;font-weight:950}.status-red .belm-tech-home-status{color:#ff6370;border-color:#ff3347}.status-yellow .belm-tech-home-status{color:#ffd049;border-color:#f5b500}.status-green .belm-tech-home-status{color:#6be98e;border-color:#16c44c}.belm-tech-home-machine-meta{margin-top:18px;display:flex;flex-wrap:wrap;gap:8px 18px;color:#b9c8d8;font-size:10px}.belm-tech-home-machine-meta b{color:#fff}.belm-tech-home-pager{margin-top:16px;color:#8da6bf;font-size:9px}.belm-tech-home-nav{display:flex;align-items:center;justify-content:space-between;margin-top:12px}.belm-tech-home-nav button{width:42px;height:42px;border:1px solid #3e6b97;border-radius:13px;background:#173657;color:#fff;font-size:28px}.belm-tech-home-nav>div{display:flex;gap:7px}.belm-tech-home-nav i{width:7px;height:7px;border-radius:50%;background:#5a7490}.belm-tech-home-nav i.active{background:#ffb82a}.belm-tech-home-open{display:block;width:100%;margin-top:20px;min-height:58px;border:0;border-radius:15px;background:#ffb829;color:#14213a;font-weight:950;font-size:13px;letter-spacing:.035em;box-shadow:0 10px 24px rgba(0,0,0,.18)}.belm-tech-home-open:disabled{opacity:.45}.belm-tech-home-empty{padding:40px;text-align:center;color:#b7c7d8}
    @media(max-width:700px){.belm-tech-home-hero{padding:0 18px 34px}.belm-tech-home-toolbar{margin:0 -18px;padding:12px 18px}.belm-tech-home-title{padding-top:48px}.belm-tech-home-title h1{font-size:38px}.belm-tech-home-contact{grid-template-columns:1fr;gap:13px;justify-items:start;max-width:360px}.belm-tech-home-contact>div{justify-content:flex-start}.belm-tech-home-customer-card{padding:18px;border-radius:22px}.belm-tech-home-card-head h2{font-size:20px}.belm-tech-home-machine{padding:17px}.belm-tech-home-machine h2{font-size:17px}.belm-tech-home-company-mark b{font-size:10px}.belm-tech-home-tools button{padding:8px 10px;font-size:9px}}
  `;document.head.appendChild(style);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();