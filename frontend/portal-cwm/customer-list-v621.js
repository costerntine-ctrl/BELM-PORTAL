(function () {
  const customerToken = localStorage.getItem('belm_customer_token') || '';
  if (customerToken) return;

  const adminToken = localStorage.getItem('belm_admin_token') || '';
  const grid = document.getElementById('cwmCardGrid');
  const search = document.getElementById('cwmSearch');
  if (!grid || !adminToken) return;

  let customers = [];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  async function loadCustomers() {
    const response = await fetch('/api/customers?action=cwm-overview', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    customers = Array.isArray(data) ? data : [];
    render(search?.value || '');
  }

  function card(customer) {
    const id = customer.id || '';
    const name = customer.name || 'Customer';
    const href = `/customer-workshop/?actor=belm&customerId=${encodeURIComponent(id)}`;
    return `<article class="cwm-welcome-card cwm-list-card-v621" data-customer-card="${escapeHtml(id)}">
      <div class="cwm-welcome-copy"><p class="cwm-welcome-kicker">CUSTOMER WORKSHOP</p><h2>${escapeHtml(name.toUpperCase())}</h2></div>
      <div class="cwm-welcome-details">
        <div><span>ADDRESS:</span><b>${escapeHtml(customer.address || 'Not recorded')}</b></div>
        <div><span>EMAIL:</span><b>${escapeHtml(customer.email || 'Not recorded')}</b></div>
        <div><span>PHONE:</span><b>${escapeHtml(customer.phone || 'Not recorded')}</b></div>
      </div>
      <a class="cwm-open-workshop" href="${href}">OPEN WORKSHOP</a>
    </article>`;
  }

  function render(value) {
    const needle = String(value || '').trim().toLowerCase();
    const rows = customers.filter((customer) => {
      if (!needle) return true;
      return [customer.name, customer.address, customer.email, customer.phone]
        .some((field) => String(field || '').toLowerCase().includes(needle));
    });
    grid.innerHTML = rows.length ? rows.map(card).join('') : '<p class="muted">No customer record found.</p>';
  }

  search?.addEventListener('input', (event) => render(event.target.value));
  window.addEventListener('load', () => setTimeout(loadCustomers, 0), { once: true });
})();
