(function(){
  'use strict';
  if(window.__belmMobileSidebar817)return;
  window.__belmMobileSidebar817=true;

  const BUTTON_ID='belmMobileSidebar817';
  const SCRIM_ID='belmMobileSidebarScrim817';
  const STYLE_ID='belmMobileSidebarStyle817';
  let current=null;

  function isMobile(){return window.matchMedia('(max-width: 900px)').matches}

  function candidates(){
    return Array.from(document.querySelectorAll('.belm-sidebar,.sidebar,aside[data-sidebar],aside.sidebar')).filter(el=>{
      if(!el||el.closest('dialog'))return false;
      const links=el.querySelectorAll('a[href],button').length;
      return links>1;
    });
  }

  function pickSidebar(){
    const list=candidates();
    if(!list.length)return null;
    const visible=list.find(el=>{
      const s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden';
    });
    return visible||list[0];
  }

  function shellFor(sidebar){
    return sidebar.closest('#belmShell,.belm-shell,#shell,.shell,[data-dashboard-shell]')||sidebar.parentElement||document.body;
  }

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');
    s.id=STYLE_ID;
    s.textContent=`
      .belm-mobile-sidebar817,.belm-mobile-sidebar-scrim817{display:none!important}
      @media(max-width:900px){
        body.belm-mobile-sidebar817-ready{overflow-x:hidden}
        body.belm-mobile-sidebar817-ready .belm-sidebar,
        body.belm-mobile-sidebar817-ready .sidebar{
          position:fixed!important;
          top:0!important;
          left:0!important;
          bottom:0!important;
          z-index:99994!important;
          width:min(286px,86vw)!important;
          max-width:86vw!important;
          height:100dvh!important;
          max-height:100dvh!important;
          overflow-y:auto!important;
          overscroll-behavior:contain;
          transform:translateX(-105%)!important;
          transition:transform .22s ease!important;
          box-shadow:18px 0 40px rgba(0,0,0,.34)!important;
          visibility:visible!important;
          opacity:1!important;
          display:block!important;
        }
        body.belm-mobile-sidebar817-open .belm-sidebar[data-belm-mobile-sidebar817="1"],
        body.belm-mobile-sidebar817-open .sidebar[data-belm-mobile-sidebar817="1"]{
          transform:translateX(0)!important;
        }
        .belm-mobile-sidebar817{
          position:fixed!important;
          left:0!important;
          top:50%!important;
          transform:translateY(-50%)!important;
          z-index:99996!important;
          width:46px!important;
          height:62px!important;
          border:1px solid rgba(4,16,31,.38)!important;
          border-left:0!important;
          border-radius:0 15px 15px 0!important;
          background:#f5c518!important;
          color:#04101f!important;
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          padding:0!important;
          font:900 24px/1 Arial,sans-serif!important;
          box-shadow:0 10px 28px rgba(0,0,0,.32)!important;
          cursor:pointer!important;
          transition:left .22s ease,background .22s ease,color .22s ease!important;
          touch-action:manipulation;
          -webkit-tap-highlight-color:transparent;
        }
        .belm-mobile-sidebar817.is-open{
          left:min(286px,86vw)!important;
          background:#0d2742!important;
          color:#fff!important;
          border-color:#49657d!important;
        }
        .belm-mobile-sidebar-scrim817{
          position:fixed!important;
          inset:0!important;
          z-index:99993!important;
          background:rgba(1,9,18,.58)!important;
          backdrop-filter:blur(2px);
          display:block!important;
        }
        .belm-mobile-sidebar-scrim817[hidden]{display:none!important}
        body.belm-mobile-sidebar817-open{overflow:hidden!important}
        #sidebarToggle,.belm-topbar__menu[data-sidebar-toggle],button[data-sidebar-toggle]{display:none!important}
      }
      @media(min-width:901px){
        body.belm-mobile-sidebar817-ready .belm-sidebar,
        body.belm-mobile-sidebar817-ready .sidebar{
          transform:none!important;
        }
      }
      @media(prefers-reduced-motion:reduce){
        body.belm-mobile-sidebar817-ready .belm-sidebar,
        body.belm-mobile-sidebar817-ready .sidebar,
        .belm-mobile-sidebar817{transition:none!important}
      }
    `;
    document.head.appendChild(s);
  }

  function setOpen(open){
    if(!current)return;
    const {button,scrim}=current;
    const next=!!open&&isMobile();
    document.body.classList.toggle('belm-mobile-sidebar817-open',next);
    button.classList.toggle('is-open',next);
    button.setAttribute('aria-expanded',String(next));
    button.setAttribute('aria-label',next?'Close sidebar menu':'Open sidebar menu');
    button.textContent=next?'‹':'☰';
    scrim.hidden=!next;
  }

  function bind(sidebar){
    if(!sidebar)return false;
    if(current&&current.sidebar===sidebar)return true;

    ensureStyle();
    document.body.classList.add('belm-mobile-sidebar817-ready');
    candidates().forEach(el=>el.removeAttribute('data-belm-mobile-sidebar817'));
    sidebar.setAttribute('data-belm-mobile-sidebar817','1');

    let button=document.getElementById(BUTTON_ID);
    if(!button){
      button=document.createElement('button');
      button.id=BUTTON_ID;
      button.className='belm-mobile-sidebar817';
      button.type='button';
      button.textContent='☰';
      document.body.appendChild(button);
    }

    let scrim=document.getElementById(SCRIM_ID);
    if(!scrim){
      scrim=document.createElement('div');
      scrim.id=SCRIM_ID;
      scrim.className='belm-mobile-sidebar-scrim817';
      scrim.hidden=true;
      document.body.appendChild(scrim);
    }

    const shell=shellFor(sidebar);
    button.setAttribute('aria-controls',sidebar.id||shell.id||'dashboard-sidebar');
    if(!sidebar.id)sidebar.id='dashboard-sidebar';

    if(button.dataset.bound817!=='1'){
      button.dataset.bound817='1';
      button.addEventListener('click',()=>setOpen(!document.body.classList.contains('belm-mobile-sidebar817-open')));
      scrim.addEventListener('click',()=>setOpen(false));
      document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
      window.addEventListener('resize',()=>{if(!isMobile())setOpen(false);scan()});
    }

    if(sidebar.dataset.bound817!=='1'){
      sidebar.dataset.bound817='1';
      sidebar.addEventListener('click',e=>{
        if(isMobile()&&e.target.closest('a[href],button[data-close-sidebar]'))setOpen(false);
      });
    }

    current={sidebar,shell,button,scrim};
    setOpen(false);
    return true;
  }

  function scan(){
    const sidebar=pickSidebar();
    if(sidebar)bind(sidebar);
    else{
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(SCRIM_ID)?.remove();
      document.body?.classList.remove('belm-mobile-sidebar817-ready','belm-mobile-sidebar817-open');
      current=null;
    }
  }

  function boot(){
    scan();
    new MutationObserver(()=>requestAnimationFrame(scan)).observe(document.body,{childList:true,subtree:true});
    [250,800,1600,3000].forEach(ms=>setTimeout(scan,ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();