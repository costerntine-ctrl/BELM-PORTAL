(()=>{
  const frame=document.getElementById('workshopWindowFrame');
  const dialog=document.getElementById('workshopWindow');
  if(!frame||!dialog)return;

  const enableInnerScroll=()=>{
    try{
      const doc=frame.contentDocument;
      if(!doc)return;
      const html=doc.documentElement;
      const body=doc.body;
      if(html){
        html.style.overflowY='auto';
        html.style.overflowX='hidden';
        html.style.height='auto';
        html.style.minHeight='100%';
        html.style.webkitOverflowScrolling='touch';
        html.style.overscrollBehavior='contain';
      }
      if(body){
        body.style.overflowY='auto';
        body.style.overflowX='hidden';
        body.style.height='auto';
        body.style.minHeight='100%';
        body.style.webkitOverflowScrolling='touch';
        body.style.overscrollBehavior='contain';
      }
    }catch(_){ }
  };

  frame.addEventListener('load',()=>{
    enableInnerScroll();
    setTimeout(enableInnerScroll,150);
    setTimeout(enableInnerScroll,700);
  });

  dialog.addEventListener('wheel',event=>{
    if(!dialog.open)return;
    const overFrame=event.target===frame||frame.contains?.(event.target);
    if(!overFrame)return;
    try{
      const win=frame.contentWindow;
      const doc=frame.contentDocument;
      if(!win||!doc)return;
      const root=doc.scrollingElement||doc.documentElement||doc.body;
      if(!root)return;
      const before=root.scrollTop;
      win.scrollBy(0,event.deltaY);
      if(root.scrollTop!==before)event.preventDefault();
    }catch(_){ }
  },{passive:false});

  let touchY=null;
  dialog.addEventListener('touchstart',event=>{
    if(!dialog.open||!event.touches?.length)return;
    touchY=event.touches[0].clientY;
  },{passive:true});
  dialog.addEventListener('touchmove',event=>{
    if(touchY===null||!event.touches?.length)return;
    const nextY=event.touches[0].clientY;
    const delta=touchY-nextY;
    touchY=nextY;
    try{
      frame.contentWindow?.scrollBy(0,delta);
    }catch(_){ }
  },{passive:true});
  dialog.addEventListener('touchend',()=>{touchY=null},{passive:true});
})();