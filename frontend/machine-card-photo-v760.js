(function(){
  'use strict';
  if(window.__belmMachineCardPhoto760)return;
  window.__belmMachineCardPhoto760=true;

  const path=location.pathname;
  const tokenKeys=path.startsWith('/customers-manager/')
    ? ['belm_admin_token','belm_tech_token','belm_customer_token']
    : path.startsWith('/concept-dashboards/02-technician')||path.startsWith('/tech')
      ? ['belm_tech_token','belm_customer_token','belm_admin_token']
      : ['belm_customer_token','belm_tech_token','belm_admin_token'];
  const token=tokenKeys.map(k=>localStorage.getItem(k)||'').find(Boolean)||'';
  if(!token)return;

  const css=`
    .belm-machine-photo-box{position:relative;width:100%;height:118px;margin:10px 0 12px;border:1px solid rgba(72,126,178,.38);border-radius:12px;overflow:hidden;background:linear-gradient(145deg,#0b2138,#102f4d);display:grid;place-items:center}
    .belm-machine-photo-box img{width:100%;height:100%;object-fit:cover;display:block}
    .belm-machine-photo-placeholder{padding:12px;text-align:center;color:#9fb7ce;font:800 11px/1.3 Inter,Arial,sans-serif;letter-spacing:.03em}
    .belm-machine-photo-actions{position:absolute;right:7px;bottom:7px;display:flex;gap:6px;z-index:2}
    .belm-machine-photo-actions button{border:1px solid rgba(255,255,255,.36);border-radius:8px;background:rgba(3,18,33,.88);color:#fff;padding:6px 9px;font:800 9px Inter,Arial,sans-serif;cursor:pointer;backdrop-filter:blur(5px)}
    .belm-machine-photo-actions button:hover{background:#0c67a3}.belm-machine-photo-actions button:disabled{opacity:.55;cursor:wait}
    .belm-machine-photo-box.is-loading:after{content:'Loading photo…';position:absolute;inset:0;display:grid;place-items:center;background:rgba(5,20,35,.72);color:#fff;font:800 10px Inter,Arial,sans-serif}
    .belm-machine-photo-box.is-saving:after{content:'Saving photo…';position:absolute;inset:0;display:grid;place-items:center;background:rgba(5,20,35,.78);color:#fff;font:800 10px Inter,Arial,sans-serif}
    .belm-machine-summary-visual.belm-has-machine-photo{padding:0!important;overflow:hidden!important;min-height:160px!important}.belm-machine-summary-visual.belm-has-machine-photo>span{display:none!important}.belm-machine-summary-visual .belm-machine-summary-photo{width:100%;height:100%;min-height:160px;object-fit:cover;display:block}
    @media(max-width:600px){.belm-machine-photo-box{height:104px}.belm-machine-photo-actions button{min-height:34px;padding:6px 8px}.belm-machine-summary-visual .belm-machine-summary-photo{min-height:125px}}
  `;
  const style=document.createElement('style');style.id='belm-machine-photo-style-v760';style.textContent=css;document.head.appendChild(style);

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function machineId(card){
    const direct=card.getAttribute('data-machine-id')||card.getAttribute('data-belm-machine-id')||card.querySelector('[data-machine-id]')?.getAttribute('data-machine-id')||card.querySelector('[data-belm-machine-id]')?.getAttribute('data-belm-machine-id')||card.querySelector('[data-operational-status]')?.getAttribute('data-operational-status')||card.querySelector('[data-service-due-badge]')?.getAttribute('data-service-due-badge');
    if(direct)return direct;
    const links=[...card.querySelectorAll('a[href],button[data-machine-reports]')];
    for(const el of links){
      if(el.dataset.machineReports)return el.dataset.machineReports;
      try{const u=new URL(el.getAttribute('href')||'',location.origin);const id=u.searchParams.get('machine')||u.searchParams.get('machineId');if(id)return id}catch(_){}
    }
    return '';
  }
  async function request(id,opt={}){
    const r=await fetch('/api/machine-card-photo/'+encodeURIComponent(id),{...opt,cache:'no-store',headers:{Authorization:'Bearer '+token,...(opt.body?{'Content-Type':'application/json'}:{}),...(opt.headers||{})}});
    const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch(_){}
    if(!r.ok)throw new Error(d.error||`Machine photo request failed (${r.status}).`);return d;
  }
  function fileToSmallJpeg(file){
    return new Promise((resolve,reject)=>{
      if(!file||!String(file.type||'').startsWith('image/')){reject(new Error('Select an image file.'));return}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Could not read the image.'));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error('Could not open the image.'));
        img.onload=()=>{
          const max=640,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
          const w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale));
          const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
          const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);
          resolve(canvas.toDataURL('image/jpeg',.72));
        };
        img.src=String(reader.result||'');
      };
      reader.readAsDataURL(file);
    });
  }
  function updateSummaryVisual(card,photo){
    const visual=card.querySelector('.belm-machine-summary-visual');if(!visual)return;
    visual.querySelector('.belm-machine-summary-photo')?.remove();
    visual.classList.toggle('belm-has-machine-photo',!!photo);
    if(photo){const img=document.createElement('img');img.className='belm-machine-summary-photo';img.alt='Machine photo';img.src=photo;visual.prepend(img)}
  }
  function renderBox(card,id,data){
    let box=card.querySelector(':scope > .belm-machine-photo-box, .machine-card-top + .belm-machine-photo-box');
    if(!box){
      box=document.createElement('div');box.className='belm-machine-photo-box';box.dataset.machinePhotoFor=id;
      const top=card.querySelector('.machine-card-top');
      if(top)top.insertAdjacentElement('afterend',box);
      else{
        const first=card.firstElementChild;
        if(first&&first.classList.contains('belm-machine-summary'))first.querySelector('.belm-machine-summary-head')?.insertAdjacentElement('afterend',box);
        else card.insertBefore(box,card.firstChild);
      }
    }
    box.classList.remove('is-loading','is-saving');
    box.innerHTML=data.photoData?`<img src="${esc(data.photoData)}" alt="Machine photo">`:'<div class="belm-machine-photo-placeholder">MACHINE PHOTO<br><small>No photo uploaded</small></div>';
    updateSummaryVisual(card,data.photoData||'');
    if(data.canUpload){
      const actions=document.createElement('div');actions.className='belm-machine-photo-actions';
      const upload=document.createElement('button');upload.type='button';upload.textContent=data.photoData?'Change':'Upload photo';
      const input=document.createElement('input');input.type='file';input.accept='image/*';input.capture='environment';input.hidden=true;
      upload.onclick=()=>input.click();
      input.onchange=async()=>{
        const file=input.files?.[0];if(!file)return;
        try{box.classList.add('is-saving');upload.disabled=true;const photoData=await fileToSmallJpeg(file);const saved=await request(id,{method:'PUT',body:JSON.stringify({photoData})});renderBox(card,id,saved)}catch(e){box.classList.remove('is-saving');upload.disabled=false;alert(e.message||'Could not save machine photo.')}
      };
      actions.append(upload,input);
      if(data.photoData){const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=async()=>{if(!confirm('Remove this machine photo?'))return;try{box.classList.add('is-saving');const d=await request(id,{method:'DELETE'});renderBox(card,id,d)}catch(e){box.classList.remove('is-saving');alert(e.message||'Could not remove machine photo.')}};actions.appendChild(remove)}
      box.appendChild(actions);
    }
  }
  async function enhance(card){
    if(card.dataset.belmMachinePhotoReady==='1')return;
    const id=machineId(card);if(!id)return;
    card.dataset.belmMachinePhotoReady='1';card.dataset.machineId=id;
    try{
      let temp=card.querySelector('.belm-machine-photo-box');if(!temp){temp=document.createElement('div');temp.className='belm-machine-photo-box is-loading';const top=card.querySelector('.machine-card-top');top?top.insertAdjacentElement('afterend',temp):card.insertBefore(temp,card.firstChild)}
      const data=await request(id);renderBox(card,id,data);
    }catch(_){card.dataset.belmMachinePhotoReady='error'}
  }
  function scan(){
    const selectors=['.machine-card','.assigned-machine-card','.belm-customer-machine-card','.belm-technician-machine-card'];
    document.querySelectorAll(selectors.join(',')).forEach(enhance);
  }
  scan();
  const observer=new MutationObserver(()=>scan());observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,400);setTimeout(scan,1400);
})();
