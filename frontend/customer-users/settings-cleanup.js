(function () {
  'use strict';

  const MODERN_ROLES = new Set([
    'workshop_manager',
    'store_keeper',
    'accounts',
    'procurement',
    'operator',
    'technician',
  ]);

  const roleSelect = document.getElementById('role');
  const form = document.getElementById('userForm');
  const accountKind = document.getElementById('accountKind');
  const userId = document.getElementById('userId');
  const errorBox = document.getElementById('formError');

  const compactStyle = document.createElement('style');
  compactStyle.textContent = `
    .share-link-row{align-items:flex-start!important;gap:12px!important}
    .share-link{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-areas:'copy button' 'link button'!important;align-items:center!important;gap:8px 14px!important;min-height:0!important;height:auto!important;padding:14px 16px!important;max-width:760px!important}
    .share-link>div{grid-area:copy!important}
    .share-link code{grid-area:link!important;display:block!important;min-width:0!important;margin:0!important;padding:0!important;font-size:11px!important;line-height:1.4!important}
    .share-link #copyLinkButton{grid-area:button!important;align-self:center!important;margin:0!important;min-height:38px!important;padding:8px 13px!important}
    @media(max-width:620px){
      .share-link-row{display:block!important}
      .share-link{grid-template-columns:1fr auto!important;grid-template-areas:'copy copy' 'link button'!important;width:100%!important;max-width:none!important;padding:13px 14px!important}
      .share-link #copyLinkButton{min-width:92px!important}
      .access-legend{max-width:none!important;margin-top:12px!important}
    }
  `;
  document.head.appendChild(compactStyle);

  function removeLegacyOptions() {
    if (!roleSelect) return;
    [...roleSelect.options].forEach((option) => {
      if (!MODERN_ROLES.has(option.value)) option.remove();
    });
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

  removeLegacyOptions();
  modernizeVisibleLabels();

  const observer = new MutationObserver(() => {
    removeLegacyOptions();
    modernizeVisibleLabels();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  form?.addEventListener('submit', (event) => {
    const role = roleSelect?.value || '';
    if (role && !MODERN_ROLES.has(role)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (errorBox) {
        errorBox.textContent = 'Select one of the current CWM operational roles.';
        errorBox.className = 'alert error';
      }
    }
  }, true);

  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    if (!edit) return;
    queueMicrotask(() => {
      removeLegacyOptions();
      const current = roleSelect?.value || '';
      if (!current && accountKind?.value === 'customer' && userId?.value) {
        document.getElementById('userDialog')?.close();
        const alertBox = document.getElementById('alertBox');
        if (alertBox) {
          alertBox.textContent = 'This is an old legacy account. Create a current CWM role account instead; legacy roles are no longer editable from Settings Center.';
          alertBox.className = 'alert';
        }
      }
    });
  }, true);
})();
