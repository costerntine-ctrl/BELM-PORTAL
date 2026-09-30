(function(){
  'use strict';
  if(window.__belmSharedMachineCardV827)return;
  window.__belmSharedMachineCardV827=true;

  const params=new URLSearchParams(location.search);
  if(location.pathname.startsWith('/customers-manager/')&&params.get('view')==='all-machines'&&params.get('embed')==='1')return;

  const style=document.createElement('style');
  style.id='belm-shared-machine-card-v827-style';
  style.textContent=`
    .belm-shared-machine-card-v827{position:relative!important;box-sizing:border-box!important;overflow:hidden!important;border:1px solid #1b3a57!important;border-radius:20px!important;background:#071526!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important;color:#eef5ff!important;min-height:680px!important;padding:0!important}
    .belm-shared-machine-card-v827.belm-shared-level-red{--belm-shared-level:#ef4d43}
    .belm-shared-machine-card-v827.belm-shared-level-yellow{--belm-shared-level:#f0c300}
    .belm-shared-machine-card-v827.belm-shared-level-green{--belm-shared-level:#20b85d}
    .belm-shared-machine-card-v827.belm-shared-level-neutral{--belm-shared-level:#73879c}
    .belm-shared-machine-card-v827.belm-shared-summary-open>*:not(.belm-shared-summary-v827){display:none!important}
    /* V837: in Customer Overview the older #machineListDialog card rules
       (30px padding + range-tinted background) wrapped the summary in a
       second frame, so each machine looked like two stacked cards. The
       summary is now one card; the range colour stays as the top accent. */
    html:not(#belm-v837) #machineListDialog .machine-card.belm-shared-machine-card-v827.belm-shared-summary-open{padding:0!important;overflow:hidden!important;border:1px solid #1b3a57!important;background:#071526!important;box-shadow:0 12px 30px rgba(0,0,0,.24)!important;min-height:0!important;height:auto!important}
    html:not(#belm-v837) #machineListDialog .machine-card.belm-shared-machine-card-v827.belm-shared-summary-open>.belm-shared-summary-v827{min-height:0!important;padding-top:24px!important}
    .belm-shared-summary-v827{display:flex;flex-direction:column;min-height:680px;padding:18px;box-sizing:border-box;background:linear-gradient(180deg,#0b213a 0%,#071526 54%,#050d16 100%);color:#eef5ff}
    .belm-shared-head-v827{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
    .belm-shared-fleet-v827{display:inline-flex;padding:7px 10px;border-radius:9px;background:#061324;border:1px solid #1a3857;color:#e5f01a;font:900 14px/1.1 Inter,Arial,sans-serif;letter-spacing:.02em}
    .belm-shared-activity-v827{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;background:#182536;border:1px solid #36485e;color:#f4f7fb;font:800 12px/1 Inter,Arial,sans-serif}
    .belm-shared-activity-v827:before{content:'';width:8px;height:8px;border-radius:50%;background:#16c45b;box-shadow:0 0 10px rgba(22,196,91,.65)}
    .belm-shared-activity-v827.is-progress:before{background:#f2c400;box-shadow:0 0 10px rgba(242,196,0,.55)}
    .belm-shared-activity-v827.is-grounded:before{background:#ef4343;box-shadow:0 0 10px rgba(239,67,67,.65)}
    .belm-shared-visual-v827{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:16/10;max-height:245px;margin:0 0 16px;border:1px solid #1a334e;border-radius:14px;background:radial-gradient(circle at 50% 38%,#173a5f 0,#0c223b 48%,#071526 100%);text-align:center;padding:22px;overflow:hidden;box-sizing:border-box}
    .belm-shared-visual-v827.has-photo{padding:0;background:#eef2f6}
    .belm-shared-visual-v827 img{width:100%;height:100%;max-height:245px;object-fit:contain;object-position:center;background:#eef2f6}
    .belm-shared-visual-v827 span{font:900 22px/1.15 Inter,Arial,sans-serif;color:#fff;max-width:90%}
    .belm-shared-summary-v827 h3{margin:0 0 5px;font-size:23px;line-height:1.15;color:#fff}
    .belm-shared-meta-v827{margin:0;color:#a9bfd8;font-size:12px;line-height:1.4;min-height:30px}
    .belm-shared-facts-v827{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:15px;border-top:1px dashed rgba(164,188,215,.2);border-bottom:1px dashed rgba(164,188,215,.2)}
    .belm-shared-fact-v827{padding:13px 5px;min-width:0}
    .belm-shared-fact-v827:nth-child(odd){padding-right:10px}.belm-shared-fact-v827:nth-child(even){padding-left:10px}
    .belm-shared-fact-v827 span{display:block;margin-bottom:5px;color:#88a5c5;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.04em}
    .belm-shared-fact-v827 b{display:block;color:#f5f7fa;font-size:13px;line-height:1.35;overflow-wrap:anywhere}
    .belm-shared-alert-v827{margin:6px 4px 6px 6px!important;padding:10px!important;border:1px solid #29425c;border-radius:10px;background:rgba(8,25,42,.72)}
    .belm-shared-level-red .belm-shared-alert-v827{border-color:#ef4d43;background:rgba(115,23,27,.24)}
    .belm-shared-level-yellow .belm-shared-alert-v827{border-color:#f0c300;background:rgba(111,87,5,.22)}
    .belm-shared-service-v827{margin-top:13px;color:#b5c8da;font-size:12px;line-height:1.35}
    .belm-shared-bar-v827{height:5px;margin:10px 0 18px;border-radius:999px;background:#142439;overflow:hidden}
    .belm-shared-bar-v827 i{display:block;width:72%;height:100%;border-radius:inherit;background:var(--belm-shared-level,#73879c)}
    .belm-shared-actions-v827{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:auto}
    .belm-shared-actions-v827 button{min-height:48px;border-radius:11px;font:900 12px Inter,Arial,sans-serif;cursor:pointer}
    .belm-shared-primary-v827{border:1px solid #30445c;background:#07111d;color:#f2f5f8}
    .belm-shared-primary-v827:disabled{opacity:.45;cursor:not-allowed}
    .belm-shared-view-v827{border:1px solid #ffda00;background:#ffdf00;color:#07111d}
    .belm-shared-view-v827[aria-expanded="true"]{filter:brightness(.92);box-shadow:inset 0 0 0 2px rgba(7,17,29,.18)}
    .belm-shared-action-panel-v838{display:grid;gap:14px;margin-top:15px;padding-top:15px;border-top:1px solid rgba(125,159,193,.24)}
    .belm-shared-action-panel-v838[hidden]{display:none!important}
    .belm-shared-action-group-v838{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px}
    .belm-shared-action-panel-v838 button{display:flex;align-items:center;justify-content:center;gap:9px;min-height:54px;padding:10px 12px;border:1px solid #294966;border-radius:12px;background:#10263b;color:#eef5ff;font:900 12px/1.2 Inter,Arial,sans-serif;cursor:pointer;transition:filter .15s ease,transform .15s ease}
    .belm-shared-action-panel-v838 button:hover{filter:brightness(1.12);transform:translateY(-1px)}
    .belm-shared-action-panel-v838 button:focus-visible{outline:3px solid rgba(255,223,0,.5);outline-offset:2px}
    .belm-shared-action-icon-v838{color:#42e36f;font-size:17px;line-height:1}
    .belm-shared-action-job-v838{border-color:#8c52e8!important;background:linear-gradient(135deg,#7650df,#8a38df)!important}
    .belm-shared-action-job-v838 .belm-shared-action-icon-v838{color:#fff}
    .belm-shared-action-edit-v838{border-color:#62aef2!important}
    .belm-shared-action-delete-v838,.belm-shared-action-forget-v838{border-color:#ff4545!important}
    @media(max-width:760px){.belm-shared-machine-card-v827{min-height:0!important}.belm-shared-summary-v827{min-height:0}.belm-shared-facts-v827{grid-template-columns:1fr 1fr}.belm-shared-actions-v827{grid-template-columns:1fr 1.25fr}.belm-shared-action-group-v838{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:380px){.belm-shared-action-group-v838{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.belm-shared-action-panel-v838 button{transition:none}.belm-shared-action-panel-v838 button:hover{transform:none}}
  `;
  document.head.appendChild(style);

  const txt=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const first=(card,selectors)=>{for(const s of selectors){const el=card.querySelector(s);if(el&&txt(el))return txt(el)}return''};
  const closestList=card=>card.closest('.machine-list,.belm-customer-machine-grid,.belm-technician-machine-grid,.assigned-machine-grid,[class*="machine-grid"]')||card.parentElement;

  function role(){
    if(location.pathname.startsWith('/customers-manager/'))return'admin';
    if(location.pathname.startsWith('/concept-dashboards/02-technician')||location.pathname.startsWith('/tech'))return'technician';
    if(localStorage.getItem('belm_customer_token'))return'customer';
    if(localStorage.getItem('belm_admin_token'))return'admin';
    return'customer';
  }

  function machineLevel(card){
    const raw=String(card.dataset.belmEffectiveRange||card.dataset.machineEffectiveRange||card.dataset.belmConditionRange||card.dataset.machineConditionLevel||'').toUpperCase();
    const cls=card.className;
    if(raw.includes('RED')||raw.includes('CRITICAL')||/status-red|range-red|level-red/.test(cls))return'red';
    if(raw.includes('YELLOW')||raw.includes('ATTENTION')||/status-yellow|range-yellow|level-yellow/.test(cls))return'yellow';
    if(raw.includes('GREEN')||raw.includes('NORMAL')||/status-green|range-green|level-green/.test(cls))return'green';
    return'neutral';
  }

  function conditionLabel(card,level){
    const direct=first(card,['.machine-status','.belm-customer-condition-badge-v422','[data-tech-condition-label]']);
    if(direct)return direct;
    return level==='red'?"Red — Don't operate":level==='yellow'?'Yellow — Attention':level==='green'?'Green — Normal':'Not checked';
  }

  function activity(card){
    const select=card.querySelector('[data-operational-status],[data-customer-activity-status],[data-belm-op-status]');
    const v=String(select?.value||card.dataset.belmActivity||'NORMAL').toUpperCase();
    const label={NORMAL:'Working',SERVICE_IN_PROGRESS:'Service',CHECKUP_IN_PROGRESS:'Check-up',MAINTENANCE_IN_PROGRESS:'Maintenance',GROUNDED:'Grounded'}[v]||txt(select?.selectedOptions?.[0])||'Working';
    return {value:v,label};
  }

  function photo(card){
    const img=card.querySelector('.belm-machine-summary-photo,.belm-machine-photo-box img,.tech-machine-summary .belm-machine-summary-visual img');
    return img?.getAttribute('src')||'';
  }

  function title(card){
    return card.dataset.belmMachineTitle||first(card,['.machine-title-row h4','[data-summary-title]','.tech-machine-summary h3','.belm-machine-native-head .font-medium','.belm-machine-native-head h3','.belm-machine-native-head strong'])||'Machine';
  }
  function fleet(card){
    return card.dataset.belmMachineFleet||first(card,['.machine-fleet-number b','.belm-customer-fleet-number b','[data-summary-fleet]','.tech-machine-summary-fleet'])||'—';
  }
  function meta(card){
    return card.dataset.belmMachineMeta||first(card,['.machine-title-row+p','.belm-shared-source-meta','.tech-machine-summary-meta'])||'Machine details';
  }
  function customer(card){
    return card.dataset.belmMachineCustomer||first(card,['.machine-customer-tag','[data-summary-customer]','.tech-machine-summary-fact:first-child b'])||'Customer';
  }
  function operator(card){
    return first(card,['.machine-operator-message strong','.belm-customer-operator-message-v422 strong','[data-tech-operator-message]','.tech-machine-summary-fact:nth-child(3) b'])||'No operator message reported yet.';
  }
  function alertText(card,level){
    return first(card,['.machine-alert-reason','.belm-customer-condition-copy-v422 strong','[data-tech-machine-condition-message]','.tech-machine-summary-fact.alert-box b'])||
      (level==='red'?'Machine requires immediate attention.':level==='yellow'?'Machine requires attention.':level==='green'?'Machine condition normal.':'No active machine alert.');
  }
  function service(card){
    return first(card,['.service-due-badge','.belm-service-due-head-v210 strong','[data-summary-service]','.tech-machine-summary-service'])||'Service due: not available';
  }

  function findPrimary(card){
    const r=role();
    const nodes=[...card.querySelectorAll('a,button,[role="button"]')].filter(el=>!el.closest('.belm-shared-summary-v827'));
    const match=(re)=>nodes.find(el=>re.test(txt(el)));
    if(r==='admin')return match(/create job card|job card/i);
    if(r==='technician')return match(/job card|my job cards/i);
    return match(/job card|service request/i);
  }

  function primaryLabel(){
    const r=role();
    return r==='admin'?'Create Job Card':r==='technician'?'Job Card':'Job Card';
  }

  const actionDefinitions=[
    {key:'report',label:'Report',icon:'▤',group:'workflow',selectors:['[data-view-reports]','[data-customer-report-menu]','[data-operator-report-menu]','.belm-technician-report-link','.report'],pattern:/^Report(?: Issue)?$/i},
    {key:'checkup',label:'Check Up',icon:'✓',group:'workflow',selectors:['[data-checkup]','[data-customer-checkup]','[data-tech-checkup-machine]','.check'],pattern:/^Check[ -]?Up$/i},
    {key:'parts',label:'Service Parts',icon:'⚙',group:'workflow',selectors:['[data-service-parts]','[data-tech-service-parts-machine]','.parts'],pattern:/^Service Parts$/i},
    {key:'job',label:'Job Card',icon:'▣',group:'workflow',selectors:['[data-tech-jobcards-machine]','.belm-maintenance-process-link','.jobs'],pattern:/^(?:Create )?(?:Machine )?Job Cards?$/i},
    {key:'edit',label:'Edit Machine',icon:'',group:'management',selectors:['[data-edit-machine]','[data-customer-edit-machine]'],pattern:/^Edit Machine$/i},
    {key:'delete',label:'Delete Machine',icon:'',group:'management',selectors:['[data-delete-machine]','[data-customer-delete-machine]'],pattern:/^Delete Machine$/i},
    {key:'forget',label:'Forget Permanently',icon:'',group:'management',selectors:['[data-forget-machine]','[data-customer-forget-machine]'],pattern:/^Forget Permanently$/i}
  ];

  function sourceActions(card){
    return [...card.querySelectorAll('a,button,[role="button"]')].filter(el=>!el.closest('.belm-shared-summary-v827'));
  }

  function isAllowedAction(el){
    if(!el||el.disabled||el.hidden||el.getAttribute('aria-disabled')==='true')return false;
    if(el.style.display==='none'||el.style.visibility==='hidden')return false;
    return !el.closest('[hidden]');
  }

  function findAction(card,definition){
    const nodes=sourceActions(card);
    for(const selector of definition.selectors){
      const match=nodes.find(el=>el.matches(selector)&&isAllowedAction(el));
      if(match)return match;
    }
    return nodes.find(el=>definition.pattern.test(txt(el))&&isAllowedAction(el))||null;
  }

  function syncActionPanel(card,summary){
    const panel=summary.querySelector('.belm-shared-action-panel-v838');
    if(!panel)return;
    const available=actionDefinitions.map(definition=>({definition,target:findAction(card,definition)})).filter(item=>item.target);
    const actionKey=available.map(item=>item.definition.key).join(' ');
    if(panel.dataset.availableActions===actionKey)return;
    for(const group of ['workflow','management']){
      const host=panel.querySelector(`[data-shared-action-group="${group}"]`);
      const items=available.filter(item=>item.definition.group===group);
      host.hidden=!items.length;
      host.replaceChildren(...items.map(({definition})=>{
        const button=document.createElement('button');
        button.type='button';
        button.className=`belm-shared-action-${definition.key}-v838`;
        button.dataset.sharedAction=definition.key;
        button.innerHTML=(definition.icon?`<span class="belm-shared-action-icon-v838" aria-hidden="true">${definition.icon}</span>`:'')+`<span>${definition.label}</span>`;
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          const currentTarget=findAction(card,definition);
          if(currentTarget)currentTarget.click();
        });
        return button;
      }));
    }
    panel.dataset.availableActions=actionKey;
    if(!available.length){
      panel.hidden=true;
      const toggle=summary.querySelector('.belm-shared-view-v827');
      toggle.setAttribute('aria-expanded','false');
    }
  }

  function sync(card,summary){
    const level=machineLevel(card),a=activity(card);
    card.classList.remove('belm-shared-level-red','belm-shared-level-yellow','belm-shared-level-green','belm-shared-level-neutral');
    card.classList.add('belm-shared-level-'+level);
    summary.querySelector('[data-shared-fleet]').textContent=fleet(card);
    summary.querySelector('[data-shared-title]').textContent=title(card);
    summary.querySelector('[data-shared-meta]').textContent=meta(card);
    summary.querySelector('[data-shared-customer]').textContent=customer(card);
    summary.querySelector('[data-shared-condition]').textContent=conditionLabel(card,level);
    summary.querySelector('[data-shared-operator]').textContent=operator(card);
    summary.querySelector('[data-shared-alert]').textContent=alertText(card,level);
    summary.querySelector('[data-shared-service]').textContent=service(card);
    const act=summary.querySelector('[data-shared-activity]');act.textContent=a.label;act.classList.toggle('is-grounded',a.value==='GROUNDED');act.classList.toggle('is-progress',a.value!=='NORMAL'&&a.value!=='GROUNDED');
    const visual=summary.querySelector('.belm-shared-visual-v827'),src=photo(card);
    visual.classList.toggle('has-photo',!!src);
    visual.innerHTML=src?'<img src="'+esc(src)+'" alt="Machine photo">':'<span>'+esc(title(card))+'</span>';
    const primary=summary.querySelector('.belm-shared-primary-v827');
    primary.textContent=primaryLabel();primary.disabled=!findPrimary(card);
    syncActionPanel(card,summary);
  }

  function enhance(card){
    if(!card||card.dataset.belmSharedCard827==='1')return;
    if(card.closest('.belm-shared-summary-v827'))return;
    if(card.matches('.tech-summary-card')&&location.pathname.startsWith('/concept-dashboards/02-technician/'))return;
    card.dataset.belmSharedCard827='1';
    card.classList.add('belm-shared-machine-card-v827','belm-shared-summary-open');

    const summary=document.createElement('section');summary.className='belm-shared-summary-v827';
    const panelId=`belm-shared-action-panel-${Math.random().toString(36).slice(2,10)}`;
    summary.innerHTML=`
      <div class="belm-shared-head-v827"><span class="belm-shared-fleet-v827" data-shared-fleet>—</span><span class="belm-shared-activity-v827" data-shared-activity>Working</span></div>
      <div class="belm-shared-visual-v827"><span>Machine</span></div>
      <h3 data-shared-title>Machine</h3>
      <p class="belm-shared-meta-v827" data-shared-meta>Machine details</p>
      <div class="belm-shared-facts-v827">
        <div class="belm-shared-fact-v827"><span>Customer</span><b data-shared-customer>Customer</b></div>
        <div class="belm-shared-fact-v827"><span>Condition</span><b data-shared-condition>Not checked</b></div>
        <div class="belm-shared-fact-v827"><span>Operator / Message</span><b data-shared-operator>No operator message reported yet.</b></div>
        <div class="belm-shared-fact-v827 belm-shared-alert-v827"><span>Alert</span><b data-shared-alert>No active machine alert.</b></div>
      </div>
      <div class="belm-shared-service-v827" data-shared-service>Service due: not available</div>
      <div class="belm-shared-bar-v827"><i></i></div>
      <div class="belm-shared-actions-v827"><button type="button" class="belm-shared-primary-v827">Job Card</button><button type="button" class="belm-shared-view-v827" aria-expanded="false" aria-controls="${panelId}">View Details</button></div>
      <div class="belm-shared-action-panel-v838" id="${panelId}" hidden>
        <div class="belm-shared-action-group-v838" data-shared-action-group="workflow"></div>
        <div class="belm-shared-action-group-v838" data-shared-action-group="management"></div>
      </div>`;
    card.prepend(summary);

    summary.querySelector('.belm-shared-primary-v827').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const target=findPrimary(card);if(target)target.click();
    });
    summary.querySelector('.belm-shared-view-v827').addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const button=e.currentTarget,panel=summary.querySelector('.belm-shared-action-panel-v838');
      syncActionPanel(card,summary);
      const open=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!open));
      panel.hidden=open;
    });
    sync(card,summary);
  }

  function scan(){
    document.querySelectorAll('.machine-card,.belm-customer-machine-card,.belm-technician-machine-card').forEach(enhance);
    document.querySelectorAll('.belm-shared-machine-card-v827').forEach(card=>{const s=card.querySelector(':scope>.belm-shared-summary-v827');if(s)sync(card,s)});
  }
  let timer=0;
  const queue=()=>{clearTimeout(timer);timer=setTimeout(scan,80)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src','value','style','hidden','disabled','aria-disabled']});
  window.addEventListener('belm-customer-activity-status-changed',queue);
  window.addEventListener('belm-technician-data-changed',queue);
  setTimeout(scan,500);setTimeout(scan,1600);
})();
