(function(){
  const qs=new URLSearchParams(location.search);
  const isBelm=(qs.get('actor')||'customer').toLowerCase()==='belm';
  const main=document.getElementById('cwmMainDashboard');
  const settings=document.getElementById('cwmSettingsView');
  const store=document.getElementById('cwmStoreView');

  function showCwmView(view){
    if(isBelm)return;
    const next=['main','settings','store'].includes(view)?view:'main';
    main?.classList.toggle('hidden',next!=='main');
    settings?.classList.toggle('hidden',next!=='settings');
    store?.classList.toggle('hidden',next!=='store');
    try{sessionStorage.setItem('belm_cwm_active_view',next)}catch(_){}
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  if(!isBelm&&main&&settings&&store){
    const settingsLink=document.getElementById('cwmSettingsLink');
    const storeLink=document.getElementById('storeLink');
    const topBack=document.getElementById('cwmBackButton');
    const brandBack=document.getElementById('backLink');

    settingsLink?.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      showCwmView('settings');
    },true);
    storeLink?.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      showCwmView('store');
    },true);
    document.querySelectorAll('[data-cwm-main]').forEach(btn=>btn.addEventListener('click',e=>{
      e.preventDefault();
      showCwmView('main');
    }));
    [topBack,brandBack].forEach(el=>el?.addEventListener('click',e=>{
      e.preventDefault();
      e.stopImmediatePropagation();
      showCwmView('main');
    },true));

    const saved=(()=>{try{return sessionStorage.getItem('belm_cwm_active_view')||'main'}catch(_){return'main'}})();
    showCwmView(saved);
  }

  if(!settings||document.getElementById('cwmV520SettingsControl'))return;
  const style=document.createElement('style');style.textContent=`
  .cwm-settings-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}.cwm-settings-control-card{padding:16px;border:1px solid #2b5572;border-radius:16px;background:linear-gradient(145deg,#0a2842,#081d31)}.cwm-settings-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.cwm-settings-card-head span{display:block;color:#5fdf9a;font-size:9px;font-weight:900;letter-spacing:.1em}.cwm-settings-card-head h3{margin:4px 0 3px;font-size:22px;color:#fff}.cwm-settings-card-head p{margin:0;color:#9eb5c9;font-size:10.5px;line-height:1.5}.cwm-settings-primary,.cwm-settings-action-row a,.cwm-settings-action-row button{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:8px 12px;border:1px solid #365f7d;border-radius:10px;background:#0c3656;color:#e9f6ff;text-decoration:none;font-size:10px;font-weight:850;cursor:pointer}.cwm-settings-primary{background:#0d8bd0;border-color:#0d8bd0}.cwm-default-role-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.cwm-default-role-list>div{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #274a65;border-radius:10px;background:#071a2c}.cwm-default-role-list b{font-size:10px}.cwm-default-role-list a{color:#7fd2ff;font-size:9px;font-weight:850;text-decoration:none}.cwm-settings-action-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.cwm-settings-action-row .action-add{background:#05a85b;border-color:#05a85b}.cwm-settings-action-row .action-danger{background:#4a2028;border-color:#7a3342;color:#ffc7cf}.cwm-settings-action-row .action-password{background:#6a51d5;border-color:#6a51d5}.cwm-template-designer-preview{margin-top:14px;padding:12px;border:1px solid #2d5270;border-radius:12px;background:#071a2c}.cwm-template-fields{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:8px}.cwm-template-fields label{display:grid;gap:5px;color:#87a3ba;font-size:8px;font-weight:850}.cwm-template-fields input{padding:9px;border:1px solid #31536c;border-radius:8px;background:#0a243b;color:#fff}.cwm-template-preview-list{display:grid;gap:7px;margin-top:10px}.cwm-template-preview-list>div{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;padding:8px 9px;border:1px solid #23465f;border-radius:9px;background:#091f34}.cwm-template-add-item{min-height:34px;border:1px dashed #3f708f;border-radius:9px;background:transparent;color:#9fd5f7;font-weight:850}.cwm-design-only-note{display:block;margin-top:10px;color:#e0b957;font-size:9px}@media(max-width:900px){.cwm-settings-control-grid{grid-template-columns:1fr}}@media(max-width:560px){.cwm-default-role-list,.cwm-template-fields{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const wrap=document.createElement('section');wrap.id='cwmV520SettingsControl';wrap.className='cwm-settings-control-grid';
  wrap.innerHTML=`
  <article class="cwm-settings-control-card"><div class="cwm-settings-card-head"><div><span>01 · ACCESS CONTROL</span><h3>Roles</h3><p>Default customer-workshop roles.</p></div><a class="cwm-settings-primary" href="/customer-users/">Open Role Manager</a></div><div class="cwm-default-role-list">${[['Customer Owner / Admin','admin'],['Workshop Manager','workshop_manager'],['Technician','technician'],['Operator','operator'],['Store Keeper','store_keeper'],['Procurement','procurement'],['Accounts / Finance','accounts'],['Management / Administration','management']].map(([n,r])=>`<div><b>${n}</b><a href="/customer-users/?role=${r}">Edit Role</a></div>`).join('')}</div></article>
  <article class="cwm-settings-control-card"><div class="cwm-settings-card-head"><div><span>02 · FLEET CONTROL</span><h3>Machines</h3><p>Customer machines only.</p></div></div><div class="cwm-settings-action-row"><a class="action-add" href="/portal/dashboard?view=machines&action=add-machine">+ Add Machine</a><a href="/portal/dashboard?view=machines">Edit Machine</a><a class="action-danger" href="/portal/dashboard?view=machines">Delete Machine</a></div></article>
  <article class="cwm-settings-control-card"><div class="cwm-settings-card-head"><div><span>03 · COMPANY USERS</span><h3>Users</h3><p>Add and manage company users.</p></div></div><div class="cwm-settings-action-row"><a class="action-add" href="/customer-users/?action=add-user">+ Add User</a><a href="/customer-users/">Edit User</a><a class="action-danger" href="/customer-users/">Delete User</a><a class="action-password" href="/customer-users/">Generate Password</a></div></article>
  <article class="cwm-settings-control-card"><div class="cwm-settings-card-head"><div><span>04 · CUSTOMER CHECKLIST</span><h3>Custom Checklist Template</h3><p>CWM-only design. It never overwrites BELM Checklist Templates.</p></div></div><div class="cwm-template-designer-preview"><div class="cwm-template-fields"><label>Template Name<input value="Customer Daily Machine Check"></label><label>Machine Type<input placeholder="e.g. Reach Stacker"></label><label>Model / Group<input placeholder="Optional model"></label></div><div class="cwm-template-preview-list"><div><span>01</span><b>Engine oil level</b><em>Normal / Attention / Critical</em></div><div><span>02</span><b>Coolant level</b><em>Normal / Attention / Critical</em></div><div><span>03</span><b>Hydraulic system</b><em>Text + Safety Color</em></div><button type="button" class="cwm-template-add-item">+ Add Checklist Item</button></div></div><div class="cwm-settings-action-row"><button type="button" class="action-add cwm-template-design-button">Create Custom Template</button><button type="button" class="cwm-template-design-button">Edit Design</button><button type="button" class="cwm-template-design-button">Preview</button></div><small class="cwm-design-only-note">Design only; customer template storage/sync remains separate from BELM templates.</small></article>`;
  const branding=document.getElementById('cwmBrandingCard');settings.insertBefore(wrap,branding||null);
  let n=3;wrap.querySelector('.cwm-template-add-item')?.addEventListener('click',e=>{n++;const row=document.createElement('div');row.innerHTML=`<span>${String(n).padStart(2,'0')}</span><b>New checklist item</b><em>Choose input + Safety Color</em>`;e.currentTarget.before(row)});
})();