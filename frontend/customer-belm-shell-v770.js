(function () {
  'use strict';
  // V770 CUSTOMER BELM-SHELL PORT
  // Copies the exact visual system used by the BELM Admin Home dashboard
  // (concept-dashboards/01-admin-home — navy/gold, .belm-shell/.belm-sidebar/
  // .belm-topbar, customer-belm-shell-v770.css) onto every customer-* page,
  // so BELM and Customer dashboards finally look like the same product.
  // Pure DOM wrap: nothing already on the page is removed, renamed or
  // restyled — this only adds the sidebar/topbar chrome around it.
  if (window.__belmCustomerShellV770) return;
  window.__belmCustomerShellV770 = true;

  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    workshop: '<path d="M4 14a8 8 0 0116 0"/><path d="M2 14h20"/><path d="M12 14V9"/><circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none"/>',
    users: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/>',
    box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.5a2 2 0 002 1.5h8.4a2 2 0 002-1.6L21 7H6"/>',
    finance: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    machine: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.6"/><path d="M2.5 20c0-3.3 2.5-5.6 5.5-5.6s5.5 2.3 5.5 5.6M14.5 20c0-2.4-1-4.3-2.6-5.3.7-.5 1.6-.7 2.6-.7 2.7 0 5 2.1 5 4.9"/>'
  };

  var NAV = [
    { label: 'Dashboard', href: '/customer-admin-dashboard/', match: '/customer-admin-dashboard/', icon: 'home' },
    { label: 'Customer Machines', href: '/portal/dashboard?view=machines', match: '/portal/dashboard', icon: 'machine' },
    { label: 'Workshop Manager', href: '/customer-workshop/?actor=customer', match: '/customer-workshop/', icon: 'workshop' },
    { label: 'Roles & Users', href: '/customer-users/', match: '/customer-users/', icon: 'users' },
    { label: 'Procurement', href: '/customer-procurement-dashboard/', match: '/customer-procurement-dashboard/', icon: 'cart' },
    { label: 'Store Keeper', href: '/customer-store-dashboard/', match: '/customer-store-dashboard/', icon: 'box' },
    { label: 'Finance / Accounts', href: '/customer-finance/', match: '/customer-finance/', icon: 'finance' },
    { label: 'System Settings', href: '/customer-settings-center/', match: '/customer-settings-center/', icon: 'settings' }
  ];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function decodeToken(value) {
    try {
      var raw = value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      raw += '='.repeat((4 - raw.length % 4) % 4);
      return JSON.parse(decodeURIComponent(Array.from(atob(raw)).map(function (c) {
        return '%' + c.charCodeAt(0).toString(16).padStart(2, '0');
      }).join('')));
    } catch (_) { return {}; }
  }

  function ensureStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }

  function ensureOverrideStyle() {
    // Give the shell the same navy canvas as BELM Admin Home, WITHOUT the
    // body-level text-colour reset belm-admin-dashboard.css normally applies
    // (that reset assumes every element on the page sets its own colour,
    // which the wrapped page's existing markup was never written to expect).
    // Sidebar and topbar keep their real navy/gold look either way since
    // those rules set their own backgrounds directly, not via inheritance.
    if (document.getElementById('csxBelmShellV770Style')) return;
    var s = document.createElement('style');
    s.id = 'csxBelmShellV770Style';
    s.textContent =
      'body{margin:0;font-family:"Inter","Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif}' +
      '.belm-shell{background:var(--belm-navy-900)}' +
      '.belm-content{min-width:0}';
    document.head.appendChild(s);
  }

  function svgIcon(key) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (ICONS[key] || ICONS.home) + '</svg>';
  }

  function buildSidebar(companyName) {
    var path = location.pathname.replace(/\/?$/, '/');
    var aside = document.createElement('aside');
    aside.className = 'belm-sidebar';
    var navHtml = NAV.map(function (item) {
      var isActive = path.indexOf(item.match) === 0;
      return '<a class="belm-nav__item' + (isActive ? ' is-active' : '') + '" href="' + item.href + '">' +
        svgIcon(item.icon) + esc(item.label) + '</a>';
    }).join('');
    aside.innerHTML =
      '<div class="belm-brand"><svg class="belm-brand__mark" viewBox="0 0 716 716" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399Z" fill="#F5C518"/></svg>' +
      '<div class="belm-brand__text"><div class="belm-brand__name">' + esc((companyName || 'CUSTOMER').toUpperCase()) + '</div><div class="belm-brand__tag">OPERATIONS PORTAL</div></div></div>' +
      '<nav class="belm-nav">' + navHtml + '</nav>' +
      '<div class="belm-nav__divider"></div>' +
      '<div class="belm-sidebar__foot">' +
      '<a class="belm-nav__item" href="/login" id="csxLogout770">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>Log out</a>' +
      '</div>';
    return aside;
  }

  function buildTopbar(companyName) {
    var header = document.createElement('header');
    header.className = 'belm-topbar';
    header.innerHTML =
      '<button class="belm-topbar__menu" id="csxSidebarToggle770" type="button" aria-label="Toggle menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>' +
      '<div class="belm-topbar__right"><div class="belm-user"><div class="belm-user__avatar"><svg viewBox="0 0 716 716" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399Z" fill="#F5C518"/></svg></div>' +
      '<div><div class="belm-user__name">' + esc((companyName || 'CUSTOMER').toUpperCase()) + '</div><div class="belm-user__role">CUSTOMER PORTAL</div></div></div></div>';
    return header;
  }

  function wrap() {
    if (document.querySelector('.belm-shell')) return; // already has this shell or v753/v760 shell
    if (document.querySelector('.cm-side') || document.querySelector('.csx-shell')) return; // older shell present, leave it
    if (!document.body || !document.body.children.length) return;

    var token = localStorage.getItem('belm_customer_token') || '';
    var companyName = 'Customer';
    if (token) {
      var session = decodeToken(token);
      companyName = (session.customerName || session.companyName || session.name || 'Customer');
    }

    ensureStylesheet('/customer-belm-shell-v770.css');
    ensureOverrideStyle();

    var shell = document.createElement('div');
    shell.className = 'belm-shell';
    shell.id = 'belmShell';

    var main = document.createElement('div');
    main.className = 'belm-main';

    var content = document.createElement('main');
    content.className = 'belm-content';
    while (document.body.firstChild) {
      content.appendChild(document.body.firstChild);
    }

    main.appendChild(buildTopbar(companyName));
    main.appendChild(content);

    shell.appendChild(buildSidebar(companyName));
    shell.appendChild(main);
    document.body.appendChild(shell);

    document.getElementById('csxSidebarToggle770')?.addEventListener('click', function () {
      shell.classList.toggle('is-sidebar-open');
    });
    document.getElementById('csxLogout770')?.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.removeItem('belm_customer_token');
      location.replace('/login');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap, { once: true });
  } else {
    wrap();
  }
})();
