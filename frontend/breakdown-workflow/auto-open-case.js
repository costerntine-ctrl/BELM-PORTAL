(function(){
  'use strict';
  const params=new URLSearchParams(location.search);
  const actor=String(params.get('actor')||'').toLowerCase();
  const embedded=params.get('embed')==='1';
  const view=String(params.get('view')||'job-cards').toLowerCase();
  const moduleKey=String(params.get('module')||'').toLowerCase();

  // V803: mirror Customer Job Cards using the exact BELM Workshop Manager
  // Job Cards wrapper pattern. The wrapper embeds this shared workflow with
  // actor=customer&embed=1, so customer data/permissions remain unchanged.
  if(actor==='customer'&&!embedded&&view==='job-cards'){
    const out=new URL('/customer-workshop-manager/job-cards.html',location.origin);
    params.forEach((value,key)=>{
      if(key==='actor'||key==='embed'||key==='view')return;
      out.searchParams.set(key,value);
    });
    location.replace(out.pathname+out.search);
    return;
  }

  // Non-Job-Card customer workflow views keep the customer-scoped BELM
  // contextual navigation shell already used for Diagnosis/Testing/etc.
  if(actor==='customer'&&!embedded){
    import('/breakdown-workflow/customer-job-card-belm-v795.js?v=803').catch(function(error){
      console.warn('Customer Job Card BELM mirror failed to load:',error);
    });
  }

  // V804: the Customer Workshop & Job Cards shell was approved visually.
  // Apply the same clean module menu to BELM Job Cards while preserving BELM
  // admin data, permissions and the shared workflow engine.
  if(actor==='admin'&&!embedded&&(moduleKey===''||moduleKey==='workshop')){
    const mirrorBelmWorkshopShell=()=>{
      const sidebar=document.getElementById('belmAdminSidebar');
      if(!sidebar)return false;

      // Keep the exact Workshop menu used by the approved Customer mirror.
      const allowed=new Set([
        'INSPECTION & REPAIR DASHBOARD',
        'JOB CARDS',
        'DIAGNOSIS',
        'WAITING FOR SPARES',
        'TESTING & COMPLETION',
        'WORKSHOP REPORTS',
        'MACHINE HISTORY',
        'COMMUNICATION'
      ]);
      sidebar.querySelectorAll('.belm-sidebar-link').forEach(link=>{
        const label=String(link.querySelector('span:nth-child(2)')?.textContent||link.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
        if(label&&!allowed.has(label))link.remove();
      });

      const back=sidebar.querySelector('.belm-sidebar-back-main');
      if(back){
        back.href='/concept-dashboards/11-workshop-manager/';
        back.textContent='← WORKSHOP DASHBOARD';
      }

      const moduleHead=sidebar.querySelector('.belm-sidebar-module-head');
      if(moduleHead){
        const small=moduleHead.querySelector('small');
        const strong=moduleHead.querySelector('strong');
        if(small)small.textContent='WORKSHOP MENU';
        if(strong)strong.textContent='Workshop & Job Cards';
      }

      // Same display-fit rule as the approved Customer Job Card sidebar.
      const fit=()=>{
        if(!window.matchMedia('(min-width: 981px)').matches){
          document.documentElement.style.removeProperty('--belm-sidebar-width');
          return;
        }
        const labels=Array.from(sidebar.querySelectorAll('.belm-sidebar-link > span:nth-child(2)'));
        const labelWidth=labels.reduce((max,label)=>Math.max(max,label.scrollWidth||0),0);
        const brandCopy=sidebar.querySelector('.belm-sidebar-brand-copy');
        const userCopy=sidebar.querySelector('.belm-sidebar-user-copy');
        const brandWidth=brandCopy?(brandCopy.scrollWidth+96):0;
        const userWidth=userCopy?(userCopy.scrollWidth+84):0;
        const width=Math.max(250,Math.min(310,Math.ceil(Math.max(labelWidth+92,brandWidth,userWidth))));
        document.documentElement.style.setProperty('--belm-sidebar-width',width+'px');
      };
      requestAnimationFrame(fit);
      if(!window.__belmJobCardFitV804){
        window.__belmJobCardFitV804=true;
        window.addEventListener('resize',fit);
      }
      return true;
    };

    if(!mirrorBelmWorkshopShell()){
      const observer=new MutationObserver(()=>{
        if(mirrorBelmWorkshopShell())observer.disconnect();
      });
      observer.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(()=>observer.disconnect(),10000);
    }
  }

  const caseId=params.get('case')||'';
  const jobId=params.get('job')||'';
  const action=String(params.get('action')||'').toLowerCase();
  if(!caseId&&!jobId)return;

  function openSelected(){
    if(caseId){
      const card=document.querySelector(`[data-case="${CSS.escape(caseId)}"]`);
      if(card){card.click();return true;}
    }
    if(jobId){
      const processRow=document.querySelector(`[data-job-card="${CSS.escape(jobId)}"]`);
      if(processRow){processRow.click();return true;}
    }
    return false;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries+=1;
    if(openSelected()||tries>100){
      clearInterval(timer);
      if(action==='checking'){
        window.setTimeout(()=>{
          const detail=document.getElementById('caseDetail');
          if(detail)detail.scrollIntoView({behavior:'smooth',block:'start'});
        },250);
      }
    }
  },100);
})();
