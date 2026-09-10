document.addEventListener('DOMContentLoaded', function () {
  var shell = document.getElementById('belmShell');
  var sidebarToggle = document.getElementById('sidebarToggle');
  var themeToggle = document.getElementById('themeToggle');
  var token = localStorage.getItem('belm_admin_token') || '';

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

  function ensureRequestAlertStyle() {
    if (document.getElementById('belm-workshop-request-alert-style')) return;
    var style = document.createElement('style');
    style.id = 'belm-workshop-request-alert-style';
    style.textContent = '@keyframes belmReqBlink{0%,100%{box-shadow:0 0 0 0 rgba(232,163,23,.65)}50%{box-shadow:0 0 0 7px rgba(232,163,23,0)}}.belm-request-blink{position:relative;border:1px solid #e8a317!important;animation:belmReqBlink 1.05s infinite}.belm-request-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;margin-left:auto;border-radius:999px;background:#e8a317;color:#221900;font-weight:900;font-size:11px}';
    document.head.appendChild(style);
  }

  async function syncWorkshopRequests() {
    if (!token) return;
    try {
      var response = await fetch('/api/workshop_material_requests.php?action=pending', { cache:'no-store', headers:{ Authorization:'Bearer ' + token } });
      if (!response.ok) return;
      var data = await response.json();
      var count = Number(data.blinkCount || 0);
      document.querySelectorAll('a[href*="spare-purchase-requests.php"]').forEach(function (link) {
        link.href = '/workshop-requests/?source=procurement';
        var badge = link.querySelector('.belm-request-count');
        if (count > 0) {
          ensureRequestAlertStyle();
          link.classList.add('belm-request-blink');
          if (!badge) { badge = document.createElement('span'); badge.className = 'belm-request-count'; link.appendChild(badge); }
          badge.textContent = String(count);
          link.title = count + ' new Workshop Material Request' + (count === 1 ? '' : 's');
        } else {
          link.classList.remove('belm-request-blink');
          if (badge) badge.remove();
        }
      });
    } catch (_) {}
  }

  syncWorkshopRequests();
  setInterval(syncWorkshopRequests, 30000);
});
