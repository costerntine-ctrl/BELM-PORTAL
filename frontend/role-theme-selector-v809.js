(function(){
  'use strict';
  if(window.__belmRoleThemeSelector809)return;
  window.__belmRoleThemeSelector809=true;

  const SELECTOR='#themeToggle,#headerThemeToggle,#customerParityThemeToggle,#themeButton,[data-belm-theme-toggle]';
  const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

  function hasSession(){return ['belm_admin_token','belm_tech_token','belm_customer_token','belm_operator_token'].some(k=>localStorage.getItem(k))}
  function loadThemeManager(){
    if(window.BELMTheme)return Promise.resolve();
    return new Promise(resolve=>{
      const found=document.querySelector('script[src^="/theme-manager.js"]');
      if(found){found.addEventListener('load',resolve,{once:true});setTimeout(resolve,1200);return}
      const script=document.createElement('script');script.src='/theme-manager.js?v=809-every-role-selector';script.onload=resolve;script.onerror=resolve;document.head.appendChild(script);
    });
  }
  function loadReportExport(){
    if(window.__belmReportExport816||document.querySelector('script[src^="/report-export-v816.js"]'))return;
    const script=document.createElement('script');
    script.src='/report-export-v816.js?v=816-pdf-csv-print';
    script.defer=true;
    document.head.appendChild(script);
  }
  function update(button){
    const dark=document.documentElement.dataset.theme==='dark';
    document.body?.classList.toggle('belm-light',!dark);
    document.documentElement.classList.toggle('customer-parity-light',!dark);
    localStorage.setItem('belm-theme',dark?'dark':'light');
    localStorage.setItem('belm_theme',dark?'dark':'light');
    button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    button.title=dark?'Light mode':'Dark mode';
    const label=button.querySelector('#themeLabel,[data-theme-label],.theme-label');
    if(label)label.textContent=dark?'Light mode':'Dark mode';
  }
  function bind(button){
    if(!button||button.dataset.belmRoleThemeBound==='1')return;
    button.dataset.belmRoleThemeBound='1';
    button.type='button';
    button.addEventListener('click',event=>{
      if(!window.BELMTheme?.toggle)return;
      event.preventDefault();event.stopImmediatePropagation();window.BELMTheme.toggle();
    },true);
    update(button);
  }
  function inject(){
    if(document.querySelector(SELECTOR))return;
    const foot=document.querySelector('.belm-sidebar__foot,.sidebar-footer');
    const actions=document.querySelector('.topbar-actions,.belm-topbar__right,.header-right');
    const host=foot||actions;if(!host)return;
    const button=document.createElement('button');button.id='roleThemeToggle';button.type='button';
    button.className=foot?(foot.classList.contains('sidebar-footer')?'nav-item':'belm-nav__item'):'button secondary';
    button.dataset.belmThemeToggle='1';button.innerHTML=icon+'<span data-theme-label>Dark mode</span>';
    host.insertBefore(button,host.firstChild);bind(button);
  }
  function scan(){document.querySelectorAll(SELECTOR+',#roleThemeToggle').forEach(bind);inject()}
  async function boot(){if(!hasSession())return;loadReportExport();await loadThemeManager();scan();window.addEventListener('belm-theme-change',()=>document.querySelectorAll(SELECTOR+',#roleThemeToggle').forEach(update));new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});setTimeout(scan,500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();