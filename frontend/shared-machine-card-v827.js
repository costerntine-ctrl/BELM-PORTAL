(function () {
  'use strict';
  if (window.__belmSharedMachineCardV838) return;
  window.__belmSharedMachineCardV838 = true;

  const CARD_SELECTOR = [
    '.machine-card',
    '.belm-customer-machine-card',
    '.belm-technician-machine-card',
    '.op-machine-card',
    '.assigned-machine-card'
  ].join(',');
  const LIST_SELECTOR = [
    '.machine-list',
    '.machine-grid',
    '.belm-customer-machine-grid',
    '.belm-technician-machine-grid',
    '.assigned-machine-grid',
    '#belmTechnicianMachineGrid',
    '#machineListBody'
  ].join(',');

  const style = document.createElement('style');
  style.id = 'belm-shared-machine-card-v838-style';
  style.textContent = `
    .belm-shared-machine-card-v827{--belm-shared-level:#73879c;position:relative!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:auto!important;min-height:0!important;max-height:none!important;padding:0!important;overflow:visible!important;border:1px solid #1b3a57!important;border-radius:20px!important;background:#071526!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important;color:#eef5ff!important;align-self:start!important}
    .belm-shared-machine-card-v827::before{content:""!important;position:absolute!important;z-index:3!important;inset:0 0 auto!important;height:7px!important;border-radius:20px 20px 0 0!important;background:var(--belm-shared-level)!important;pointer-events:none!important}
    .belm-shared-machine-card-v827.belm-shared-level-red{--belm-shared-level:#ef4d43}
    .belm-shared-machine-card-v827.belm-shared-level-yellow{--belm-shared-level:#f0c300}
    .belm-shared-machine-card-v827.belm-shared-level-green{--belm-shared-level:#20b85d}
    .belm-shared-machine-card-v827.belm-shared-level-neutral{--belm-shared-level:#73879c}
    .belm-shared-native-v838{display:none!important}
    .belm-shared-summary-v827{display:flex!important;flex-direction:column!important;min-height:0!important;padding:22px 18px 16px!important;box-sizing:border-box!important;border-radius:20px!important;background:linear-gradient(180deg,#0b213a 0%,#071526 54%,#050d16 100%)!important;color:#eef5ff!important;text-align:left!important}
    .belm-shared-head-v827{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
    .belm-shared-fleet-v827{display:inline-flex;padding:8px 12px;border-radius:10px;background:#061324;border:1px solid #1a3857;color:#ecf619;font:900 16px/1.1 Inter,Arial,sans-serif;letter-spacing:.02em}
    .belm-shared-activity-v827{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:#182536;border:1px solid #36485e;color:#f4f7fb;font:800 12px/1 Inter,Arial,sans-serif}
    .belm-shared-activity-v827::before{content:'';width:9px;height:9px;border-radius:50%;background:#16c45b;box-shadow:0 0 10px rgba(22,196,91,.65)}
    .belm-shared-activity-v827.is-progress::before{background:#f2c400;box-shadow:0 0 10px rgba(242,196,0,.55)}
    .belm-shared-activity-v827.is-grounded::before{background:#ef4343;box-shadow:0 0 10px rgba(239,67,67,.65)}
    .belm-shared-visual-v827{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:16/7;min-height:135px;max-height:215px;margin:0 0 14px;padding:16px;overflow:hidden;box-sizing:border-box;border:1px solid #1a334e;border-radius:15px;background:radial-gradient(circle at 50% 38%,#173a5f 0,#0c223b 48%,#071526 100%);text-align:center}
    .belm-shared-visual-v827.has-photo{padding:0;background:#eef2f6}
    .belm-shared-visual-v827 img{display:block;width:100%;height:100%;max-height:215px;object-fit:contain;object-position:center;background:#eef2f6}
    .belm-shared-visual-v827 span{max-width:90%;font:900 22px/1.15 Inter,Arial,sans-serif;color:#fff}
    .belm-shared-summary-v827 h3{margin:0 0 5px!important;color:#fff!important;font:900 22px/1.15 Inter,Arial,sans-serif!important;overflow-wrap:anywhere}
    .belm-shared-meta-v827{min-height:30px;margin:0!important;color:#a9bfd8!important;font-size:12px!important;line-height:1.45!important}
    .belm-shared-facts-v827{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:12px;border-top:1px dashed rgba(164,188,215,.24);border-bottom:1px dashed rgba(164,188,215,.24)}
    .belm-shared-fact-v827{min-width:0;padding:11px 6px}
    .belm-shared-fact-v827:nth-child(odd){padding-right:12px}.belm-shared-fact-v827:nth-child(even){padding-left:12px}
    .belm-shared-fact-v827 span{display:block;margin-bottom:5px;color:#88a5c5;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.04em}
    .belm-shared-fact-v827 b{display:block;color:#f5f7fa;font-size:13px;line-height:1.4;overflow-wrap:anywhere}
    .belm-shared-alert-v827{margin:7px 4px 7px 7px!important;padding:11px!important;border:1px solid #29425c;border-radius:11px;background:rgba(8,25,42,.72)}
    .belm-shared-level-red .belm-shared-alert-v827{border-color:#ef4d43;background:rgba(115,23,27,.24)}
    .belm-shared-level-yellow .belm-shared-alert-v827{border-color:#f0c300;background:rgba(111,87,5,.22)}
    .belm-shared-service-v827{margin-top:11px;color:#b5c8da;font-size:12px;line-height:1.4}
    .belm-shared-bar-v827{height:6px;margin:9px 0 14px;border-radius:999px;background:#142439;overflow:hidden}
    .belm-shared-bar-v827 i{display:block;width:72%;height:100%;border-radius:inherit;background:var(--belm-shared-level)}
    .belm-shared-actions-v827{display:grid;grid-template-columns:1fr 1.25fr;gap:11px;margin-top:auto}
    .belm-shared-actions-v827 button{min-height:50px;padding:10px 12px;border-radius:11px;font:900 12px Inter,Arial,sans-serif;cursor:pointer}
    .belm-shared-primary-v827{border:1px solid #30445c;background:#07111d;color:#f2f5f8}
    .belm-shared-primary-v827:disabled{opacity:.45;cursor:not-allowed}
    .belm-shared-view-v827{border:1px solid #ffda00;background:#ffdf00;color:#07111d}
    .belm-shared-drawer-v838{display:none;padding:0 22px 22px;border-top:1px solid #18324d;background:#050d16}
    .belm-shared-machine-card-v827.belm-shared-actions-open>.belm-shared-drawer-v838{display:block!important}
    .belm-shared-drawer-head-v838{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0 12px}
    .belm-shared-drawer-head-v838 strong{color:#fff;font-size:13px}.belm-shared-drawer-head-v838 span{color:#819ab4;font-size:10px}
    .belm-shared-action-grid-v838{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
    .belm-shared-action-proxy-v838{min-height:48px;padding:10px;border:1px solid #315170;border-radius:10px;background:#0c3154;color:#fff;font:850 11px Inter,Arial,sans-serif;cursor:pointer}
    .belm-shared-action-proxy-v838[data-action-kind="checkup"]{background:#0d78bd;border-color:#168edf}
    .belm-shared-action-proxy-v838[data-action-kind="parts"]{background:#087447;border-color:#12b96b}
    .belm-shared-action-proxy-v838[data-action-kind="job"]{background:#d7a900;border-color:#f3c900;color:#07111d}
    .belm-shared-action-proxy-v838[data-action-kind="delete"],.belm-shared-action-proxy-v838[data-action-kind="forget"]{background:#4a1620;border-color:#df4455}
    .belm-shared-action-proxy-v838:disabled{opacity:.45;cursor:not-allowed}
    .belm-shared-empty-actions-v838{grid-column:1/-1;padding:14px;border:1px dashed #29425c;border-radius:10px;color:#8fa6bd;text-align:center;font-size:11px}
    .belm-shared-status-field-v838{display:grid;grid-column:1/-1;gap:6px;padding:10px;border:1px solid #29425c;border-radius:10px;background:#08192a;color:#9db3c9;font-size:10px;font-weight:800;text-transform:uppercase}
    .belm-shared-status-field-v838 select{width:100%;min-height:42px;padding:8px;border:1px solid #3a5875;border-radius:8px;background:#06111f;color:#fff}
    ${LIST_SELECTOR}{min-width:0!important;max-width:100%!important;max-height:none!important;overflow:visible!important;align-items:start!important}
    #machineListDialog{height:100dvh!important;max-height:100dvh!important;overflow-x:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}
    #machineListDialog>.dialog-card,#machineListDialog .dialog-card{height:auto!important;min-height:100%!important;max-height:none!important;overflow:visible!important}
    dialog:has(.belm-shared-machine-card-v827),.op-checkup-dialog,#techMachineReportsDialog{max-height:calc(100dvh - 24px)!important;overflow-y:auto!important;overscroll-behavior:contain!important}
    @media(max-width:760px){.belm-shared-summary-v827{min-height:0!important;padding:18px 14px 14px!important}.belm-shared-visual-v827{min-height:125px;max-height:190px}.belm-shared-facts-v827{grid-template-columns:1fr}.belm-shared-fact-v827,.belm-shared-fact-v827:nth-child(odd),.belm-shared-fact-v827:nth-child(even){padding:9px 4px}.belm-shared-alert-v827{margin:0 0 8px!important}.belm-shared-actions-v827{grid-template-columns:1fr 1.2fr}.belm-shared-drawer-v838{padding:0 14px 15px}.belm-shared-action-grid-v838{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const text = (element) => String(element?.textContent || '').replace(/\s+/g, ' ').trim();
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const firstText = (card, selectors) => {
    for (const selector of selectors) {
      const element = card.querySelector(selector);
      if (element && text(element)) return text(element);
    }
    return '';
  };

  function machineLevel(card) {
    const raw = String(card.dataset.belmEffectiveRange || card.dataset.machineEffectiveRange || card.dataset.belmConditionRange || card.dataset.machineConditionLevel || card.dataset.alertPriority || '').toUpperCase();
    const classes = card.className;
    if (raw.includes('RED') || raw.includes('CRITICAL') || /status-red|range-red|level-red/.test(classes)) return 'red';
    if (raw.includes('YELLOW') || raw.includes('ATTENTION') || /status-yellow|range-yellow|level-yellow/.test(classes)) return 'yellow';
    if (raw.includes('GREEN') || raw.includes('NORMAL') || /status-green|range-green|level-green/.test(classes)) return 'green';
    return 'neutral';
  }

  function conditionLabel(card, level) {
    return firstText(card, ['.machine-status', '.belm-customer-condition-badge-v422', '[data-tech-condition-label]', '.op-machine-health>div:nth-child(2)>strong', '.machine-status-pill', '.tech-machine-summary-fact:nth-child(2) b']) ||
      (level === 'red' ? "Red — Don't operate" : level === 'yellow' ? 'Yellow — Attention' : level === 'green' ? 'Green — Normal' : 'Not checked');
  }

  function activity(card) {
    const select = card.querySelector('[data-operational-status],[data-customer-activity-status],[data-belm-op-status]');
    const direct = firstText(card, ['.tech-machine-summary-activity', '.op-activity-value']);
    const value = String(select?.value || card.dataset.belmActivity || direct || 'NORMAL').toUpperCase();
    const label = { NORMAL: 'Working', SERVICE_IN_PROGRESS: 'Service', CHECKUP_IN_PROGRESS: 'Check-up', MAINTENANCE_IN_PROGRESS: 'Maintenance', GROUNDED: 'Grounded' }[value] || text(select?.selectedOptions?.[0]) || direct || 'Working';
    return { value, label };
  }

  function details(card) {
    const generic = [...card.querySelectorAll(':scope>.belm-shared-native-v838>p')].map(text).filter(Boolean).join(' · ');
    return {
      fleet: card.dataset.belmMachineFleet || firstText(card, ['.machine-fleet-number b', '.belm-customer-fleet-number b', '[data-summary-fleet]', '.tech-machine-summary-fleet', '.op-fleet-badge b']) || '—',
      title: card.dataset.belmMachineTitle || firstText(card, ['.machine-title-row h4', '[data-summary-title]', '.tech-machine-summary h3', '.op-machine-head h2', '.belm-machine-native-head .font-medium', '.belm-machine-native-head h3', '.belm-shared-native-v838>h3', '.belm-shared-native-v838>h2']) || 'Machine',
      meta: card.dataset.belmMachineMeta || firstText(card, ['.machine-title-row+p', '.belm-shared-source-meta', '.tech-machine-summary-meta', '.op-machine-subhead']) || generic || 'Machine details',
      customer: card.dataset.belmMachineCustomer || firstText(card, ['.machine-customer-tag', '[data-summary-customer]', '.tech-machine-summary-fact:first-child b']) || 'Customer',
      operator: firstText(card, ['.machine-operator-message strong', '.belm-customer-operator-message-v422 strong', '[data-tech-operator-message]', '.tech-machine-summary-fact:nth-child(3) b', '.op-operator-message strong']) || 'No operator message reported yet.',
      alert: firstText(card, ['.machine-alert-reason', '.belm-customer-condition-copy-v422 strong', '[data-tech-machine-condition-message]', '.tech-machine-summary-fact.alert-box b', '.op-condition-message strong']) || '',
      service: firstText(card, ['.service-due-badge', '.belm-service-due-head-v210 strong', '[data-summary-service]', '.tech-machine-summary-service', '.op-service-head strong']) || 'Service due: not available',
      photo: card.querySelector('.belm-machine-summary-photo,.belm-machine-photo-box img,.tech-machine-summary img,.op-machine-card img,.machine-card img')?.getAttribute('src') || ''
    };
  }

  function actionKind(element) {
    const label = text(element).toLowerCase();
    const attrs = [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`).join(' ').toLowerCase();
    const all = `${label} ${attrs}`;
    if (/forget/.test(all)) return 'forget';
    if (/delete/.test(all)) return 'delete';
    if (/edit/.test(all)) return 'edit';
    if (/service.?parts|\bparts\b/.test(all)) return 'parts';
    if (/check.?up|checklist|daily check/.test(all)) return 'checkup';
    if (/job.?card|operation.?card|maintenance process/.test(all)) return 'job';
    if (/report|problem/.test(all)) return 'report';
    if (/procurement/.test(all)) return 'procurement';
    return '';
  }

  function actionLabel(element, kind) {
    const current = text(element).replace(/^[^A-Za-z0-9]+/, '').trim();
    if (current && current.length <= 42 && !/^view details$/i.test(current)) return current;
    return { report: 'Report Issue', checkup: 'Check Up', parts: 'Service Parts', job: 'Job Card', edit: 'Edit Machine', delete: 'Delete Machine', forget: 'Forget Permanently', procurement: 'Open Procurement' }[kind] || 'Open';
  }

  function explicitlyHidden(element) {
    for (let node = element; node && node instanceof HTMLElement; node = node.parentElement) {
      if (node.classList.contains('belm-shared-native-v838')) break;
      if (node.hidden || node.classList.contains('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  }

  function collectActions(card) {
    const seen = new Set();
    return [...card.querySelectorAll('.belm-shared-native-v838 button,.belm-shared-native-v838 a[href],.belm-shared-native-v838 [role="button"]')]
      .filter((element) => !explicitlyHidden(element))
      .map((element) => ({ element, kind: actionKind(element) }))
      .filter((item) => item.kind && !seen.has(item.kind) && seen.add(item.kind))
      .sort((a, b) => ['report', 'checkup', 'parts', 'job', 'edit', 'delete', 'forget', 'procurement'].indexOf(a.kind) - ['report', 'checkup', 'parts', 'job', 'edit', 'delete', 'forget', 'procurement'].indexOf(b.kind));
  }

  function preferredAction(actions) {
    return actions.find((item) => item.kind === 'report') || actions.find((item) => item.kind === 'job') || actions[0] || null;
  }

  function invoke(item) {
    if (!item || item.element.disabled || item.element.getAttribute('aria-disabled') === 'true') return;
    item.element.click();
  }

  function renderDrawer(card, drawer, actions, primary) {
    const grid = drawer.querySelector('.belm-shared-action-grid-v838');
    grid.replaceChildren();
    actions.filter((item) => item !== primary).forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'belm-shared-action-proxy-v838';
      button.dataset.actionKind = item.kind;
      button.textContent = actionLabel(item.element, item.kind);
      button.disabled = Boolean(item.element.disabled || item.element.getAttribute('aria-disabled') === 'true');
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); invoke(item); });
      grid.appendChild(button);
    });
    const nativeStatus = card.querySelector('.belm-shared-native-v838 [data-operational-status],.belm-shared-native-v838 [data-customer-activity-status],.belm-shared-native-v838 [data-belm-op-status]');
    if (nativeStatus) {
      const label = document.createElement('label');
      label.className = 'belm-shared-status-field-v838';
      label.textContent = 'Activity Status';
      const select = nativeStatus.cloneNode(true);
      select.removeAttribute('id');
      select.value = nativeStatus.value;
      select.addEventListener('change', () => { nativeStatus.value = select.value; nativeStatus.dispatchEvent(new Event('change', { bubbles: true })); });
      label.appendChild(select);
      grid.appendChild(label);
    }
    if (!grid.children.length) {
      const empty = document.createElement('div');
      empty.className = 'belm-shared-empty-actions-v838';
      empty.textContent = 'No additional actions are available for this role.';
      grid.appendChild(empty);
    }
  }

  function sync(card) { captureLateNativeChildren(card);
    const summary = card.querySelector(':scope>.belm-shared-summary-v827');
    const drawer = card.querySelector(':scope>.belm-shared-drawer-v838');
    if (!summary || !drawer) return;
    const level = machineLevel(card);
    const info = details(card);
    const currentActivity = activity(card);
    const actions = collectActions(card);
    const primary = preferredAction(actions);
    const levelClass = `belm-shared-level-${level}`;
    if (!card.classList.contains(levelClass)) {
      card.classList.remove('belm-shared-level-red', 'belm-shared-level-yellow', 'belm-shared-level-green', 'belm-shared-level-neutral');
      card.classList.add(levelClass);
    }
    summary.querySelector('[data-shared-fleet]').textContent = info.fleet;
    summary.querySelector('[data-shared-title]').textContent = info.title;
    summary.querySelector('[data-shared-meta]').textContent = info.meta;
    summary.querySelector('[data-shared-customer]').textContent = info.customer;
    summary.querySelector('[data-shared-condition]').textContent = conditionLabel(card, level);
    summary.querySelector('[data-shared-operator]').textContent = info.operator;
    summary.querySelector('[data-shared-alert]').textContent = info.alert || (level === 'red' ? 'Machine requires immediate attention.' : level === 'yellow' ? 'Machine requires attention.' : level === 'green' ? 'Machine condition normal.' : 'No active machine alert.');
    summary.querySelector('[data-shared-service]').textContent = info.service;
    const activityNode = summary.querySelector('[data-shared-activity]');
    activityNode.textContent = currentActivity.label;
    activityNode.classList.toggle('is-grounded', currentActivity.value.includes('GROUND'));
    activityNode.classList.toggle('is-progress', !currentActivity.value.includes('NORMAL') && !currentActivity.value.includes('WORKING') && !currentActivity.value.includes('GROUND'));
    const visual = summary.querySelector('.belm-shared-visual-v827');
    visual.classList.toggle('has-photo', Boolean(info.photo));
    const visualKey = `${info.photo}|${info.title}`;
    if (visual.dataset.visualKey !== visualKey) {
      visual.dataset.visualKey = visualKey;
      visual.innerHTML = info.photo ? `<img src="${escapeHtml(info.photo)}" alt="${escapeHtml(info.title)} machine photo">` : `<span>${escapeHtml(info.title)}</span>`;
    }
    const primaryButton = summary.querySelector('.belm-shared-primary-v827');
    primaryButton.textContent = primary ? (primary.kind === 'report' ? 'Report Issue' : actionLabel(primary.element, primary.kind)) : 'No Direct Action';
    primaryButton.disabled = !primary || Boolean(primary.element.disabled || primary.element.getAttribute('aria-disabled') === 'true');
    primaryButton.onclick = (event) => { event.preventDefault(); event.stopPropagation(); invoke(primary); };
    renderDrawer(card, drawer, actions, primary);
  }

  function captureLateNativeChildren(card) { const native = card.querySelector(':scope>.belm-shared-native-v838'); const summary = card.querySelector(':scope>.belm-shared-summary-v827'); const drawer = card.querySelector(':scope>.belm-shared-drawer-v838'); if (!native || !summary || !drawer) return false; Array.from(card.childNodes).forEach((node) => { if (node !== native && node !== summary && node !== drawer) native.appendChild(node); }); return true; } function enhance(card) {
    if (!card || card.closest('.belm-shared-native-v838')) return;
    if (card.parentElement?.closest(CARD_SELECTOR)) return; if (card.dataset.belmSharedCard838 === '1') { if (captureLateNativeChildren(card)) return; const staleNative = card.querySelector(':scope>.belm-shared-native-v838'); const staleSummary = card.querySelector(':scope>.belm-shared-summary-v827'); const staleDrawer = card.querySelector(':scope>.belm-shared-drawer-v838'); if (staleNative) { while (staleNative.firstChild) card.insertBefore(staleNative.firstChild, staleNative); staleNative.remove(); } staleSummary?.remove(); staleDrawer?.remove(); delete card.dataset.belmSharedCard838; card.classList.remove('belm-shared-machine-card-v827', 'belm-shared-actions-open'); }
    const native = document.createElement('div');
    native.className = 'belm-shared-native-v838';
    native.hidden = true;
    native.setAttribute('aria-hidden', 'true');
    while (card.firstChild) native.appendChild(card.firstChild);

    const summary = document.createElement('section');
    summary.className = 'belm-shared-summary-v827';
    summary.innerHTML = `
      <div class="belm-shared-head-v827"><span class="belm-shared-fleet-v827" data-shared-fleet>—</span><span class="belm-shared-activity-v827" data-shared-activity>Working</span></div>
      <div class="belm-shared-visual-v827"><span>Machine</span></div>
      <h3 data-shared-title>Machine</h3>
      <p class="belm-shared-meta-v827" data-shared-meta>Machine details</p>
      <div class="belm-shared-facts-v827">
        <div class="belm-shared-fact-v827"><span>Customer</span><b data-shared-customer>Customer</b></div>
        <div class="belm-shared-fact-v827"><span>Condition</span><b data-shared-condition>Not checked</b></div>
        <div class="belm-shared-fact-v827"><span>Operator / Message</span><b data-shared-operator>No operator message reported yet.</b></div>
        <div class="belm-shared-fact-v827 belm-shared-alert-v827"><span>Alert</span><b data-shared-alert>No active machine alert.</b></div>
      </div>
      <div class="belm-shared-service-v827" data-shared-service>Service due: not available</div>
      <div class="belm-shared-bar-v827"><i></i></div>
      <div class="belm-shared-actions-v827"><button type="button" class="belm-shared-primary-v827">Report Issue</button><button type="button" class="belm-shared-view-v827" aria-expanded="false">View Details</button></div>`;
    const drawer = document.createElement('section');
    drawer.className = 'belm-shared-drawer-v838';
    drawer.innerHTML = '<div class="belm-shared-drawer-head-v838"><strong>Machine Actions</strong><span>Available for your role</span></div><div class="belm-shared-action-grid-v838"></div>';
    card.append(summary, drawer, native);
    card.dataset.belmSharedCard838 = '1';
    card.classList.add('belm-shared-machine-card-v827');
    summary.querySelector('.belm-shared-view-v827').addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      const open = !card.classList.contains('belm-shared-actions-open');
      card.classList.toggle('belm-shared-actions-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'Hide Details' : 'View Details';
      if (open) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      window.dispatchEvent(new CustomEvent('belm:machine-card-toggle', { detail: { open } }));
    });
    sync(card);
  }

  function scan() {
    document.querySelectorAll(CARD_SELECTOR).forEach(enhance);
    document.querySelectorAll('.belm-shared-machine-card-v827').forEach(sync);
  }

  let timer = 0;
  const queue = () => { clearTimeout(timer); timer = window.setTimeout(scan, 100); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
  new MutationObserver((mutations) => {
    const internalOnly = mutations.every((mutation) => mutation.target instanceof Element && mutation.target.closest('.belm-shared-summary-v827,.belm-shared-drawer-v838'));
    if (!internalOnly) queue();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'src', 'value', 'disabled', 'aria-disabled'] });
  window.addEventListener('belm-customer-activity-status-changed', queue);
  window.addEventListener('belm-technician-data-changed', queue);
  window.addEventListener('resize', queue, { passive: true });
  window.setTimeout(scan, 500);
  window.setTimeout(scan, 1600);
})();
