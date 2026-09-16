(function(){
  'use strict';
  if(window.__belmCustomerMirror753)return;
  window.__belmCustomerMirror753=true;

  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token){location.replace('/login');return;}

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function decodeToken(value){try{let raw=value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')))}catch(_){return {}}}
  const session=decodeToken(token);
  const rawRole=String(session.customerRole||(session.actorType==='owner'?'owner':'assistant')).trim().toLowerCase();
  const aliases={owner:'customer_admin',admin:'customer_admin',customer_admin:'customer_admin',workshop_manager:'workshop_manager',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store_keeper',accounts:'accounts',finance:'accounts',accountant:'accounts'};
  const role=aliases[rawRole]||'assistant';
  const roleAccess={
    customer_admin:['customer_admin','workshop_manager','technician','operator','procurement','store_keeper','accounts','settings'],
    workshop_manager:['workshop_manager','technician','operator','procurement','store_keeper'],
    technician:['technician'],
    operator:['operator'],
    procurement:['procurement'],
    store_keeper:['store_keeper'],
    accounts:['accounts'],
    assistant:[]
  };

  async function api(path){const r=await fetch(path,{cache:'no-store',headers:{Authorization:'Bearer '+token}}),d=await r.json().catch(()=>({}));if(r.status===401){localStorage.removeItem('belm_customer_token');location.replace('/login');throw new Error('Session expired.')}if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d}

  function ensureLockStyle(){if(document.getElementById('customerMirrorLock753'))return;const s=document.createElement('style');s.id='customerMirrorLock753';s.textContent=`
    .customer-role-locked-v753{position:relative!important;opacity:.58!important;filter:saturate(.55)!important;cursor:not-allowed!important}
    .customer-role-locked-v753::after{content:'🔒';position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:13px;z-index:3}
    .customer-dashboard-lock-v753{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:rgba(2,10,20,.82);backdrop-filter:blur(8px)}
    .customer-dashboard-lock-v753>div{width:min(520px,100%);padding:26px;border:1px solid #315b7c;border-radius:20px;background:linear-gradient(145deg,#0b2b47,#071b2e);color:#eef7ff;box-shadow:0 30px 80px rgba(0,0,0,.55);text-align:center;font-family:Inter,Arial,sans-serif}
    .customer-dashboard-lock-v753 b{display:block;font-size:42px;margin-bottom:10px}.customer-dashboard-lock-v753 h2{margin:4px 0 8px}.customer-dashboard-lock-v753 p{margin:0 0 18px;color:#a8bfd2;line-height:1.55}.customer-dashboard-lock-v753 a{display:inline-flex;padding:11px 16px;border-radius:10px;background:#f5c518;color:#071727;text-decoration:none;font-weight:900}
    .customer-mode-chip-v753{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:999px;border:1px solid #2e6287;background:#0a2943;color:#dbeeff;font:900 9px Inter,Arial,sans-serif;letter-spacing:.06em}.customer-mode-chip-v753.independent{border-color:#24945c;color:#97efbc;background:#0d3927}.customer-mode-chip-v753.provider{border-color:#c99a21;color:#ffe28b;background:#362a0a}
  `;document.head.appendChild(s)}

  function lockElement(el,reason){if(!el||el.classList.contains('customer-role-locked-v753'))return;el.classList.add('customer-role-locked-v753');el.setAttribute('aria-disabled','true');el.title=reason||'This role is locked for the current account.';el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();alert(reason||'This role is locked for the current account.')},true)}

  function dashboardLock(reason){if(document.querySelector('.customer-dashboard-lock-v753'))return;const box=document.createElement('div');box.className='customer-dashboard-lock-v753';box.innerHTML=`<div><b>🔒</b><h2>Role Dashboard Locked</h2><p>${esc(reason||'Your current customer role does not have access to this dashboard.')}</p><a href="/portal-cwm/">Back to Company Home</a></div>`;document.body.appendChild(box)}

  function applyRoleLocks(mode){const enabled=new Map((Array.isArray(mode.roles)?mode.roles:[]).map(x=>[x.key,!!x.enabled]));document.querySelectorAll('[data-customer-role]').forEach(el=>{const target=String(el.dataset.customerRole||'').trim();const allowed=(roleAccess[role]||[]).includes(target);const modeAllowed=target==='settings'?!!mode.customerSettings?.available:(enabled.has(target)?enabled.get(target):true);if(!allowed||!modeAllowed){const entry=(mode.roles||[]).find(x=>x.key===target);lockElement(el,!modeAllowed?(entry?.scope||'This role is unavailable in the current service mode.'):`Your ${rawRole.replaceAll('_',' ')} role does not have permission to open this dashboard.`)}});
    const current=String(document.body.dataset.customerRoleDashboard||'').trim();if(current){const allowed=(roleAccess[role]||[]).includes(current);const modeAllowed=current==='settings'?!!mode.customerSettings?.available:(enabled.has(current)?enabled.get(current):true);if(!allowed||!modeAllowed){const entry=(mode.roles||[]).find(x=>x.key===current);dashboardLock(!modeAllowed?(entry?.scope||'This dashboard is unavailable in the current service mode.'):`Your current role (${rawRole.replaceAll('_',' ')}) cannot open this dashboard.`)}}
  }

  function installRoleTools(){const nav=document.querySelector('.cm-side>.cm-nav,.cm-side .cm-nav');if(!nav)return;nav.querySelectorAll('a[href^="/general-report/"]').forEach(a=>{a.href='/role-reports/';if(/report/i.test(a.textContent||''))a.textContent='My Reports'});if(!nav.querySelector('a[href="/role-communications/"]')){const a=document.createElement('a');a.href='/role-communications/';a.textContent='Communication';nav.appendChild(a)}if(!nav.querySelector('a[href="/role-reports/"]')){const a=document.createElement('a');a.href='/role-reports/';a.textContent='My Reports';nav.appendChild(a)}}

  function updateClock(){const now=new Date();document.querySelectorAll('[data-live-date]').forEach(el=>el.textContent=now.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}));document.querySelectorAll('[data-live-time]').forEach(el=>el.textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}))}

  async function boot(){
    ensureLockStyle();installRoleTools();updateClock();setInterval(updateClock,30000);
    const [dashResult,modeResult]=await Promise.allSettled([api('/api/customer-portal/dashboard'),api('/api/customer_mode.php')]);
    const dash=dashResult.status==='fulfilled'?dashResult.value:{};
    const mode=modeResult.status==='fulfilled'?modeResult.value:{};
    if(dashResult.status==='rejected')console.error('customer-portal/dashboard failed:',dashResult.reason);
    if(modeResult.status==='rejected')console.error('customer_mode.php failed:',modeResult.reason);
    const customer=dash.customer||{},name=String(customer.name||'Customer').trim()||'Customer';
    window.BELMCustomerMirror={token,session,role,rawRole,customer,dashboard:dash,mode,api};
    document.querySelectorAll('[data-company-name]').forEach(el=>el.textContent=name);
    document.querySelectorAll('[data-company-name-upper]').forEach(el=>el.textContent=name.toUpperCase());
    document.querySelectorAll('[data-company-email]').forEach(el=>el.textContent=customer.email||'Not recorded');
    document.querySelectorAll('[data-company-phone]').forEach(el=>el.textContent=customer.phone||'Not recorded');
    document.querySelectorAll('[data-company-address]').forEach(el=>el.textContent=customer.address||'Not recorded');
    document.querySelectorAll('[data-customer-role-label]').forEach(el=>el.textContent=rawRole.replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase()));
    document.title=document.title.replace(/Customer|COMPANY/g,name);
    const modeChip=document.querySelector('[data-customer-mode-chip]');
    if(modeChip){
      if(modeResult.status==='fulfilled'){
        const independent=!!mode.mode?.customerIndependent;
        modeChip.textContent=independent?'CUSTOMER INDEPENDENT WORKSHOP':'BELM SERVICE PROVIDER';
        modeChip.classList.add('customer-mode-chip-v753',independent?'independent':'provider');
      }else{
        modeChip.textContent='MODE UNAVAILABLE';
        modeChip.classList.add('customer-mode-chip-v753');
      }
    }
    if(modeResult.status==='fulfilled')applyRoleLocks(mode);
    window.dispatchEvent(new CustomEvent('belm:customer-mirror-ready',{detail:{customer,dashboard:dash,mode,role,rawRole,api}}));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
