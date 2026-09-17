(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const actor = String(params.get('actor') || '').toLowerCase();
  if (actor !== 'customer' || params.get('embed') === '1') return;
  if (document.getElementById('belmAdminSidebar')) return;

  const customerToken = localStorage.getItem('belm_customer_token') || '';
  const techToken = localStorage.getItem('belm_tech_token') || '';
  const activeType = String(localStorage.getItem('belm_active_account_type') || '').toLowerCase();
  const token = activeType === 'technician' ? (techToken || customerToken) : (customerToken || techToken);
  if (!token) return;

  function decode(value) {
    try {
      let raw = String(value || '').split('.')[1] || '';
      raw = raw.replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return {}; }
  }

  const session = decode(token);
  const view = String(params.get('view') || 'job-cards').toLowerCase();
  const icon = function (inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  };
  const icons = {
    dashboard: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6"/>'),
    job: icon('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
    diagnosis: icon('<path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/>'),
    spares: icon('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    testing: icon('<path d="M20 6L9 17l-5-5"/><path d="M4 3h16v18H4z"/>'),
    reports: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
    history: icon('<path d="M3 12a9 9 0 109-9 9.4 9.4 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
    communication: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')
  };

  const pages = [
    { label: 'Inspection & Repair Dashboard', href: '/customer-inspection-repair/', icon: icons.dashboard },
    { label: 'Job Cards', href: '/breakdown-workflow/?actor=customer&view=job-cards', icon: icons.job, active: !params.has('view') || view === 'job-cards' },
    { label: 'Diagnosis', href: '/breakdown-workflow/?actor=customer&view=diagnosis', icon: icons.diagnosis, active: view === 'diagnosis' },
    { label: 'Waiting for Spares', href: '/customer-procurement-workspace/?view=queue', icon: icons.spares },
    { label: 'Testing & Completion', href: '/breakdown-workflow/?actor=customer&view=testing', icon: icons.testing, active: view === 'testing' },
    { label: 'Workshop Reports', href: '/general-analysis/?module=workshop&analysisOnly=1', icon: icons.reports },
    { label: 'Machine History', href: '/portal/dashboard?view=machines', icon: icons.history },
    { label: 'Communication', href: '/role-communications/', icon: icons.communication },
    { label: 'My Role Reports', href: '/role-reports/', icon: icons.reports }
  ];

  const sidebar = document.createElement('aside');
  sidebar.id = 'belmAdminSidebar';
  sidebar.className = 'belm-admin-sidebar';
  sidebar.setAttribute('aria-label', 'Customer Workshop Job Card menu');

  const brand = document.createElement('a');
  brand.className = 'belm-sidebar-brand';
  brand.href = '/customer-workshop-manager/';
  brand.setAttribute('aria-label', 'Back to Customer Workshop Dashboard');
  brand.innerHTML = '<span class="belm-sidebar-brand-mark" aria-hidden="true"><span>B</span></span>' +
    '<span class="belm-sidebar-brand-copy"><strong id="customerJobCardCompany">CUSTOMER WORKSHOP</strong>' +
    '<small>Customer Operations Portal</small><span class="belm-sidebar-brand-palette" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>';

  const userCard = document.createElement('div');
  userCard.className = 'belm-sidebar-user';
  const actorName = String(session.actorName || session.name || 'Workshop Manager').trim() || 'Workshop Manager';
  const initials = actorName.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join('') || 'WM';
  userCard.innerHTML = '<span class="belm-sidebar-user-avatar">' + initials + '</span>' +
    '<span class="belm-sidebar-user-copy"><strong>' + escapeHtml(actorName) + '</strong><span>Customer Workshop</span></span>';

  const moduleHeader = document.createElement('div');
  moduleHeader.className = 'belm-sidebar-module-head';
  moduleHeader.innerHTML = '<a href="/customer-workshop-manager/" class="belm-sidebar-back-main">← WORKSHOP DASHBOARD</a>' +
    '<small>WORKSHOP MENU</small><strong>Workshop &amp; Job Cards</strong>';

  const nav = document.createElement('nav');
  nav.className = 'belm-sidebar-nav belm-sidebar-nav-flat';
  pages.forEach(function (page) {
    const link = document.createElement('a');
    link.className = 'belm-sidebar-link' + (page.active ? ' active' : '');
    link.href = page.href;
    if (page.active) link.setAttribute('aria-current', 'page');
    link.innerHTML = '<span class="belm-sidebar-icon">' + page.icon + '</span><span>' + escapeHtml(page.label) + '</span>';
    link.addEventListener('click', function () { document.body.classList.remove('belm-sidebar-open'); });
    nav.appendChild(link);
  });

  const footer = document.createElement('div');
  footer.className = 'belm-sidebar-footer';
  const theme = document.createElement('button');
  theme.className = 'belm-sidebar-theme-toggle';
  theme.type = 'button';
  const updateThemeText = function () {
    theme.textContent = document.documentElement.dataset.theme === 'dark' ? '☀ Light mode' : '☾ Dark mode';
  };
  updateThemeText();
  theme.addEventListener('click', function () {
    if (window.BELMTheme && typeof window.BELMTheme.toggle === 'function') window.BELMTheme.toggle();
    else {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
    }
    window.setTimeout(updateThemeText, 0);
  });
  window.addEventListener('belm-theme-change', updateThemeText);

  const logout = document.createElement('button');
  logout.className = 'belm-sidebar-logout';
  logout.type = 'button';
  logout.textContent = 'Log out securely';
  logout.addEventListener('click', function () {
    ['belm_customer_token', 'belm_tech_token', 'belm_tech_user', 'belm_active_account_type', 'belm_session_refreshed_belm_customer_token'].forEach(function (key) {
      localStorage.removeItem(key);
    });
    location.assign('/login');
  });
  footer.append(theme, logout);

  sidebar.append(brand, userCard, moduleHeader, nav, footer);

  const toggle = document.createElement('button');
  toggle.className = 'belm-sidebar-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Open Customer Workshop Job Card menu');
  toggle.textContent = '☰';
  const scrim = document.createElement('button');
  scrim.className = 'belm-sidebar-scrim';
  scrim.type = 'button';
  scrim.setAttribute('aria-label', 'Close Customer Workshop Job Card menu');
  const close = function () { document.body.classList.remove('belm-sidebar-open'); };
  toggle.addEventListener('click', function () { document.body.classList.toggle('belm-sidebar-open'); });
  scrim.addEventListener('click', close);

  document.body.prepend(scrim);
  document.body.prepend(sidebar);
  document.body.prepend(toggle);
  document.body.classList.add('belm-sidebar-ready', 'belm-module-workshop', 'customer-job-card-belm-mirror');

  const topbar = document.querySelector('body > .topbar');
  if (topbar) {
    const eyebrow = topbar.querySelector('p');
    if (eyebrow) eyebrow.textContent = 'CUSTOMER WORKSHOP';
  }

  if (view === 'testing') applySearchFilter('testing');
  if (view === 'diagnosis') applySearchFilter('diagnosis');

  loadCompany();

  function applySearchFilter(term) {
    let tries = 0;
    const timer = window.setInterval(function () {
      tries += 1;
      const box = document.getElementById('searchBox');
      if (box) {
        box.value = term;
        box.dispatchEvent(new Event('input', { bubbles: true }));
        window.clearInterval(timer);
      } else if (tries > 30) window.clearInterval(timer);
    }, 100);
  }

  async function loadCompany() {
    try {
      const response = await fetch('/api/customer-portal/dashboard', { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) return;
      const data = await response.json();
      const name = data && data.customer && data.customer.name ? String(data.customer.name) : '';
      if (!name) return;
      const company = document.getElementById('customerJobCardCompany');
      if (company) company.textContent = name.toUpperCase();
      const copy = userCard.querySelector('.belm-sidebar-user-copy span');
      if (copy) copy.textContent = name + ' · Workshop';
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
})();
