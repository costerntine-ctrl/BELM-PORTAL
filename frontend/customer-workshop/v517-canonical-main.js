(function(){
  const qs=new URLSearchParams(location.search);
  if((qs.get('actor')||'customer').toLowerCase()==='belm')return;
  if(!localStorage.getItem('belm_customer_token'))return;

  const shell=document.querySelector('main.shell');
  const role=document.querySelector('.bw-role-grid.cwm-single-home');
  const docs=document.getElementById('cwmCustomerDocuments');
  const branding=document.getElementById('cwmBrandingCard');
  const workflow=document.querySelector('.workflow-panel');
  const store=document.getElementById('workshop-store');
  const toolDocs=document.getElementById('toolDocumentsPanel');
  if(!shell||!role||!docs||!branding||!workflow||!store||!toolDocs)return;

  const style=document.createElement('style');
  style.textContent=`
    .cwm-v517-subview{margin-top:18px}
    .cwm-v517-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 18px;border:1px solid #284b67;border-radius:15px;background:linear-gradient(135deg,#0b2c47,#0a2036);color:#edf6ff}
    .cwm-v517-head h2{margin:0;font-family:"Space Grotesk",Inter,sans-serif;font-size:clamp(22px,3vw,32px)}
    .cwm-v517-head p:not(.eyebrow){margin:5px 0 0;color:#a9bfd2;font-size:10px}
    .cwm-v517-back{flex:0 0 auto;min-height:40px;padding:9px 14px;border:1px solid #466981;border-radius:10px;background:#0b2036;color:#fff;font:inherit;font-size:10px;font-weight:850;cursor:pointer}
    .cwm-v517-back:hover,.cwm-v517-back:focus{background:#123451;border-color:#5a87a5}
    #cwmV517Settings .cwm-branding-parity{margin:14px 0 0}
    #cwmV517Store .workshop-store-panel{margin-top:14px}
    #cwmV517Store #toolDocumentsPanel{margin-top:14px}
    @media(max-width:620px){.cwm-v517-head{flex-direction:column;padding:14px}.cwm-v517-back{width:100%}}
  `;
  document.head.appendChild(style);

  const main=document.createElement('div');
  main.id='cwmV517Main';
  shell.insertBefore(main,role);
  main.append(role,docs,workflow);

  const settings=document.createElement('section');
  settings.id='cwmV517Settings';
  settings.className='cwm-v517-subview hidden';
  settings.innerHTML='<div class="cwm-v517-head"><div><p class="eyebrow">PORTAL-CWM ONLY</p><h2>Settings</h2><p>Company-specific PORTAL-CWM settings.</p></div><button type="button" class="cwm-v517-back">← Back to CWM Main Home</button></div>';
  settings.appendChild(branding);
  main.after(settings);

  const storeView=document.createElement('section');
  storeView.id='cwmV517Store';
  storeView.className='cwm-v517-subview hidden';
  storeView.innerHTML='<div class="cwm-v517-head"><div><p class="eyebrow">PORTAL-CWM · STORE & SPARES</p><h2>Open Store & Spares</h2><p>Customer Workshop Store, spare/material receiving and Tool Issue documents.</p></div><button type="button" class="cwm-v517-back">← Back to CWM Main Home</button></div>';
  storeView.append(store,toolDocs);
  settings.after(storeView);

  let active='main';
  function show(view){
    active=['main','settings','store'].includes(view)?view:'main';
    main.classList.toggle('hidden',active!=='main');
    settings.classList.toggle('hidden',active!=='settings');
    storeView.classList.toggle('hidden',active!=='store');
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  const storeLink=document.getElementById('storeLink');
  const settingsLink=document.getElementById('cwmSettingsLink');
  const topBack=document.getElementById('cwmBackButton');
  const brandBack=document.getElementById('backLink');

  if(storeLink)storeLink.href='#cwm-store';
  if(settingsLink)settingsLink.href='#cwm-settings';

  // Top-level CWM navigation must return to the approved Customer Dashboard
  // home card. Only internal Settings/Store Back buttons return to CWM Main.
  if(topBack){
    topBack.href='/portal/dashboard';
    topBack.setAttribute('aria-label','Back to Customer Dashboard');
  }
  if(brandBack)brandBack.href='/portal/dashboard';

  storeLink?.addEventListener('click',e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    show('store');
  },true);
  settingsLink?.addEventListener('click',e=>{
    e.preventDefault();
    e.stopImmediatePropagation();
    show('settings');
  },true);
  document.querySelectorAll('.cwm-v517-back').forEach(btn=>btn.addEventListener('click',()=>show('main')));

  // Do not trap browser Back/Forward inside PORTAL-CWM. Natural navigation
  // must be able to return to the Customer Dashboard/home card.
  show('main');
})();
