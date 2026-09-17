(function () {
  'use strict';

  const nav = document.querySelector('.belm-sidebar .belm-nav');
  const foot = document.querySelector('.belm-sidebar .belm-sidebar__foot');
  const topbarRight = document.querySelector('.belm-topbar .belm-topbar__right');
  const user = document.querySelector('.belm-topbar .belm-user');
  const hero = document.querySelector('.belm-hero');
  if (!nav || !foot) return;

  const icons = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    workshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14a8 8 0 0116 0"/><path d="M2 14h20"/><path d="M12 14V9"/><circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>',
    operator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="3"/><path d="M5 20c0-4 3-7 7-7s7 3 7 7"/><path d="M8 17h8M12 17v3"/></svg>',
    machines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l3-7h5l2 4h6l2 3"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg>',
    checklist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v2h6V3M9 10l1.7 1.7L14 8.3M9 16h6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/><path d="M20 4l1.2 1.2M20 8l1.6-.2"/></svg>',
    jobcards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a3 3 0 00-4.2 4.2L4 17v3h3l6.5-6.5a3 3 0 004.2-4.2l-2.4 2.4-2-2z"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>',
    procurement: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.5a2 2 0 002 1.5h8.4a2 2 0 002-1.6L21 7H6"/></svg>',
    finance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };

  const links = [
    ['/customer-admin-dashboard/', 'Dashboard', icons.dashboard, '', true],
    ['/customer-workshop-manager/', 'Workshop Manager', icons.workshop, 'workshop_manager'],
    ['/customer-operator-dashboard/', 'Machine Operator', icons.operator, 'operator'],
    ['/portal/dashboard?view=machines', 'Customer Machines', icons.machines],
    ['/portal/dashboard?view=machines&focus=daily-checklist', 'Daily Checklist', icons.checklist],
    ['/customer-users/', 'Roles & Users', icons.users],
    ['/breakdown-workflow/?actor=customer', 'Workshop & Job Cards', icons.jobcards, 'workshop_manager'],
    ['/customer-store-dashboard/', 'Spare Parts Inventory', icons.store, 'store_keeper'],
    ['/customer-procurement-dashboard/', 'Procurement', icons.procurement, 'procurement'],
    ['/customer-finance/', 'Finance & Accounts', icons.finance, 'accounts'],
    ['/general-analysis/?module=overview&analysisOnly=1', 'General Analysis', icons.reports],
    ['/customer-settings-center/', 'System Settings', icons.settings, 'settings']
  ];

  nav.innerHTML = links.map(function (entry) {
    const href = entry[0], label = entry[1], icon = entry[2], role = entry[3], active = entry[4];
    return '<a href="' + href + '" class="belm-nav__item' + (active ? ' is-active' : '') + '"' + (role ? ' data-customer-role="' + role + '"' : '') + '>' + icon + label + '</a>';
  }).join('');

  foot.innerHTML = '<button class="belm-nav__item" id="themeToggle" type="button">' + icons.theme + '<span id="themeLabel">Light mode</span></button>' +
    '<a href="/login" class="belm-nav__item" id="logout">' + icons.logout + 'Log out</a>';

  if (topbarRight && user && !document.querySelector('.belm-bell')) {
    const bell = document.createElement('button');
    bell.className = 'belm-bell';
    bell.type = 'button';
    bell.setAttribute('aria-label', 'Notifications');
    bell.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg><span class="belm-bell__badge" id="mainBellCount">0</span>';
    topbarRight.insertBefore(bell, user);
  }

  if (user) {
    const role = user.querySelector('.belm-user__role');
    if (role) role.textContent = 'CUSTOMER ADMIN · MAIN DASHBOARD';
    if (!user.querySelector('.belm-user__chev')) {
      user.insertAdjacentHTML('beforeend', '<svg class="belm-user__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>');
    }
  }

  if (hero) {
    const title = hero.querySelector('.belm-hero__title');
    if (title) title.textContent = 'Customer Main Dashboard';
    const aside = hero.querySelector('.belm-hero__aside');
    if (aside && !aside.querySelector('.belm-btn-gold')) {
      aside.insertAdjacentHTML('beforeend', '<a href="/customer-users/" class="belm-btn-gold">VIEW MY ROLE<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>');
    }
  }

  function setThemeLabel() {
    const label = document.getElementById('themeLabel');
    if (label) label.textContent = document.body.classList.contains('belm-light') ? 'Dark mode' : 'Light mode';
  }

  if (localStorage.getItem('belm-theme') === 'light') document.body.classList.add('belm-light');
  setThemeLabel();
  document.getElementById('themeToggle')?.addEventListener('click', function () {
    const light = document.body.classList.toggle('belm-light');
    localStorage.setItem('belm-theme', light ? 'light' : 'dark');
    setThemeLabel();
  });

  function syncBell() {
    const attention = parseInt(document.getElementById('statAttention')?.textContent || '0', 10) || 0;
    const approvals = parseInt(document.getElementById('statApprovals')?.textContent || '0', 10) || 0;
    const total = attention + approvals;
    const badge = document.getElementById('mainBellCount');
    if (badge) {
      badge.textContent = String(total);
      badge.style.display = total ? 'flex' : 'none';
    }
  }

  ['statAttention', 'statApprovals'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) new MutationObserver(syncBell).observe(el, { childList: true, characterData: true, subtree: true });
  });
  syncBell();
})();
