(function(){
  'use strict';
  if(window.__belmCustomerRouting754)return;
  window.__belmCustomerRouting754=true;

  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token)return;

  function decode(value){try{let raw=value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>`%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')))}catch(_){return {}}}
  const session=decode(token);
  const rawRole=String(session.customerRole||(session.actorType==='owner'?'owner':'assistant')).trim().toLowerCase();
  const aliases={owner:'customer_admin',admin:'customer_admin',customer_admin:'customer_admin',workshop_manager:'workshop_manager',technician:'technician',operator:'operator',procurement:'procurement',store_keeper:'store_keeper',accounts:'accounts',finance:'accounts',accountant:'accounts'};
  const roleKey=aliases[rawRole]||'customer_admin';
  let mode=null;

  async function getMode(){const r=await fetch('/api/customer_mode.php',{cache:'no-store',headers:{Authorization:'Bearer '+token}}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load customer role mode.');return d}
  function roleEntry(){return (Array.isArray(mode?.roles)?mode.roles:[]).find(x=>x.key===roleKey)||null}
  function fallback(){const map={customer_admin:'/customer-admin-dashboard/',workshop_manager:'/customer-workshop/?actor=customer',technician:'/concept-dashboards/02-technician/',operator:'/concept-dashboards/07-operator/',procurement:'/customer-procurement-dashboard/',store_keeper:'/customer-store-dashboard/',accounts:'/customer-finance/'};return map[roleKey]||'/customer-admin-dashboard/'}
  function target(){const e=roleEntry();return e?.dashboard||fallback()}
  function enabled(){const e=roleEntry();return e?e.enabled!==false:true}

  function apply(){
    const link=document.querySelector('.cwm-enter-role-v672');
    if(link){
      link.href=enabled()?target():'#';
      link.dataset.customerRole=roleKey;
      link.dataset.roleLocked=enabled()?'0':'1';
      const small=link.querySelector('small'),note=link.querySelector('em');
      const e=roleEntry();
      if(small)small.textContent=(e?.label||rawRole.replaceAll('_',' ')||'CUSTOMER ADMIN').toUpperCase();
      if(note)note.textContent=enabled()?'OPEN ROLE DASHBOARD':(e?.scope||'ROLE LOCKED IN CURRENT SERVICE MODE');
      if(!enabled()&&!link.dataset.lockBound){link.dataset.lockBound='1';link.addEventListener('click',ev=>{ev.preventDefault();alert(e?.scope||'This role is locked in the current service mode.')},true)}
    }

    const quick=document.querySelector('.cwm-quick-grid-v556');
    if(quick){
      const map=[
        ['JOB CARDS','/customer-workshop/?actor=customer','workshop_manager'],
        ['PROCUREMENT','/customer-procurement-dashboard/','procurement'],
        ['STORE','/customer-store-dashboard/','store_keeper'],
        ['USERS','/customer-admin-dashboard/','customer_admin']
      ];
      map.forEach(([label,href,key])=>{const a=[...quick.querySelectorAll('a')].find(x=>String(x.querySelector('b')?.textContent||'').trim().toUpperCase()===label);if(!a)return;a.href=href;a.dataset.customerRole=key});
      const admin=[...quick.querySelectorAll('a')].find(x=>String(x.querySelector('b')?.textContent||'').trim().toUpperCase()==='USERS');if(admin&&roleKey!=='customer_admin'){admin.style.opacity='.55';admin.style.pointerEvents='none';admin.title='Customer Admin only';}
    }
  }

  async function boot(){try{mode=await getMode()}catch(_){mode=null}apply();const obs=new MutationObserver(apply);obs.observe(document.documentElement,{subtree:true,childList:true});setTimeout(()=>obs.disconnect(),20000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
