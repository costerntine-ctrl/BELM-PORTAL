(function(){
  'use strict';
  const money=value=>'TZS '+Number(value||0).toLocaleString('en-TZ',{maximumFractionDigits:0});
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const date=value=>{if(!value)return '-';const d=new Date(value);return Number.isNaN(d.getTime())?'-':d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})};
  const byId=id=>document.getElementById(id);

  function initials(name){
    const bits=String(name||'Company').trim().split(/\s+/).filter(Boolean);
    return (bits.slice(0,2).map(x=>x[0]||'').join('')||'CO').toUpperCase();
  }

  function classifyInvoice(row){
    const balance=Number(row.balance||0);
    if(balance<=0)return 'paid';
    if(row.due_date){const due=new Date(String(row.due_date)+'T23:59:59');if(!Number.isNaN(due.getTime())&&due<new Date())return 'overdue'}
    return 'outstanding';
  }

  function setDonut(counts){
    const total=counts.paid+counts.outstanding+counts.overdue;
    const circumference=2*Math.PI*62;
    const paidLen=total?circumference*counts.paid/total:0;
    const openLen=total?circumference*counts.outstanding/total:0;
    const overdueLen=total?circumference*counts.overdue/total:0;
    const paid=byId('donutPaid'),open=byId('donutOutstanding'),overdue=byId('donutOverdue');
    [paid,open,overdue].forEach(el=>{if(el){el.style.strokeDasharray=`0 ${circumference}`;el.style.strokeDashoffset='0'}});
    if(paid){paid.style.strokeDasharray=`${paidLen} ${Math.max(0,circumference-paidLen)}`;paid.style.strokeDashoffset='0'}
    if(open){open.style.strokeDasharray=`${openLen} ${Math.max(0,circumference-openLen)}`;open.style.strokeDashoffset=String(-paidLen)}
    if(overdue){overdue.style.strokeDasharray=`${overdueLen} ${Math.max(0,circumference-overdueLen)}`;overdue.style.strokeDashoffset=String(-(paidLen+openLen))}
    byId('donutTotal').textContent=String(total);
    byId('paidInvoiceCount').textContent=String(counts.paid);
    byId('openInvoiceCount').textContent=String(counts.outstanding);
    byId('overdueInvoiceCount').textContent=String(counts.overdue);
  }

  function renderInvoices(documents){
    const invoices=(Array.isArray(documents)?documents:[]).filter(row=>String(row.document_type||'').toUpperCase()==='INVOICE');
    const tbody=byId('recentInvoices');
    if(!invoices.length){tbody.innerHTML='<tr><td colspan="5" class="empty-cell">No invoice records yet.</td></tr>';return invoices}
    tbody.innerHTML=invoices.slice(0,6).map(row=>{
      const state=classifyInvoice(row);
      const label=state==='paid'?'Paid':state==='overdue'?'Overdue':'Outstanding';
      return `<tr><td><a class="cell-link" href="/customer-sales-documents/">${esc(row.document_no||'-')}</a></td><td>${esc(row.client_name||'-')}</td><td>${date(row.created_at)}</td><td class="num">${money(row.gross_total)}</td><td><span class="status-pill status-pill--${state}">${label}</span></td></tr>`;
    }).join('');
    return invoices;
  }

  function renderPayments(items){
    const rows=Array.isArray(items)?items:[];
    const tbody=byId('recentPayments');
    if(!rows.length){tbody.innerHTML='<tr><td colspan="5" class="empty-cell">No payment records yet.</td></tr>';return}
    tbody.innerHTML=rows.slice(0,6).map(row=>`<tr><td><a class="cell-link" href="/customer-finance-workspace/?view=payments">${esc(row.document_no||'-')}</a></td><td>${esc(row.client_name||'-')}</td><td>${date(row.paid_at||row.created_at)}</td><td class="num">${money(row.amount)}</td><td>${esc(row.payment_method||'-')}</td></tr>`).join('');
  }

  function setSummary(summary,invoices,payments,expenses){
    const companyExpenses=Number(summary.companyExpenses||0);
    const operationalExpenses=Number(summary.operationalExpenses||0);
    const expenseTotal=companyExpenses+operationalExpenses;
    const outstandingInvoices=invoices.filter(row=>Number(row.balance||0)>0);
    byId('invoiceValue').textContent=money(summary.invoiceGross);
    byId('paymentValue').textContent=money(summary.payments);
    byId('outstandingValue').textContent=money(summary.outstanding);
    byId('expenseValue').textContent=money(expenseTotal);
    byId('invoiceCount').textContent=`${invoices.length} invoice${invoices.length===1?'':'s'}`;
    byId('paymentCount').textContent=`${payments.length} payment${payments.length===1?'':'s'}`;
    byId('outstandingCount').textContent=`${outstandingInvoices.length} invoice${outstandingInvoices.length===1?'':'s'}`;
    byId('expenseCount').textContent=`${expenses.length} finance expense${expenses.length===1?'':'s'}`;
    byId('positionInvoice').textContent=money(summary.invoiceGross);
    byId('positionPaid').textContent=money(summary.payments);
    byId('positionOutstanding').textContent=money(summary.outstanding);
    byId('positionVat').textContent=money(summary.vatTotal);
    byId('positionPettyFunded').textContent=money(summary.pettyCashFunded);
    byId('positionPettySpent').textContent=money(summary.pettyCashSpent);
    const counts={paid:0,outstanding:0,overdue:0};
    invoices.forEach(row=>{counts[classifyInvoice(row)]++});
    setDonut(counts);
  }

  async function boot(event){
    const detail=event.detail||{};
    const api=detail.api;
    if(typeof api!=='function')return;
    const customer=detail.customer||{};
    const short=initials(customer.name);
    document.querySelectorAll('[data-company-initials]').forEach(el=>el.textContent=short);
    document.querySelectorAll('[data-role-initials]').forEach(el=>el.textContent='FA');
    const errorBox=byId('financeLoadError');
    try{
      const [finance,paymentData,expenseData]=await Promise.all([
        api('/api/customer-portal/finance-summary'),
        api('/api/customer-portal/sales-payments'),
        api('/api/customer-portal/finance-expenses')
      ]);
      const invoices=renderInvoices(finance.documents||[]);
      const payments=Array.isArray(paymentData.items)?paymentData.items:[];
      const expenses=Array.isArray(expenseData.items)?expenseData.items:[];
      renderPayments(payments);
      setSummary(finance.summary||{},invoices,payments,expenses);
      errorBox.hidden=true;
    }catch(error){
      console.error(error);
      errorBox.textContent='Finance data could not be loaded. Refresh the page or check this customer role access.';
      errorBox.hidden=false;
      byId('recentInvoices').innerHTML='<tr><td colspan="5" class="empty-cell">Unable to load invoice records.</td></tr>';
      byId('recentPayments').innerHTML='<tr><td colspan="5" class="empty-cell">Unable to load payment records.</td></tr>';
    }
  }

  window.addEventListener('belm:customer-mirror-ready',boot,{once:true});
  document.addEventListener('click',event=>{
    const logout=event.target.closest('[data-customer-logout]');
    if(!logout)return;
    localStorage.removeItem('belm_customer_token');
  });
})();
