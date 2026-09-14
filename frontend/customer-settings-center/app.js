(()=>{
  'use strict';
  const token=localStorage.getItem('belm_customer_token')||'';
  if(!token){location.replace('/login');return}
  const $=id=>document.getElementById(id);
  const state={alerts:{critical:true,service:true,breakdown:true,procurement:true},whatsapp:{enabled:false,number:'',groupName:''},email:{enabled:true,fromName:'',replyTo:''},managementGroupEmails:[],canEdit:false,providers:{},serviceControl:{},restrictions:{}};
  const switches={};

  async function api(method='GET',body){
    const r=await fetch('/api/customer_settings.php',{method,cache:'no-store',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const d=await r.json().catch(()=>({}));
    if(r.status===401){location.replace('/login');throw new Error('Session expired.')}
    if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);
    return d;
  }
  function setText(id,value){const el=$(id);if(el)el.textContent=value}
  function provider(id,info,label){const el=$(id);if(!el)return;const ready=!!info?.configured;el.classList.toggle('ready',ready);el.innerHTML=`<span class="dot"></span><span>${label}: ${ready?'CONNECTED':'NOT CONNECTED'} · provider credentials are controlled by BELM.</span>`}
  function paint(){
    Object.entries(switches).forEach(([key,button])=>{const on=key==='whatsapp'?state.whatsapp.enabled:key==='email'?state.email.enabled:!!state.alerts[key];button.classList.toggle('on',on);button.setAttribute('aria-pressed',on?'true':'false');button.disabled=!state.canEdit});
    $('waNumber').value=state.whatsapp.number||'';$('waGroup').value=state.whatsapp.groupName||'';$('emailFrom').value=state.email.fromName||'';$('replyTo').value=state.email.replyTo||'';$('managementEmails').value=(state.managementGroupEmails||[]).join('\n');
    document.querySelectorAll('#waNumber,#waGroup,#emailFrom,#replyTo,#managementEmails').forEach(el=>el.disabled=!state.canEdit);
    $('saveButton').disabled=!state.canEdit;
    setText('companyName',state.companyName||'Customer');setText('companyNameSide',String(state.companyName||'Customer').toUpperCase());
    const service=state.serviceControl||{},mode=$('serviceMode');if(mode){mode.textContent=service.label||'Customer Service Mode';mode.className='mode '+(service.customerIndependent?'independent':'provider')}
    setText('techControl',service.customerTechnicianEnabled?'CUSTOMER TECHNICIAN ON':'CUSTOMER TECHNICIAN LOCKED');
    setText('machineControl',service.customerMachineManagementEnabled?'CUSTOMER MANAGED':'BELM CONTROLLED');
    setText('belmEscalation',service.belmTechnicalEscalationRequired?'MANDATORY':'ON REQUEST');
    provider('emailProvider',state.providers?.email,'EMAIL');provider('whatsappProvider',state.providers?.whatsapp,'WHATSAPP');
    const escalation=$('providerNotice');if(escalation)escalation.textContent=service.belmTechnicalEscalationRequired?'BELM Service Provider mode: technical critical, breakdown and service escalation to BELM remains mandatory. Customer switches below control customer-side copies and recipients; they do not silence BELM technical responsibility.':'Independent mode: your company controls its own operational team and customer-side alert recipients. BELM receives items only through the permitted BELM support/service workflow.';
    setText('permissionStatus',state.canEdit?'Customer Owner / Company Admin — EDIT':'Role access — VIEW ONLY');
    $('permissionStatus')?.classList.toggle('ok',state.canEdit);
    $('status').textContent=state.canEdit?'Settings loaded. Company-level changes require Customer Owner / Company Admin.':'View only. Customer Owner / Company Admin controls company-level settings.';
  }
  function bindSwitches(){document.querySelectorAll('[data-toggle]').forEach(b=>{switches[b.dataset.toggle]=b;b.addEventListener('click',()=>{if(!state.canEdit)return;const k=b.dataset.toggle;if(k==='whatsapp')state.whatsapp.enabled=!state.whatsapp.enabled;else if(k==='email')state.email.enabled=!state.email.enabled;else state.alerts[k]=!state.alerts[k];paint()})})}
  function syncTheme(){const theme=window.BELMTheme?.get?.()||(document.documentElement.dataset.theme==='dark'?'dark':'light');document.querySelectorAll('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===theme));$('themeToggle').textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode'}
  async function setTheme(theme){if(window.BELMTheme?.set)await window.BELMTheme.set(theme);else{document.documentElement.dataset.theme=theme;localStorage.setItem('belm-theme',theme)}syncTheme()}
  async function load(){try{const d=await api();Object.assign(state,d);Object.assign(state.alerts,d.alerts||{});Object.assign(state.whatsapp,d.whatsapp||{});Object.assign(state.email,d.email||{});state.managementGroupEmails=d.managementGroupEmails||[];paint()}catch(e){$('status').textContent=e.message}}
  async function save(){if(!state.canEdit)return;state.whatsapp.number=$('waNumber').value.trim();state.whatsapp.groupName=$('waGroup').value.trim();state.email.fromName=$('emailFrom').value.trim();state.email.replyTo=$('replyTo').value.trim();state.managementGroupEmails=$('managementEmails').value.split(/[\n,;]+/).map(v=>v.trim()).filter(Boolean);$('saveButton').disabled=true;$('status').textContent='Saving company settings…';try{const d=await api('POST',state);Object.assign(state,d.settings||{});$('status').textContent='Saved. Customer routing preferences updated; BELM provider controls were not changed.';paint()}catch(e){$('status').textContent=e.message}finally{$('saveButton').disabled=!state.canEdit}}
  bindSwitches();$('saveButton').addEventListener('click',save);$('themeToggle').addEventListener('click',()=>setTheme((window.BELMTheme?.get?.()||document.documentElement.dataset.theme)==='dark'?'light':'dark'));document.querySelectorAll('[data-theme-choice]').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.themeChoice)));window.addEventListener('belm-theme-change',syncTheme);syncTheme();load();
})();