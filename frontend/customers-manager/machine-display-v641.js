(function(){
  if(!location.pathname.startsWith('/customers-manager/'))return;
  const states=new WeakMap();
  const params=new URLSearchParams(location.search);
  const workshopSummary=params.get('view')==='all-machines'&&params.get('embed')==='1';
  const text=(el)=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
  const setText=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value};

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

  function activity(card){
    const sel=card.querySelector('[data-operational-status]');
    const value=String(sel?.value||'NORMAL').toUpperCase();
    const label={NORMAL:'Working',SERVICE_IN_PROGRESS:'Service',CHECKUP_IN_PROGRESS:'Check-up',MAINTENANCE_IN_PROGRESS:'Maintenance',GROUNDED:'Grounded'}[value]||text(sel?.selectedOptions?.[0])||'Working';
    return {value,label};
  }

  function summaryData(card){
    const title=text(card.querySelector('.machine-title-row h4'))||'Machine';
    const fleet=text(card.querySelector('.machine-fleet-number b'))||'—';
    const meta=text(card.querySelector('.machine-title-row')?.nextElementSibling?.tagName==='P'?card.querySelector('.machine-title-row').nextElementSibling:card.querySelector('p'))||'Machine details';
    const customer=text(card.querySelector('.machine-customer-tag'))||'BELM Customer';
    const condition=text(card.querySelector('.machine-status'))||'Not checked';
    const service=text(card.querySelector('.service-due-badge'))||'Service due: not available';
    const reason=text(card.querySelector('.machine-alert-reason'))||'No active condition message.';
    const operator=text(card.querySelector('.machine-operator-message strong'))||'No operator message';
    return {title,fleet,meta,customer,condition,service,reason,operator,activity:activity(card)};
  }

  function injectWorkshopStyle(){
    if(!workshopSummary||document.getElementById('belm-wm-machine-summary-style'))return;
    document.documentElement.classList.add('belm-wm-machine-summary');
    const style=document.createElement('style');
    style.id='belm-wm-machine-summary-style';
    style.textContent=`
      html.belm-wm-machine-summary #machineListBody .machine-list{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(310px,1fr))!important;gap:16px!important;align-items:start!important}
      html.belm-wm-machine-summary .machine-card.belm-summary-mode{padding:0!important;border:1px solid #1c3959!important;border-radius:18px!important;background:#071526!important;box-shadow:0 12px 28px rgba(1,12,27,.22)!important;overflow:hidden!important;min-width:0!important}
      html.belm-wm-machine-summary .machine-card.belm-summary-mode>*:not(.belm-machine-summary){display:none!important}
      html.belm-wm-machine-summary .machine-card.belm-detail-open{grid-column:1/-1!important}
      html.belm-wm-machine-summary .machine-card.belm-detail-open>.belm-machine-summary{display:none!important}
      html.belm-wm-machine-summary .machine-card.belm-detail-open>.belm-machine-back{display:inline-flex!important}
      html.belm-wm-machine-summary .machine-card.belm-summary-mode>.belm-machine-back{display:none!important}
      .belm-machine-summary{position:relative;display:flex;flex-direction:column;min-height:100%;padding:18px;color:#eef5ff;background:linear-gradient(180deg,#0b213a 0%,#071526 54%,#050d16 100%)}
      .belm-machine-summary-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
      .belm-machine-summary-fleet{display:inline-flex;padding:7px 10px;border-radius:9px;background:#061324;border:1px solid #1a3857;color:#e5f01a;font:900 14px/1.1 Inter,Arial,sans-serif;letter-spacing:.02em}
      .belm-machine-summary-activity{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:#182536;border:1px solid #36485e;color:#f4f7fb;font:800 12px/1 Inter,Arial,sans-serif}
      .belm-machine-summary-activity:before{content:'';width:8px;height:8px;border-radius:50%;background:#16c45b;box-shadow:0 0 10px rgba(22,196,91,.65)}
      .belm-machine-summary-activity.is-grounded:before{background:#ef4343;box-shadow:0 0 10px rgba(239,67,67,.65)}
      .belm-machine-summary-activity.is-progress:before{background:#f2c400;box-shadow:0 0 10px rgba(242,196,0,.55)}
      .belm-machine-summary-visual{display:flex;align-items:center;justify-content:center;min-height:160px;margin:0 0 16px;border:1px solid #1a334e;border-radius:14px;background:radial-gradient(circle at 50% 38%,#173a5f 0,#0c223b 48%,#071526 100%);text-align:center;padding:22px}
      .belm-machine-summary-visual span{font:900 22px/1.15 Inter,Arial,sans-serif;color:#fff;max-width:90%}
      .belm-machine-summary h3{margin:0 0 5px;font-size:22px;line-height:1.15;color:#fff}
      .belm-machine-summary-meta{margin:0;color:#a9bfd8;font-size:13px;line-height:1.45;min-height:38px}
      .belm-machine-summary-facts{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:15px;border-top:1px dashed rgba(164,188,215,.2);border-bottom:1px dashed rgba(164,188,215,.2)}
      .belm-machine-summary-fact{padding:13px 4px;min-width:0}
      .belm-machine-summary-fact:nth-child(odd){padding-right:10px}.belm-machine-summary-fact:nth-child(even){padding-left:10px}
      .belm-machine-summary-fact span{display:block;margin-bottom:5px;color:#88a5c5;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .belm-machine-summary-fact b{display:block;color:#f5f7fa;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
      .belm-machine-summary-service{margin:14px 0 8px;color:#b6c8dc;font-size:12px;line-height:1.4}
      .belm-machine-summary-bar{height:5px;border-radius:99px;background:#111b28;overflow:hidden;margin-bottom:15px}
      .belm-machine-summary-bar>i{display:block;width:72%;height:100%;background:#24ba64;border-radius:99px}
      .belm-machine-summary.level-yellow .belm-machine-summary-bar>i{background:#f0c300}.belm-machine-summary.level-red .belm-machine-summary-bar>i{background:#ef4d43}.belm-machine-summary.level-unknown .belm-machine-summary-bar>i{background:#60758d}
      .belm-machine-summary-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:auto}
      .belm-machine-summary-actions button{min-height:44px;border-radius:11px;font-weight:900;font-size:13px;cursor:pointer}
      .belm-machine-summary-report{border:1px solid #30445c;background:#07111d;color:#f2f5f8}.belm-machine-summary-report:disabled{opacity:.45;cursor:not-allowed}
      .belm-machine-summary-view{border:1px solid #ffda00;background:#ffdf00;color:#07111d}.belm-machine-summary-view:hover{filter:brightness(1.04)}
      .belm-machine-back{display:none;align-items:center;justify-content:center;margin:0 0 12px;padding:8px 12px;border:1px solid #2d7bc2;border-radius:9px;background:#0b3358;color:#fff;font-weight:900;cursor:pointer}
      @media(max-width:720px){html.belm-wm-machine-summary #machineListBody .machine-list{grid-template-columns:1fr!important}.belm-machine-summary-visual{min-height:125px}.belm-machine-summary h3{font-size:20px}}
    `;
    document.head.appendChild(style);
  }

  function enhanceWorkshopCard(card){
    if(!workshopSummary)return;
    injectWorkshopStyle();
    let summary=card.querySelector(':scope>.belm-machine-summary');
    if(!summary){
      summary=document.createElement('section');
      summary.className='belm-machine-summary';
      summary.innerHTML=`
        <div class="belm-machine-summary-head"><span class="belm-machine-summary-fleet" data-summary-fleet>—</span><span class="belm-machine-summary-activity" data-summary-activity>Working</span></div>
        <div class="belm-machine-summary-visual"><span data-summary-visual>Machine</span></div>
        <h3 data-summary-title>Machine</h3>
        <p class="belm-machine-summary-meta" data-summary-meta></p>
        <div class="belm-machine-summary-facts">
          <div class="belm-machine-summary-fact"><span>Customer</span><b data-summary-customer>—</b></div>
          <div class="belm-machine-summary-fact"><span>Condition</span><b data-summary-condition>—</b></div>
          <div class="belm-machine-summary-fact"><span>Operator / Message</span><b data-summary-operator>—</b></div>
          <div class="belm-machine-summary-fact"><span>Alert</span><b data-summary-reason>—</b></div>
        </div>
        <div class="belm-machine-summary-service" data-summary-service>Service due: not available</div>
        <div class="belm-machine-summary-bar"><i></i></div>
        <div class="belm-machine-summary-actions"><button type="button" class="belm-machine-summary-report">Report Issue</button><button type="button" class="belm-machine-summary-view">View Details</button></div>`;
      const back=document.createElement('button');
      back.type='button';back.className='belm-machine-back';back.textContent='← Back to Machine Card';
      card.prepend(back);card.prepend(summary);card.classList.add('belm-summary-mode');
      summary.querySelector('.belm-machine-summary-view').addEventListener('click',()=>{
        card.classList.remove('belm-summary-mode');card.classList.add('belm-detail-open');card.scrollIntoView({behavior:'smooth',block:'start'});
      });
      back.addEventListener('click',()=>{
        card.classList.remove('belm-detail-open');card.classList.add('belm-summary-mode');card.scrollIntoView({behavior:'smooth',block:'nearest'});
      });
      summary.querySelector('.belm-machine-summary-report').addEventListener('click',()=>{
        const link=card.querySelector('.belm-maintenance-process-link');
        if(link)link.click();
      });
    }
    const d=summaryData(card);const level=levelFor(card,d.condition+' '+d.reason);
    summary.classList.remove('level-green','level-yellow','level-red','level-unknown');summary.classList.add('level-'+level);
    setText(summary.querySelector('[data-summary-fleet]'),d.fleet);
    setText(summary.querySelector('[data-summary-title]'),d.title);
    setText(summary.querySelector('[data-summary-visual]'),d.title);
    setText(summary.querySelector('[data-summary-meta]'),d.meta);
    setText(summary.querySelector('[data-summary-customer]'),d.customer);
    setText(summary.querySelector('[data-summary-condition]'),d.condition);
    setText(summary.querySelector('[data-summary-operator]'),d.operator);
    setText(summary.querySelector('[data-summary-reason]'),d.reason);
    setText(summary.querySelector('[data-summary-service]'),d.service);
    const activityEl=summary.querySelector('[data-summary-activity]');
    setText(activityEl,d.activity.label);activityEl.classList.toggle('is-grounded',d.activity.value==='GROUNDED');activityEl.classList.toggle('is-progress',d.activity.value!=='NORMAL'&&d.activity.value!=='GROUNDED');
    const report=summary.querySelector('.belm-machine-summary-report');report.disabled=!card.querySelector('.belm-maintenance-process-link');
  }

  function scan(){
    document.querySelectorAll('.machine-card').forEach(card=>{
      render(card);enhanceWorkshopCard(card);
      if(card.dataset.belmDisplayTimer)return;
      card.dataset.belmDisplayTimer='1';setInterval(()=>rotate(card),4200+Math.floor(Math.random()*1800));
    });
  }
  const observer=new MutationObserver(()=>requestAnimationFrame(scan));
  function boot(){injectWorkshopStyle();scan();observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();