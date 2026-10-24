(() => {
  'use strict';
  const root = document.getElementById('financeReviewPanel');
  if (!root) return;
  const el = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const req = async action => {
    const token = localStorage.getItem('belm_admin_token');
    const response = await fetch('/api/bank-manager?action=' + encodeURIComponent(action), {headers:{Authorization:'Bearer '+(token||'')},cache:'no-store'});
    if (!response.ok) throw new Error('Review unavailable (' + response.status + '). Check Super Admin access and database.');
    return response.json();
  };
  const empty = (id, n, msg) => { el(id).innerHTML = `<tr><td colspan="${n}">${esc(msg)}</td></tr>`; };
  async function refresh() {
    el('financeReviewStatus').textContent = 'Checking reconciliation records…';
    try {
      const [a, d, m] = await Promise.all([req('finance-audit'),req('expense-overlap-review'),req('job-customer-margin')]);
      const counts = a.audit?.counts || {};
      const overlaps = d.review?.items || [];
      const report = m.report || {};
      const exceptions = Object.values(counts).reduce((sum,v)=>sum+(Number(v)||0),0);
      el('financeReviewCounts').innerHTML = `<div class="panel"><strong>${fmt(exceptions)}</strong><p>Financial exception flags</p></div><div class="panel"><strong>${fmt(overlaps.length)}</strong><p>Possible expense overlaps</p></div><div class="panel"><strong>${fmt((report.invoicesWithoutJobCard||[]).length)}</strong><p>Invoices without Job Cards</p></div>`;
      const customers=report.customers||[];
      el('financeReviewCustomers').innerHTML=customers.length?customers.map(r=>`<tr><td>${esc(r.customerName)}</td><td>${fmt(r.revenueExVat)}</td><td>${fmt(r.estimatedSpareCost)}</td><td>${fmt(r.contributionBeforeLaborAndOverheads)}</td></tr>`).join(''):'';
      if(!customers.length)empty('financeReviewCustomers',4,'No customer contribution data.');
      const jobs=report.linkedJobInvoices||[];
      el('financeReviewJobs').innerHTML=jobs.length?jobs.slice(0,100).map(r=>`<tr><td>${esc(r.jobCardNo)}</td><td>${esc(r.invoiceNo)} / ${esc(r.customerName)}</td><td>${fmt(r.revenueExVat)}</td><td>${fmt(r.contributionBeforeLaborAndOverheads)}</td></tr>`).join(''):'';
      if(!jobs.length)empty('financeReviewJobs',4,'No linked Job Card invoices.');
      el('financeReviewUnlinked').textContent = `${(report.invoicesWithoutJobCard||[]).length} invoice(s) need link review. This does not necessarily indicate an error.`;
      el('financeReviewDuplicates').innerHTML=overlaps.length?overlaps.map(r=>`<tr><td>${esc(r.expenseDate ?? r.expense_date)}</td><td>${esc(r.financeDescription ?? r.finance_description)}</td><td>${esc(r.procurementDescription ?? r.procurement_description)}</td><td>${fmt(r.financeAmount ?? r.finance_amount)}</td></tr>`).join(''):'';
      if(!overlaps.length)empty('financeReviewDuplicates',4,'No potential overlaps returned.');
      el('financeReviewStatus').textContent=`Review loaded. ${exceptions} exception flags; check source records before making adjustments.`;
    } catch(e) {el('financeReviewStatus').textContent=e.message; ['financeReviewCustomers','financeReviewJobs','financeReviewDuplicates'].forEach((id)=>empty(id,4,'Review could not be loaded.'));}
  }
  el('refreshFinanceReview').addEventListener('click',refresh);
  refresh();
})();
