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

  // Existing legacy records remain in backend history for compatibility,
  // but Settings Center never exposes them as assignable/editable CWM roles.
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
