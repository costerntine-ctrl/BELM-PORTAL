document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var searchInput = document.querySelector('.belm-search input');

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

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('.belm-table tbody tr').forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = text.indexOf(q) === -1 ? 'none' : '';
      });
    });
  }

  var liveSync = document.createElement('script');
  liveSync.src = 'assets/js/jobcard-live-sync.js?v=721-live-jobcards';
  liveSync.defer = true;
  document.body.appendChild(liveSync);
});
