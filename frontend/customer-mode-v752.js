(function () {
  'use strict';
  if (window.__belmCustomerMode752) return;
  window.__belmCustomerMode752 = true;

  const token = localStorage.getItem('belm_customer_token') || '';
  if (!token) return;

  function decodeToken(value) {
    try {
      let raw = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    } catch (_) { return {}; }
  }

  const session = decodeToken(token);
  const role = String(session.customerRole || (session.actorType === 'owner' ? 'owner' : 'assistant')).trim().toLowerCase();

  async function api(path) {
    const response = await fetch(path, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function roleDestination(mode) {
    const roles = Array.isArray(mode.roles) ? mode.roles : [];
    const aliases = {
      owner: 'customer_admin',
      admin: 'customer_admin',
      customer_admin: 'customer_admin',
      workshop_manager: 'workshop_manager',
      technician: 'technician',
      operator: 'operator',
      procurement: 'procurement',
      store_keeper: 'store_keeper',
      accounts: 'accounts',
      finance: 'accounts',
      accountant: 'accounts'
    };
    const wanted = aliases[role] || 'customer_admin';
    const entry = roles.find((item) => item.key === wanted);
    if (!entry) return { href: '/customer-admin-dashboard/', label: 'CUSTOMER PORTAL', enabled: true };
    if (!entry.enabled) {
      return {
        href: '/portal-cwm/',
        label: `${entry.label} · LOCKED`,
        enabled: false,
        scope: entry.scope
      };
    }
    return { href: entry.dashboard, label: entry.label, enabled: true, scope: entry.scope };
  }

  function ensureStyle() {
    if (document.getElementById('customerMode752Style')) return;
    const style = document.createElement('style');
    style.id = 'customerMode752Style';
    style.textContent = `
      .belm-customer-mode-v752{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:10px 0 0}
      .belm-customer-mode-v752 .mode-pill{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;border:1px solid #2f678d;background:#0a2d49;color:#d9edff;font-size:10px;font-weight:900;letter-spacing:.04em}
      .belm-customer-mode-v752 .mode-pill.independent{border-color:#2d9a66;background:#123c2b;color:#98efbd}
      .belm-customer-mode-v752 .mode-pill.provider{border-color:#daa31b;background:#3a2d0a;color:#ffe083}
      .belm-customer-mode-v752 .restriction{font-size:10px;color:#9db6ca;font-weight:750}
      .belm-customer-mode-card-v752{margin:0 0 18px;padding:14px 16px;border:1px solid #2d5877;border-radius:14px;background:#09223a;color:#eef7ff}
      .belm-customer-mode-card-v752 strong{display:block;font-size:15px;margin-bottom:4px}.belm-customer-mode-card-v752 p{margin:0;color:#a8bfd2;font-size:11px;line-height:1.5}
      .belm-customer-mode-card-v752.provider{border-color:#84691e;background:#2c260f}.belm-customer-mode-card-v752.independent{border-color:#277850;background:#0e3024}
      .cwm-enter-role-v672[data-role-locked="1"]{opacity:.62;filter:saturate(.55)}
      .customer-quick-locked-v752{position:relative!important;opacity:.48!important;filter:saturate(.4)!important;cursor:not-allowed!important}
      .customer-quick-locked-v752::after{content:'🔒';position:absolute;right:12px;top:10px;font-size:13px}
    `;
    document.head.appendChild(style);
  }

  function quickRoleAccess(mode) {
    const aliases = { owner:'customer_admin', admin:'customer_admin', customer_admin:'customer_admin', workshop_manager:'workshop_manager', technician:'technician', operator:'operator', procurement:'procurement', store_keeper:'store_keeper', accounts:'accounts', finance:'accounts', accountant:'accounts' };
    const current = aliases[role] || 'customer_admin';
    const grants = {
      customer_admin: new Set(['machines','jobcards','procurement','store','reports','users','settings']),
      workshop_manager: new Set(['machines','jobcards','procurement','store','reports']),
      technician: new Set(['machines','jobcards','reports']),
      operator: new Set(['machines','reports']),
      procurement: new Set(['procurement','reports']),
      store_keeper: new Set(['store','procurement','reports']),
      accounts: new Set(['reports']),
    };
    const enabled = new Map((mode.roles || []).map((item) => [item.key, !!item.enabled]));
    const roleRequirement = { procurement:'procurement', store:'store_keeper', jobcards:'workshop_manager', machines:null, reports:null, users:'customer_admin', settings:'customer_admin' };
    document.querySelectorAll('.cwm-quick-grid-v556 a').forEach((link) => {
      const href = link.getAttribute('href') || '';
      let key = '';
      if (href.includes('view=machines')) key='machines';
      else if (href.includes('customer-job-card')) key='jobcards';
      else if (href.includes('procurement')) key='procurement';
      else if (href.includes('customer-store')) key='store';
      else if (href.includes('general-report')) key='reports';
      else if (href.includes('customer-users')) key='users';
      else if (href.includes('customer-settings')) key='settings';
      if (!key) return;
      const requirement = roleRequirement[key];
      const modeAllowed = requirement ? (enabled.has(requirement) ? enabled.get(requirement) : true) : true;
      const roleAllowed = grants[current]?.has(key) || false;
      if (!modeAllowed || !roleAllowed) {
        link.classList.add('customer-quick-locked-v752');
        link.setAttribute('aria-disabled','true');
        link.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          alert(!modeAllowed ? 'This function is unavailable in the current customer service mode.' : 'This function is locked for your assigned customer role.');
        }, true);
      }
    });
  }

  function applyPortalHome(mode) {
    const action = roleDestination(mode);
    const link = document.querySelector('.cwm-enter-role-v672');
    if (link) {
      link.href = action.href;
      link.dataset.roleLocked = action.enabled ? '0' : '1';
      const small = link.querySelector('small');
      const note = link.querySelector('em');
      if (small) small.textContent = action.label.toUpperCase();
      if (note) note.textContent = action.enabled ? (action.scope || 'Open assigned role dashboard') : (action.scope || 'Role unavailable in this service mode');
      if (!action.enabled) link.onclick = (event) => { event.preventDefault(); alert(action.scope || 'This role is locked in the current service mode.'); };
    }

    const hero = document.querySelector('.cwm-home-hero-v556');
    if (hero && !hero.querySelector('.belm-customer-mode-v752')) {
      const bar = document.createElement('div');
      bar.className = 'belm-customer-mode-v752';
      const independent = Boolean(mode.mode?.customerIndependent);
      bar.innerHTML = `<span class="mode-pill ${independent ? 'independent' : 'provider'}">${independent ? 'CUSTOMER INDEPENDENT WORKSHOP' : 'BELM SERVICE PROVIDER'}</span><span class="restriction">No Bank Controller · No BELM spare-part selling</span>`;
      hero.appendChild(bar);
    }

    const quick = document.querySelector('.cwm-quick-grid-v556');
    if (quick && !quick.querySelector('[data-customer-system-settings]')) {
      const settings = document.createElement('a');
      settings.href = '/customer-settings-center/';
      settings.dataset.customerSystemSettings = '1';
      settings.innerHTML = '<i>⚙</i><b>SYSTEM SETTINGS</b><small>Customer-level setup & access</small><span>›</span>';
      quick.appendChild(settings);
    }
    quickRoleAccess(mode);
  }

  function applySettings(mode) {
    const shell = document.querySelector('.settings-shell');
    const grid = document.querySelector('.settings-grid');
    if (shell && grid && !document.querySelector('.belm-customer-mode-card-v752')) {
      const independent = Boolean(mode.mode?.customerIndependent);
      const card = document.createElement('section');
      card.className = `belm-customer-mode-card-v752 ${independent ? 'independent' : 'provider'}`;
      card.innerHTML = independent
        ? '<strong>Customer Independent Workshop</strong><p>Your company manages its own workshop roles, Technician team, machines, procurement, store, finance, reports and customer-level settings. Bank Controller and BELM spare-part selling are not part of the customer system.</p>'
        : '<strong>BELM Service Provider</strong><p>Your company keeps Administration, Operator, Procurement, Store, Finance and Reports. Customer Technician is disabled while BELM handles technical service. Bank Controller and BELM spare-part selling remain unavailable.</p>';
      grid.parentNode.insertBefore(card, grid);
    }

    const save = document.getElementById('saveButton');
    const status = document.getElementById('status');
    if (save && mode.customerSettings && mode.customerSettings.canEdit === false) {
      save.disabled = true;
      save.title = 'Only Customer Owner / Company Admin can edit company settings.';
      if (status) status.textContent = 'View only — Customer Owner / Company Admin controls company settings.';
      document.querySelectorAll('[data-toggle],#waNumber,#waGroup,#emailFrom,#replyTo,#managementEmails').forEach((el) => { el.disabled = true; });
    }
  }

  function applyUserCenter(mode) {
    const independent = Boolean(mode.mode?.customerIndependent);
    const technicianOption = document.querySelector('#role option[value="technician"]');
    if (technicianOption) {
      technicianOption.disabled = !independent || !mode.mode?.customerTechnicianEnabled;
      technicianOption.textContent = independent && mode.mode?.customerTechnicianEnabled
        ? 'Technician — Customer Workshop'
        : 'Technician — BELM Service Provider active';
    }
    document.querySelectorAll('option[value="accounts"]').forEach((option) => { option.textContent = 'Finance / Accounts'; });
    document.querySelectorAll('.badge.accounts').forEach((badge) => { badge.textContent = 'Finance / Accounts'; });
  }

  async function boot() {
    ensureStyle();
    try {
      const mode = await api('/api/customer_mode.php');
      const apply = () => {
        if (location.pathname.startsWith('/portal-cwm')) applyPortalHome(mode);
        if (location.pathname.startsWith('/customer-settings-center')) applySettings(mode);
        if (location.pathname.startsWith('/customer-users')) applyUserCenter(mode);
      };
      apply();
      const observer = new MutationObserver(apply);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 12000);
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
