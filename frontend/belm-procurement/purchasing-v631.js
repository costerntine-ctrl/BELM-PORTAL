(function(){
  const token=localStorage.getItem('belm_admin_token')||'';
  if(!token)return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  let allRows=[];let active='SPARE_PARTS';let visible=[];

  async function loadAudit(){
    const r=await fetch('/api/belm-procurement?action=audit',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    const t=await r.text();let d=null;try{d=t?JSON.parse(t):null}catch(_){}
    if(!r.ok)throw new Error(d?.error||`Purchase report failed (${r.status}).`);
    allRows=Array.isArray(d?.rows)?d.rows:[];
    render();
  }
  function categoryRows(){
    return allRows.filter(r=>{
      const t=String(r.type||'').toUpperCase();
      if(active==='SPARE_PARTS')return t==='JOB CARD PROCUREMENT'||t==='INVENTORY PROCUREMENT';
      if(active==='LUBRICANTS')return t==='OIL';
      if(active==='FUELS')return t==='FUEL';
      return !['JOB CARD PROCUREMENT','INVENTORY PROCUREMENT','OIL','FUEL'].includes(t);
    });
  }
  function boughtValue(r){
    const note=String(r.note||'');
    const tagged=note.match(/BOUGHT_TSH\s*:\s*([\d,.]+)/i);
    if(tagged)return 'TZS '+Number(tagged[1].replace(/,/g,'')).toLocaleString('en-TZ');
    const any=note.match(/TZS\s*([\d,.]+)/i);
    if(any)return 'TZS '+Number(any[1].replace(/,/g,'')).toLocaleString('en-TZ');
    return '—';
  }
  function render(){
    visible=categoryRows();
    document.querySelectorAll('[data-purchase-category]').forEach(b=>b.classList.toggle('active',b.dataset.purchaseCategory===active));
    const title={SPARE_PARTS:'Spare Parts Purchase List',LUBRICANTS:'Lubricants Purchase List',FUELS:'Fuel Purchase List',OTHERS:'Other Purchases'}[active];
    if($('purchaseListTitle'))$('purchaseListTitle').textContent=title;
    if($('purchaseListCount'))$('purchaseListCount').textContent=`${visible.length} record${visible.length===1?'':'s'}`;
    const body=$('purchaseRows');if(!body)return;
    body.innerHTML=visible.length?visible.map(r=>`<tr><td>${esc(String(r.eventDate||'').slice(0,16).replace('T',' '))}</td><td><b>${esc(r.item||'—')}</b><small>${esc(r.reference||'')}</small></td><td>${esc(boughtValue(r))}</td><td>${esc(r.quantity||'—')}</td><td>${esc(r.supplier||'—')}</td><td>${esc([r.customer,r.machine].filter(Boolean).join(' · ')||'—')}</td><td>${esc(r.status||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">No purchase records in this category.</td></tr>';
  }
  function csv(){
    const rows=[['Date','Item / Part','Bought TSH','Qty','Supplier','Customer / Machine','Status'],...visible.map(r=>[r.eventDate||'',r.item||'',boughtValue(r),r.quantity||'',r.supplier||'',([r.customer,r.machine].filter(Boolean).join(' · ')),r.status||''])];
    const content=rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));a.download=`BELM-${active.replace(/_/g,'-')}-Purchasing.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
  }
  function pdf(){
    const title=$('purchaseListTitle')?.textContent||'BELM Purchasing Report';
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return alert('Allow pop-ups to create the PDF report.');
    const rows=visible.map(r=>`<tr><td>${esc(String(r.eventDate||'').slice(0,10))}</td><td>${esc(r.item||'—')}</td><td>${esc(boughtValue(r))}</td><td>${esc(r.quantity||'—')}</td><td>${esc(r.supplier||'—')}</td><td>${esc(r.status||'—')}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>body{font:12px Arial;padding:24px;color:#111}h1{font-size:20px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}</style></head><body><h1>BELM GENERAL TECH LTD</h1><h2>${esc(title)}</h2><p>Generated ${new Date().toLocaleString()}</p><table><thead><tr><th>Date</th><th>Item / Part</th><th>Bought TSH</th><th>Qty</th><th>Supplier</th><th>Status</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No records.</td></tr>'}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  document.querySelectorAll('[data-purchase-category]').forEach(btn=>btn.addEventListener('click',()=>{active=btn.dataset.purchaseCategory;render();document.getElementById('purchaseListPanel')?.scrollIntoView({behavior:'smooth',block:'start'});}));
  $('purchaseCsvButton')?.addEventListener('click',csv);$('purchasePdfButton')?.addEventListener('click',pdf);$('purchaseRefreshButton')?.addEventListener('click',loadAudit);

  // Preserve purchase value without a schema-breaking migration: the existing
  // procurement note remains the authoritative order record and audit source.
  $('orderForm')?.addEventListener('submit',()=>{
    const amount=Number($('purchaseAmount')?.value||0);const note=$('orderNote');if(!note||!amount)return;
    const cleaned=String(note.value||'').replace(/\[?BOUGHT_TSH\s*:\s*[\d,.]+\]?\s*/ig,'').trim();
    note.value=`BOUGHT_TSH: ${amount}${cleaned?' | '+cleaned:''}`.slice(0,500);
  },true);
  document.addEventListener('click',e=>{if(e.target.closest('[data-order]')&&$('purchaseAmount'))$('purchaseAmount').value='';});
  window.addEventListener('load',()=>setTimeout(()=>loadAudit().catch(()=>{}),900));
  $('refreshButton')?.addEventListener('click',()=>setTimeout(()=>loadAudit().catch(()=>{}),600));
})();