(function(){
  'use strict';
  var path=location.pathname;
  function go(url){ if(url) location.href=url; }
  function text(el){ return (el.textContent||'').replace(/\s+/g,' ').trim(); }
  function downloadCsv(){
    var table=document.querySelector('table');
    if(!table){ alert('No table data is available to export.'); return; }
    var rows=[].slice.call(table.querySelectorAll('tr')).map(function(tr){
      return [].slice.call(tr.querySelectorAll('th,td')).map(function(td){return '"'+text(td).replace(/"/g,'""')+'"';}).join(',');
    });
    var blob=new Blob([rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='BELM-export-'+new Date().toISOString().slice(0,10)+'.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  }
  function routeFor(el){
    var t=text(el).toLowerCase();
    if(path.indexOf('/01-admin-home/')>=0){
      if(t.indexOf('machines due')>=0) return 'machines.php?filter=service-due';
      if(t.indexOf('low stock')>=0) return 'spare-parts.php?filter=low-stock';
      if(t.indexOf('fuel refill')>=0) return 'reports-analysis.php?view=fuel';
      if(t.indexOf('expired documents')>=0) return 'reports-analysis.php?view=documents';
      if(t==='view all') return 'reports-analysis.php';
    }
    if(path.indexOf('/02-technician/')>=0){
      if(t==='open job') return 'my-job-cards.php';
      if(t.indexOf('diagnosis')>=0) return 'diagnosis-repair.php';
      if(t.indexOf('request spare')>=0) return 'spare-requests.php';
      if(t.indexOf('testing')>=0) return 'testing-completion.php';
    }
    if(path.indexOf('/03-procurement/')>=0){
      if(t.indexOf('request quotation')>=0) return 'spare-purchase-requests.php';
      if(t.indexOf('compare proforma')>=0 || t==='review' || t.indexOf('submit for approval')>=0) return 'pending-proforma.php';
      if(t.indexOf('create po')>=0) return 'purchase-orders.php';
      if(t.indexOf('view details')>=0) return 'delivery-tracking.php';
    }
    if(path.indexOf('/04-customer-registration/')>=0){
      if(t==='view') return 'all-customers.php?action=view';
      if(t==='edit') return 'all-customers.php?action=edit';
      if(t.indexOf('reset access')>=0) return 'portal-access.php?action=reset';
      if(t==='manage') return 'customer-users.php';
    }
    if(path.indexOf('/05-inspection-repair/')>=0){
      if(t.indexOf('new inspection')>=0 || t.indexOf('open checklist')>=0) return 'inspection-checklists.php';
      if(t.indexOf('review diagnosis')>=0 || t.indexOf('add findings')>=0) return 'diagnosis.php';
      if(t.indexOf('check spare')>=0) return 'waiting-for-spares.php';
      if(t.indexOf('start testing')>=0) return 'testing-completion.php';
      if(t.indexOf('assign technician')>=0) return 'repair-jobs.php?action=assign';
      if(t.indexOf('generate report')>=0) return 'service-reports.php';
      if(t==='view all') return 'repair-jobs.php';
    }
    if(path.indexOf('/06-storekeeper/')>=0){
      if(t==='view') return 'spare-parts-inventory.php';
      if(t.indexOf('request procurement')>=0) return 'spare-requests.php?action=procure';
      if(t==='adjust') return 'stock-audit.php?action=adjust';
      if(t==='review') return 'spare-requests.php';
      if(t.indexOf('issue part')>=0) return 'stock-out-issues.php';
      if(t.indexOf('scan item')>=0) return 'spare-parts-inventory.php?action=scan';
      if(t.indexOf('start audit')>=0) return 'stock-audit.php';
      if(t.indexOf('print issue note')>=0){ window.print(); return null; }
      if(t.indexOf('export csv')>=0){ downloadCsv(); return null; }
    }
    if(path.indexOf('/07-operator/')>=0){ if(t.indexOf('add comment')>=0) return 'communication.php?action=comment'; }
    if(path.indexOf('/08-daily-checklist/')>=0){
      if(t.indexOf('download pdf')>=0){ window.print(); return null; }
      if(t.indexOf('export csv')>=0){ downloadCsv(); return null; }
    }
    if(path.indexOf('/09-finance-accounts/')>=0 && el.classList.contains('cell-link')) return 'invoices-proforma.html';
    if(path.indexOf('/11-workshop-manager/')>=0 && el.classList.contains('cell-link')) return 'job-cards.html';
    return null;
  }
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href="#"]');
    if(a){
      e.preventDefault(); var r=routeFor(a); if(r) go(r); return;
    }
    var action=e.target.closest('.row-action');
    if(action){
      if(path.indexOf('/09-finance-accounts/')>=0) go('invoices-proforma.html');
      else if(path.indexOf('/11-workshop-manager/')>=0) go('job-cards.html');
    }
  });
})();
