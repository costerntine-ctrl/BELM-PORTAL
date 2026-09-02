(function(){
  const qs=new URLSearchParams(location.search);
  const actor=(qs.get('actor')||'customer').toLowerCase();
  const customerId=qs.get('customerId')||'';
  const isBelm=actor==='belm';
  const key=`belm_cwm_view_state:${actor}:${customerId||'self'}`;
  const back=document.getElementById('cwmBackButton');
  if(back) back.href=isBelm?'/customers-manager/':'/portal/dashboard';
  function read(){try{return JSON.parse(sessionStorage.getItem(key)||'{}')||{}}catch(_){return{}}}
  function save(){
    try{sessionStorage.setItem(key,JSON.stringify({scrollY:Math.max(0,window.scrollY||0),toolDocumentsOpen:!document.getElementById('toolDocumentsPanel')?.classList.contains('hidden')}))}catch(_){}
  }
  window.addEventListener('pagehide',save);
  window.addEventListener('beforeunload',save);
  window.addEventListener('pageshow',()=>{const st=read();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Number(st.scrollY)||0,left:0,behavior:'auto'})))});
  document.getElementById('toolDocumentsButton')?.addEventListener('click',()=>setTimeout(save,0));
  const st=read();
  if(st.toolDocumentsOpen&&!isBelm){
    const tryRestore=()=>{
      const p=document.getElementById('toolDocumentsPanel');
      const b=document.getElementById('toolDocumentsButton');
      if(p&&b&&p.classList.contains('hidden')) b.click();
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Number(st.scrollY)||0,left:0,behavior:'auto'})));
    };
    setTimeout(tryRestore,250);
  } else {
    setTimeout(()=>window.scrollTo({top:Number(st.scrollY)||0,left:0,behavior:'auto'}),120);
  }
})();
