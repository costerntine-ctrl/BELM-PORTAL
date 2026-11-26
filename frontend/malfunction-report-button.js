/* Phase 55 - "Report It" on every machine card (Technician, Machine Operator, Customer Workshop).
   Opens a short form; the description is saved as a Machine Malfunctioning Report and the
   Workshop Manager receives it as an alert asking to create a Job Card. */
(()=>{
  'use strict';
  if(window.__belmMalfunctionButton)return;
  window.__belmMalfunctionButton=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function tokenInfo(){
    const g=k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}};
    const active=g('belm_active_account_type');
    const order=active==='operator'?['belm_operator_token']:active==='customer'?['belm_customer_token']:active==='technician'?['belm_tech_token']:['belm_operator_token','belm_customer_token','belm_tech_token','belm_admin_token'];
    for(const k of order){const t=g(k);if(t)return t}
    return g('belm_operator_token')||g('belm_customer_token')||g('belm_tech_token')||g('belm_admin_token');
  }
  function toast(box,msg,ok){box.textContent=msg;box.style.color=ok?'#166534':'#991b1b'}
  function openForm(machineId,label){
    const wrap=document.createElement('div');
    wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');
    wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML='<form style="background:#fff;color:#1b1f23;border-radius:14px;padding:20px;max-width:440px;width:100%;display:grid;gap:12px;font-family:inherit">'+
      '<b style="font-size:17px">Report machine problem</b><span style="font-size:13px;color:#5b6168">'+esc(label||'This machine')+'</span>'+
      '<textarea name="d" rows="5" maxlength="2000" required placeholder="Write the machine problem (e.g. engine oil is low)" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #c9c6bd;border-radius:8px;font:inherit"></textarea>'+
      '<div role="status" aria-live="polite" style="font-size:13px;min-height:18px"></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-x style="min-height:44px;padding:0 16px;border:1px solid #c9c6bd;background:#fff;border-radius:8px">Cancel</button>'+
      '<button type="submit" style="min-height:44px;padding:0 16px;border:0;background:#b42318;color:#fff;border-radius:8px;font-weight:600">Send report</button></div></form>';
    document.body.appendChild(wrap);
    const form=wrap.querySelector('form'),status=wrap.querySelector('[role=status]'),btn=form.querySelector('[type=submit]');
    wrap.querySelector('[data-x]').onclick=()=>wrap.remove();
    form.d.focus();
    form.onsubmit=async e=>{
      e.preventDefault();btn.disabled=true;toast(status,'Sending...',true);
      try{
        const res=await fetch('/api/malfunction-reports/report',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokenInfo()},body:JSON.stringify({machineId:machineId||undefined,description:form.d.value.trim()})});
        const data=await res.json().catch(()=>({}));
        if(!res.ok)throw new Error(data.error||'Could not send the report.');
        toast(status,'Sent. The Workshop Manager has been alerted.',true);
        setTimeout(()=>wrap.remove(),1400);
      }catch(err){toast(status,err.message,false);btn.disabled=false}
    };
  }
  window.BelmReportIt=openForm;
  function makeButton(machineId,label){
    const b=document.createElement('button');
    b.type='button';b.className='belm-report-it-btn';b.textContent='Report It';
    b.style.cssText='min-height:44px;padding:8px 14px;border:0;border-radius:8px;background:#b42318;color:#fff;font-weight:600;font-size:14px;cursor:pointer;width:100%;margin-top:8px';
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openForm(machineId,label)});
    return b;
  }
  function decorate(){
    document.querySelectorAll('.op-machine-actions:not([data-report-it])').forEach(bar=>{
      bar.dataset.reportIt='1';
      // Operator tokens already carry the single machine id; the server uses it.
      bar.after(makeButton('',localStorage.getItem('belm_operator_machine_name')||'Your machine'));
    });
    document.querySelectorAll('.belm-technician-machine-card:not([data-report-it]),.belm-shared-machine-card-v827:not([data-report-it])').forEach(card=>{
      const id=card.dataset.machineId||card.dataset.belmMachineId||'';
      if(!id)return;
      card.dataset.reportIt='1';
      card.appendChild(makeButton(id,card.dataset.belmMachineTitle||'This machine'));
    });
  }
  let t=0;
  new MutationObserver(()=>{clearTimeout(t);t=setTimeout(decorate,150)}).observe(document.documentElement,{childList:true,subtree:true});
  decorate();
})();
