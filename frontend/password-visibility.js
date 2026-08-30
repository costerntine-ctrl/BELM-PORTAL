(function(){
  function enhance(input){
    if(!(input instanceof HTMLInputElement)||input.dataset.belmEyeReady==='1'||input.type!=='password')return;
    input.dataset.belmEyeReady='1';
    const wrap=document.createElement('span');wrap.className='belm-secret-field';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    const button=document.createElement