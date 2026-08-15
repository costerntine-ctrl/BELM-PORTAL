(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const makeIcon = (visible) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (!visible) {
      const p1 = document.createElementNS(NS, 'path'); p1.setAttribute('d', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z');
      const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
      svg.append(p1, c);
    } else {
      const p1 = document.createElementNS(NS, 'path'); p1.setAttribute('d', 'M3 3l18 18');
      const p2 = document.createElementNS(NS, 'path'); p2.setAttribute('d', 'M10.6 10.6a2 2 0 0 0 2.8 2.8');
      const p3 = document.createElementNS(NS, 'path'); p3.setAttribute('d', 'M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a17.4 17.4 0 0 1-3 4.2');
      const p4 = document.createElementNS(NS, 'path'); p4.setAttribute('d', 'M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.1-.8');
      svg.append(p1, p2, p3, p4);
    }
    return svg;
  };

  function enhance(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.belmEyeReady === '1') return;
    if (input.type !== 'password') return;
    input.dataset.belmEyeReady = '1';

    const wrapper = document.createElement('span');
    wrapper.className = 'belm-secret-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'belm-secret-toggle';
    button.setAttribute('aria-label', 'Show password or PIN');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Show';
    button.appendChild(makeIcon(false));
    wrapper.appendChild(button);

    button.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.replaceChildren(makeIcon(show));
      button.setAttribute('aria-pressed', show ? 'true' : 'false');
      button.setAttribute('aria-label', show ? 'Hide password or PIN' : 'Show password or PIN');
      button.title = show ? 'Hide' : 'Show';
      input.focus({ preventScroll: true });
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
    });
  }

  function scan(root = document) {
    if (root.matches?.('input[type="password"]')) enhance(root);
    root.querySelectorAll?.('input[type="password"]').forEach(enhance);
  }

  const start = () => {
    scan(document);
    new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) scan(node);
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
