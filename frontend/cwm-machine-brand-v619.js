// V619 — Runtime CWM machine-card branding guard.
// Purpose: legacy React/Tailwind/status classes can repaint the full customer card red.
// This observer reapplies the approved BELM shell/action colors after the card is decorated.
(function(){
  if (!localStorage.getItem('belm_customer_token')) return;
  if (location.pathname !== '/portal/dashboard' && location.pathname !== '/portal/dashboard/') return;

  const important = (el, prop, value) => el && el.style.setProperty(prop, value, 'important');
  function paintButton(btn, bg, color='#fff', border=bg){
    important(btn,'background',bg); important(btn,'background-image','none'); important(btn,'color',color);
    important(btn,'border-color',border); important(btn,'box-shadow','none');
  }
  function decorate(card){
    if (!card || card.dataset.belmBrand619 === '1') return;
    card.dataset.belmBrand619 = '1';

    important(card,'background','linear-gradient(155deg,#061525 0%,#082a48 52%,#071b31 100%)');
    important(card,'background-color','#061525');
    important(card,'border','2px solid #1684ff');
    important(card,'box-shadow','0 16px 34px rgba(0,0,0,.30)');
    important(card,'color','#f7fbff');
    important(card,'animation','none');

    // Keep the main body visually BELM navy even when legacy status classes affect child wrappers.
    Array.from(card.children).forEach(child=>{
      if (child.classList.contains('belm-customer-machine-alert-copy')) return;
      if (/operator message|critical machine alert/i.test(child.textContent||'')) return;
      if (getComputedStyle(child).backgroundColor === 'rgb(127, 29, 29)' || /red|rose/.test(child.className||'')) {
        important(child,'background-color','transparent');
      }
    });

    // Action colours: approved BELM palette. Safety/destructive controls remain red.
    card.querySelectorAll('button,a').forEach(btn=>{
      const t=(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if (t==='report' || t.includes('service parts')) paintButton(btn,'linear-gradient(135deg,#0d4fa3,#1684ff)','#fff','#1684ff');
      else if (t.includes('check up')) paintButton(btn,'linear-gradient(135deg,#087447,#16c778)','#fff','#16c778');
      else if (t.includes('job card')) paintButton(btn,'linear-gradient(135deg,#e6aa00,#ffd126)','#10213a','#ffd126');
      else if (t.includes('edit machine')) paintButton(btn,'#071827','#62b7ff','#1684ff');
      else if (t.includes('delete machine') || t.includes('forget permanently')) paintButton(btn,'#071827','#ff6672','#ff3f52');
    });

    // Status badge uses yellow warning style when machine is red, without repainting the whole card.
    const badge=card.querySelector('.belm-customer-condition-badge-v422');
    if (badge && card.classList.contains('status-red')) {
      important(badge,'background','linear-gradient(135deg,#e6aa00,#ffd126)');
      important(badge,'color','#10213a');
      important(badge,'border-color','#ffd126');
    }
  }

  function scan(){document.querySelectorAll('.belm-customer-machine-card').forEach(decorate)}
  const observer=new MutationObserver(()=>requestAnimationFrame(scan));
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('load',scan);
  setTimeout(scan,250); setTimeout(scan,900); setTimeout(scan,2000);
})();
