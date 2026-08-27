(()=>{
  const homeMessages=[
    {text:'Safety is everyone’s responsibility. Work safe, go home safe.',by:'BELM Team'},
    {text:'Every Job Card must have a clear owner, status and next action.',by:'BELM Workshop'},
    {text:'Diagnose first, record the finding, then repair with control.',by:'BELM Technical'},
    {text:'Keep workshop, store and procurement working from one live record.',by:'BELM Operations'},
    {text:'Quality work. Safety first. On time.',by:'BELM General Tech'}
  ];

  // V606: Main BELM account can return to the full Main Menu. A Workshop Manager
  // stays inside PORTAL-BELM WM and uses this page as their home dashboard.
  const mainMenuBack=document.getElementById('mainMenuBackButton');
  let currentUser=null;
  try{currentUser=JSON.parse(localStorage.getItem('belm_admin_user')||'null');}catch(_){ }
  const role=String(currentUser?.role||'').trim().toLowerCase();
  const isMainBelmAccount=role==='super admin'||currentUser?.allowedPages===null;
  if(mainMenuBack){
    mainMenuBack.hidden=!isMainBelmAccount;
    mainMenuBack.style.display=isMainBelmAccount?'inline-flex':'none';
    if(isMainBelmAccount)mainMenuBack.setAttribute('href','/overview-manager/');
  }

  document.getElementById('bwLogoutButton')?.addEventListener('click',()=>{
    localStorage.removeItem('belm_admin_token');
    localStorage.removeItem('belm_admin_user');
    localStorage.removeItem('belm_active_account_type');
    location.replace('/login');
  });
  const root=document.querySelector('.bw-home-message-v603');
  if(!root)return;
  let index=0,timer=null;
  const textEl=root.querySelector('[data-bw-message-text]'),byEl=root.querySelector('[data-bw-message-by]'),dots=root.querySelector('[data-bw-message-dots]');
  const render=()=>{const item=homeMessages[index];if(textEl)textEl.textContent=item.text;if(byEl)byEl.textContent=`— ${item.by}`;if(dots){dots.innerHTML=homeMessages.map((_,i)=>`<button type="button" aria-label="Message ${i+1}" class="${i===index?'active':''}" data-bw-dot="${i}"></button>`).join('');dots.querySelectorAll('[data-bw-dot]').forEach(button=>button.addEventListener('click',()=>{index=Number(button.dataset.bwDot);render();restart();}));}};
  const next=()=>{index=(index+1)%homeMessages.length;render();},prev=()=>{index=(index-1+homeMessages.length)%homeMessages.length;render();},restart=()=>{if(timer)clearInterval(timer);timer=setInterval(next,6500);};
  root.querySelector('[data-bw-message-next]')?.addEventListener('click',()=>{next();restart();});root.querySelector('[data-bw-message-prev]')?.addEventListener('click',()=>{prev();restart();});render();restart();
})();
