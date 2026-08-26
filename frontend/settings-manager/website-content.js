(function(){
  const token=localStorage.getItem('belm_admin_token');
  const api='/api/website-content.php';
  const q=(s)=>document.querySelector(s);
  const esc=(s)=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function call(action,opts={}){
    const r=await fetch(`${api}?action=${encodeURIComponent(action)}`,{...opts,headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`,...(opts.headers||{})},cache:'no-store'});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Request failed'); return d;
  }
  function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
  function msg(text,bad=false){const e=q('#websiteContentAlert');e.textContent=text;e.classList.remove('hidden');e.style.color=bad?'#a4231b':'#08783e';setTimeout(()=>e.classList.add('hidden'),4500);}
  async function load(){
    const d=await call('admin');
    q('#websiteGalleryList').innerHTML=d.gallery.length?d.gallery.map(x=>`<div class="wc-item"><img src="${x.imageUrl}" alt=""><div><strong>${esc(x.caption||'Work photo')}</strong><small>${x.isPublished?'Published':'Hidden'}</small></div><div class="wc-actions"><button data-g-toggle="${x.id}" data-state="${x.isPublished?1:0}" type="button">${x.isPublished?'Hide':'Publish'}</button><button class="danger" data-g-delete="${x.id}" type="button">Delete</button></div></div>`).join(''):'<p class="muted">No uploaded work photos yet.</p>';
    q('#websitePromotionList').innerHTML=d.promotions.length?d.promotions.map(x=>`<div class="wc-item promo"><img src="${x.imageUrl}" alt=""><div><input data-p-title="${x.id}" value="${esc(x.title)}" maxlength="180"><textarea data-p-desc="${x.id}" maxlength="1200">${esc(x.description)}</textarea><label class="toggle-row"><input data-p-pub="${x.id}" type="checkbox" ${x.isPublished?'checked':''}> Published</label></div><div class="wc-actions"><button data-p-save="${x.id}" type="button">Save</button><button class="danger" data-p-delete="${x.id}" type="button">Delete</button></div></div>`).join(''):'<p class="muted">No machine promotions yet.</p>';
  }
  q('#websiteGalleryForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const f=q('#websiteGalleryPhoto').files[0];if(!f)throw new Error('Choose a photo.');await call('gallery-create',{method:'POST',body:JSON.stringify({caption:q('#websiteGalleryCaption').value,imageData:await fileData(f),isPublished:q('#websiteGalleryPublished').checked})});e.target.reset();q('#websiteGalleryPublished').checked=true;msg('Work photo published to website content.');await load();}catch(err){msg(err.message,true);}});
  q('#websitePromotionForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const f=q('#websitePromotionPhoto').files[0];if(!f)throw new Error('Choose a machine photo.');await call('promotion-create',{method:'POST',body:JSON.stringify({title:q('#websitePromotionTitle').value,description:q('#websitePromotionDescription').value,imageData:await fileData(f),isPublished:q('#websitePromotionPublished').checked})});e.target.reset();q('#websitePromotionPublished').checked=true;msg('Machine promotion published.');await load();}catch(err){msg(err.message,true);}});
  document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
    if(b.dataset.gToggle){await call('gallery-toggle',{method:'POST',body:JSON.stringify({id:b.dataset.gToggle,isPublished:b.dataset.state!=='1'})});await load();}
    if(b.dataset.gDelete&&confirm('Delete this work photo?')){await call('gallery-delete',{method:'POST',body:JSON.stringify({id:b.dataset.gDelete})});await load();}
    if(b.dataset.pSave){const id=b.dataset.pSave;await call('promotion-update',{method:'POST',body:JSON.stringify({id,title:q(`[data-p-title="${id}"]`).value,description:q(`[data-p-desc="${id}"]`).value,isPublished:q(`[data-p-pub="${id}"]`).checked})});msg('Promotion updated.');await load();}
    if(b.dataset.pDelete&&confirm('Delete this promotion?')){await call('promotion-delete',{method:'POST',body:JSON.stringify({id:b.dataset.pDelete})});await load();}
  }catch(err){msg(err.message,true);}});
  load().catch(e=>msg(e.message,true));
})();
