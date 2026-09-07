(()=>{
  const sidebar=document.querySelector('.workspace>.card');
  if(!sidebar)return;

  sidebar.id='wmSidebar';
  sidebar.setAttribute('aria-label','BELM Workshop navigation');

  const menuButton=document.createElement('button');
  menuButton.id='wmMenuButton';
  menuButton.className='wm-menu-button';
  menuButton.type='button';
  menuButton.textContent='☰';
  menuButton.setAttribute('aria-label','Open Workshop menu');
  menuButton.setAttribute('aria-controls','wmSidebar');
  menuButton.setAttribute('aria-expanded','false');

  const scrim=document.createElement('div');
  scrim.id='wmMenuScrim';
  scrim.className='wm-menu-scrim';
  scrim.hidden=true;

  const closeButton=document.createElement('button');
  closeButton.id='wmSidebarClose';
  closeButton.className='wm-side-close';
  closeButton.type='button';
  closeButton.textContent='×';
  closeButton.setAttribute('aria-label','Close Workshop menu');
  sidebar.querySelector('.head')?.append(closeButton);
  document.body.prepend(scrim);
  document.body.prepend(menuButton);

  const setOpen=open=>{
    document.body.classList.toggle('wm-menu-open',open);
    menuButton.setAttribute('aria-expanded',String(open));
    scrim.hidden=!open;
    if(open)closeButton.focus();
  };

  menuButton.addEventListener('click',()=>setOpen(true));
  closeButton.addEventListener('click',()=>setOpen(false));
  scrim.addEventListener('click',()=>setOpen(false));
  sidebar.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setOpen(false)));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('wm-menu-open'))setOpen(false);
  });
  window.addEventListener('resize',()=>{
    if(innerWidth>820){
      document.body.classList.remove('wm-menu-open');
      menuButton.setAttribute('aria-expanded','false');
      scrim.hidden=true;
    }
  });
})();
