(function(){
  'use strict';
  if(window.__BELM_MOBILE_ROLE_SIDEBAR_V817)return;
  window.__BELM_MOBILE_ROLE_SIDEBAR_V817=true;

  const tokenKeys=['belm_admin_token','belm_tech_token','belm_customer_token','belm_operator_token'];
  if(!tokenKeys.some(key=>localStorage.getItem(key)))return;

  let sidebar=null;
  let shell=null;
  let button=null;
  let scrim=null;
  let observer=null;

  function sidebarScore(el){
    if(!el||el.closest('dialog')||el.classList.contains('billing-section-sidebar'))return -1;
    const links=el.querySelectorAll('a[href],button').length;
    if(links<2)return -1;
    let score=links;
    if(el.matches('aside.belm-sidebar'))score+=100;
    else if(el.matches('aside.sidebar'))score+=90;
    else if(el.matches('.belm-sidebar'))score+=80;
    else if(el.matches('.sidebar'))score+=60;
    if(el.closest('.belm-shell,.shell,.dashboard-shell,.portal-shell'))score+=25;
    return score;
  }

  function findSidebar(){
    const selectors=[
      'aside.belm-sidebar',
      '.belm-shell > .belm-sidebar',
      'aside.sidebar',
      '.shell > .sidebar',
      '.dashboard-shell > .sidebar',
      '.portal-shell > .sidebar',
      '[data-role-sidebar]'
    ];
    const seen=new Set();
    const candidates=[];
    selectors.forEach(selector=>document.querySelectorAll(selector).forEach(el=>{
      if(seen.has(el))return;
      seen.add(el);
      const score=sidebarScore(el);
      if(score>=0)candidates.push({el,score});
    }));
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.el||null;
  }

  function ensureStyle(){
    if(document.getElementById('belmMobileRoleSidebarV817Style'))return;
    const style=document.createElement('style');
    style.id='belmMobileRoleSidebarV817Style';
    style.textContent=`
      .belm-mobile-role-toggle-v817,.belm-mobile-role-scrim-v817{display:none}
      @media(max-width:900px){
        #sidebarToggle,.belm-topbar__menu{display:none!important}
        .belm-mobile-role-sidebar-v817{
          position:fixed!important;
          inset:0 auto 0 0!important;
          width:min(280px,86vw)!important;
          max-width:86vw!important;
          height:100dvh!important;
          max-height:100dvh!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          z-index:2147483000!important;
          transform:translateX(-105%)!important;
          transition:transform .22s ease!important;
          visibility:visible!important;
          opacity:1!important;
          display:flex!important;
          flex-direction:column!important;
          box-shadow:18px 0 42px rgba(0,0,0,.35)!important;
        }
        body.belm-mobile-role-open-v817 .belm-mobile-role-sidebar-v817{
          transform:translateX(0)!important;
        }
        .belm-mobile-role-toggle-v817{
          position:fixed;
          left:0;
          top:50%;
          transform:translateY(-50%);
          z-index:2147483002;
          width:44px;
          height:62px;
          border:1px solid rgba(4,16,31,.35);
          border-left:0;
          border-radius:0 15px 15px 0;
          background:#f5c518;
          color:#04101f;
          display:flex;
          align-items:center;
          justify-content:center;
          font:900 23px/1 Arial,sans-serif;
          box-shadow:0 10px 28px rgba(0,0,0,.34);
          transition:left .22s ease,background .2s ease,color .2s ease;
          touch-action:manipulation;
          -webkit-tap-highlight-color:transparent;
        }
        .belm-mobile-role-toggle-v817.is-open{
          left:min(280px,86vw);
          background:#0d2742;
          color:#fff;
          border-color:#49657d;
        }
        .belm-mobile-role-scrim-v817{
          position:fixed;
          inset:0;
          z-index:2147482999;
          background:rgba(1,9,18,.58);
          backdrop-filter:blur(2px);
          display:block;
        }
        .belm-mobile-role-scrim-v817[hidden]{display:none!important}
        body.belm-mobile-role-open-v817{overflow:hidden!important}
      }
      @media(min-width:901px){
        .belm-mobile-role-sidebar-v817{transform:none!important}
      }
      @media(prefers-reduced-motion:reduce){
        .belm-mobile-role-sidebar-v817,.belm-mobile-role-toggle-v817{transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function setOpen(open){
    if(!sidebar)return;
    const mobile=window.innerWidth<=900;
    const next=Boolean(open&&mobile);
    document.body.classList.toggle('belm-mobile-role-open-v817',next);
    sidebar.classList.toggle('is-sidebar-open',next);
    shell?.classList.toggle('is-sidebar-open',next);
    shell?.classList.toggle('sidebar-open',next);
    if(button){
      button.classList.toggle('is-open',next);
      button.setAttribute('aria-expanded',String(next));
      button.setAttribute('aria-label',next?'Close sidebar menu':'Open sidebar menu');
      button.textContent=next?'‹':'☰';
    }
    if(scrim)scrim.hidden=!next;
  }

  function ensureControls(){
    if(!button){
      button=document.createElement('button');
      button.id='belmMobileRoleToggleV817';
      button.className='belm-mobile-role-toggle-v817';
      button.type='button';
      button.setAttribute('aria-label','Open sidebar menu');
      button.setAttribute('aria-expanded','false');
      button.textContent='☰';
      button.addEventListener('click',()=>setOpen(!document.body.classList.contains('belm-mobile-role-open-v817')));
      document.body.appendChild(button);
    }
    if(!scrim){
      scrim=document.createElement('div');
      scrim.id='belmMobileRoleScrimV817';
      scrim.className='belm-mobile-role-scrim-v817';
      scrim.hidden=true;
      scrim.addEventListener('click',()=>setOpen(false));
      document.body.appendChild(scrim);
    }
  }

  function bindSidebar(next){
    if(sidebar===next)return;
    if(sidebar){
      sidebar.classList.remove('belm-mobile-role-sidebar-v817','is-sidebar-open');
      sidebar.removeAttribute('data-belm-mobile-role-sidebar');
    }
    sidebar=next;
    shell=sidebar?.closest('.belm-shell,.shell,.dashboard-shell,.portal-shell')||null;
    if(!sidebar){
      setOpen(false);
      if(button)button.hidden=true;
      return;
    }
    if(!sidebar.id)sidebar.id='belmRoleSidebarV817';
    sidebar.classList.add('belm-mobile-role-sidebar-v817');
    sidebar.setAttribute('data-belm-mobile-role-sidebar','1');
    ensureControls();
    button.hidden=false;
    button.setAttribute('aria-controls',sidebar.id);
    if(sidebar.dataset.belmMobileRoleBound!=='1'){
      sidebar.dataset.belmMobileRoleBound='1';
      sidebar.addEventListener('click',event=>{
        if(window.innerWidth<=900&&event.target.closest('a[href]'))setOpen(false);
      });
    }
  }

  function scan(){
    if(!document.body)return;
    ensureStyle();
    bindSidebar(findSidebar());
  }

  function boot(){
    scan();
    observer=new MutationObserver(()=>requestAnimationFrame(scan));
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false)});
    window.addEventListener('resize',()=>{if(window.innerWidth>900)setOpen(false);else scan()});
    [150,500,1200,2500,5000].forEach(delay=>setTimeout(scan,delay));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();