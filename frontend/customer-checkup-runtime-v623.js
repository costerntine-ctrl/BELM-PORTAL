(()=>{
  'use strict';
  if(location.pathname!=='/portal/dashboard')return;

  const STYLE_ID='customerCheckupBelmV799Style';
  const MODAL_ID='customerLiveCheckupV623';
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const token=()=>localStorage.getItem('belm_customer_token')||'';

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const link=document.createElement('link');
    link.id=STYLE_ID;
    link.rel='stylesheet';
    link.href='/customer-checkup-belm-v799.css?v=799';
    document.head.appendChild(link);
  }

  function tokenPayload(){
    try{
      let raw=(token().split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/');
      raw+='='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    }catch(_){return {}}
  }

  const api=async(url,opt={})=>{
    const r=await fetch(url,{...opt,cache:'no-store',headers:{...(opt.headers||{}),Authorization:`Bearer ${token()}`}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===401){localStorage.removeItem('belm_customer_token');location.replace('/login')}
      throw Error(d.error||`Request failed (${r.status})`);
    }
    return d;
  };

  const compress=async file=>{
    if(!file||!String(file.type||'').startsWith('image/'))throw Error('Select JPG, PNG or WEBP image.');
    const img=await new Promise((res,rej)=>{const rd=new FileReader();rd.onerror=()=>rej(Error('Could not read photo.'));rd.onload=()=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error('Invalid image.'));i.src=rd.result};rd.readAsDataURL(file)});
    const c=document.createElement('canvas'),ctx=c.getContext('2d');
    let scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight)),q=.68,out='';
    for(let n=0;n<9;n++){
      c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
      ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);out=c.toDataURL('image/jpeg',q);
      const bytes=Math.ceil((out.split(',')[1]||'').length*3/4);if(bytes<=450*1024)break;if(q>.42)q-=.08;else{scale*=.78;q=.56}
    }
    if(Math.ceil((out.split(',')[1]||'').length*3/4)>500*1024)throw Error('Photo is still too large.');
    return out;
  };

  let previousOverflow='';
  const close=()=>{
    document.getElementById(MODAL_ID)?.remove();
    document.documentElement.style.overflow=previousOverflow;
  };

  function optionRows(item){
    const type=String(item.input_type||item.inputType||item.type||'TEXT').toUpperCase();
    let rows=Array.isArray(item.options)?item.options:[];
    if(type==='YES_NO'&&!rows.length)rows=['Yes','No'];
    return rows.map(o=>{
      if(o&&typeof o==='object')return {value:String(o.value??o.label??o.name??''),label:String(o.label??o.value??o.name??''),safety:String(o.safety??o.color??o.safetyLevel??'').toUpperCase()};
      return {value:String(o),label:String(o),safety:''};
    }).filter(o=>o.value);
  }

  function inputType(item){return String(item.input_type||item.inputType||item.type||'TEXT').trim().toUpperCase()}
  function isRequired(item){return item.isRequired===true||item.is_required===true||item.is_required===1||item.is_required==='1'}

  function control(item){
    const type=inputType(item),id=esc(item.id),req=isRequired(item)?' required':'';
    if(type==='DROPDOWN'||type==='YES_NO')return `<select data-answer="${id}"${req}><option value="">Select result</option>${optionRows(item).map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
    if(type==='NUMBER')return `<input data-answer="${id}" type="number" step="any"${req}>`;
    if(type==='DATE')return `<input data-answer="${id}" type="date"${req}>`;
    if(type==='PHOTO')return `<input data-answer-photo="${id}" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"${req}>`;
    return `<input data-answer="${id}" type="text"${req}>`;
  }

  function safetyFor(item,value){
    const val=String(value||'').trim();
    if(!val)return {key:'pending',label:'PENDING'};
    if(/^(n\/?a|not applicable|na)$/i.test(val))return {key:'gray',label:'N/A'};
    const row=optionRows(item).find(o=>o.value.toLowerCase()===val.toLowerCase());
    let safety=String(row?.safety||'').toUpperCase();
    if(!safety){
      const map=item.optionSafety||item.option_safety||{};
      safety=String(map?.[val]||map?.[val.toUpperCase()]||item.safety_level||item.safetyLevel||'').toUpperCase();
    }
    if(!safety&&inputType(item)==='YES_NO')safety=/^(yes|ok|normal|good)$/i.test(val)?'GREEN':'RED';
    if(['RED','DANGER','UNSAFE','STOP'].includes(safety))return {key:'red',label:'UNSAFE'};
    if(['YELLOW','AMBER','WARNING','ATTENTION'].includes(safety))return {key:'yellow',label:'ATTENTION'};
    if(['GRAY','GREY','NA','N/A'].includes(safety))return {key:'gray',label:'N/A'};
    return {key:'green',label:'NORMAL'};
  }

  function machineTitle(m){return [m.brand,m.model].filter(Boolean).join(' ')||m.machineType||m.machine_type||'Machine'}
  function fleet(m){return m.fleetNumber||m.fleet_number||m.regNumber||m.reg_number||'—'}
  function serial(m){return m.serialNumber||m.serial_number||m.regNumber||m.reg_number||'—'}
  function nowLabel(){return new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}

  async function open(machineId){
    close();ensureStyle();
    if(!token())throw Error('Customer session expired. Please sign in again.');
    const data=await api(`/api/customer-checkup?machine=${encodeURIComponent(machineId)}`);
    const templates=Array.isArray(data.templates)?data.templates:[];
    if(!templates.length)throw Error(`Checklist Template not synced for ${data.machine?.machineType||'this machine type'}.`);

    const m=data.machine||{},master=templates[0],session=tokenPayload();
    const company=String(data.customer?.name||data.customerName||session.customerName||session.companyName||'Customer');
    const operator=String(session.actorName||session.userName||session.fullName||session.name||'Signed-in User');
    const reportNo=data.todayReport?.checklist_no||data.todayReport?.checklistNo||data.todayReport?.report_no||data.todayReport?.reportNo||'NEW CHECK';

    const modal=document.createElement('div');
    modal.id=MODAL_ID;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Daily Machine Checklist');
    modal.innerHTML=`
      <section class="cc-shell">
        <header class="cc-topbar">
          <div class="cc-topbar-left"><span class="cc-mark">B</span><div class="cc-topbar-copy"><b>BELM DAILY MACHINE CHECKLIST</b><span>${esc(company)} · Machine Check-up</span></div></div>
          <button class="cc-close" type="button" data-close aria-label="Close Machine Check-up">×</button>
        </header>
        <form data-form class="cc-content">
          <section class="cc-hero">
            <svg class="cc-hero-wire" viewBox="0 0 320 180" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="40" y="60" width="120" height="70" rx="4"/><polygon points="160,70 200,70 220,100 220,130 160,130"/><circle cx="90" cy="140" r="16"/><circle cx="190" cy="140" r="16"/><line x1="40" y1="80" x2="160" y2="80"/><line x1="40" y1="100" x2="160" y2="100"/></svg>
            <div class="cc-hero-body"><p class="cc-eyebrow">PRE-OPERATION SAFETY & CONDITION INSPECTION</p><h2>${esc(machineTitle(m))}</h2><p>${esc(m.machineType||m.machine_type||'Machine')} · Serial ${esc(serial(m))}</p></div>
            <div class="cc-hero-note">MACHINES TODAY.<br>PRODUCTIVITY TOMORROW.</div>
          </section>

          <section class="cc-infobar">
            <label class="cc-photo-card" data-photo-card>
              <input name="displayPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
              <img class="cc-photo-preview" data-photo-preview alt="Machine display photo preview">
              <span class="cc-photo-placeholder"><svg viewBox="0 0 100 70" fill="none" stroke="currentColor" stroke-width="2"><rect x="10" y="28" width="48" height="24" rx="2"/><polygon points="58,32 75,32 84,44 84,55 58,55"/><circle cx="27" cy="58" r="7"/><circle cx="70" cy="58" r="7"/><line x1="18" y1="24" x2="67" y2="10"/></svg><b>MACHINE DISPLAY PHOTO</b><small data-photo-state>Tap to capture or upload · required</small></span>
            </label>
            <div class="cc-meta-card">
              <div class="cc-meta-row"><span class="cc-meta-label">Checklist No.</span><span class="cc-meta-value">${esc(reportNo)}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Machine</span><span class="cc-meta-value">${esc(machineTitle(m))}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Fleet No.</span><span class="cc-meta-value">${esc(fleet(m))}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Template</span><span class="cc-meta-value">${esc(master.name||'Checklist')}</span></div>
            </div>
            <div class="cc-meta-card">
              <div class="cc-meta-row"><span class="cc-meta-label">Customer</span><span class="cc-meta-value">${esc(company)}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Checked by</span><span class="cc-meta-value">${esc(operator)}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Date & Time</span><span class="cc-meta-value">${esc(nowLabel())}</span></div>
              <div class="cc-meta-row"><span class="cc-meta-label">Engine Hours</span><input class="cc-hours" name="hourMeterReading" type="number" min="0" step="any" value="${esc(data.todayReport?.hour_meter_reading??data.todayReport?.hourMeterReading??data.latestHourMeter??0)}" required></div>
            </div>
            <div class="cc-guide">
              <div class="cc-guide-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>Checklist Status Guide</div>
              <div class="cc-guide-row"><i class="cc-dot green"></i><span class="cc-guide-label green">Normal</span><span class="cc-guide-desc">Machine is in good condition</span></div>
              <div class="cc-guide-row"><i class="cc-dot amber"></i><span class="cc-guide-label amber">Attention</span><span class="cc-guide-desc">Monitor and plan service</span></div>
              <div class="cc-guide-row"><i class="cc-dot red"></i><span class="cc-guide-label red">Unsafe / Stop</span><span class="cc-guide-desc">Creates an urgent machine condition</span></div>
              <div class="cc-guide-row"><i class="cc-dot gray"></i><span class="cc-guide-label gray">Not Applicable</span><span class="cc-guide-desc">Not relevant to this machine</span></div>
            </div>
          </section>

          <section class="cc-start-panel">
            <div class="cc-start-title"><div><b>CHECKLIST CONTROL</b><small>Complete the service information before submitting the inspection.</small></div><span class="cc-sync">● MASTER TEMPLATE SYNCED</span></div>
            <div class="cc-start-box"><span>Checklist Template</span><strong>${esc(master.name||'Checklist')}</strong><div class="cc-template-meta">AUTO SYNC · ${esc(m.machineType||m.machine_type||'Machine')} = ${esc(master.machine_type||master.machineType||m.machineType||'Master')}</div><input name="templateId" type="hidden" value="${esc(master.id)}"></div>
            <label class="cc-start-box"><span>Service Day</span><span class="cc-service-row"><input name="serviceDayChecked" type="checkbox"> Is this a service day?</span></label>
            <label class="cc-start-box" data-service hidden><span>Next Service Interval</span><select name="nextServiceHours"><option value="250">250 HRS</option><option value="500">500 HRS</option><option value="1000">1000 HRS</option><option value="2000">2000 HRS</option></select></label>
          </section>

          <div class="cc-section-head"><div><h3>Machine Inspection</h3><p>Complete every required item. Attention and Unsafe results open an observation note automatically.</p></div><span class="cc-sync">${esc((master.items||[]).length)} CHECK ITEMS</span></div>
          <section class="cc-check-grid" data-items></section>
          <p class="cc-error" data-error hidden></p>
          <footer class="cc-actions"><div class="cc-actions-note">Customer check-up remains synced with the BELM master template and this machine's history.</div><div class="cc-action-buttons"><button type="button" class="cc-cancel" data-close>Cancel</button><button type="submit" class="cc-submit">✓ COMPLETE & SAVE CHECK UP</button></div></footer>
        </form>
      </section>`;

    previousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow='hidden';
    document.body.appendChild(modal);

    const form=modal.querySelector('[data-form]'),itemsBox=modal.querySelector('[data-items]'),serviceBox=modal.querySelector('[data-service]');
    let displayPhotoUrl='';
    const items=Array.isArray(master.items)?master.items:[];
    itemsBox.innerHTML=items.map((item,index)=>`<article class="cc-check-card" data-item="${esc(item.id)}"><div class="cc-item-head"><b>${index+1}. ${esc(item.label)}${isRequired(item)?' *':''}</b><span class="cc-status-pill" data-status>PENDING</span></div><div class="cc-control">${control(item)}<textarea data-note="${esc(item.id)}" rows="2" placeholder="Observation / issue note"></textarea></div></article>`).join('')||'<article class="cc-check-card"><div class="cc-item-head"><b>No checklist items in this template.</b></div></article>';

    function updateItem(item,element){
      const card=element.closest('.cc-check-card');if(!card)return;
      const value=element.matches('[data-answer-photo]')?(element.files?.length?'PHOTO':''):element.value;
      const state=safetyFor(item,value);
      card.classList.remove('status-green','status-yellow','status-red','status-gray');
      if(state.key!=='pending')card.classList.add('status-'+state.key);
      const pill=card.querySelector('[data-status]');if(pill)pill.textContent=state.label;
    }

    items.forEach(item=>{
      const id=CSS.escape(String(item.id));
      const element=form.querySelector(`[data-answer="${id}"]`)||form.querySelector(`[data-answer-photo="${id}"]`);
      if(element)element.addEventListener('change',()=>updateItem(item,element));
    });

    form.elements.serviceDayChecked.addEventListener('change',e=>{serviceBox.hidden=!e.target.checked});
    form.elements.displayPhoto.addEventListener('change',async e=>{
      const state=modal.querySelector('[data-photo-state]'),card=modal.querySelector('[data-photo-card]'),preview=modal.querySelector('[data-photo-preview]');
      try{
        state.textContent='Compressing photo…';
        displayPhotoUrl=await compress(e.target.files?.[0]);
        preview.src=displayPhotoUrl;card.classList.add('has-photo');state.textContent='Display photo ready · tap to replace';
      }catch(err){
        displayPhotoUrl='';e.target.value='';preview.removeAttribute('src');card.classList.remove('has-photo');state.textContent=err.message;
      }
    });

    const today=data.todayReport;
    if(today){
      if(today.display_photo_url||today.displayPhotoUrl){displayPhotoUrl=today.display_photo_url||today.displayPhotoUrl;const preview=modal.querySelector('[data-photo-preview]'),card=modal.querySelector('[data-photo-card]'),state=modal.querySelector('[data-photo-state]');preview.src=displayPhotoUrl;card.classList.add('has-photo');state.textContent='Today\'s display photo · tap to replace';form.elements.displayPhoto.required=false}
      if(today.service_day_checked??today.serviceDayChecked){form.elements.serviceDayChecked.checked=true;serviceBox.hidden=false}
      const next=today.next_service_hours??today.nextServiceHours;if(next)form.elements.nextServiceHours.value=String(next);
      for(const answer of today.answers||[]){
        const id=String(answer.template_item_id??answer.templateItemId??answer.itemId??'');if(!id)continue;
        const text=form.querySelector(`[data-answer="${CSS.escape(id)}"]`),note=form.querySelector(`[data-note="${CSS.escape(id)}"]`);
        if(text&&text.type!=='file'){text.value=answer.value??'';const item=items.find(x=>String(x.id)===id);if(item)updateItem(item,text)}
        if(note)note.value=answer.note??'';
      }
      const submit=form.querySelector('[type=submit]');if(submit)submit.textContent='✓ UPDATE TODAY\'S CHECK UP';
    }

    const escapeHandler=e=>{if(e.key==='Escape'){e.preventDefault();close();document.removeEventListener('keydown',escapeHandler)}};
    document.addEventListener('keydown',escapeHandler);
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-close]')){document.removeEventListener('keydown',escapeHandler);close()}});

    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type=submit]'),err=modal.querySelector('[data-error]');err.hidden=true;
      if(!displayPhotoUrl){err.textContent='Machine display photo is required.';err.hidden=false;return}
      btn.disabled=true;btn.textContent='Saving Check Up…';
      try{
        const answers=[];
        for(const item of items){
          const id=CSS.escape(String(item.id));
          const text=form.querySelector(`[data-answer="${id}"]`),photo=form.querySelector(`[data-answer-photo="${id}"]`),note=form.querySelector(`[data-note="${id}"]`);
          let photoUrl='';if(photo?.files?.[0])photoUrl=await compress(photo.files[0]);
          answers.push({itemId:item.id,value:text?text.value.trim():'',photoUrl,note:note?.value.trim()||''});
        }
        const result=await api('/api/customer-checkup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineId,templateId:master.id,hourMeterReading:form.elements.hourMeterReading.value,displayPhotoUrl,serviceDayChecked:form.elements.serviceDayChecked.checked,nextServiceHours:form.elements.nextServiceHours.value,answers})});
        document.removeEventListener('keydown',escapeHandler);close();alert(`${result.message||'Check Up saved.'}\nStatus: ${result.overallStatus||'GREEN'}`);window.location.reload();
      }catch(error){err.textContent=error.message||'Check Up could not be saved.';err.hidden=false;btn.disabled=false;btn.textContent=today?'✓ UPDATE TODAY\'S CHECK UP':'✓ COMPLETE & SAVE CHECK UP'}
    });
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-customer-checkup]');if(!b)return;
    e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
    open(b.dataset.customerCheckup).catch(err=>alert(err.message||'Could not open Check Up.'));
  },true);
})();
