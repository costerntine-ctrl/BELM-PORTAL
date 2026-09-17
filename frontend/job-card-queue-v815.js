(function(){
  'use strict';
  if(window.__BELM_JOB_CARD_QUEUE_V815)return;
  window.__BELM_JOB_CARD_QUEUE_V815=true;

  var frame=document.getElementById('workflowFrame');
  var processLabels=['Create & Assign','Receive','Diagnosis / Inspection','Manager Review','Maintenance / Spare','Testing','Final Result','Report'];
  var stageCounts=new Array(8).fill(0);
  var observer=null;
  var initTimer=null;

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});}

  function setTopTitle(){
    var title=document.querySelector('.bar b');
    if(title)title.textContent='LIVE JOB CARD / BREAKDOWN QUEUE';
  }

  function ensureStyle(doc){
    if(doc.getElementById('jobCardQueueV815Style'))return;
    var s=doc.createElement('style');
    s.id='jobCardQueueV815Style';
    s.textContent=`
      .jcm814-flow .jcm815-stage{appearance:none;width:100%;min-height:50px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;padding:7px 6px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--muted);font:inherit;font-size:9px;font-weight:900;line-height:1.2;text-transform:uppercase;position:relative;transition:border-color .2s ease,background .2s ease,transform .2s ease;}
      .jcm814-flow button.jcm815-stage{cursor:pointer;}
      .jcm814-flow button.jcm815-stage:hover{border-color:#0b67c2;transform:translateY(-1px);}
      .jcm814-flow .jcm815-stage small{font-size:8px;font-weight:800;text-transform:none;opacity:.9;}
      .jcm814-flow .jcm815-stage .jcm815-count{position:absolute;top:4px;right:5px;min-width:17px;height:17px;display:grid;place-items:center;border-radius:999px;background:#0b3154;color:#fff;font-size:8px;font-weight:900;}
      .jcm814-flow .jcm815-stage.jcm815-active{border-color:#e0ad00;background:color-mix(in srgb,var(--surface) 82%,#f5c518 18%);animation:jcm815Pulse 1.35s ease-in-out infinite;}
      .jcm814-flow .jcm815-stage.jcm815-review-alert{border-color:#e0ad00;box-shadow:0 0 0 1px rgba(245,197,24,.22);animation:jcm815ReviewPulse .9s ease-in-out infinite;}
      .jcm814-flow .jcm815-stage .jcm815-wa{display:none;padding:2px 5px;border-radius:999px;background:#128c4e;color:#fff;font-size:7px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;}
      .jcm814-flow .jcm815-stage.jcm815-review-alert .jcm815-wa{display:inline-flex;}
      .jcm815-focus{outline:2px solid #f5c518!important;outline-offset:3px;animation:jcm815Focus 1.1s ease-in-out 2;}
      .jcm815-modal-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(2,10,20,.72);display:grid;place-items:center;padding:16px;}
      .jcm815-modal{width:min(760px,96vw);max-height:86vh;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--ink);box-shadow:0 24px 60px rgba(0,0,0,.32);}
      .jcm815-modal-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;border-bottom:1px solid var(--line);background:var(--surface);}
      .jcm815-modal-head h3{margin:0;font-size:15px}.jcm815-close{border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);padding:7px 10px;font-weight:900;cursor:pointer;}
      .jcm815-review-list{display:grid;gap:8px;padding:12px;}
      .jcm815-review-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--bg);}
      .jcm815-review-item b{display:block;font-size:11px}.jcm815-review-item small{display:block;margin-top:3px;color:var(--muted);font-size:9px;line-height:1.35}.jcm815-review-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}
      .jcm815-review-actions button{border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--surface);color:var(--ink);font-size:9px;font-weight:900;cursor:pointer}.jcm815-review-actions .wa{background:#128c4e;color:#fff;border-color:#128c4e;}
      @keyframes jcm815Pulse{0%,100%{box-shadow:0 0 0 0 rgba(245,197,24,.08)}50%{box-shadow:0 0 0 4px rgba(245,197,24,.16)}}
      @keyframes jcm815ReviewPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,197,24,.12)}50%{box-shadow:0 0 0 5px rgba(245,197,24,.28)}}
      @keyframes jcm815Focus{0%,100%{transform:scale(1)}50%{transform:scale(1.006)}}
      @media(prefers-reduced-motion:reduce){.jcm814-flow .jcm815-stage.jcm815-active,.jcm814-flow .jcm815-stage.jcm815-review-alert,.jcm815-focus{animation:none!important;}}
      @media(max-width:620px){.jcm815-review-item{grid-template-columns:1fr}.jcm815-review-actions{justify-content:flex-start}.jcm815-modal-backdrop{padding:8px}}
    `;
    doc.head.appendChild(s);
  }

  function findStep(row){
    var processCell=row && row.cells ? row.cells[4] : null;
    if(!processCell)return 0;
    var match=String(processCell.textContent||'').match(/Step\s+(\d+)\s*\/\s*8/i);
    return match?Number(match[1]):0;
  }

  function isClosedRow(row){
    if(!row)return true;
    var techCell=row.cells && row.cells[1] ? String(row.cells[1].textContent||'').toUpperCase() : '';
    var pendingCell=row.cells && row.cells[5] ? String(row.cells[5].textContent||'').toUpperCase() : '';
    return techCell.indexOf('COMPLETED')>=0 || pendingCell.indexOf('CLOSED')>=0;
  }

  function getRows(doc){
    var body=doc.getElementById('jcm814Rows');
    return body?Array.from(body.querySelectorAll('tr[data-job]')):[];
  }

  function updateStageState(doc){
    stageCounts=new Array(8).fill(0);
    getRows(doc).forEach(function(row){
      if(isClosedRow(row))return;
      var step=findStep(row);
      if(step>=1&&step<=8)stageCounts[step-1]++;
    });
    var tiles=doc.querySelectorAll('.jcm814-flow .jcm815-stage');
    tiles.forEach(function(tile,index){
      var count=stageCounts[index]||0;
      tile.classList.toggle('jcm815-active',count>0);
      tile.classList.toggle('jcm815-review-alert',index===3&&count>0);
      var badge=tile.querySelector('.jcm815-count');
      if(badge){badge.textContent=String(count);badge.hidden=count===0;}
      tile.setAttribute('aria-label',(index+1)+'. '+processLabels[index]+(count?'; '+count+' active Job Card'+(count===1?'':'s'):''));
    });
  }

  function buildStages(doc){
    var flow=doc.querySelector('#jobCardManagerV814 .jcm814-flow');
    if(!flow)return false;
    if(flow.dataset.v815==='1'){updateStageState(doc);return true;}
    flow.dataset.v815='1';
    flow.innerHTML=processLabels.map(function(label,index){
      var action=index===0||index===3;
      var tag=action?'button':'div';
      var extra=index===3?'<span class="jcm815-wa">WhatsApp alert</span>':'';
      var hint=index===0?'<small>Create / Reassign</small>':index===3?'<small>Open diagnosis report</small>':'';
      return '<'+tag+' class="jcm815-stage" '+(action?'type="button" data-jcm815-action="'+(index===0?'assign':'review')+'"':'')+'><span>'+(index+1)+'. '+esc(label)+'</span>'+hint+extra+'<span class="jcm815-count" hidden>0</span></'+tag+'>';
    }).join('');
    flow.addEventListener('click',function(event){
      var button=event.target.closest('[data-jcm815-action]');
      if(!button)return;
      if(button.dataset.jcm815Action==='assign')focusAssignment(doc);
      if(button.dataset.jcm815Action==='review')openReviewPicker(doc);
    });
    updateStageState(doc);
    return true;
  }

  function focusAssignment(doc){
    var form=doc.getElementById('jcm814Create');
    var select=doc.getElementById('jcm814Case');
    var note=doc.getElementById('jcm814Note');
    if(!form)return;
    form.scrollIntoView({behavior:'smooth',block:'center'});
    form.classList.remove('jcm815-focus');void form.offsetWidth;form.classList.add('jcm815-focus');
    if(note)note.textContent='Create / Reassign: select the existing work case to change Technician without creating a duplicate Job Card.';
    setTimeout(function(){if(select)select.focus({preventScroll:true});form.classList.remove('jcm815-focus');},650);
  }

  function reviewRows(doc){
    return getRows(doc).filter(function(row){return !isClosedRow(row)&&findStep(row)===4;});
  }

  function rowSummary(row){
    var job=row.cells&&row.cells[0]?String(row.cells[0].innerText||row.cells[0].textContent||'').trim():'Job Card';
    var technician=row.cells&&row.cells[1]?String(row.cells[1].innerText||row.cells[1].textContent||'').trim():'';
    return {job:job,technician:technician};
  }

  function closeModal(doc){var old=doc.getElementById('jcm815ReviewModal');if(old)old.remove();}

  function openReviewPicker(doc){
    closeModal(doc);
    var rows=reviewRows(doc);
    if(!rows.length){
      var note=doc.getElementById('jcm814Note');
      if(note){note.textContent='Manager Review: hakuna Technician Diagnosis Report inayosubiri review kwa sasa.';note.className='jcm814-note';}
      return;
    }
    var backdrop=doc.createElement('div');
    backdrop.id='jcm815ReviewModal';backdrop.className='jcm815-modal-backdrop';
    backdrop.innerHTML='<div class="jcm815-modal" role="dialog" aria-modal="true" aria-label="Manager Review"><div class="jcm815-modal-head"><h3>Manager Review · Technician Diagnosis Report</h3><button class="jcm815-close" type="button">Close</button></div><div class="jcm815-review-list"></div></div>';
    var list=backdrop.querySelector('.jcm815-review-list');
    rows.forEach(function(row,index){
      var summary=rowSummary(row);
      var item=doc.createElement('div');item.className='jcm815-review-item';
      item.innerHTML='<div><b>'+esc(summary.job.replace(/\n+/g,' · '))+'</b><small>'+esc(summary.technician.replace(/\n+/g,' · '))+'</small></div><div class="jcm815-review-actions"><button type="button" data-open="'+index+'">Open Diagnosis Report</button><button type="button" class="wa" data-wa="'+index+'">WhatsApp Alert</button></div>';
      list.appendChild(item);
    });
    backdrop.addEventListener('click',function(event){
      if(event.target===backdrop||event.target.closest('.jcm815-close')){closeModal(doc);return;}
      var open=event.target.closest('[data-open]');
      if(open){
        var row=rows[Number(open.dataset.open)];
        var report=row&&row.querySelector('button[data-view]');
        if(report){closeModal(doc);report.click();}
        else{var note=doc.getElementById('jcm814Note');if(note)note.textContent='Diagnosis report is not ready to open yet.';}
        return;
      }
      var wa=event.target.closest('[data-wa]');
      if(wa){
        var targetRow=rows[Number(wa.dataset.wa)];
        var s=rowSummary(targetRow);
        var msg='BELM Job Card Manager Review Alert\n'+s.job.replace(/\n+/g,' · ')+'\n'+s.technician.replace(/\n+/g,' · ')+'\nTechnician diagnosis report is ready for Workshop Manager review.';
        window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank','noopener');
      }
    });
    doc.body.appendChild(backdrop);
  }

  function syncCreateButton(doc){
    var select=doc.getElementById('jcm814Case');
    var button=doc.getElementById('jcm814Assign');
    var note=doc.getElementById('jcm814Note');
    if(!select||!button)return;
    function update(){
      var caseId=select.value;
      if(!caseId){button.textContent='Create Job Card & Assign Technician';return;}
      var active=getRows(doc).some(function(row){return !isClosedRow(row)&&String(row.dataset.job||'')&&String(row.textContent||'').length>0;});
      if(active){
        button.textContent='Create / Reassign Technician';
        if(note&&/Select a case and Technician/i.test(note.textContent||''))note.textContent='Selected case can be assigned or reassigned. Existing active Job Card stays the same; no duplicate should be created.';
      }
    }
    if(select.dataset.v815!=='1'){select.dataset.v815='1';select.addEventListener('change',update);}
    update();
  }

  function cleanDuplicateQueue(doc){
    var root=doc.getElementById('jobCardManagerV814');
    if(!root)return;

    // BELM Job Cards now use Digital Job Card Control as the single source of truth.
    // The embedded workflow still carries its older Job Card Process/Dashboard table,
    // which duplicates the Active Job Cards + Job Card Register rendered below.
    var legacyProcess=doc.getElementById('jobProcessPanel');
    if(legacyProcess){
      legacyProcess.hidden=true;
      legacyProcess.classList.add('hidden');
      legacyProcess.style.setProperty('display','none','important');
      legacyProcess.setAttribute('aria-hidden','true');
      legacyProcess.setAttribute('data-belm-duplicate-removed','1');
    }

    var grid=doc.querySelector('.grid');
    if(grid&&grid!==root&&root.parentNode===grid.parentNode)grid.style.display='none';
    var toolbar=root.querySelector('.jcm814-toolbar b');
    if(toolbar)toolbar.textContent='Active Job Cards';
  }

  function observe(doc){
    if(observer)observer.disconnect();
    var rows=doc.getElementById('jcm814Rows');
    if(!rows)return;
    observer=new MutationObserver(function(){updateStageState(doc);});
    observer.observe(rows,{childList:true,subtree:true,characterData:true});
  }

  function enhance(){
    setTopTitle();
    var doc=frame?frame.contentDocument:document;
    if(!doc||!doc.body)return false;
    var root=doc.getElementById('jobCardManagerV814');
    if(!root)return false;
    ensureStyle(doc);
    buildStages(doc);
    syncCreateButton(doc);
    cleanDuplicateQueue(doc);
    observe(doc);
    updateStageState(doc);
    return true;
  }

  function waitForManager(){
    var attempts=0;
    clearInterval(initTimer);
    initTimer=setInterval(function(){
      attempts++;
      if(enhance()||attempts>80)clearInterval(initTimer);
    },125);
  }

  setTopTitle();
  if(frame)frame.addEventListener('load',function(){setTimeout(waitForManager,100);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForManager,{once:true});else waitForManager();
})();
