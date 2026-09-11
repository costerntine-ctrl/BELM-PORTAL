document.addEventListener('DOMContentLoaded', function () {
  function updateClock() {
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (!dateEl || !timeEl) return;
    var now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // System Updates duplicated System Settings. Keep all version/system
  // information in the single System Settings workspace and remove both the
  // sidebar shortcut and duplicate card.
  document.querySelectorAll('a[href="system-updates.html"]').forEach(function (link) {
    var card = link.closest('.setting-card');
    if (card) card.remove();
    else link.remove();
  });

  updateClock();
  setInterval(updateClock, 1000);
});
