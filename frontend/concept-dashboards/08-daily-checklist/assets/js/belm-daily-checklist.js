document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var token = localStorage.getItem('belm_operator_token') || '';

  if (sidebarToggle) sidebarToggle.addEventListener('click', function () { shell.classList.toggle('is-sidebar-open'); });
  if (themeToggle) {
    if (localStorage.getItem('belm-theme') === 'light') { document.body.classList.add('belm-light'); themeToggle.lastChild.textContent = ' Dark mode'; }
    themeToggle.addEventListener('click', function () {
      var isLight = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', isLight ? 'light' : 'dark');
      themeToggle.lastChild.textContent = isLight ? ' Dark mode' : ' Light mode';
    });
  }

  function updateClock() {
    var now = new Date(), dateEl = document.getElementById('liveDate'), timeEl = document.getElementById('liveTime'), metaEl = document.getElementById('metaDateTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    if (metaEl) metaEl.textContent = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ' • ' + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  }
  updateClock(); setInterval(updateClock, 30000);

  var statusSelects = Array.prototype.slice.call(document.querySelectorAll('.check-status'));
  function applyStatusColor(select) {
    select.classList.remove('status-normal','status-attention','status-unsafe','status-na');
    if (select.value === 'normal') select.classList.add('status-normal');
    else if (select.value === 'attention') select.classList.add('status-attention');
    else if (select.value === 'unsafe') select.classList.add('status-unsafe');
    else if (select.value === 'na') select.classList.add('status-na');
  }
  statusSelects.forEach(function (select) { select.addEventListener('change', function () { applyStatusColor(select); }); });

  var engineHours = document.getElementById('engineHours'), hoursUp = document.getElementById('hoursUp'), hoursDown = document.getElementById('hoursDown');
  function parseHours(){ return parseInt((engineHours.value || '0').replace(/[^\d]/g,''),10) || 0; }
  function setHours(v){ engineHours.value = v.toLocaleString('en-US') + ' h'; }
  if (hoursUp) hoursUp.addEventListener('click', function(){ setHours(parseHours()+1); });
  if (hoursDown) hoursDown.addEventListener('click', function(){ setHours(Math.max(0,parseHours()-1)); });

  var photoInput = document.getElementById('photoInput'), fileHint = document.getElementById('fileHint');
  if (photoInput) photoInput.addEventListener('change', function(){
    if (photoInput.files && photoInput.files[0]) { fileHint.textContent=photoInput.files[0].name; fileHint.classList.add('belm-file-name'); }
    else { fileHint.textContent='Low-size image'; fileHint.classList.remove('belm-file-name'); }
  });

  function rows() {
    return statusSelects.map(function (select) {
      var item = select.closest('.belm-check-item');
      return { label:item.querySelector('.belm-check-item__label').textContent.replace(/&amp;/g,'&').trim(), value:select.value };
    });
  }
  function unsafeRows(){ return rows().filter(function(r){return r.value==='unsafe';}); }
  function rowValue(match) {
    var r = rows().find(function(x){ return match.test(x.label); });
    return r ? r.value : '';
  }
  function convert(value, kind) {
    if (value === 'normal' || value === 'na') return 'OK';
    if (kind === 'engine' || kind === 'gearbox') return value === 'unsafe' ? 'CONTAMINATED' : 'LOW';
    if (kind === 'coolant') return 'LOW';
    if (kind === 'tires') return value === 'unsafe' ? 'DAMAGED' : 'WORN';
    if (kind === 'brakes') return value === 'unsafe' ? 'CRITICAL' : 'NEEDS_ATTENTION';
    return 'OK';
  }
  async function operatorApi(action, body) {
    if (!token) throw new Error('Operator login is required. Open the Operator Dashboard and sign in first.');
    var response = await fetch('/api/operator/' + action, {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}, body:JSON.stringify(body || {})});
    var data = await response.json().catch(function(){return {};});
    if (!response.ok) throw new Error(data.error || 'Could not save checklist.');
    return data;
  }
  function fullChecklistMessage() {
    var lines = ['DAILY MACHINE CHECKLIST', 'Engine Hours: ' + parseHours()];
    rows().forEach(function(r){ lines.push(r.label + ': ' + (r.value || 'Not selected').replace(/_/g,' ')); });
    return lines.join('\n');
  }

  var saveBtn=document.getElementById('saveChecklistBtn'), confirmBox=document.getElementById('confirmAccurate');
  if (saveBtn) saveBtn.addEventListener('click', async function(){
    if (!confirmBox || !confirmBox.checked) { alert('Confirm that the checklist is accurate before saving.'); return; }
    var missing = rows().filter(function(r){ return !r.value; });
    if (missing.length) { alert('Complete all checklist status fields before saving.'); return; }
    saveBtn.disabled=true;
    try {
      var basic = {
        engineOilLevel:convert(rowValue(/Engine oil/i),'engine'),
        gearboxOilLevel:convert(rowValue(/Transmission oil/i),'gearbox'),
        coolantLevel:convert(rowValue(/Coolant/i),'coolant'),
        tires:convert(rowValue(/Tyres condition/i),'tires'),
        brakes:convert(rowValue(/Service brake/i),'brakes')
      };
      var check = await operatorApi('check-up', basic);
      // Preserve the complete 27-item checklist as the daily report text as well.
      await operatorApi('report', {message:fullChecklistMessage(), mode:'DAILY'});
      alert(check.status === 'OPEN' ? 'Checklist saved. Attention is required on this machine.' : 'Checklist saved successfully.');
    } catch (error) {
      alert(error.message || 'Could not save checklist.');
    } finally { saveBtn.disabled=false; }
  });

  var reportBtn=document.getElementById('reportUnsafeBtn');
  if (reportBtn) reportBtn.addEventListener('click', async function(){
    var unsafe=unsafeRows();
    var message = unsafe.length ? 'UNSAFE CONDITION: ' + unsafe.map(function(r){return r.label;}).join(', ') + '\n\n' + fullChecklistMessage() : 'UNSAFE CONDITION REPORTED FROM DAILY CHECKLIST\n\n' + fullChecklistMessage();
    if (!confirm('Send this unsafe condition as an official BELM Job Card / problem report?')) return;
    reportBtn.disabled=true;
    try {
      var result=await operatorApi('report',{message:message,mode:'BELM_JOB'});
      alert(result.jobCardCreated ? ('Job Card ' + (result.jobCardNo || '') + ' created and sent to TECHNICAL DEP.').trim() : (result.message || 'Unsafe condition reported.'));
    } catch(error){ alert(error.message || 'Could not report unsafe condition.'); }
    finally { reportBtn.disabled=false; }
  });

  window.BELMExportChecklistCSV = function () {
    var out=[['Item','Status']];
    rows().forEach(function(r){out.push([r.label,r.value||'']);});
    out.unshift(['Engine Hours',String(parseHours())]);
    var csv=out.map(function(row){return row.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='BELM-Daily-Checklist-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  };
});
