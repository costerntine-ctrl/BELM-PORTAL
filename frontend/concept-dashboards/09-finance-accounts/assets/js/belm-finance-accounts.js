document.addEventListener('DOMContentLoaded', function () {
  function updateClock() {
    var dateEl = document.getElementById('liveDate');
    var timeEl = document.getElementById('liveTime');
    if (!dateEl || !timeEl) return;
    var now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function wireFocusedFinanceRoutes() {
    document.querySelectorAll('a[href]').forEach(function (link) {
      var text = String(link.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      var href = link.getAttribute('href') || '';

      if (text === 'create invoice' || text === 'invoices & proforma' || text === 'invoices') {
        if (text === 'create invoice' || /invoices-proforma\.html(?:\?|$)/.test(href)) {
          link.href = '/invoice-manager/';
        }
      }

      if (text === 'view all' && link.closest('.panel') && /invoices-proforma\.html/.test(href)) {
        link.href = '/invoice-manager/';
      }
    });
  }

  updateClock();
  wireFocusedFinanceRoutes();
  setInterval(updateClock, 30000);
});
