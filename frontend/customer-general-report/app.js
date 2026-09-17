(function(){'use strict';
 const token=localStorage.getItem('belm_customer_token')||localStorage.getItem('belm_tech_token')||localStorage.getItem('belm_operator_token')||'';if(!token){location.replace('/login');return}
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=(tag,title,desc,href)=>({tag,title,desc,href});
 const sections=[
  {title:'Workshop & Machine Reports',note:'Operational and maintenance records across Workshop Manager, Technician and Operator roles.',cards:[
   c('MACHINES','Machine Reports','Checklist, fuel, operator, technician, service, breakdown and maintenance history.','/general-report/'),
   c('JOB CARDS','Job Card Reports','Opened, received, diagnosis, waiting spare, testing and completed work.','/breakdown-workflow/?actor=customer'),
   c('TECHNICIAN','Technician Reports','Assigned jobs, diagnosis, repair, testing and completion records.','/technician-job-cards/'),
   c('OPERATOR','Operator Reports','Daily checkup, operation log, fuel and machine issue records.','/operator/')
  ]},
  {title:'Procurement & Store Reports',note:'Purchasing, stock and tools records. Analysis is intentionally excluded.',cards:[
   c('PROCUREMENT','Procurement Records','Spare requests, purchase records, proforma, purchase orders and deliveries.','/customer-procurement-workspace/?view=records'),
   c('STORE','Store Reports','Inventory, stock in/out, issues, shortages and spare movements.','/customer-store-dashboard/'),
   c('AUDIT','Store Audit','Stock movement audit and transaction history.','/customer-store-audit/'),
   c('TOOLS','Tools Register','Tool issue, return, condition and overdue records.','/customer-tools-register/')
  ]},
  {title:'Finance Reports',note:'Customer finance records only. BELM bank-control functions are not included.',cards:[
   c('INVOICES','Invoices & Proforma','Customer sales documents, invoices and proforma records.','/customer-sales-documents/'),
   c('PAYMENTS','Payments & Receipts','Payment and receipt history.','/customer-finance-workspace/?view=payments'),
   c('EXPENSES','Expenses','Customer company expense records.','/customer-finance-workspace/?view=expenses'),
   c('PETTY CASH','Petty Cash','Petty cash movement and supporting records.','/customer-petty-cash/'),
   c('VAT','VAT / Tax','VAT summary and tax records.','/customer-finance-workspace/?view=vat'),
   c('AUDIT','Finance Audit Logs','Financial transaction and change history.','/customer-finance-workspace/?view=audit')
  ]},
  {title:'Customer Administration Reports',note:'Company access and operational records without analytics.',cards:[
   c('USERS','Roles & Users','Customer role assignments and portal user records.','/customer-users/'),
   c('COMMUNICATION','Communication Records','Role communication history and operational messages.','/role-communications/'),
   c('SERVICE','Service & Maintenance','Customer machine service and maintenance records.','/general-report/')
  ]}
 ];
 document.getElementById('content').innerHTML=sections.map(s=>`<section class="section"><h2>${esc(s.title)}</h2><p>${esc(s.note)}</p><div class="grid">${s.cards.map(x=>`<a class="card" href="${esc(x.href)}"><span class="tag">${esc(x.tag)}</span><h3>${esc(x.title)}</h3><p>${esc(x.desc)}</p><strong>Open report →</strong></a>`).join('')}</div></section>`).join('');
 document.getElementById('refresh').onclick=()=>location.reload();
 try{let raw=(token.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/');raw+='='.repeat((4-raw.length%4)%4);const p=JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));const name=p.customerName||p.companyName||'';if(name)document.getElementById('title').textContent=name+' General Report'}catch(_){ }
})();
