(function () {
  'use strict';

  const ROLE_ORDER = [
    'workshop_manager',
    'technician',
    'operator',
    'store_keeper',
    'procurement',
    'accounts',
  ];
  const MODERN_ROLES = new Set(ROLE_ORDER);
  const ROLE_META = {
    workshop_manager: { label: 'Workshop Manager', group: 'workshop', note: 'Plans work, assigns technicians and supervises maintenance.' },
    technician: { label: 'Technician', group: 'workshop', note: 'Diagnosis, repair, testing and Job Card progress.' },
    operator: { label: 'Machine Operator', group: 'workshop', note: 'Daily machine operation, checks, fuel and problem reporting.' },
    store_keeper: { label: 'Store Keeper', group: 'support', note: 'Stock, spare parts, tools, issue and receiving records.' },
    procurement: { label: 'Procurement', group: 'support', note: 'Spare purchasing, suppliers, proforma and delivery tracking.' },
    accounts: { label: 'Finance / Accounts', group: 'support', note: 'Invoices, payments, expenses, VAT and financial records.' },
  };

  const roleSelect = document.getElementById('role');
  const form = document.getElementById('userForm');
  const accountKind = document.getElementById('accountKind');
  const userId = document.getElementById('userId');
  const errorBox = document.getElementById('formError');

  const compactStyle = document.createElement('style');
  compactStyle.id = 'customerRoleLayoutV784';
  compactStyle.textContent = `
    .share-link-row{align-items:flex-start!important;gap:12px!important}
    .share-link{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:'copy button' 'link button'!important;align-items:center!important;gap:8px 14px!important;min-height:0!important;height:auto!important;padding:14px 16px!important;max-width:760px!important}
    .share-link>div{grid-area:copy!important}
    .share-link code{grid-area:link!important;display:block!important;min-width:0!important;margin:0!important;padding:0!important;font-size:11px!important;line-height:1.4!important}
    .share-link #copyLinkButton{grid-area:button!important;align-self:center!important;margin:0!important;min-height:38px!important;padding:8px 13px!important}

    #roleCards.role-cards-v784{display:block!important;padding:18px 20px 22px!important}
    .role-group-v784+.role-group-v784{margin-top:22px;padding-top:20px;border-top:1px solid var(--line)}
    .role-group-head-v784{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:0 0 12px}
    .role-group-head-v784 h3{margin:0;color:var(--navy);font-size:14px;letter-spacing:.02em}
    .role-group-head-v784 p{margin:3px 0 0;color:var(--muted);font-size:10.5px;line-height:1.45}
    .role-group-count-v784{flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#edf3f8;color:#39556d;font-size:10px;font-weight:900}
    .role-grid-v784{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .role-grid-v784 .role-card{min-height:145px;padding:16px!important;border-radius:14px!important;position:relative;overflow:hidden}
    .role-grid-v784 .role-card:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--yellow),var(--green))}
    .role-grid-v784 .role-card-head{margin:4px 0 8px!important}
    .role-grid-v784 .role-card-head strong{font-size:26px!important}
    .role-note-v784{margin:0 0 10px;color:var(--muted);font-size:10.5px;line-height:1.45}
    .role-grid-v784 .role-card ul{margin-top:8px!important}
    .role-grid-v784 .role-card li{font-size:11px!important}
    .role-grid-v784 .empty-role{margin-top:8px!important;padding:8px 0!important;text-align:left!important}
    .badge.workshop_manager,.badge.technician,.badge.operator,.badge.store_keeper,.badge.procurement,.badge.accounts{font-size:9px!important;letter-spacing:.02em}
    .badge.workshop_manager{color:#0a4b83;background:#e5f2ff}
    .badge.technician{color:#005f50;background:#def8f1}
    .badge.operator{color:#087039;background:#e7f8ee}
    .badge.store_keeper{color:#315b36;background:#e8f4e8}
    .badge.procurement{color:#735b00;background:#fff4bd}
    .badge.accounts{color:#8a4b00;background:#fff0df}

    @media(max-width:900px){.role-grid-v784{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){
      .share-link-row{display:block!important}
      .share-link{grid-template-columns:1fr auto!important;grid-template-areas:'copy copy' 'link button'!important;width:100%!important;max-width:none!important;padding:13px 14px!important}
      .share-link #copyLinkButton{min-width:92px!important}
      .access-legend{max-width:none!important;margin-top:12px!important}
      .role-grid-v784{grid-template-columns:1fr}
      .role-group-head-v784{align-items:flex-start;flex-direction:column}
    }
  `;
  document.head.appendChild(compactStyle);

  function removeLegacyOptionsAndOrderRoles() {
    if (!roleSelect) return;
    [...roleSelect.options].forEach((option) => {
      if (!MODERN_ROLES.has(option.value)) option.remove();
    });

    ROLE_ORDER.forEach((role) => {
      const option = roleSelect.querySelector(`option[value="${role}"]`);
      if (!option) return;
      const meta = ROLE_META[role];
      if (role !== 'technician' || (!/LOCKED|Workspace/i.test(option.textContent || ''))) {
        option.textContent = meta.label;
      }
      roleSelect.appendChild(option);
    });
  }

  function roleKeyFromCard(card) {
    const badge = card.querySelector('.badge');
    if (!badge) return '';
    return ROLE_ORDER.find((key) => badge.classList.contains(key)) || '';
  }

  function normalizeRoleCard(card, roleKey) {
    const badge = card.querySelector('.badge');
    if (badge && roleKey !== 'technician') badge.textContent = ROLE_META[roleKey].label;
    if (badge && roleKey === 'technician' && !/Technician/i.test(badge.textContent || '')) badge.textContent = 'Technician';

    let note = card.querySelector('.role-note-v784');
    if (!note) {
      note = document.createElement('p');
      note.className = 'role-note-v784';
      const head = card.querySelector('.role-card-head');
      if (head) head.insertAdjacentElement('afterend', note);
    }
    note.textContent = ROLE_META[roleKey].note;
    card.dataset.roleKey = roleKey;
  }

  let arranging = false;
  function arrangeRoleCards() {
    const container = document.getElementById('roleCards');
    if (!container || arranging) return;
    const cards = [...container.querySelectorAll(':scope > .role-card')];
    if (!cards.length) return;

    arranging = true;
    const byRole = {};
    cards.forEach((card) => {
      const key = roleKeyFromCard(card);
      if (key) {
        normalizeRoleCard(card, key);
        byRole[key] = card;
      }
    });

    const groups = [
      {
        key: 'workshop',
        title: 'Workshop Operations',
        subtitle: 'People directly responsible for machine operation, diagnosis, repair and completion.',
        roles: ['workshop_manager', 'technician', 'operator'],
      },
      {
        key: 'support',
        title: 'Support Departments',
        subtitle: 'Departments supporting workshop execution with stock, purchasing and financial control.',
        roles: ['store_keeper', 'procurement', 'accounts'],
      },
    ];

    container.innerHTML = '';
    container.classList.add('role-cards-v784');
    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'role-group-v784';
      section.dataset.roleGroup = group.key;
      const activeCards = group.roles.map((role) => byRole[role]).filter(Boolean);
      section.innerHTML = `<div class="role-group-head-v784"><div><h3>${group.title}</h3><p>${group.subtitle}</p></div><span class="role-group-count-v784">${activeCards.length} roles</span></div><div class="role-grid-v784"></div>`;
      const grid = section.querySelector('.role-grid-v784');
      activeCards.forEach((card) => grid.appendChild(card));
      container.appendChild(section);
    });
    arranging = false;
  }

  function analysisRank(text) {
    const value = String(text || '').toLowerCase();
    if (value.includes('workshop manager')) return 1;
    if (value.includes('technician') || value.includes('fundi')) return 2;
    if (value.includes('operator') && !value.includes('roster')) return 3;
    if (value.includes('store')) return 4;
    if (value.includes('procurement')) return 5;
    if (value.includes('account') || value.includes('finance') || value.includes('muhasibu')) return 6;
    if (value.includes('roster')) return 7;
    return 99;
  }

  function arrangeAnalysisRows() {
    const container = document.getElementById('analysisRows');
    if (!container) return;
    const rows = [...container.querySelectorAll(':scope > .analysis-row')];
    if (rows.length < 2) return;
    rows.sort((a, b) => analysisRank(a.textContent) - analysisRank(b.textContent));
    rows.forEach((row) => container.appendChild(row));
  }

  function modernizeVisibleLabels(root = document) {
    root.querySelectorAll('.badge').forEach((badge) => {
      const text = String(badge.textContent || '').trim().toLowerCase();
      if (text.includes('legacy company admin') || text === 'legacy assistant') {
        const card = badge.closest('.user-card');
        if (card) card.remove();
      }
    });

    root.querySelectorAll('.analysis-row').forEach((row) => {
      const text = String(row.textContent || '').toLowerCase();
      if (text.includes('legacy') || text.includes('assistant')) row.remove();
    });
  }

  function tidyRoles() {
    removeLegacyOptionsAndOrderRoles();
    modernizeVisibleLabels();
    arrangeRoleCards();
    arrangeAnalysisRows();
  }

  tidyRoles();

  let tidyScheduled = false;
  const observer = new MutationObserver(() => {
    if (arranging || tidyScheduled) return;
    tidyScheduled = true;
    requestAnimationFrame(() => {
      tidyScheduled = false;
      tidyRoles();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  form?.addEventListener('submit', (event) => {
    const role = roleSelect?.value || '';
    if (role && !MODERN_ROLES.has(role)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (errorBox) {
        errorBox.textContent = 'Select one of the current Customer Workshop Portal operational roles.';
        errorBox.className = 'alert error';
      }
    }
  }, true);

  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    if (!edit) return;
    queueMicrotask(() => {
      removeLegacyOptionsAndOrderRoles();
      const current = roleSelect?.value || '';
      if (!current && accountKind?.value === 'customer' && userId?.value) {
        document.getElementById('userDialog')?.close();
        const alertBox = document.getElementById('alertBox');
        if (alertBox) {
          alertBox.textContent = 'This is an old legacy account. Create a current Customer Workshop Portal role account instead; legacy roles are no longer editable from Settings Center.';
          alertBox.className = 'alert';
        }
      }
    });
  }, true);
})();
