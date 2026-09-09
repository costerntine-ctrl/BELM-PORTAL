document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var searchInput = document.querySelector('.belm-search input');
  var tableRows = document.querySelectorAll('.belm-table tbody tr');

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

  // Search filter ya "Registered Customers" (company / location) — client-side placeholder
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      tableRows.forEach(function (row) {
        var text = row.textContent.toLowerCase();
        row.style.display = text.indexOf(q) === -1 ? 'none' : '';
      });
    });
  }

  // Save Customer — demo tu; unganisha na POST /api/customers upande wa PHP
  var form = document.getElementById('registerForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Unganisha kitufe hiki na endpoint yako ya PHP (POST /api/customers) ili kuhifadhi mteja mpya.');
    });
  }
});
