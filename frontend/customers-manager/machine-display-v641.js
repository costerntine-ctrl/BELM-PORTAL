(function(){
  if(!location.pathname.startsWith('/customers-manager/'))return;
  const states=new WeakMap();
  const text=(el)=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
  function levelFor(card,message){
    const v=String(card.dataset.machineEffectiveRange||card.dataset.machineConditionLevel||'').toUpperCase();
    const m=String(message||'').toLowerCase();
    if(v==='RED'||v==='CRITICAL'||/don't operate|critical|grounded/.test(m))return'red';
    if(v==='YELLOW'||v==='ATTENTION'||/attention|due|overdue|required/.test(m))return'yellow';
    if(v==='GREEN'||v==='OK'||/normal/.test(m))return'green';
    return'unknown';
  }
  function collect(card){
    const operator=card.querySelector('.machine-operator-message');
    const condition=card.querySelector('.machine-alert-reason');
    const serviceRange=card.querySelector('[data-machine-service-alert-copy]');
    const serviceDue=card.querySelector('.service-due-badge');
    const list=[];
    if(operator){
      const strong=text(operator.querySelector('strong'));
      if(strong&&!/^no operator message reported yet\.?$/i.test(strong))list.push({label:'Operator',message:strong,meta:text(operator.querySelector('small'))});
    }
    if(condition&&text(condition))list.push({label:'Condition',message:text(condition),meta:'Machine condition'});
    if(serviceRange&&text(serviceRange)&&!/checking/i.test(text(serviceRange)))list.push({label:'Service',message:text(serviceRange),meta:'Service range'});
    if(serviceDue&&text(serviceDue)&&!/checking/i.test(text(serviceDue)))list.push({label:'Service due',message:text(serviceDue),meta:'Maintenance'});
    if(!list.length)list.push({label:'Machine',message:'No new machine messages.',meta:'Status display'});
    return list;
  }
  function render(card){
    const host=card.querySelector('.machine-alert-copy');if(!host)return;
    let display=host.querySelector('.belm-machine-display');
    if(!display){display=document.createElement('div');display.className='belm-machine-display';display.setAttribute('aria-live','polite');host.appendChild(display);}
    const messages=collect(card);let state=states.get(card)||{index:Math.floor(Math.random()*messages.length)};state.messages=messages;state.index%=messages.length;states.set(card,state);
    const item=messages[state.index];const level=levelFor(card,item.message);
    display.className=`belm-machine-display display-${level}`;
    display.innerHTML=`<span class="belm-machine-display-kicker">${item.label}</span><span class="belm-machine-display-message">${item.message}<small class="belm-machine-display-meta">${item.meta||''}</small></span>`;
  }
  function rotate(card){const state=states.get(card);if(!state||state.messages.length<2)return;state.index=(state.index+1+Math.floor(Math.random()*(state.messages.length-1)))%state.messages.length;render(card);}
  function scan(){document.querySelectorAll('.machine-card').forEach(card=>{render(card);if(card.dataset.belmDisplayTimer)return;card.dataset.belmDisplayTimer='1';setInterval(()=>rotate(card),4200+Math.floor(Math.random()*1800));});}
  const observer=new MutationObserver(()=>requestAnimationFrame(scan));
  function boot(){scan();observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();