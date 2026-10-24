/* BELM user language preference, scoped to signed-in account in this browser. */
(function () {
  'use strict';
  const languages = {en:'English',sw:'Kiswahili',zh:'中文（简体）'};
  function identity() {
    const active = String(localStorage.getItem('belm_active_account_type') || '').toLowerCase();
    const tokenKey = {customer:'belm_customer_token',technician:'belm_tech_token',admin:'belm_admin_token',operator:'belm_operator_token'}[active];
    const token = tokenKey ? localStorage.getItem(tokenKey) : null;
    if (!token) return null;
    try {
      const raw = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      const payload = JSON.parse(atob(raw + '='.repeat((4-raw.length%4)%4)));
      const id = payload.actorType === 'assistant' ? payload.actorId : (payload.sub || payload.userId || payload.id || payload.customerId);
      if (!id) return null;
      return active + ':' + (payload.actorType === 'assistant' ? 'assistant:' : '') + String(id);
    } catch (_) { return null; }
  }
  function key() { const id = identity(); return id ? 'belm_language_pref:' + id : null; }
  function get() { const k=key(); const v=k?localStorage.getItem(k):null; return languages[v]?v:'en'; }
  function authToken() {
    const active=String(localStorage.getItem('belm_active_account_type')||'').toLowerCase();
    const preferred={customer:'belm_customer_token',technician:'belm_tech_token',admin:'belm_admin_token',operator:'belm_operator_token'}[active];
    return preferred ? localStorage.getItem(preferred) : null;
  }
  async function loadRemote(select,status) {
    const token=authToken();if(!token)return;
    try {
      const r=await fetch('/api/preferences',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!r.ok)throw new Error('Unable to read language setting');
      const data=await r.json();
      const lang=languages[data.language]?data.language:get();
      select.value=lang;set(lang);
      status.textContent='Saved for your account; available on your devices.';
    }catch(_){status.textContent='Offline preference on this device. Account sync unavailable.';}
  }
  async function saveRemote(value,status){
    const token=authToken();if(!token){status.textContent='Sign in to save your language.';return;}
    try {
      const r=await fetch('/api/preferences',{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({language:value})});
      if(!r.ok)throw new Error('Save failed');
      status.textContent='Language saved to your account.';
    }catch(_){status.textContent='Saved on this device only; account sync failed.';}
  }
  function set(value) {
    if (!languages[value]) return false;
    const k=key(); if (!k) return false;
    localStorage.setItem(k,value);
    document.documentElement.lang=value==='zh'?'zh-CN':value;
    window.dispatchEvent(new CustomEvent('belm:language-changed',{detail:{language:value}}));
    return true;
  }
  function mount(target) {
    const root = typeof target==='string'?document.querySelector(target):target;
    if (!root || root.querySelector('[data-belm-language]')) return;
    const container=document.createElement('section'); container.className='belm-language-pref';
    container.style.cssText='margin-top:16px;padding:16px;border:1px solid var(--line,#d5e0ec);border-radius:12px;background:var(--panel,#fff);color:var(--text,#14243a)';
    const label=document.createElement('label');label.textContent='Preferred language / Lugha / 语言';label.htmlFor='belmUserLanguage';label.style.cssText='display:block;font-weight:700;margin-bottom:9px';
    const select=document.createElement('select');select.id='belmUserLanguage';select.dataset.belmLanguage='';select.style.cssText='width:100%;max-width:360px;padding:11px;border:1px solid #9aabbc;border-radius:9px;color:inherit;background:transparent';
    for (const [value,name] of Object.entries(languages)) {const o=document.createElement('option');o.value=value;o.textContent=name;select.appendChild(o)}
    select.value=get();
    const status=document.createElement('p');status.style.cssText='font-size:12px;margin:9px 0 0';status.textContent='Loading account language preference…';
    select.addEventListener('change',()=>{if(set(select.value))saveRemote(select.value,status);else status.textContent='Sign in to save your personal language preference.';});
    container.append(label,select,status);root.appendChild(container);loadRemote(select,status);
  }
  // Load saved language across dashboards, not only when Settings is open.
  async function initializeAccountLanguage() {
    const token = authToken();
    if (!token || !key()) return;
    try {
      const response = await fetch('/api/preferences', {headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      if (languages[data.language]) set(data.language);
    } catch (_) { /* retain device preference if offline */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAccountLanguage, {once:true});
  } else { initializeAccountLanguage(); }
  document.documentElement.lang=get()==='zh'?'zh-CN':get();
  window.BelmLanguagePreferences={get,set,mount};
})();
