(function () {
  'use strict';
  const token = localStorage.getItem('belm_customer_token') || '';
  if (!token) { location.replace('/login'); return; }

  async function api(path) {
    const res = await fetch('/api/customer-portal' + path, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('belm_customer_token'); location.replace('/login'); }
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function load() {
    try {
      const [dash, stats] = await Promise.all([api('/dashboard'), api('/workshop-manager-stats')]);
      const companyName = dash?.customer?.name || 'Customer';
      document.querySelectorAll('[data-company-name-upper]').forEach((el) => { el.textContent = companyName.toUpperCase(); });

      document.getElementById('statOpen').textContent = stats.openJobCards ?? '—';
      document.getElementById('statProgress').textContent = stats.inProgress ?? '—';
      document.getElementById('statSpare').textContent = stats.waitingForSpare ?? '—';
      document.getElementById('statCompleted').textContent = stats.completedThisMonth ?? '—';
      document.getElementById('statOverdue').textContent = stats.overdue ?? '—';
    } catch (e) {
      ['statOpen', 'statProgress', 'statSpare', 'statCompleted', 'statOverdue'].forEach((id) => {
        document.getElementById(id).textContent = '—';
      });
      console.error(e);
    }
  }

  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('belm_customer_token');
    location.replace('/login');
  });

  load();
})();
