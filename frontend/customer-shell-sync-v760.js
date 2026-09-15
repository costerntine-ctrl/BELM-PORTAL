(function () {
  'use strict';
  // V760 CUSTOMER SHELL SYNC
  // Purpose: give every customer-* page the SAME sidebar navigation, brand
  // header and colour language already used on the 4 v753 role-hub pages
  // (customer-admin-dashboard, customer-finance, customer-procurement-dashboard,
  // customer-store-dashboard), WITHOUT touching that page's own markup, ids,
  // classes or scripts. This is a pure DOM wrap: nothing existing is removed,
  // renamed or restyled. Safe to include on any customer-* page.
  if (window.__belmCustomerShellSyncV760) return;
  window.__belmCustomerShellSyncV760 = true;

  // Pages that already have the v753 shell (.cm-side present) get skipped
  // automatically below. This script is meant for every OTHER customer page.

  var NAV = [
    { label: 'Dashboard', href: '/customer-admin-dashboard/', match: '/customer-admin-dashboard/' },
    { label: 'Customer Machines', href: '/portal/dashboard?view=machines', match: '/portal/dashboard' },
    { label: 'Workshop Manager', href: '/customer-workshop/?actor=customer', match: '/customer-workshop/', role: 'workshop_manager' },
    { label: 'Roles & Users', href: '/customer-users/', match: '/customer-users/' },
    { label: 'Procurement', href: '/customer-procurement-dashboard/', match: '/customer-procurement-dashboard/', role: 'procurement' },
    { label: 'Store Keeper', href: '/customer-store-dashboard/', match: '/customer-store-dashboard/', role: 'store_keeper' },
    { label: 'Finance / Accounts', href: '/customer-finance/', match: '/customer-finance/', role: 'accounts' },
    { label: 'Reports & Analysis', href: '/general-report/', match: '/general-report/' },
    { label: 'System Settings', href: '/customer-settings-center/', match: '/customer-settings-center/', role: 'settings' }
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
    if (document.getElementById('csxShellSyncV760Style')) return;
    var s = document.createElement('style');
    s.id = 'csxShellSyncV760Style';
    // Layout-only overrides. No colour/background rules here on purpose:
    // the wrapped page keeps 100% control of its own look.
    s.textContent =
      '.csx-shell{display:grid;grid-template-columns:270px minmax(0,1fr);min-height:100vh}' +
      '.csx-page{min-width:0}' +
      '@media(max-width:900px){.csx-shell{grid-template-columns:1fr}.csx-shell>.cm-side{display:none}}';
    document.head.appendChild(s);
  }

  function buildSidebar(companyName) {
    var path = location.pathname.replace(/\/?$/, '/');
    var aside = document.createElement('aside');
    aside.className = 'cm-side';
    var navHtml = NAV.map(function (item) {
      var isActive = path.indexOf(item.match) === 0;
      return '<a' + (isActive ? ' class="active"' : '') + ' href="' + item.href + '"' +
        (item.role ? ' data-customer-role="' + item.role + '"' : '') + '>' + esc(item.label) + '</a>';
    }).join('');
    aside.innerHTML =
      '<div class="cm-brand"><span>' + esc((companyName || 'COMPANY').toUpperCase()) + '</span><small>OPERATIONS PORTAL</small></div>' +
      '<div class="cm-company"><span>REGISTERED CUSTOMER</span><b>' + esc(companyName || 'Customer') + '</b></div>' +
      '<nav class="cm-nav">' + navHtml + '</nav>' +
      '<div class="cm-foot"><nav class="cm-nav"><a href="/portal-cwm/">Company Home</a><a href="/login" id="csxLogout760">Log out</a></nav></div>';
    return aside;
  }

  function wrap() {
    // Don't double-wrap, and don't touch pages that already ship the v753 shell.
    if (document.querySelector('.cm-side') || document.querySelector('.csx-shell')) return;
    if (!document.body || !document.body.children.length) return;

    var token = localStorage.getItem('belm_customer_token') || '';
    var companyName = 'Customer';
    if (token) {
      var session = decodeToken(token);
      companyName = (session.customerName || session.companyName || session.name || 'Customer');
    }

    ensureStylesheet('/customer-role-mirror-v753.css');
    ensureOverrideStyle();

    var shell = document.createElement('div');
    shell.className = 'csx-shell';

    var page = document.createElement('div');
    page.className = 'csx-page';
    // Move every existing body child into the new wrapper, in order,
    // without altering any of them.
    while (document.body.firstChild) {
      page.appendChild(document.body.firstChild);
    }

    shell.appendChild(buildSidebar(companyName));
    shell.appendChild(page);
    document.body.appendChild(shell);

    var logout = document.getElementById('csxLogout760');
    if (logout) {
      logout.addEventListener('click', function (e) {
        e.preventDefault();
        localStorage.removeItem('belm_customer_token');
        location.replace('/login');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wrap, { once: true });
  } else {
    wrap();
  }
})();
