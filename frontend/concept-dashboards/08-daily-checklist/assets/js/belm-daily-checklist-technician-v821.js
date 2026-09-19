(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  if(String(params.get('actor')||'').toLowerCase()!=='technician')return;

  const token=localStorage.getItem('belm_tech_token')||'';
  const machineId=String(params.get('machine')||params.get('machineId')||'').trim();
  if(!token){location.replace('/login');return}
  if(!machineId){location.replace('/concept-dashboards/02-technician/daily-checklists.php');return}

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').trim();
  const byLabel=label=>Array.from(document.querySelectorAll('.belm-meta-row')).find(r=>norm(r.querySelector('.belm-meta-row__label')?.textContent).toLowerCase()===label.toLowerCase());
  const setMeta=(label,value,newLabel)=>{const row=byLabel(label);if(!row)return;if(newLabel){const l=row.querySelector('.belm-meta-row__label');if(l)l.textContent=newLabel}const el=row.querySelector('.belm-meta-row__value');if(el)el.textContent=value||'—'};
  const authFetch=async(url,opt={})=>{const headers={Authorization:'Bearer '+token,...(opt.headers||{})};const init={cache:'no-store',...opt,headers};if(init.body&&typeof init.body!=='string'){init.headers={'Content-Type':'application/json',...headers};init.body=JSON.stringify(init.body)}const r=await fetch(url,init);const ct=String(r.headers.get('content-type')||'');const data=ct.includes('application/json')?await r.json().catch(()=>({})):await r.blob();if(!r.ok)throw new Error((data&&data.error)||('Request failed ('+r.status+').'));return data};
  const fmtNow=()=>{const d=new Date();return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})+' • '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
  const value=(o,...keys)=>{for(const k of keys)if(o&&o[k]!=null&&o[k]!=='')return o[k];return''};

  let template=null,machine=null,reportContext=null,latestReport=null,displayPhotoData='',savedReport=null;
  const itemMap=new Map();

  function updateClock(){
    const d=new Date();
    const dateEl=document.getElementById('liveDate'),timeEl=document.getElementById('liveTime'),metaEl=document.getElementById('metaDateTime');
    if(dateEl)dateEl.textContent=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    if(timeEl)timeEl.textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    if(metaEl)metaEl.textContent=fmtNow();
  }

  function categoryFor(label){
    const s=norm(label).toLowerCase();
    if(/engine|coolant|fuel|air filter/.test(s))return'Engine System';
    if(/transmission|gearbox|forward|reverse|gear/.test(s))return'Transmission';
    if(/brake|steer/.test(s))return'Brakes & Steering';
    if(/hydraulic|hose|pipe|cylinder|pump/.test(s))return'Hydraulic System';
    if(/electric|battery|light|horn|alarm|beacon|indicator/.test(s))return'Electrical & Lights';
    if(/tyre|tire|wheel|seat belt|mirror|camera|fire extinguisher|safety/.test(s))return'Tyres & Safety';
    if(/boom|spreader|dashboard|fault|service hour|operation|working|parameter/.test(s))return'Working Parameters';
    return'General Check';
  }

  function statusClass(item,val){
    const safety=String(item.optionSafety?.[val]||item.safetyLevel||'NONE').toUpperCase();
    if(safety==='GREEN')return'status-normal';
    if(safety==='YELLOW')return'status-attention';
    if(safety==='RED')return'status-unsafe';
    return'status-na';
  }

  function controlFor(item){
    const id='techCheck_'+String(item.id).replace(/[^A-Za-z0-9_-]/g,'');
    itemMap.set(String(item.id),item);
    const type=String(item.inputType||'TEXT').toUpperCase();
    if(type==='DROPDOWN'||type==='YES_NO'){
      let options=Array.isArray(item.options)?item.options:[];
      if(type==='YES_NO'&&!options.length)options=['Yes','No'];
      return `<select id="${esc(id)}" class="check-status tech-template-control" data-item-id="${esc(item.id)}" ${item.isRequired?'required':''}><option value="">Select status</option>${options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
    }
    if(type==='NUMBER')return `<input id="${esc(id)}" class="tech-template-control tech-check-input" data-item-id="${esc(item.id)}" type="number" ${item.isRequired?'required':''}>`;
    if(type==='DATE')return `<input id="${esc(id)}" class="tech-template-control tech-check-input" data-item-id="${esc(item.id)}" type="date" ${item.isRequired?'required':''}>`;
    if(type==='PHOTO')return `<input id="${esc(id)}" class="tech-template-control tech-check-input" data-item-id="${esc(item.id)}" type="text" placeholder="Photo reference / note" ${item.isRequired?'required':''}>`;
    return `<input id="${esc(id)}" class="tech-template-control tech-check-input" data-item-id="${esc(item.id)}" type="text" placeholder="Enter result" ${item.isRequired?'required':''}>`;
  }

  function iconFor(title){
    const icons={
      'Engine System':'<rect x="3" y="9" width="12" height="8" rx="1"/><path d="M15 12h4l2 3v2h-6"/><circle cx="7.5" cy="19" r="1.4"/><circle cx="17.5" cy="19" r="1.4"/>',
      'Transmission':'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
      'Brakes & Steering':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
      'Hydraulic System':'<path d="M12 3c3 4 6 7.5 6 11a6 6 0 11-12 0c0-3.5 3-7 6-11z"/>',
      'Electrical & Lights':'<path d="M13 2L3 14h7l-1 8 11-14h-8l1-6z"/>',
      'Tyres & Safety':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
      'Working Parameters':'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
      'General Check':'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>'
    };
    return icons[title]||icons['General Check'];
  }

  function renderTemplate(){
    const grid=document.querySelector('.belm-check-grid');
    if(!grid||!template)return;
    const groups=new Map();
    (template.items||[]).forEach(item=>{const cat=categoryFor(item.label);if(!groups.has(cat))groups.set(cat,[]);groups.get(cat).push(item)});
    const order=['Engine System','Transmission','Brakes & Steering','Hydraulic System','Electrical & Lights','Tyres & Safety','Working Parameters','General Check'];
    const cards=order.filter(k=>groups.has(k)).map(cat=>`<div class="belm-check-card"><div class="belm-check-card__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconFor(cat)}</svg>${esc(cat)}</div>${groups.get(cat).map(item=>`<div class="belm-check-item"><span class="belm-check-item__label">${esc(item.label)}</span>${controlFor(item)}<button type="button" class="belm-comment-btn tech-comment-btn" data-note-for="${esc(item.id)}" title="Add issue/comment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H8l-4 4V4z"/></svg></button></div>`).join('')}</div>`).join('');
    grid.innerHTML=cards+`<div class="belm-important"><div class="belm-important__title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>Important</div><div class="belm-important__lead">A RED / unsafe selection will:</div><div class="belm-important__list"><div class="belm-important__item">Create a machine alert immediately</div><div class="belm-important__item">Generate / synchronize the Breakdown Case and Job Card workflow</div><div class="belm-important__item">Notify the relevant BELM / Customer team according to portal rules</div></div></div>`;
    grid.querySelectorAll('.check-status').forEach(select=>select.addEventListener('change',()=>{const item=itemMap.get(select.dataset.itemId);select.classList.remove('status-normal','status-attention','status-unsafe','status-na');const cls=statusClass(item,select.value);if(select.value)select.classList.add(cls)}));
    grid.querySelectorAll('.tech-comment-btn').forEach(btn=>btn.addEventListener('click',()=>{const control=grid.querySelector('[data-item-id="'+CSS.escape(btn.dataset.noteFor)+'"]');if(!control)return;const current=control.dataset.note||'';const next=prompt('Issue / comment for this checklist item:',current);if(next===null)return;control.dataset.note=next.trim();btn.style.color=next.trim()?'#f5c518':'';btn.title=next.trim()?next.trim():'Add issue/comment'}));
  }

  function controls(){
    return Array.from(document.querySelectorAll('.tech-template-control'));
  }
  function answers(){
    return controls().map(control=>({templateItemId:control.dataset.itemId,value:norm(control.value),note:norm(control.dataset.note||''),photoUrl:null})).filter(a=>a.value||a.note);
  }
  function redItems(){
    const out=[];
    controls().forEach(control=>{const item=itemMap.get(control.dataset.itemId);if(!item||!control.value)return;const safety=String(item.optionSafety?.[control.value]||item.safetyLevel||'NONE').toUpperCase();if(safety==='RED')out.push(item.label)});
    return out;
  }

  async function compressImage(file){
    if(!file)return'';
    if(!/^image\//.test(file.type))throw new Error('Use JPG, PNG or WEBP for the display photo.');
    const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Could not read display photo.'));r.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Could not open display photo.'));i.src=data});
    const max=1280,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    let quality=.82,out=canvas.toDataURL('image/jpeg',quality);
    while(out.length>640000&&quality>.42){quality-=.08;out=canvas.toDataURL('image/jpeg',quality)}
    if(out.length>690000)throw new Error('Display photo is still too large. Take a lower-resolution photo and try again.');
    return out;
  }

  function engineHours(){
    const el=document.getElementById('engineHours');return Number(String(el?.value||'0').replace(/[^0-9.]/g,''))||0;
  }
  function setHours(v){const el=document.getElementById('engineHours');if(el)el.value=Number(v||0).toLocaleString('en-US')+' h'}

  function fillMachinePhoto(){
    authFetch('/api/machine-card-photo/'+encodeURIComponent(machineId)).then(d=>{
      if(!d?.photoData)return;
      const box=document.querySelector('.belm-machine-photo');if(!box)return;
      box.innerHTML='<img src="'+d.photoData+'" alt="Machine photo" style="width:100%;height:100%;object-fit:contain;display:block;background:#eef2f6"><div class="belm-machine-photo__label">MACHINE PHOTO</div>';
    }).catch(()=>{});
  }

  function setupEvidence(){
    const input=document.getElementById('displayPhotoInput'),preview=document.getElementById('displayPhotoPreview'),name=document.getElementById('displayPhotoName');
    if(!input)return;
    input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;name.textContent='Compressing display photo...';try{displayPhotoData=await compressImage(file);preview.innerHTML='<img src="'+displayPhotoData+'" alt="Machine display evidence preview">';name.textContent=file.name+' · Ready for BELM and Customer';name.classList.add('is-selected')}catch(e){displayPhotoData='';input.value='';name.textContent=e.message;alert(e.message)}});
  }

  async function download(url,filename,button){
    const old=button.textContent;button.disabled=true;button.textContent='PREPARING...';
    try{const blob=await authFetch(url);const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000)}
    finally{button.disabled=false;button.textContent=old}
  }

  async function saveChecklist(forceUnsafe=false){
    const confirmBox=document.getElementById('confirmAccurate');
    if(!confirmBox?.checked)throw new Error('Confirm that the checklist is accurate before saving.');
    if(!displayPhotoData)throw new Error('Upload the display photo showing running hours, fuel level and any fault code.');
    const missing=controls().filter(c=>c.required&&!norm(c.value));
    if(missing.length)throw new Error('Complete all required checklist fields before saving.');
    const reds=redItems();
    if(forceUnsafe&&!reds.length)throw new Error('No RED / unsafe checklist item is selected.');
    const payload={machineId,templateId:template.id,hourMeterReading:engineHours(),displayPhotoUrl:displayPhotoData,answers:answers()};
    const result=await authFetch('/api/checklist-reports',{method:'POST',body:payload});
    savedReport=result;
    const no=document.getElementById('checklistNoValue');if(no)no.textContent=result.checklistNo||'Saved';
    alert(reds.length?('Checklist saved. RED condition detected'+(result.jobCardNo?' · Job Card '+result.jobCardNo:'')+'.'):'Checklist saved successfully.');
    return result;
  }

  function bindActions(){
    const save=document.getElementById('saveChecklistBtn'),unsafe=document.getElementById('reportUnsafeBtn'),pdf=document.getElementById('checklistPdfBtn'),csv=document.getElementById('checklistCsvBtn');
    if(save)save.addEventListener('click',async()=>{save.disabled=true;try{await saveChecklist(false)}catch(e){alert(e.message)}finally{save.disabled=false}});
    if(unsafe)unsafe.addEventListener('click',async()=>{if(!confirm('Save this RED / unsafe checklist and send it into the Breakdown / Job Card workflow?'))return;unsafe.disabled=true;try{await saveChecklist(true)}catch(e){alert(e.message)}finally{unsafe.disabled=false}});
    if(pdf)pdf.addEventListener('click',async e=>{e.preventDefault();try{if(!savedReport?.id)throw new Error('Save the checklist first, then download the final PDF.');await download('/api/checklist-reports/'+encodeURIComponent(savedReport.id)+'/pdf','BELM-'+(savedReport.checklistNo||'Checklist')+'.pdf',pdf)}catch(err){alert(err.message)}});
    if(csv)csv.addEventListener('click',async e=>{e.preventDefault();try{if(!savedReport?.id)throw new Error('Save the checklist first, then export the report CSV.');const q=new URLSearchParams({category:'checklists',machineId,reportId:savedReport.id});await download('/api/checklist-reports/technician-general/csv?'+q.toString(),'BELM-'+(savedReport.checklistNo||'Checklist')+'.csv',csv)}catch(err){alert(err.message)}});
  }

  async function boot(){
    updateClock();setInterval(updateClock,30000);
    document.querySelector('.belm-hero__subtitle').textContent='Technician pre-operation safety and condition inspection';
    const commentTitle=document.querySelector('.belm-bottom-grid .belm-form-panel__title');if(commentTitle)commentTitle.lastChild.textContent=' Technician Comment';
    const comment=document.getElementById('operatorComment');if(comment)comment.placeholder='Technician overall comment / abnormal condition...';

    try{
      reportContext=await authFetch('/api/checklist-reports/technician-general?machineId='+encodeURIComponent(machineId));
      const customer=reportContext.customer||{};
      let richer=await authFetch('/api/customers/'+encodeURIComponent(customer.id)).catch(()=>null);
      const rows=Array.isArray(richer?.machines)?richer.machines:[];
      machine=rows.find(m=>String(m.id)===machineId)||null;
      if(!machine){
        const basic=(reportContext.machines||[]).find(m=>String(m.id)===machineId);
        if(basic)machine={...basic,machineType:basic.machineType||basic.machine_type||''};
      }
      if(!machine)throw new Error('This machine is not available in your assigned Technician scope.');
      const machineType=value(machine,'machineType','machine_type');
      if(!machineType)throw new Error('Machine Type is missing. Ask Admin to update this machine registration.');
      const templates=await authFetch('/api/checklist-templates?machineType='+encodeURIComponent(machineType));
      template=(Array.isArray(templates)?templates:[]).find(t=>t.isActive!==false)||null;
      if(!template)throw new Error('No active Daily Checklist template is available for '+machineType+'.');

      const history=await authFetch('/api/checklist-reports/machine/'+encodeURIComponent(machineId)).catch(()=>[]);
      latestReport=Array.isArray(history)&&history.length?history[0]:null;
      const service=(reportContext.maintenanceSummary||[]).find(x=>String(x.machineId)===machineId)||{};

      const label=value(machine,'label')||[value(machine,'brand'),value(machine,'model')].filter(Boolean).join(' ')||machineType;
      setMeta('Checklist No.','NEW · AUTO ON SAVE');
      setMeta('Machine',label);
      setMeta('Fleet No.',value(machine,'fleetNumber','fleet_number')||'—');
      setMeta('Customer',customer.name||'Assigned Customer');
      setMeta('Operator',reportContext.technician?.name||'Technician','Technician');
      const hours=value(latestReport,'hourMeterReading','hour_meter_reading')||value(service,'totalHours')||0;
      setHours(hours);
      const up=document.getElementById('hoursUp'),down=document.getElementById('hoursDown');
      if(up)up.onclick=()=>setHours(engineHours()+1);
      if(down)down.onclick=()=>setHours(Math.max(0,engineHours()-1));
      renderTemplate();setupEvidence();fillMachinePhoto();bindActions();

      const title=document.querySelector('.belm-hero__title');if(title)title.textContent='Daily Machine Checklist';
      document.title='Daily Checklist — '+label+' — BELM Technician';
      const back=document.querySelector('[data-nav="home"]');if(back)back.href='/concept-dashboards/02-technician/';
    }catch(e){
      const main=document.querySelector('.belm-content');
      if(main)main.innerHTML='<section class="belm-meta-card" style="max-width:760px;margin:40px auto"><h2>Daily Checklist could not open</h2><p style="color:#a9b7c6">'+esc(e.message)+'</p><a href="/concept-dashboards/02-technician/daily-checklists.php" class="belm-btn-lg belm-btn-lg--blue">BACK TO ASSIGNED MACHINES</a></section>';
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();