(function(){
  function enhance(input){
    if(!(input instanceof HTMLInputElement)||input.dataset.belmEyeReady==='1'||input.type!=='password')return;
    input.dataset.belmEyeReady='1';
    const wrap=document.createElement('span');wrap.className='belm-secret-field';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    const button=document.createElement('button');button.type='button';button.className='belm-secret-toggle';button.setAttribute('aria-label','Show password or PIN');button.textContent='◉';wrap.appendChild(button);
    button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-label',show?'Hide password or PIN':'Show password or PIN');button.title=show?'Hide':'Show';input.focus({preventScroll:true});});
  }
  function scan(root=document){if(root.matches?.('input[type="password"]'))enhance(root);root.querySelectorAll?.('input[type="password"]').forEach(enhance);}
  function start(){scan(document);new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)scan(n)}).observe(document.documentElement,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  if(!document.querySelector('script[data-v520-upgrades]')){const s=document.createElement('script');s.src='/v520-upgrades.js?v=520-latest';s.defer=true;s.dataset.v520Upgrades='1';document.head.appendChild(s);}
})();