(()=>{
  if(!location.pathname.startsWith('/tech'))return;
  const isMachinePage=()=>new URLSearchParams(location.search).get('view')==='machines';
  const style=document.createElement('style');
  style.textContent=`
    body.belm-tech-machines-page #belmTechnicianCustomerCard{display:none!important}
    body.belm-tech-machines-page #belmTechnicianMachineListHeading{margin-top:0!important}
    body.belm-tech-machines-page #belmTechnicianMachineGrid{display:grid!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;transform:none!important}
    body.belm-tech-machines-page .belm-technician-dashboard-shell>div:first-child{display:none!important}
    .belm-tech-machines-page-head{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:14px 16px;border:1px solid #274b69;border-radius:14px;background:#071b2e;color:#fff}
    .belm-tech-machines-page-head a{display:grid;place-items:center;width:40px;height:40px;border:1px solid #355a78;border-radius:10px;color:#fff;text-decoration:none;font-size:22px}
    .belm-tech-machines-page-head span{display:block;color:#7fa2bf;font-size:11px;margin-top:3px}
    @media(max-width:600px){.belm-tech-machines-page-head{margin:0 0 12px;padding:11px 12px}}
  `;
  document.head.appendChild(style);

  function wire(){
    const button=document.querySelector('[data-technician-view-machines]');
    if(button&&!button.dataset.belmDedicatedMachinePage){
      button.dataset.belmDedicatedMachinePage='1';
      button.addEventListener('click',e=>{
        e.preventDefault();e.stopImmediatePropagation();e.stopPropagation();
        location.href='/tech?view=machines';
      },true);
    }
    if(!isMachinePage())return;
    document.body.classList.add('belm-tech-machines-page');
    const grid=document.getElementById('belmTechnicianMachineGrid');
    const heading=document.getElementById('belmTechnicianMachineListHeading');
    if(grid){grid.classList.remove('belm-technician-machine-grid-collapsed');grid.hidden=false;}
    if(heading){
      heading.classList.remove('belm-technician-machine-list-heading-collapsed');
      if(!document.getElementById('belmTechMachinesPageHead')){
        const head=document.createElement('div');head.id='belmTechMachinesPageHead';head.className='belm-tech-machines-page-head';
        head.innerHTML='<a href="/tech" aria-label="Back to Technician Dashboard">←</a><div><b>MY MACHINES</b><span>Assigned machines only</span></div>';
        heading.before(head);
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
  const mo=new MutationObserver(wire);mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>mo.disconnect(),15000);
})();