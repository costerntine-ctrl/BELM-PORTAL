document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
  }

  if (themeToggle) {
    if (localStorage.getItem('belm-theme') === 'light') {
      document.body.classList.add('belm-light');
      themeToggle.lastChild.textContent = ' Dark mode';
    }
    themeToggle.addEventListener('click', function () {
      var isLight = document.body.classList.toggle('belm-light');
      localStorage.setItem('belm-theme', isLight ? 'light' : 'dark');
      themeToggle.lastChild.textContent = isLight ? ' Dark mode' : ' Light mode';
    });
  }

  // Live date/time (Date & Time inayoonyeshwa kwenye meta card na topbar)
  function updateClock() {
    var now = new Date();
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    var metaEl = document.getElementById('metaDateTime');
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (metaEl) {
      var d = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      var t = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      metaEl.textContent = d + ' • ' + t;
    }
  }
  updateClock();
  setInterval(updateClock, 30000);

  // Rangi ya kila dropdown inabadilika kulingana na hali iliyochaguliwa
  var statusSelects = document.querySelectorAll('.check-status');
  var unsafeItems = [];

  function applyStatusColor(select) {
    select.classList.remove('status-normal', 'status-attention', 'status-unsafe', 'status-na');
    if (select.value === 'normal') select.classList.add('status-normal');
    else if (select.value === 'attention') select.classList.add('status-attention');
    else if (select.value === 'unsafe') select.classList.add('status-unsafe');
    else if (select.value === 'na') select.classList.add('status-na');
  }

  statusSelects.forEach(function (select) {
    select.addEventListener('change', function () {
      applyStatusColor(select);

      if (select.value === 'unsafe') {
        var label = select.closest('.belm-check-item').querySelector('.belm-check-item__label').textContent;
        if (unsafeItems.indexOf(label) === -1) unsafeItems.push(label);
      }
    });
  });

  // Engine hours stepper
  var engineHours = document.getElementById('engineHours');
  var hoursUp = document.getElementById('hoursUp');
  var hoursDown = document.getElementById('hoursDown');

  function parseHours() {
    return parseInt((engineHours.value || '0').replace(/[^\d]/g, ''), 10) || 0;
  }
  function setHours(val) {
    engineHours.value = val.toLocaleString('en-US') + ' h';
  }
  if (hoursUp) hoursUp.addEventListener('click', function () { setHours(parseHours() + 1); });
  if (hoursDown) hoursDown.addEventListener('click', function () { setHours(Math.max(0, parseHours() - 1)); });

  // Attach photo — onyesha jina la faili lililochaguliwa
  var photoInput = document.getElementById('photoInput');
  var fileHint = document.getElementById('fileHint');
  if (photoInput) {
    photoInput.addEventListener('change', function () {
      if (photoInput.files && photoInput.files[0]) {
        fileHint.textContent = photoInput.files[0].name;
        fileHint.classList.add('belm-file-name');
      } else {
        fileHint.textContent = 'Low-size image';
        fileHint.classList.remove('belm-file-name');
      }
    });
  }

  // Save Checklist — hakiki confirmation checkbox kabla ya "kuhifadhi"
  var saveBtn = document.getElementById('saveChecklistBtn');
  var confirmBox = document.getElementById('confirmAccurate');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (!confirmBox.checked) {
        alert('Tafadhali thibitisha kwanza: "I confirm this checklist is accurate."');
        return;
      }
      if (unsafeItems.length > 0) {
        alert('Umeweka "Unsafe / Stop" kwa: ' + unsafeItems.join(', ') + '.\n\nHii itaunda machine alert na Report Issue moja kwa moja baada ya kuunganisha na backend (POST /api/checklists).');
      } else {
        alert('Checklist tayari kuhifadhiwa. Unganisha kitufe hiki na endpoint yako ya PHP (POST /api/checklists).');
      }
    });
  }

  // Report Unsafe Condition — moja kwa moja
  var reportBtn = document.getElementById('reportUnsafeBtn');
  if (reportBtn) {
    reportBtn.addEventListener('click', function () {
      alert('Unganisha kitufe hiki na endpoint yako ya PHP (POST /api/report-issue) ili kuunda Machine Alert + Report Issue mara moja.');
    });
  }
});
