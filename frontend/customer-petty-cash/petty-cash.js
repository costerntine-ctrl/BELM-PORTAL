(function () {
  const token = localStorage.getItem("belm_customer_token");
  const alertBox = document.getElementById("alertBox");
  let receiptPhotoData = "";
  let receiptPhotoName = "";
  let openReceiptUrl = "";
  let editingEntryId = "";
  let entryCache = new Map();
  const money = new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 2 });

  if (!token) { window.location.replace("/login"); return; }

  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]); }
  function formatDate(value) { if (!value) return "—"; const d = new Date(value); if (Number.isNaN(d.getTime())) return "—"; return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; }
  function showAlert(message, isError=false) { alertBox.textContent = message; alertBox.className = `alert${isError ? " error" : ""}`; }
  function clearAlert() { alertBox.textContent = ""; alertBox.className = "alert hidden"; }
  function hasReceipt(value) { return value === true || value === 1 || value === "1" || value === "t" || value === "true"; }

  function spareRowHtml(item={}, index=0) {
    const description = escapeHtml(item.description || "");
    const partNumber = escapeHtml(item.partNumber || "");
    const quantity = item.quantity ?? "";
    const unit = String(item.unit || "PCS").toUpperCase() === "LITER" ? "LITER" : "PCS";
    return `<div class="petty-spare-row" data-spare-row>
      <label class="spare-description">Spare Description<input data-spare-description maxlength="220" value="${description}" placeholder="e.g. Oil filter, hydraulic hose"></label>
      <label>Part Number<input data-spare-part maxlength="100" value="${partNumber}" placeholder="e.g. 1R-1808"></label>
      <label>Qty<input data-spare-qty type="number" min="0.001" step="0.001" value="${escapeHtml(quantity)}" placeholder="e.g. 2"></label>
      <label>Unit<select data-spare-unit><option value="PCS"${unit === "PCS" ? " selected" : ""}>PCS</option><option value="LITER"${unit === "LITER" ? " selected" : ""}>Liter</option></select></label>
      <button class="spare-remove${index === 0 ? " first" : ""}" type="button" data-remove-spare aria-label="Remove spare">×</button>
    </div>`;
  }

  function renderSpareItems(items=[{}]) {
    const list = Array.isArray(items) && items.length ? items : [{}];
    document.getElementById("spareItems").innerHTML = list.map((item,index)=>spareRowHtml(item,index)).join("");
  }

  function collectSpareItems() {
    return [...document.querySelectorAll("[data-spare-row]")].map(row=>({
      description: row.querySelector("[data-spare-description]").value.trim(),
      partNumber: row.querySelector("[data-spare-part]").value.trim(),
      quantity: row.querySelector("[data-spare-qty]").value,
      unit: row.querySelector("[data-spare-unit]").value,
    })).filter(item=>item.description || item.partNumber || item.quantity);
  }

  function spareSummaryHtml(items) {
    if (!Array.isArray(items) || !items.length) return "—";
    return `<div class="petty-spare-summary">${items.map(item=>{
      const qty = Number(item.quantity || 0);
      const qtyText = Number.isFinite(qty) ? qty.toLocaleString("en-TZ", {maximumFractionDigits:3}) : "0";
      const unit = String(item.unit || "PCS").toUpperCase() === "LITER" ? "Liter" : "PCS";
      return `<span><b>${escapeHtml(item.description || "Spare")}</b>${item.partNumber ? ` · ${escapeHtml(item.partNumber)}` : ""}<small>${qtyText} ${unit}</small></span>`;
    }).join("")}</div>`;
  }

  async function api(path, options={}) {
    const response = await fetch(`/api/customer-portal${path}`, { ...options, cache:"no-store", headers:{ ...(options.body ? {"Content-Type":"application/json"}:{}), Authorization:`Bearer ${token}`, ...(options.headers||{}) } });
    if (!response.ok) { let message="Request failed."; try { const e=await response.json(); message=e.error||message; } catch(_){} if(response.status===401){ localStorage.removeItem("belm_customer_token"); window.location.replace("/login"); } const error=new Error(message); error.status=response.status; throw error; }
    return response.status===204 ? null : response.json();
  }

  function currentRangeQuery() {
    const scope = document.getElementById("printScope").value;
    if (scope === "date") { const v=document.getElementById("printDateInput").value; return v ? `?date=${encodeURIComponent(v)}` : ""; }
    if (scope === "month") { const v=document.getElementById("printMonthInput").value; return v ? `?month=${encodeURIComponent(v)}` : ""; }
    return "";
  }

  function render(data) {
    const account=data.account||{}, summary=data.summary||{};
    const balance=Number(account.balance||0);
    const balanceEl=document.getElementById("balanceAmount");
    balanceEl.textContent=money.format(Math.abs(balance));
    balanceEl.classList.toggle("is-debt", balance<0);
    document.querySelector(".balance-card")?.classList.toggle("has-debt", balance<0);
    document.querySelector(".balance-card span").textContent = balance < 0 ? "Petty Cash Debt" : "Petty Cash Balance";
    document.getElementById("totalToppedUp").textContent=money.format(Number(account.totalToppedUp||0));
    document.getElementById("totalUsed").textContent=money.format(Number(account.totalUsed||0));
    document.getElementById("totalCost").textContent=money.format(Number(summary.totalCost||0));
    document.getElementById("recordCount").textContent=Number(summary.recordCount||0).toLocaleString("en-TZ");
    document.getElementById("averageCost").textContent=money.format(Number(summary.averageCost||0));
    document.getElementById("receiptCount").textContent=Number(summary.receiptCount||0).toLocaleString("en-TZ");

    const machines=Array.isArray(data.machines)?data.machines:[];
    const select=document.getElementById("machineSelect");
    const current=select.value;
    select.innerHTML='<option value="">Select machine…</option>'+machines.map(m=>`<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}${m.serialNumber?` · ${escapeHtml(m.serialNumber)}`:""}</option>`).join("");
    if (machines.some(m=>String(m.id)===String(current))) select.value=current;

    document.getElementById("topupPanel").classList.toggle("hidden", !account.canTopUp);
    const topups=Array.isArray(account.topups)?account.topups:[];
    document.getElementById("topupRows").innerHTML=topups.length?topups.map(t=>`<tr><td>${formatDate(t.createdAt)}</td><td><strong>${money.format(Number(t.amount||0))}</strong></td><td>${escapeHtml(t.note||"—")}</td><td>${escapeHtml(t.addedBy||"Administration")}</td></tr>`).join(""):'<tr><td colspan="4" class="empty">No top-ups yet.</td></tr>';

    const rows=Array.isArray(data.entries)?data.entries:[];
    entryCache = new Map(rows.map(e=>[String(e.id), e]));
    document.getElementById("expenseRows").innerHTML=rows.length?rows.map(e=>`<tr><td>${formatDate(e.date)}</td><td><strong>${escapeHtml(e.machineName||"Machine")}</strong></td><td>${escapeHtml(e.description)}</td><td>${spareSummaryHtml(e.spareItems)}</td><td><strong>${money.format(Number(e.cost||0))}</strong></td><td>${hasReceipt(e.hasReceipt)?`<button class="receipt-button" type="button" data-receipt="${escapeHtml(e.id)}">View</button> <button class="receipt-button" type="button" data-print-receipt="${escapeHtml(e.id)}">Print</button>`:"—"}</td><td>${escapeHtml(e.loggedBy||"Customer")}</td><td><button class="receipt-button petty-edit-button" type="button" data-edit-entry="${escapeHtml(e.id)}">Edit</button></td></tr>`).join(""):'<tr><td colspan="8" class="empty">No Petty Cash entries recorded yet.</td></tr>';
  }

  function clearReceiptInput(){ receiptPhotoData=""; receiptPhotoName=""; document.getElementById("receiptPhoto").value=""; document.getElementById("receiptPreview").removeAttribute("src"); document.getElementById("receiptPreviewWrap").classList.add("hidden"); }

  function setEditMode(entry=null){
    editingEntryId = entry ? String(entry.id) : "";
    const isEditing = Boolean(editingEntryId);
    document.getElementById("entryPanelTitle").textContent = isEditing ? "Edit petty cash entry" : "Add petty cash entry";
    document.getElementById("entryPanelHelp").textContent = isEditing
      ? "Update the selected record. Existing receipt is kept unless you upload a new one."
      : "Record a small cash cost and select the machine that used it.";
    document.getElementById("saveButton").textContent = isEditing ? "Save Changes" : "Save petty cash entry";
    document.getElementById("cancelEditButton").classList.toggle("hidden", !isEditing);
    if (!entry) return;
    document.getElementById("expenseDate").value = String(entry.date || "").slice(0,10);
    document.getElementById("machineSelect").value = String(entry.machineId || "");
    document.getElementById("description").value = entry.description || "";
    document.getElementById("amount").value = Number(entry.cost || 0);
    document.getElementById("calculatedTotal").textContent = `Amount: ${money.format(Number(entry.cost || 0))}`;
    renderSpareItems(Array.isArray(entry.spareItems) && entry.spareItems.length ? entry.spareItems : [{}]);
    clearReceiptInput();
    document.getElementById("entryPanel").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function resetExpenseForm(){
    document.getElementById("expenseForm").reset();
    document.getElementById("expenseDate").value=new Date().toISOString().slice(0,10);
    document.getElementById("calculatedTotal").textContent=`Amount: ${money.format(0)}`;
    renderSpareItems([{}]);
    clearReceiptInput();
    setEditMode(null);
  }
  function compressReceipt(file){ return new Promise((resolve,reject)=>{ if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){reject(new Error("Receipt must be JPG, PNG or WebP."));return;} const r=new FileReader(); r.onerror=()=>reject(new Error("Could not read receipt.")); r.onload=()=>{const im=new Image(); im.onerror=()=>reject(new Error("Receipt photo is invalid.")); im.onload=()=>{const max=1280, scale=Math.min(1,max/Math.max(im.width,im.height)); const c=document.createElement("canvas"); c.width=Math.max(1,Math.round(im.width*scale)); c.height=Math.max(1,Math.round(im.height*scale)); c.getContext("2d").drawImage(im,0,0,c.width,c.height); const data=c.toDataURL("image/jpeg",.78); if(data.length>2.8*1024*1024){reject(new Error("Receipt photo is too large."));return;} resolve(data);}; im.src=r.result;}; r.readAsDataURL(file); }); }

  async function load(retry=0){ clearAlert(); try{ render(await api(`/petty-cash-account${currentRangeQuery()}`)); }catch(e){ if(Number(e.status||0)===503&&retry<8){showAlert("Database update is finishing. Reconnecting Petty Cash…");setTimeout(()=>load(retry+1),2500);return;} showAlert(e.message||"Could not load Petty Cash.",true);} }

  async function download(format){ const button=document.getElementById(`${format}Button`), original=button.textContent; button.disabled=true; button.textContent="Preparing…"; try{ const sep=currentRangeQuery(); const response=await fetch(`/api/customer-portal/petty-cash-account/${format}${sep}`,{headers:{Authorization:`Bearer ${token}`}}); if(!response.ok) throw new Error(`Could not download ${format.toUpperCase()}.`); const blob=await response.blob(), url=URL.createObjectURL(blob), a=document.createElement("a"); const disposition=response.headers.get("Content-Disposition")||"", m=disposition.match(/filename="?([^";]+)"?/i); a.href=url; a.download=m?.[1]||`petty-cash-account.${format}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);}catch(e){showAlert(e.message,true);}finally{button.disabled=false;button.textContent=original;} }

  async function viewReceipt(id, print=false){ try{ const response=await fetch(`/api/customer-portal/petty-cash-account/receipt?expenseId=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}}); if(!response.ok) throw new Error("Could not load receipt."); const blob=await response.blob(); if(openReceiptUrl) URL.revokeObjectURL(openReceiptUrl); openReceiptUrl=URL.createObjectURL(blob); if(print){ const w=window.open(openReceiptUrl,"_blank","noopener"); if(w) setTimeout(()=>{try{w.print();}catch(_){}},700); return;} document.getElementById("receiptImage").src=openReceiptUrl; document.getElementById("receiptDialog").showModal(); }catch(e){showAlert(e.message,true);} }

  async function downloadAllReceipts(){ const button=document.getElementById("receiptsButton"); button.disabled=true; const original=button.textContent; try{ const list=await api(`/petty-cash-account/receipts-list${currentRangeQuery()}`); if(!list.length){showAlert("No receipts found for selected range.",true);return;} for(let i=0;i<list.length;i++){button.textContent=`Downloading ${i+1}/${list.length}…`; const r=await fetch(`/api${list[i].downloadUrl}`,{headers:{Authorization:`Bearer ${token}`}}); if(!r.ok) continue; const b=await r.blob(), u=URL.createObjectURL(b), a=document.createElement("a"); a.href=u;a.download=list[i].name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u); await new Promise(res=>setTimeout(res,250));} showAlert(`Downloaded ${list.length} receipt(s).`);}catch(e){showAlert(e.message,true);}finally{button.disabled=false;button.textContent=original;} }

  document.getElementById("expenseDate").value=new Date().toISOString().slice(0,10);
  renderSpareItems([{}]);
  document.getElementById("addSpareButton").addEventListener("click",()=>{
    const list=document.getElementById("spareItems");
    list.insertAdjacentHTML("beforeend", spareRowHtml({}, list.children.length));
  });
  document.getElementById("spareItems").addEventListener("click",e=>{
    const button=e.target.closest("[data-remove-spare]");
    if(!button) return;
    const rows=[...document.querySelectorAll("[data-spare-row]")];
    if(rows.length<=1){
      rows[0].querySelectorAll("input").forEach(input=>input.value="");
      rows[0].querySelector("[data-spare-unit]").value="PCS";
      return;
    }
    button.closest("[data-spare-row]").remove();
  });
  document.getElementById("amount").addEventListener("input",()=>document.getElementById("calculatedTotal").textContent=`Amount: ${money.format(Number(document.getElementById("amount").value||0))}`);
  document.getElementById("topupAmount").addEventListener("input",()=>document.getElementById("topupCalculated").textContent=`Top-up: ${money.format(Number(document.getElementById("topupAmount").value||0))}`);
  document.getElementById("receiptPhoto").addEventListener("change",async e=>{const file=e.target.files?.[0]; if(!file){clearReceiptInput();return;} try{receiptPhotoData=await compressReceipt(file);receiptPhotoName=file.name;document.getElementById("receiptPreview").src=receiptPhotoData;document.getElementById("receiptPreviewWrap").classList.remove("hidden");}catch(err){clearReceiptInput();showAlert(err.message,true);}});
  document.getElementById("removeReceiptButton").addEventListener("click",clearReceiptInput);
  document.getElementById("expenseForm").addEventListener("submit",async e=>{e.preventDefault(); const b=document.getElementById("saveButton");b.disabled=true;try{const payload={machineId:document.getElementById("machineSelect").value,date:document.getElementById("expenseDate").value,description:document.getElementById("description").value.trim(),spareItems:collectSpareItems(),amount:Number(document.getElementById("amount").value),receiptPhoto:receiptPhotoData,receiptName:receiptPhotoName}; const wasEditing=Boolean(editingEntryId); const path=wasEditing?`/petty-cash-account/entry/${encodeURIComponent(editingEntryId)}`:'/petty-cash-account/entry'; await api(path,{method:wasEditing?'PUT':'POST',body:JSON.stringify(payload)}); resetExpenseForm(); await load(); showAlert(wasEditing?"Petty Cash entry updated successfully.":"Petty Cash entry saved successfully.");}catch(err){showAlert(err.message,true);}finally{b.disabled=false;}});
  document.getElementById("topupForm").addEventListener("submit",async e=>{e.preventDefault(); const b=document.getElementById("topupButton");b.disabled=true;try{await api('/petty-cash-account/topup',{method:'POST',body:JSON.stringify({amount:Number(document.getElementById("topupAmount").value),note:document.getElementById("topupNote").value.trim()})});e.target.reset();await load();showAlert("Petty Cash funds added successfully.");}catch(err){showAlert(err.message,true);}finally{b.disabled=false;}});
  document.getElementById("expenseRows").addEventListener("click",e=>{const v=e.target.closest('[data-receipt]'),p=e.target.closest('[data-print-receipt]'),edit=e.target.closest('[data-edit-entry]'); if(v)viewReceipt(v.dataset.receipt); if(p)viewReceipt(p.dataset.printReceipt,true); if(edit){const entry=entryCache.get(String(edit.dataset.editEntry||"")); if(entry)setEditMode(entry);}});
  document.getElementById("cancelEditButton").addEventListener("click",()=>resetExpenseForm());
  document.getElementById("closeReceiptButton").addEventListener("click",()=>document.getElementById("receiptDialog").close());
  document.getElementById("printScope").addEventListener("change",e=>{document.getElementById("printDateInput").classList.toggle("hidden",e.target.value!=="date");document.getElementById("printMonthInput").classList.toggle("hidden",e.target.value!=="month"); if(e.target.value==="all")load();});
  document.getElementById("printDateInput").addEventListener("change",load); document.getElementById("printMonthInput").addEventListener("change",load);
  document.getElementById("refreshButton").addEventListener("click",load); document.getElementById("csvButton").addEventListener("click",()=>download("csv")); document.getElementById("pdfButton").addEventListener("click",()=>download("pdf")); document.getElementById("receiptsButton").addEventListener("click",downloadAllReceipts);
  document.getElementById("logoutButton").addEventListener("click",()=>{localStorage.removeItem("belm_customer_token");window.location.href="/login";});
  load();
})();
