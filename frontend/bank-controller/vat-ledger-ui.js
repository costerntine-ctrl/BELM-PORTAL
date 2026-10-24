(() => {
  'use strict';
  const token = localStorage.getItem('belm_admin_token') || '';
  const $ = id => document.getElementById(id);
  const msg = $('vatLedgerMessage');
  const fmt = new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 2 });
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const today = new Date();
  // en-CA usually uses YYYY-MM-DD; use formatToParts so no locale-format assumption.
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(today).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  $('vatEntryDate').value = `${parts.year}-${parts.month}-${parts.day}`;
  $('vatTaxMonth').value = `${parts.year}-${parts.month}`;
  function updateType(){ const type=$('vatEntryType').value; $('vatDirectionField').hidden=type!=='ADJUSTMENT'; $('vatWithdrawalField').hidden=type!=='TRA_PAYMENT'; }
  $('vatEntryType').addEventListener('change', updateType);updateType();
  async function loadWithdrawals(){
    try {
      const r=await fetch('/api/bank-manager',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!r.ok) throw new Error('Bank withdrawals unavailable');
      const d=await r.json();
      const select=$('vatBankWithdrawal');
      select.innerHTML='<option value="">Unlinked — pending reconciliation</option>'+(d.withdrawals||[]).map(w=>`<option value="${escape(w.id)}">${escape(w.date)} — ${escape(w.bank_name)} — TZS ${fmt.format(w.amount)} — ${escape(w.cheque_number||'')}</option>`).join('');
    } catch(e){msg.textContent='Bank withdrawal list unavailable; TRA entries can still be recorded as unlinked.';}
  }
  async function request(options) {
    const response = await fetch('/api/belm-vat-ledger',{ cache:'no-store',...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
    return data;
  }
  async function refresh() {
    try {
      const data = await request();
      const rows = data.months || [];
      $('vatLedgerRows').innerHTML = rows.length ? rows.map(row => `<tr><td>${escape(row.month)}</td><td>${fmt.format(row.outputVat||0)}</td><td>${fmt.format(row.inputVat||0)}</td><td>${fmt.format(row.traPayments||0)}</td><td>${fmt.format(row.adjustmentIncrease||0)} / ${fmt.format(row.adjustmentDecrease||0)}</td><td>${fmt.format(row.cumulativeEstimatedBalance||0)}</td></tr>`).join('') : '<tr><td colspan="6">No VAT ledger records yet.</td></tr>';
      $('vatLedgerWarning').textContent = data.warning || ''; $('vatReconcileCount').textContent=`TRA payments awaiting bank reconciliation (recent 200): ${data.unlinkedTraPayments||0}. Linked entries do not debit the bank again.`;
    } catch(error) { $('vatLedgerRows').innerHTML = '<tr><td colspan="6">Ledger unavailable; check authorization and connection.</td></tr>'; msg.textContent = error.message; }
  }
  $('vatRefreshButton').addEventListener('click',refresh);
  $('vatLedgerForm').addEventListener('submit', async event => {
    event.preventDefault();
    const btn = $('vatSaveButton'); btn.disabled = true; msg.textContent = 'Saving…';
    try {
      const type = $('vatEntryType').value;
      const payload = { type, taxMonth:$('vatTaxMonth').value,entryDate:$('vatEntryDate').value,amount:$('vatAmount').value,reference:$('vatReference').value.trim(),description:$('vatDescription').value.trim() };
      if(type==='ADJUSTMENT') payload.direction=$('vatDirection').value; if(type==='TRA_PAYMENT' && $('vatBankWithdrawal').value) payload.bankWithdrawalId=$('vatBankWithdrawal').value;
      await request({method:'POST',body:JSON.stringify(payload)});
      msg.textContent='Saved. Reconcile the entry with evidence and the bank statement; no bank transaction was created.';
      $('vatAmount').value='';$('vatReference').value='';$('vatDescription').value='';
      await refresh();
    } catch(error) {msg.textContent=`Could not save: ${error.message}`;} finally {btn.disabled=false;}
  });
  loadWithdrawals();refresh();
})();
