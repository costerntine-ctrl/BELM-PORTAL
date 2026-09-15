document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var token = localStorage.getItem('belm_admin_token') || '';
  var preview = new URLSearchParams(location.search).get('preview') === '1' || /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if (!preview && !token) { location.replace('/login'); return; }

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];});}
  function money(v){return 'TZS '+Number(v||0).toLocaleString('en-TZ',{maximumFractionDigits:0});}
  function num(v){return Number(v||0).toLocaleString('en-TZ',{maximumFractionDigits:0});}
  function date(v){if(!v)return '—';var d=new Date(v);if(isNaN(d))return String(v);return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
  async function api(path){var r=await fetch('/api'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token}});var t=await r.text();var d=null;try{d=t?JSON.parse(t):null}catch(_){ }if(!r.ok)throw new Error(d&&d.error||'Request failed');return d;}

  // Identity only; visual design remains supplied dashboard design.
  try {
    var u=JSON.parse(localStorage.getItem('belm_admin_user')||'null');
    if(u){
      var strong=document.querySelector('.user-copy strong'), small=document.querySelector('.user-copy small'), avatar=document.querySelector('.user-avatar');
      if(strong&&u.name)strong.textContent=u.name;
      if(small&&u.roleName)small.textContent=u.roleName;
      if(avatar&&u.name){var p=String(u.name).trim().split(/\s+/);avatar.textContent=((p[0]||'F')[0]+(p[1]||p[0]||'A')[0]).toUpperCase();}
    }
  } catch(_) {}

  function updateStats(invoices,expenses){
    var cards=[...document.querySelectorAll('.stat-card')];
    var payments=invoices.flatMap(function(i){return Array.isArray(i.payments)?i.payments:[];});
    var totalInvoices=invoices.reduce(function(s,i){return s+Number(i.total||0);},0);
    var totalPaid=payments.reduce(function(s,p){return s+Number(p.amount||0);},0);
    var outstanding=invoices.reduce(function(s,i){return s+Math.max(0,Number(i.balance!=null?i.balance:(Number(i.total||0)-Number(i.paidAmount||0))));},0);
    var totalExpenses=expenses.reduce(function(s,e){return s+Number(e.amount||0);},0);
    var values=[[totalInvoices,invoices.length+' Invoices'],[totalPaid,payments.length+' Payments'],[outstanding,invoices.filter(function(i){return Number(i.balance||0)>0.005;}).length+' Invoices'],[totalExpenses,expenses.length+' Expenses']];
    cards.forEach(function(c,i){if(!values[i])return;var v=c.querySelector('.stat-value'), sub=c.querySelector('.stat-foot .sub');if(v)v.textContent=money(values[i][0]);if(sub)sub.textContent=values[i][1];});
  }

  function renderRecent(invoices){
    var tables=document.querySelectorAll('.tables-grid .data-table tbody');
    if(tables[0]){
      var rows=invoices.slice(0,5).map(function(i,idx){
        var status=String(i.status||'OUTSTANDING').toUpperCase();
        var cls=status==='PAID'?'paid':(status==='OVERDUE'?'overdue':'outstanding');
        return '<tr><td>'+(idx+1)+'</td><td><a href="/billing-manager/?tab=invoices" class="cell-link">'+esc(i.invoiceNo||'—')+'</a></td><td>'+esc(i.customer&&i.customer.name||'—')+'</td><td>'+esc(date(i.issueDate||i.createdAt))+'</td><td class="num">'+num(i.total)+'</td><td><span class="status-pill status-pill--'+cls+'">'+esc(status.charAt(0)+status.slice(1).toLowerCase())+'</span></td><td class="row-action">···</td></tr>';
      }).join('');
      tables[0].innerHTML=rows||'<tr><td colspan="7">No invoices yet.</td></tr>';
    }
    var pays=[];invoices.forEach(function(i){(i.payments||[]).forEach(function(p){pays.push({p:p,i:i});});});
    pays.sort(function(a,b){return new Date(b.p.paidAt||0)-new Date(a.p.paidAt||0);});
    if(tables[1]) tables[1].innerHTML=pays.slice(0,5).map(function(x,idx){return '<tr><td>'+(idx+1)+'</td><td>'+esc(date(x.p.paidAt))+'</td><td>'+esc(x.i.customer&&x.i.customer.name||'—')+'</td><td class="num">'+num(x.p.amount)+'</td><td>'+esc(x.p.method||x.p.paymentMethod||'—')+'</td><td>'+esc(x.p.referenceNo||x.p.reference||'—')+'</td></tr>';}).join('')||'<tr><td colspan="6">No payments yet.</td></tr>';
  }

  function monthKey(d){var x=new Date(d);if(isNaN(x))return '';return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');}
  function updateCharts(invoices,expenses){
    var now=new Date(), months=[];
    for(var k=5;k>=0;k--){var d=new Date(now.getFullYear(),now.getMonth()-k,1);months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('en-GB',{month:'short',year:'numeric'}),income:0,expense:0});}
    invoices.forEach(function(i){var key=monthKey(i.issueDate||i.createdAt);var m=months.find(function(x){return x.key===key;});if(m)m.income+=Number(i.total||0);});
    expenses.forEach(function(e){var key=monthKey(e.date||e.createdAt);var m=months.find(function(x){return x.key===key;});if(m)m.expense+=Number(e.amount||0);});
    var max=Math.max(1,...months.map(function(m){return Math.max(m.income,m.expense);}));
    var groups=[...document.querySelectorAll('.bar-chart .bar-group')];
    groups.forEach(function(g,i){var m=months[i];if(!m)return;var a=g.querySelector('.bar--income'),b=g.querySelector('.bar--expense'),l=g.querySelector('.bar-month-label');if(a){a.style.height=Math.max(4,Math.round(m.income/max*300))+'px';a.title=money(m.income);}if(b){b.style.height=Math.max(4,Math.round(m.expense/max*300))+'px';b.title=money(m.expense);}if(l)l.textContent=m.label;});
    var y=[...document.querySelectorAll('.bar-chart-yaxis span')];if(y.length===5){var top=Math.ceil(max/1000000);y[0].textContent=top+'M';y[1].textContent=Math.round(top*.75)+'M';y[2].textContent=Math.round(top*.5)+'M';y[3].textContent=Math.round(top*.25)+'M';y[4].textContent='0';}

    var active=invoices.filter(function(i){return String(i.status||'').toUpperCase()!=='CANCELLED';});
    var paid=active.filter(function(i){return String(i.status||'').toUpperCase()==='PAID'||Number(i.balance||0)<=0.005;}).length;
    var overdue=active.filter(function(i){return String(i.status||'').toUpperCase()==='OVERDUE';}).length;
    var outstanding=Math.max(0,active.length-paid-overdue), total=Math.max(1,active.length), circ=2*Math.PI*62;
    var circles=[...document.querySelectorAll('.donut-svg circle')].slice(1);
    var counts=[paid,outstanding,overdue], offset=0;
    circles.forEach(function(c,i){var len=circ*(counts[i]||0)/total;c.setAttribute('stroke-dasharray',len+' '+circ);c.setAttribute('stroke-dashoffset',-offset);offset+=len;});
    var tx=document.querySelector('.donut-svg text');if(tx)tx.textContent=active.length;
    var legend=[...document.querySelectorAll('.donut-legend-row')];legend.forEach(function(r,i){var s=r.querySelector('strong'),sm=r.querySelector('small');if(s)s.textContent=counts[i]||0;if(sm)sm.textContent='('+Math.round((counts[i]||0)/total*100)+'%)';});
  }

  function updateBalances(bank){
    if(!bank||!Array.isArray(bank.accounts))return;
    var cards=[...document.querySelectorAll('.balance-card')];
    cards.forEach(function(c,i){var a=bank.accounts[i];if(!a){if(i<2){var name=c.querySelector('.balance-name'),val=c.querySelector('.balance-value'),sub=c.querySelector('.balance-sub');if(name)name.textContent='Bank account';if(val)val.textContent='Restricted / not configured';if(sub)sub.textContent='Open Bank Control';}return;}var n=c.querySelector('.balance-name'),v=c.querySelector('.balance-value'),s=c.querySelector('.balance-sub');if(n)n.textContent=a.bankName||'Bank';if(v)v.textContent=money(a.balance);if(s)s.textContent='A/C: '+(a.accountNumber||'—');c.href='/bank-controller/';});
  }

  function updateSummary(invoices,expenses){
    var now=new Date(), mk=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    var income=invoices.filter(function(i){return monthKey(i.issueDate||i.createdAt)===mk;}).reduce(function(s,i){return s+Number(i.total||0);},0);
    var exp=expenses.filter(function(e){return monthKey(e.date||e.createdAt)===mk;}).reduce(function(s,e){return s+Number(e.amount||0);},0);
    var vals=[income,exp,income-exp];
    [...document.querySelectorAll('.summary-item .summary-value')].forEach(function(el,i){if(vals[i]!=null)el.textContent=money(vals[i]);});
  }

  async function load(){
    try{
      var results=await Promise.allSettled([api('/billing'),api('/company-expenses'),api('/bank-manager')]);
      var invoices=results[0].status==='fulfilled'&&Array.isArray(results[0].value)?results[0].value:[];
      var expenses=results[1].status==='fulfilled'&&Array.isArray(results[1].value)?results[1].value:[];
      var bank=results[2].status==='fulfilled'?results[2].value:null;
      updateStats(invoices,expenses);renderRecent(invoices);updateCharts(invoices,expenses);updateBalances(bank);updateSummary(invoices,expenses);
    }catch(e){console.warn('Finance dashboard live sync:',e);}
  }
  load();
  setInterval(load,60000);

  var theme=document.getElementById('themeToggle');
  if(theme)theme.addEventListener('click',function(){location.href='/settings-manager/#display-theme';});
});
