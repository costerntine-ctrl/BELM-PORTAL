(() => {
  const token = localStorage.getItem('belm_customer_token');
  if (!token) { location.replace('/login'); return; }
  const $ = id => document.getElementById(id);
  let records = [], issues = [], loading = false;
  const msg = (text, error = false) => { $('message').textContent = text; $('message').classList.toggle('error', error); };
  async function api(path, options = {}) {
    const result = await fetch('/api/customer-portal' + path, { ...options, cache: 'no-store', headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const body = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(body.error || body.message || `Request failed (${result.status})`);
    return body;
  }
  function options(element, rows, description, label) {
    element.replaceChildren(new Option(description, ''));
    rows.forEach(row => element.add(new Option(label(row), String(row.id))));
    element.disabled = !rows.length;
  }
  async function loadMachine() {
    const machineId = $('machine').value;
    records = []; issues = []; $('submit').disabled = true;
    options($('job'), [], 'Select a machine first', () => '');
    options($('issue'), [], 'Select a machine first', () => '');
    $('report').replaceChildren(); $('viewReport').disabled = true; $('summary').textContent = ''; $('remaining').textContent = ''; $('machineDetail').textContent = ''; $('reviewList').replaceChildren();
    if (!machineId) return;
    try {
      const data = await api(`/machines/${encodeURIComponent(machineId)}/maintenance-history`);
      $('machineDetail').textContent = [data.machine?.machineType, data.machine?.fleetNumber].filter(Boolean).join(' · ');
      const items = Array.isArray(data.items) ? data.items : [];
      records = items.filter(item => item.kind === 'JOB_CARD' && !['CANCELLED','CANCELED'].includes(String(item.status).toUpperCase()));
      issues = items.filter(item => item.kind === 'STORE_ISSUE');
      options($('job'), records, 'Select Job Card', item => `${item.reference || item.id} · ${item.status || 'Unknown'}`);
      options($('issue'), issues, 'Select store issue', item => `${item.partNumber || item.description || 'Part'} · Issued ${item.quantity}`);
      renderReviews(items.filter(item => item.kind === 'REPAIR_CONFIRMED'));
      const cost = data.confirmedCostSummary || {};
      $('summary').textContent = `Approved parts: TZS ${Number(cost.partsCost || 0).toLocaleString()} · Labor: TZS ${Number(cost.laborCost || 0).toLocaleString()} · Total: TZS ${Number(cost.total || 0).toLocaleString()}`;
      if (data.hasMore) msg('History is limited to recent records. Older Job Cards or issues may not appear; do not create a duplicate confirmation.');
      else msg('Choose an issued part and a matching Job Card.');
      sync();
    } catch (err) { msg(err.message, true); }
  }
  function renderReviews(entries) {
    const root = $('reviewList'); root.replaceChildren();
    if (!entries.length) { root.textContent = 'No repair records for this machine.'; return; }
    entries.forEach(entry => {
      const card = document.createElement('div'); card.className = 'review-entry';
      const heading = document.createElement('strong');
      heading.textContent = `${entry.reference || 'Job Card'} · ${entry.partNumber || 'Part'} · ${entry.reviewStatus || 'PENDING'}`;
      card.append(heading);
      const details = document.createElement('p'); details.className = 'muted';
      details.textContent = `Quantity: ${entry.quantity} · Parts TZS ${Number(entry.partsCost || 0).toLocaleString()} · Labor TZS ${Number(entry.laborCost || 0).toLocaleString()}`;
      card.append(details);
      if (entry.reviewStatus === 'PENDING') {
        const reason = document.createElement('textarea'); reason.rows = 2; reason.maxLength = 1000; reason.placeholder = 'Review note (required for rejection)';
        card.append(reason);
        ['APPROVED','REJECTED'].forEach(decision => {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'review-action';
          button.textContent = decision === 'APPROVED' ? 'Approve' : 'Reject';
          button.addEventListener('click', async () => {
            if (decision === 'REJECTED' && !reason.value.trim()) { msg('A reason is required to reject.', true); return; }
            if (!confirm(`${decision === 'APPROVED' ? 'Approve' : 'Reject'} this repair record?`)) return;
            button.disabled = true;
            try {
              await api(`/machines/${encodeURIComponent($('machine').value)}/repair-review`, {method:'POST',body:JSON.stringify({confirmationId:entry.id,decision,reason:reason.value.trim()})});
              await loadMachine(); msg(`Repair record ${decision.toLowerCase()}.`);
            } catch (err) { msg(err.message, true); button.disabled = false; }
          });
          card.append(button);
        });
      } else if (entry.reviewNote) {
        const note = document.createElement('p'); note.textContent = `Review note: ${entry.reviewNote}`; card.append(note);
      }
      root.append(card);
    });
  }
  function sync() {
    const issue = issues.find(x => String(x.id) === $('issue').value);
    $('remaining').textContent = issue ? `Issued quantity: ${issue.quantity}. Previously confirmed quantities are validated by the server.` : '';
    $('submit').disabled = loading || !$('machine').value || !$('job').value || !$('issue').value;
    $('viewReport').disabled = !$('machine').value || !$('job').value;
  }
  const reportLine = (root, label, value) => { const p=document.createElement('p'); const b=document.createElement('strong'); b.textContent=label+': '; p.append(b,document.createTextNode(String(value ?? '—'))); root.append(p); };
  $('viewReport').addEventListener('click', async () => {
    const machineId=$('machine').value, jobId=$('job').value;
    if (!machineId || !jobId) return;
    const root=$('report'); root.replaceChildren();
    try {
      const r=await api(`/machines/${encodeURIComponent(machineId)}/repair-report?jobCardId=${encodeURIComponent(jobId)}`);
      if ($('machine').value !== machineId || $('job').value !== jobId) return;
      const title=document.createElement('h3'); title.textContent=`${r.reportStatus} · ${r.jobCard.number || 'Job Card'}`; root.append(title);
      reportLine(root,'Machine',`${r.machine.label} · ${r.machine.type || ''} · ${r.machine.fleetNumber || ''}`);
      reportLine(root,'Work',r.jobCard.title); reportLine(root,'Status',r.jobCard.status);
      reportLine(root,'Technician',r.jobCard.technician); reportLine(root,'Completed',r.jobCard.completedAt);
      reportLine(root,'Customer signed by',r.jobCard.customerSignedBy);
      reportLine(root,'Customer sign-off date',r.jobCard.customerSignedAt);
      reportLine(root,'Pending manager reviews',r.pendingReviewCount);
      const heading=document.createElement('h4'); heading.textContent='Repair evidence'; root.append(heading);
      (r.entries || []).forEach(e=>reportLine(root,`${e.partNumber || 'Part'} · ${e.status}`,`Qty ${e.quantity} · Parts TZS ${Number(e.partsCost).toLocaleString()} · Labor ${e.laborHours}h / TZS ${Number(e.laborCost).toLocaleString()} · Reviewed by ${e.reviewedBy || 'Pending'}`));
      reportLine(root,'Approved parts (TZS)',Number(r.costs.approvedParts).toLocaleString());
      reportLine(root,'Approved labor (TZS)',Number(r.costs.approvedLabor).toLocaleString());
      reportLine(root,'Approved recorded total (TZS)',Number(r.costs.approvedTotal).toLocaleString());
      const note=document.createElement('p'); note.className='muted'; note.textContent=r.disclaimer; root.append(note);
      const print=document.createElement('button'); print.type='button'; print.textContent='Print report'; print.addEventListener('click',()=>window.print()); root.append(print);
    } catch(err) { msg(err.message,true); }
  });
  $('machine').addEventListener('change', loadMachine); $('job').addEventListener('change', sync); $('issue').addEventListener('change', sync);
  $('confirmForm').addEventListener('submit', async event => {
    event.preventDefault(); sync(); if ($('submit').disabled) return;
    const form = new FormData(event.currentTarget);
    const payload = { jobCardId: $('job').value, storeIssueId: $('issue').value, quantityInstalled: Number(form.get('quantityInstalled')), laborHours: Number(form.get('laborHours')), hourlyRate: Number(form.get('hourlyRate')), note: String(form.get('note') || '') };
    if (!(payload.quantityInstalled > 0) || payload.laborHours < 0 || payload.hourlyRate < 0 || !Number.isFinite(payload.quantityInstalled + payload.laborHours + payload.hourlyRate)) { msg('Enter valid quantities and cost information.', true); return; }
    if (!confirm('Confirm this part was ACTUALLY INSTALLED and the labor recorded? This creates a record pending separate manager review.')) return;
    loading = true; sync();
    try {
      await api(`/machines/${encodeURIComponent($('machine').value)}/repair-confirmations`, { method: 'POST', body: JSON.stringify(payload) });
      msg('Repair record saved. It is awaiting manager review.'); event.currentTarget.reset();
      const selectedMachine = $('machine').value; await loadMachine(); $('machine').value = selectedMachine;
    } catch (err) { msg(err.message, true); } finally { loading = false; sync(); }
  });
  api('/dashboard').then(data => {
    const machines = Array.isArray(data.machines) ? data.machines : [];
    options($('machine'), machines, 'Select a customer machine', machine => [machine.brand, machine.model, machine.fleetNumber || machine.fleet_number].filter(Boolean).join(' · ') || machine.id);
    const preset = new URLSearchParams(location.search).get('machine');
    if (preset && machines.some(machine => String(machine.id) === preset)) { $('machine').value = preset; loadMachine(); }
  }).catch(err => msg(err.message, true));
})();
