(function(){
  const qs=new URLSearchParams(location.search);
  const actor=(qs.get('actor')||'customer').toLowerCase();
  const isBelm=actor==='belm';
  const customerId=qs.get('customerId')||'';
  const customerToken=localStorage.getItem('belm_customer_token')||'';
  const adminToken=localStorage.getItem('belm_admin_token')||'';
  const alertBox=document.getElementById('pageAlert');
  let technicians=[];
  let toolIssues=[];
  let currentCustomerProfile=null;
  let currentWorkshopModuleActive=true;
  let cwmActiveView='main';
  const cwmStateKey=`belm_cwm_view_state:${actor}:${customerId||'self'}`;
  let restoringCwmState=false;
  let cwmHistoryGuardArmed=false;
  function armCustomerMainHistoryGuard(){
    if(isBelm||cwmHistoryGuardArmed||!localStorage.getItem('belm_customer_token'))return;
    const canonical='/customer-workshop/?actor=customer';
    try{
      history.replaceState({...((history.state&&typeof history.state==='object')?history.state:{}),belmCwmMain:true},'',canonical);
      history.pushState({belmCwmGuard:true},'',canonical);
      cwmHistoryGuardArmed=true;
    }catch(_){}
  }
  function readCwmState(){try{return JSON.parse(sessionStorage.getItem(cwmStateKey)||'{}')||{}}catch(_){return{}}}
  function saveCwmState(){
    if(restoringCwmState)return;
    try{sessionStorage.setItem(cwmStateKey,JSON.stringify({activeView:cwmActiveView,scrollY:Math.max(0,window.scrollY||0),toolDocumentsOpen:cwmActiveView==='store'&&!document.getElementById('toolDocumentsPanel')?.classList.contains('hidden')}))}catch(_){}
  }
  async function showCwmView(view,{restore=false}={}){
    let next=['main','store','settings'].includes(view)?view:'main';
    if(isBelm&&next!=='main')next='main';
    if(next==='store'&&(!currentWorkshopModuleActive||document.getElementById('storeLink')?.classList.contains('cwm-role-hidden')))next='main';
    if(next==='settings'&&document.getElementById('cwmSettingsLink')?.classList.contains('cwm-role-hidden'))next='main';
    cwmActiveView=next;
    document.getElementById('cwmMainDashboard')?.classList.toggle('hidden',next!=='main');
    document.getElementById('cwmStoreView')?.classList.toggle('hidden',next!=='store');
    document.getElementById('cwmSettingsView')?.classList.toggle('hidden',next!=='settings');
    if(next==='store'&&!isBelm)await loadStore();
    if(next==='settings'&&!isBelm)await loadCompanyLogo();
    if(!restore)window.scrollTo({top:0,left:0,behavior:'auto'});
    saveCwmState();
  }
  async function restoreCwmState(){
    const state=readCwmState();
    restoringCwmState=true;
    try{
      await showCwmView(state.activeView||'main',{restore:true});
      if(cwmActiveView==='store'&&state.toolDocumentsOpen&&!isBelm){
        const panel=document.getElementById('toolDocumentsPanel');
        if(panel&&panel.classList.contains('hidden')){panel.classList.remove('hidden');await loadToolIssues()}
      }
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Number(state.scrollY)||0,left:0,behavior:'auto'})));
    }finally{setTimeout(()=>{restoringCwmState=false},80)}
  }

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function show(message,error=false){alertBox.textContent=message;alertBox.className=`alert${error?' error':''}`}
  function clear(){alertBox.className='alert hidden';alertBox.textContent=''}
  async function customerApi(path,options={}){
    const r=await fetch(`/api/customer-portal${path}`,{...options,cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${customerToken}`,...(options.headers||{})}});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch(_){data=null}if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data;
  }
  async function adminApi(path){const r=await fetch(`/api${path}`,{cache:'no-store',headers:{Authorization:`Bearer ${adminToken}`}});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||`Request failed (${r.status}).`);return data}
  function canManageCompanyLogo(profile){
    const type=String(profile?.actorType||'').toLowerCase();
    const role=String(profile?.actorRole||'').toLowerCase();
    return type==='owner'||(type==='assistant'&&role==='admin');
  }
  function normalizeRole(profile){
    if(String(profile?.actorType||'').toLowerCase()==='owner') return 'owner';
    return String(profile?.actorRole||'assistant').toLowerCase().replace(/\s+/g,'_');
  }
  function hasPermission(profile,key){
    if(String(profile?.actorType||'').toLowerCase()==='owner') return true;
    const permissions=profile?.actorPermissions;
    if(permissions===null||permissions===undefined||permissions==='all') return true;
    return Array.isArray(permissions)&&permissions.includes(key);
  }
  function setActionVisible(id,visible){
    const el=document.getElementById(id);if(el)el.classList.toggle('cwm-role-hidden',!visible);
  }
  function applyCustomerRoleAccess(profile,belmOn,workshopModuleActive){
    const role=normalizeRole(profile);
    const ownerAdmin=role==='owner'||role==='admin';
    const workshopRole=ownerAdmin||role==='workshop_manager';
    const storeRole=ownerAdmin||role==='store_keeper'||role==='workshop_manager'||role==='procurement';
    const procurementRole=ownerAdmin||role==='procurement'||role==='workshop_manager';
    const accountsRole=ownerAdmin||role==='accounts';
    const reportRole=!['operator'].includes(role);
    setActionVisible('managerJobCardLink',workshopRole||hasPermission(profile,'workflow'));
    setActionVisible('storeLink',workshopModuleActive&&storeRole&&hasPermission(profile,'store'));
    setActionVisible('cwmProcurementLink',procurementRole&&(hasPermission(profile,'machine-expenses')||hasPermission(profile,'store')));
    setActionVisible('technicianManageLink',!belmOn&&(ownerAdmin||role==='workshop_manager'));
    setActionVisible('managerAnalysisLink',workshopRole||hasPermission(profile,'workflow'));
    setActionVisible('cwmGeneralReportLink',reportRole);
    setActionVisible('cwmPettyCashLink',accountsRole||hasPermission(profile,'machine-expenses'));
    setActionVisible('cwmGeneralAnalysisLink',ownerAdmin||role==='workshop_manager'||role==='accounts');
    setActionVisible('cwmSettingsLink',ownerAdmin||role==='workshop_manager');
    setActionVisible('cwmChecklistTemplateLink',ownerAdmin||role==='workshop_manager'||hasPermission(profile,'check-up'));
    const assign=document.getElementById('cwmAssignFunction');
    if(assign){assign.textContent=belmOn?'BELM Technician Assignment':'Assign / Reassign Technician';assign.classList.toggle('cwm-function-locked',belmOn)}
    const workload=document.getElementById('cwmWorkloadFunction');
    if(workload)workload.textContent=belmOn?'BELM Job Progress':'Technician Workload';
    const roleMeta={
      owner:['CUSTOMER OWNER / ADMIN','Managing Company Workshop','OWNER'],
      admin:['CUSTOMER ADMIN','Managing Company Workshop','ADMIN'],
      workshop_manager:['WORKSHOP MANAGER','Managing Workshop','CONTROL'],
      store_keeper:['STORE KEEPER','Store & Spare Control','STORE'],
      procurement:['PROCUREMENT','Workshop Procurement','PROCUREMENT'],
      accounts:['ACCOUNTS / FINANCE','Workshop Finance','FINANCE'],
      operator:['OPERATOR','Machine Operations','OPERATOR'],
      assistant:['CUSTOMER USER','Customer Workshop','ACCESS']
    };
    const meta=roleMeta[role]||roleMeta.assistant;
    const label=document.getElementById('cwmRoleLabel');
    const title=document.getElementById('cwmRoleTitle');
    const status=document.getElementById('cwmRoleStatus');
    const description=document.getElementById('cwmRoleDescription');
    if(label)label.textContent=meta[0];
    if(title)title.textContent=meta[1];
    if(status)status.textContent=meta[2];
    if(description)description.textContent=`${meta[1]} вЂ” same PORTAL-BELM WM card language, scoped to this customer company and the signed-in role.`;
    document.body.dataset.customerRole=role;
  }

  function renderCompanyLogo(data){
    const img=document.getElementById('cwmCompanyLogoPreview');
    const placeholder=document.getElementById('cwmLogoPlaceholder');
    const remove=document.getElementById('cwmRemoveLogoButton');
    if(data?.logoDataUrl){img.src=data.logoDataUrl;img.hidden=false;placeholder.hidden=true;remove.hidden=!data.canManage}
    else{img.removeAttribute('src');img.hidden=true;placeholder.hidden=false;remove.hidden=true}
    const upload=document.getElementById('cwmUploadLogoButton');
    const canManage=data?.canManage ?? canManageCompanyLogo(currentCustomerProfile);
    upload.disabled=!canManage;
    upload.title=canManage?'Upload JPG or PNG. It will be optimized automatically.':'Only the Customer Owner/Admin can change company branding.';
    upload.textContent=canManage?'Upload Company Logo':'Company Logo В· Owner/Admin Only';
  }
  async function loadCompanyLogo(){
    if(isBelm)return;
    try{renderCompanyLogo(await customerApi('/company-logo'))}catch(e){renderCompanyLogo({canManage:canManageCompanyLogo(currentCustomerProfile)});show(e.message,true)}
  }
  function fileToImage(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read the logo file.'));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(new Error('The selected logo image is not valid.'));img.onload=()=>resolve(img);img.src=reader.result};reader.readAsDataURL(file)})}
  async function prepareCompanyLogo(file){
    if(!file)throw new Error('Choose a company logo.');
    if(!['image/jpeg','image/png'].includes(file.type))throw new Error('Choose a JPG or PNG company logo.');
    if(file.size>6*1024*1024)throw new Error('Logo file is too large. Choose an image under 6MB.');
    const img=await fileToImage(file);
    const max=1200;const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    const logoDataUrl=canvas.toDataURL('image/jpeg',.9);
    const wm=document.createElement('canvas');wm.width=w;wm.height=h;const wx=wm.getContext('2d');wx.fillStyle='#ffffff';wx.fillRect(0,0,w,h);wx.globalAlpha=.13;wx.drawImage(img,0,0,w,h);wx.globalAlpha=1;
    const watermarkDataUrl=wm.toDataURL('image/jpeg',.86);
    return{logoDataUrl,watermarkDataUrl};
  }
  async function uploadCompanyLogo(file){
    const button=document.getElementById('cwmUploadLogoButton');button.disabled=true;button.textContent='Saving LogoвЂ¦';
    try{const prepared=await prepareCompanyLogo(file);const result=await customerApi('/company-logo',{method:'PUT',body:JSON.stringify(prepared)});show(result.message||'Company logo saved.');await loadCompanyLogo()}
    catch(e){show(e.message,true);renderCompanyLogo({canManage:canManageCompanyLogo(currentCustomerProfile)})}
  }
  async function removeCompanyLogo(){
    if(!confirm('Remove the company logo watermark from PORTAL-CWM documents?'))return;
    try{const result=await customerApi('/company-logo',{method:'DELETE'});show(result.message||'Company logo removed.');await loadCompanyLogo()}catch(e){show(e.message,true)}
  }
  function setBelmMode(customer){
    document.getElementById('modePill').textContent='BELM CUSTOMER VIEW';
    document.getElementById('backLink').href='/customers-manager/';
    document.getElementById('workshopTitle').textContent=`${customer?.name||'Customer'} вЂ” Workshop`;
    document.getElementById('workshopSubtitle').textContent='Customer workshop role structure viewed from BELMI. Customer-owned team controls remain separated from BELM staff.';
    const suffix=customerId?`?customerId=${encodeURIComponent(customerId)}`:'';
    document.getElementById('managerJobCardLink').href='/belm-workshop/#job-cards';
    document.getElementById('managerAnalysisLink').href='/belm-workshop/#workshop-analysis';
    document.getElementById('storeLink').href='/spare-parts-manager/';
    document.getElementById('storeLink').textContent='BELM Spare / Support View';
    document.getElementById('workshop-store').classList.add('hidden');
    document.getElementById('toolDocumentsButton').classList.add('hidden');
    document.getElementById('technicianManageLink').href='/roles-manager/?role=Technician&technical=1';
    document.getElementById('technicianManageLink').textContent='BELM Technician Directory';
    document.getElementById('toolDocumentsPanel').classList.add('hidden');
    document.getElementById('cwmBrandingCard')?.classList.add('hidden');
    document.getElementById('cwmSettingsLink')?.classList.add('hidden');
  }
  async function loadBelm(){
    if(!adminToken){location.href='/login';return}
    let selected=null;
    try{const customers=await adminApi('/customers');selected=(Array.isArray(customers)?customers:(customers?.customers||[])).find(c=>String(c.id)===String(customerId))||null}catch(e){show(e.message,true)}
    setBelmMode(selected);
  }
  async function loadCustomer(){
    if(!customerToken){location.href='/login';return}
    document.getElementById('modePill').textContent='CUSTOMER WORKSHOP';
    document.getElementById('backLink').href='/portal/dashboard';
    let workshopModuleActive=true;
    try{
      const dashboard=await customerApi('/dashboard');
      const profile=dashboard?.customer||{};
      currentCustomerProfile=profile;
      currentWorkshopModuleActive=profile.workshopModuleActive!==false;
      workshopModuleActive=currentWorkshopModuleActive;
      const name=profile.name||'Customer';
      document.getElementById('workshopTitle').textContent=`${name} вЂ” PORTAL-CWM`;
      document.getElementById('workshopSubtitle').textContent=Boolean(profile.belmServiceProviderActive)
        ?'BELM Service Mode вЂ” customer records remain company-scoped; machine updates stay in Report Record and BELM Job Cards go directly to TECHNICAL DEP.'
        :'Customer Workshop Manager home вЂ” customer records stay company-scoped; BELN›Ш€Ш\™И\™HЬ[™YЫ›HЪ[€‘S€Э\Ьќ\И™\]Y\ЭY‰ОВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћS[YIКKќ^ЫЫќ[ќ[[YNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћPY™\ЬЙКKќ^ЫЫќ[ќ\›Щљ[KY™\ЬЯ	У›Э™XЫЬ™Y	ОВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћQ[XZ[	КKќ^ЫЫќ[ќ\›Щљ[K™[XZ[	У›Э™XЫЬ™Y	ОВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћPЫЫќXЭ	КKќ^ЫЫќ[ќ\›Щљ[KњЫ™_	У›Э™XЫЬ™Y	ОВ€ЫЫњЭ™[SЫЏP›ЫЫX[Љ›Щљ[K™[TЩ\ќљXЩT›ЭљY\ђXЭ]™JNВ€ЫЫњЭ™[TЭ]\ПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫP™[TЭ]\ЙКNВ€™[TЭ]\Лќ^ЫЫќ[ќX™[SЫЏЙР‘SHУ€0­ИСT•’PСHPХU‘IО‰Р‘SHС‘€0­ИХTХУQT€УФ’ФТФ	ОВ€™[TЭ]\ЛЫ\ЬУ\ЭќЩЩЫJ	Ъ\Л[Ы‰Л™[SЫЉNШ™[TЭ]\ЛЫ\ЬУ\ЭќЩЩЫJ	Ъ\Л[Щ™‰ЛX™[SЫЉNВ€ЫЫњЭXЪX[YЩOYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭXЪљXЪX[“X[YЩS[љЙКNВ€YЉ™[SЫЉ^В€XЪљXЪX[њПVЧNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭXЪљXЪX[ђЫЭ[ќ	КKќ^ЫЫќ[ќIУРТСQ0­И‘SHУ‰ОВ€YЉXЪX[YЩJ^ЭXЪX[YЩKќ^ЫЫќ[ќIХXЪљXЪX[њИШЪЩY0­И‘SHУ‰ОЭXЪX[YЩKњ™[[Э™P]љXќ]J	Ъ™Y‰КNЭXЪX[YЩKњЩ]]љXќ]J	Ш\љXKY\ШX›Y	Л	ЭќYIКNЭXЪX[YЩKЫ\ЬУ\ЭY
	ЫШЪЩYXXЭ[Ы‰К_B€ЫЫњЭ™]ХЫЫ\ЬЭYOYШЭ[Y[ќ™Щ][[Y[ќћRY
	Ы™]ХЫЫ\ЬЭYPќ]Ы‰КNВ€YЉ™]ХЫЫ\ЬЭYJ^Ы™]ХЫЫ\ЬЭYK™\ШX›Y]ќYNЫ™]ХЫЫ\ЬЭYKќ^ЫЫќ[ќIТ\ЬЭYHЫЫШЪЩY0­И‘SHУ‰ОЫ™]ХЫЫ\ЬЭYKќ]OIРЭ\ЭЫY\€XЪљXЪX[€ЩXЭ[Ы€\ИШЪЩYЪ[H‘SHЩ\ќљXЩH\ИУ‹‰ЯB€Y[Щ^В€YЉXЪX[YЩJ^ЭXЪX[YЩKќ^ЫЫќ[ќIУX[YЩHXЪљXЪX[њЙОЭXЪX[YЩKљ™YЏIЛШЭ\ЭЫY\‹]\Щ\њЛЙОЭXЪX[YЩKњ™[[Э™P]љXќ]J	Ш\љXKY\ШX›Y	КNЭXЪX[YЩKЫ\ЬУ\Эњ™[[Э™J	ЫШЪЩYXXЭ[Ы‰К_B€ЫЫњЭ™]ХЫЫ\ЬЭYOYШЭ[Y[ќ™Щ][[Y[ќћRY
	Ы™]ХЫЫ\ЬЭYPќ]Ы‰КNВ€YЉ™]ХЫЫ\ЬЭYJ^Ы™]ХЫЫ\ЬЭYK™\ШX›YY[ЩNЫ™]ХЫЫ\ЬЭYKќ^ЫЫќ[ќIКИ\ЬЭYHЫЫ	ОЫ™]ХЫЫ\ЬЭYKќ]OIЙЯB€B€ЫЫњЭXXЪ[™S[љПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫSXXЪ[™\У[љЙКNВ€XXЪ[™S[љЛќ^ЫЫќ[ќX	Ы[YKќХ\\ђШ\ЩJ
_HPPТS‘TШВ€ЫЫњЭЪXЪЫ\Э[љПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЪXЪЫ\Э[\]S[љЙКNВ€YЉЪXЪЫ\Э[љКHЪXЪЫ\Э[љЛљ™YЏIЛЬЬќ[Щ\Ъ›Ш\™ЭљY]П[XXЪ[™\ЙОВ€\PЭ\ЭЫY\”›ЫPXШЩ\ЬК›Щљ[K™[SЫ‹ЫЬљЬЪЬ[Щ[PXЭ]™JNВ€YЉ]ЫЬљЬЪЬ[Щ[PXЭ]™J^В€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™S[љЙКOЛЫ\ЬУ\ЭY
	ЪY[‰КNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќРќ]Ы‰КOЛЫ\ЬУ\ЭY
	ЪY[‰КNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЬљЬЪЬ\ЭЬ™IКOЛЫ\ЬУ\ЭY
	ЪY[‰КNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќФ[™[	КOЛЫ\ЬУ\ЭY
	ЪY[‰КNВ€B€XШ]Ъ
J^ЬЪЭКK›Y\ЬШYЩKќYJ_B€]ШZ]ШYЫЫ\[ћSЩЫК
NВ€ЫЫњЭXЪШЪЩYYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭXЪљXЪX[“X[YЩS[љЙКOЛ™Щ]]љXќ]J	Ш\љXKY\ШX›Y	КOOOIЭќYIОВ€YЉ]XЪШЪЩY
^В€ћ^ЭXЪљXЪX[њПX]ШZ]Э\ЭЫY\ђ\J	ЛЭXЪљXЪX[њЙКNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭXЪљXЪX[ђЫЭ[ќ	КKќ^ЫЫќ[ќX	ЭXЪљXЪX[њЛ›[™ЭHPТ	ЭXЪљXЪX[њЛ›[™ЭOOLOЙЙО‰ФЙЯXЬ™[™\•XЪљXЪX[“Ь[ЫњК
_XШ]Ъ
К^ЭXЪљXЪX[њПVЧNЬ™[™\•XЪљXЪX[“Ь[ЫњК
_B€Y[Щ^ЭXЪљXЪX[њПVЧNЬ™[™\•XЪљXЪX[“Ь[ЫњК
_B€YЉЫЬљЬЪЬ[Щ[PXЭ]™JH]ШZ]ШYЭЬ™J
NВ€B€\Ю[Иќ[Э[Ы€ШYЭЬ™J
^В€YЉ\Р™[J\™]\›ЋВ€ЫЫњЭ›ЭЬПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™T›ЭЬЙКNВ€›ЭЬЛљ[›™\’SIЯЏЏЫЫЬ[ЏHЌИ€Ы\ЬПH™[\HЏ“ШY[™ИЭ\ЭЫY\€ЭЬ™x )ЏЭЏЭЏ‰ОВ€ћ^В€ЫЫњЭ]OX]ШZ]Э\ЭЫY\ђ\J	ЛЬЭЬ™IКNВ€ЫЫњЭ][\ПY]Kљ][\ЯЧNВ€ЫЫњЭ]OZ][\Лњ™YXЩJ
Э[K
OOњЭ[JУќ[X™\Љњ]WЫЫ—Ъ[™ПЮњ]SЫ’[™ПМ
K
NВ€ЫЫњЭЭ]Z][\Л™љ[\ЉO“ќ[X™\Љњ]WЫЫ—Ъ[™ПЮњ]SЫ’[™ПМ
OL
K›[™ЭВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™R][PЫЭ[ќ	КKќ^ЫЫќ[ќZ][\Л›[™ЭВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™T]PЫЭ[ќ	КKќ^ЫЫќ[ќ\]KќУШШ[TЭљ[™К[™Yљ[™YЫX^[][QњXЭ[Ы‘YЪ]ОЊџJNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™SЭ]ЫЭ[ќ	КKќ^ЫЫќ[ќ[Э]В€›ЭЬЛљ[›™\’SZ][\Л›[™ЭЪ][\Л›X\
OЏЏЏЏ‰Щ\ШКњ\ќЫќ[X™\ЏПЮњ\ќќ[X™\ЏПЙш %	К_OШЏЏЭЏ‰Щ\ШК™\ШЬљ\[Ыџ	ш %	К_OЭЏ‰Щ\ШКќ[љ]	ФЙК_OЭЏ‰Уќ[X™\ЉќЭ[Ь™XЩZ]™YПЮќЭ[™XЩZ]™YПМ
KќУШШ[TЭљ[™К
_OЭЏ‰Уќ[X™\ЉќЭ[Ъ\ЬЭYYПЮќЭ[\ЬЭYYПМ
KќУШШ[TЭљ[™К
_OЭЏЏЏ‰Уќ[X™\Љњ]WЫЫ—Ъ[™ПЮњ]SЫ’[™ПМ
KќУШШ[TЭљ[™К
_OШЏЏЭЏ•”И	Уќ[X™\Љ]™\YЩWЭ[љ]ШЫЬЭПЮ]™\YЩU[љ]ЫЬЭПМ
KќУШШ[TЭљ[™К
_OЭЏЭЏ
Kљ›Ъ[Љ	ЙКN‰ПЏЏЫЫЬ[ЏHЌИ€Ы\ЬПH™[\HЏ“›ИЭ\ЭЫY\€ЭЬ™HЭШЪИ™XЫЬ™YY]ЏЭЏЭЏ‰ОВ€XШ]Ъ
J^Ь›ЭЬЛљ[›™\’SXЏЏЫЫЬ[ЏHЌИ€Ы\ЬПH™[\HЏ‰Щ\ШКK›Y\ЬШYЩJ_OЭЏЭЏB€B€ќ[Э[Ы€Ь[”™XЩZ]™TЭШЪК
^ЩШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪС›Ь›IКKњ™\Щ]

NЩШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™U[љ]ЫЬЭ	КKќ[YOIМ	ОЩШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪС\њ›Ь‰КKЫ\ЬУ\ЭY
	ЪY[‰КNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪСX[ЩЙКKњЪЭУ[Щ[

_B€ќ[Э[Ы€™[™\•XЪљXЪX[“Ь[ЫњК
^ШЫЫњЭЩ[YШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫXЪљXЪX[‰КNЬЩ[љ[›™\’SIПЬ[Ы€[YOH€Џ”Щ[XЭXЪљXЪX[ё )ЏЫЬ[ЫЏ‰КЭXЪљXЪX[њЛ›X\
OЬ[Ы€[YOH‰Щ\ШКќ\Щ\’Y
_H€]K[[YOH‰Щ\ШК›[YJ_HЏ‰Щ\ШК›[YJ_OЫЬ[ЫЏ
Kљ›Ъ[Љ	ЙК_B€ќ[Э[Ы€›]]JЉ^ЪYЉ]Љ\™]\›Љ	ш %	КNЭћ^Ь™]\›€™]И]JЉKќУШШ[TЭљ[™К
_XШ]Ъ
К^Ь™]\›€џ_B€ќ[Э[Ы€™[™\•ЫЫ\ЬЭY\К
^В€ЫЫњЭ›ЭЬПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYT›ЭЬЙКNВ€ЫЫњЭЭ]]ЫЫ\ЬЭY\Л™љ[\ЉO€^њ™]\›™Y]
K›[™Э™]\›™Y]ЫЫ\ЬЭY\Л™љ[\ЉOћњ™]\›™Y]
K›[™ЭВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫУЭ]ЫЭ[ќ	КKќ^ЫЫќ[ќ[Э]ЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫФ™]\›™YЫЭ[ќ	КKќ^ЫЫќ[ќ\™]\›™YЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќЫЭ[ќ	КKќ^ЫЫќ[ќ]ЫЫ\ЬЭY\Л›[™ЭВ€›ЭЬЛљ[›™\’S]ЫЫ\ЬЭY\Л›[™ЭЭЫЫ\ЬЭY\Л›X\
OЏЏЏЏ‰Щ\ШК™ШЭ[Y[ќ›Я	ш %	К_OШЏЏЭЏ‰Щ\ШКљ›ШђШ\™›Я	ш %	К_OЭЏ‰Щ\ШКќXЪљXЪX[“[Y_	ш %	К_OЭЏЏЏ‰Щ\ШКќЫЫ[YJ_OШЏ‰ЮќЫЫ\ЬЩ]YШњЏЏЫX[‰Щ\ШКќЫЫ\ЬЩ]Y
_OЬЫX[‰ЙЯOЭЏ‰Щ\ШКњ]X[ќ]J_OЭЏ‰Щ›]]Jљ\ЬЭYY]
_OЭЏЏЬ[€Ы\ЬПH‰Юњ™]\›™Y]ЙЬЭ]\Л\™]\›™Y	О‰ЬЭ]\Л[Э]	ЯHЏ‰Юњ™]\›™Y]ЙФ‘UT“‘Q	О‰УХUТUPТ’PТPS‰ЯOЬЬ[ЏЏЭЏ‰Юњ™]\›™Y]Ш	Щ›]]Jњ™]\›™Y]
_OњЏЏЫX[‰Щ\ШКЫЫ™][Ы’[џ	ЙК_OЬЫX[ќ]Ы€Ы\ЬПHњ™]\›‹Xќ]Ы€€\OHќ]Ы€€]K\™]\›‹]ЫЫH‰Щ\ШКљY
_HЏ”™XЩZ]™H™]\›ЏШќ]ЫЏOЭЏЭЏ
Kљ›Ъ[Љ	ЙКN‰ПЏЏЫЫЬ[ЏHЋ€Ы\ЬПH™[\HЏ“›ИЫЫ\ЬЭYHШЭ[Y[ќИY]ЏЭЏЭЏ‰ОВ€›ЭЬЛњ]Y\ћTЩ[XЭЬђ[
	ЦЩ]K\™]\›‹]ЫЫIКK™›Ь‘XXЪ
ЏO‹Y]™[ќ\Э[™\Љ	ШЫXЪЙЛ

OO›Ь[”™]\›Љ‹™]\Щ]њ™]\›•ЫЫ
JJNВ€B€\Ю[Иќ[Э[Ы€ШYЫЫ\ЬЭY\К
^ЪYЉ\Р™[J\™]\›ЋШЫЫњЭ›ЭЬПYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYT›ЭЬЙКNЬ›ЭЬЛљ[›™\’SIПЏЏЫЫЬ[ЏHЋ€Ы\ЬПH™[\HЏ“ШY[™ИЫЫ\ЬЭYHШЭ[Y[ќш )ЏЭЏЭЏ‰ОЭћ^ШЫЫњЭ]OX]ШZ]Э\ЭЫY\ђ\J	ЛЭЫЫZ\ЬЭY\ЙКNЭЫЫ\ЬЭY\ПY]Kљ][\ЯЧNЬ™[™\•ЫЫ\ЬЭY\К
_XШ]Ъ
J^Ь›ЭЬЛљ[›™\’SXЏЏЫЫЬ[ЏHЋ€Ы\ЬПH™[\HЏ‰Щ\ШКK›Y\ЬШYЩJ_OЭЏЭЏ_B€ќ[Э[Ы€Ь[’\ЬЭYJ
^ЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQ›Ь›IКKњ™\Щ]

NЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ]X[ќ]IКKќ[YOIМIОЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQ\њ›Ь‰КKЫ\ЬУ\ЭY
	ЪY[‰КNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQX[ЩЙКKњЪЭУ[Щ[

_B€ќ[Э[Ы€Ь[”™]\›ЉY
^ЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘›Ь›IКKњ™\Щ]

NЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›’Y	КKќ[YOZYЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘\њ›Ь‰КKЫ\ЬУ\ЭY
	ЪY[‰КNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘X[ЩЙКKњЪЭУ[Щ[

_B€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШXЪУ[љЙКOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[ИOOћЪYЉZ\Р™[J^ЩKњ™]™[ќY][

NШ]ШZ]ЪЭРЭЫUљY]К	ЫXZ[‰К__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЬЭЬ™S[љЙКOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[ИOOћЪYЉ\Р™[J\™]\›ЋЩKњ™]™[ќY][

NШ]ШZ]ЪЭРЭЫUљY]К	ЬЭЬ™IК_JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫTЩ][™ЬУ[љЙКOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[ИOOћЪYЉ\Р™[J\™]\›ЋЩKњ™]™[ќY][

NШ]ШZ]ЪЭРЭЫUљY]К	ЬЩ][™ЬЙК_JNВ€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
	ЦЩ]KXЭЫK[XZ[—IКK™›Ь‘XXЪ
ЏO‹Y]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[К
OOћШ]ШZ]ЪЭРЭЫUљY]К	ЫXZ[‰К_JJNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPXЪРќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[ИOOћЪYЉZ\Р™[J^ЩKњ™]™[ќY][

NШ]ШZ]ЪЭРЭЫUљY]К	ЫXZ[‰КNЬ™]\›џZYЉЭЫPXЭ]™UљY]ИOOIЫXZ[‰К^ЩKњ™]™[ќY][

NШ]ШZ]ЪЭРЭЫUљY]К	ЫXZ[‰К__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќРќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[К
OOћШЫЫњЭYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќФ[™[	КNЬЫ\ЬУ\Эњ™[[Э™J	ЪY[‰КNЬШ]™PЭЫTЭ]J
NЬњШЬ›Ы[ќХљY]КШ™Z]љ[ЬЋ‰ЬЫ[ЫЭ	Л›ШЪО‰ЬЭ\ќ	ЯJNШ]ШZ]ШYЫЫ\ЬЭY\К
_JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ы™]ХЫЫ\ЬЭYPќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛЬ[’\ЬЭYJNВ€ШЭ[Y[ќњ]Y\ћTЩ[XЭЬђ[
	ЦЩ]KXЫЬЩWIКK™›Ь‘XXЪ
ЏO‹Y]™[ќ\Э[™\Љ	ШЫXЪЙЛ

OO™ШЭ[Y[ќ™Щ][[Y[ќћRY
‹™]\Щ]ЫЬЩJOЛЫЬЩJ
JJNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQ›Ь›IКKY]™[ќ\Э[™\Љ	ЬЭX›Z]	Л\Ю[ИOOћЩKњ™]™[ќY][

NШЫЫњЭ\њ›Ьђ›ЮYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQ\њ›Ь‰КNЭћ^ШЫЫњЭXЪYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫXЪљXЪX[‰КNШЫЫњЭЬ]XЪњЩ[XЭYЬ[ЫњЦМNШ]ШZ]Э\ЭЫY\ђ\J	ЛЭЫЫZ\ЬЭY\ЙЛЫY]Щ‰ФФХ	Л›ЩN’”УУ‹њЭљ[™ЪYћJЪ›ШђШ\™›О™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ›ШђШ\™›ЙКKќ[YKќљ[J
KXЪљXЪX[’YќXЪќ[YKXЪљXЪX[“[YN›ЬЛ™]\Щ]Л›[Y_ЬЛќ^ЫЫќ[ќ	ЙЛЫЫ[YN™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ[YIКKќ[YKќљ[J
KЫЫ\ЬЩ]Y™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЩ]Y	КKќ[YKќљ[J
K]X[ќ]N“ќ[X™\ЉШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ]X[ќ]IКKќ[Y_JK^XЭY™]\›ђ]™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ^XЭY™]\›‰КKќ[Y_ќ[ЫЫ™][Ы“Э]™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫЫЫ™][Ы“Э]	КKќ[YKќљ[J
K›ЭN™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYS›ЭIКKќ[YKќљ[J
_J_JNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ\ЬЭYQX[ЩЙКKЫЬЩJ
NЬЪЭК	ХЫЫ\ЬЭYHШЭ[Y[ќЬ™X]Y‰КNШ]ШZ]ШYЫЫ\ЬЭY\К
_XШ]Ъ
\њЉ^Щ\њ›Ьђ›Юќ^ЫЫќ[ќY\њ‹›Y\ЬШYЩNЩ\њ›Ьђ›ЮЫ\ЬУ\Эњ™[[Э™J	ЪY[‰К__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘›Ь›IКKY]™[ќ\Э[™\Љ	ЬЭX›Z]	Л\Ю[ИOOћЩKњ™]™[ќY][

NШЫЫњЭ\њ›Ьђ›ЮYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘\њ›Ь‰КNЭћ^ШЫЫњЭYYШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›’Y	КKќ[YNШ]ШZ]Э\ЭЫY\ђ\JЭЫЫZ\ЬЭY\ЛЙЩ[ЫЩUT’PЫЫ\Ы™[ќ
Y
_KЬ™]\›ЫY]Щ‰ФФХ	Л›ЩN’”УУ‹њЭљ[™ЪYћJШЫЫ™][Ы’[Ћ™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫЫЫ™][Ы’[‰КKќ[YKќљ[J
K™XЩZ]™YћN™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™XЩZ]™YћIКKќ[YKќљ[J
K›ЭN™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›“›ЭIКKќ[YKќљ[J
_J_JNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫ™]\›‘X[ЩЙКKЫЬЩJ
NЬЪЭК	ХЫЫ™]\›€™XЫЬ™Y‰КNШ]ШZ]ШYЫЫ\ЬЭY\К
_XШ]Ъ
\њЉ^Щ\њ›Ьђ›Юќ^ЫЫќ[ќY\њ‹›Y\ЬШYЩNЩ\њ›Ьђ›ЮЫ\ЬУ\Эњ™[[Э™J	ЪY[‰К__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪРќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛЬ[”™XЩZ]™TЭШЪКNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪС›Ь›IКKY]™[ќ\Э[™\Љ	ЬЭX›Z]	Л\Ю[ИOOћЩKњ™]™[ќY][

NШЫЫњЭ\њ›Ьђ›ЮYШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪС\њ›Ь‰КNЭћ^Ш]ШZ]Э\ЭЫY\ђ\J	ЛЬЭЬ™IЛЫY]Щ‰ФФХ	Л›ЩN’”УУ‹њЭљ[™ЪYћJЬ\ќќ[X™\Ћ™ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™T\ќќ[X™\‰КKќ[YKќљ[J
K\ШЬљ\[ЫЋ™ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™Q\ШЬљ\[Ы‰КKќ[YKќљ[J
K[љ]™ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™U[љ]	КKќ[YK]X[ќ]N“ќ[X™\ЉШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™T]X[ќ]IКKќ[Y_
K[љ]ЫЬЭ“ќ[X™\ЉШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™U[љ]ЫЬЭ	КKќ[Y_
K›ЭN™ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™S›ЭIКKќ[YKќљ[J
_J_JNЩШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™XЩZ]™TЭШЪСX[ЩЙКKЫЬЩJ
NЬЪЭК	РЭ\ЭЫY\€ЭЬ™HЭШЪИ™XЩZ]™Y‰КNШ]ШZ]ШYЭЬ™J
_XШ]Ъ
\њЉ^Щ\њ›Ьђ›Юќ^ЫЫќ[ќY\њ‹›Y\ЬШYЩNЩ\њ›Ьђ›ЮЫ\ЬУ\Эњ™[[Э™J	ЪY[‰К__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫU\ШYЩЫРќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ

OO™ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћSЩЫТ[њ]	КOЛЫXЪК
JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫPЫЫ\[ћSЩЫТ[њ]	КOЛY]™[ќ\Э[™\Љ	ШЪ[™ЩIЛ\Ю[ИOOћШЫЫњЭљ[OYKќ\™Щ]™љ[\ПЛ–МNЩKќ\™Щ]ќ[YOIЙОЪYЉљ[JX]ШZ]\ШYЫЫ\[ћSЩЫКљ[J_JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫT™[[Э™SЩЫРќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ™[[Э™PЫЫ\[ћSЩЫКNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	Ь™Yњ™\Ъќ]Ы‰КKY]™[ќ\Э[™\Љ	ШЫXЪЙЛ\Ю[К
OOћШЫX\Љ
NШЫЫњЭљY]ПXЭЫPXЭ]™UљY]ОЪYЉ\Р™[JX]ШZ]ШY™[J
NЩ[Щ^Ш]ШZ]ШYЭ\ЭЫY\Љ
NШ]ШZ]ЪЭРЭЫUљY]КљY]ЛЬ™\ЭЬ™NќќY_JNЪYЉљY]ПOOIЬЭЬ™IЙ‰€YШЭ[Y[ќ™Щ][[Y[ќћRY
	ЭЫЫШЭ[Y[ќФ[™[	КKЫ\ЬУ\ЭЫЫќZ[њК	ЪY[‰КJX]ШZ]ШYЫЫ\ЬЭY\К
__JNВ€ШЭ[Y[ќ™Щ][[Y[ќћRY
	ШЭЫSЩЫЭ]ќ]Ы‰КOЛY]™[ќ\Э[™\Љ	ШЫXЪЙЛ

OOћВ€YЉ\Р™[J^ЫШШ][Ы‹љ™YЏIЛЫЩЪ[‰ОЬ™]\›џB€ШШ[ЭЬYЩKњ™[[Э™R][J	Ш™[WШЭ\ЭЫY\—ЭЪЩ[‰КNВ€ШШ[ЭЬYЩKњ™[[Э™R][J	Ш™[WЬЩ\ЬЪ[Ы—Ь™Yњ™\ЪYШ™[WШЭ\ЭЫY\—ЭЪЩ[‰КNВ€YЉЭљ[™КШШ[ЭЬYЩK™Щ]][J	Ш™[WШXЭ]™WШXШЫЭ[ќЭ\IК_	ЙКKќУЭЩ\ђШ\ЩJ
OOOIШЭ\ЭЫY\‰К[ШШ[ЭЬYЩKњ™[[Э™R][J	Ш™[WШXЭ]™WШXШЫЭ[ќЭ\IКNВ€ћ^ЬЩ\ЬЪ[Ы”ЭЬYЩKњ™[[Э™R][JЭЫTЭ]RЩ^J_XШ]Ъ
К^ЯB€ШШ][Ы‹њ™\XЩJ	ЛЫЩЪ[‰КNВ€JNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	ЬЬЭ]IЛ\Ю[К
OOћВ€YЉ\Р™[_[ШШ[ЭЬYЩK™Щ]][J	Ш™[WШЭ\ЭЫY\—ЭЪЩ[‰КJ\™]\›ЋВ€]ШZ]ЪЭРЭЫUљY]К	ЫXZ[‰КNВ€ћ^Ъ\ЭЬћKњ\ЪЭ]JШ™[PЭЫQЭX\™ќќY_K	ЙЛ	ЛШЭ\ЭЫY\‹]ЫЬљЬЪЬПШXЭЬЏXЭ\ЭЫY\‰К_XШ]Ъ
К^ЯB€JNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	ЬYЩZYIЛШ]™PЭЫTЭ]JNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	Ш™Y›Ь™][›ШY	ЛШ]™PЭЫTЭ]JNВ€Ъ[™ЭЛY]™[ќ\Э[™\Љ	ЬYЩ\ЪЭЙЛOOћЪYЉKњ\њЪ\ЭY
^ШЫЫњЭЭ]O\™XYЭЫTЭ]J
NЬ™\]Y\Э[љ[X][Ы‘њ[YJ

OOќЪ[™ЭЛњШЬ›ЫКќ[X™\ЉЭ]KњШЬ›ЫJ_
J__JNВ€
\Ю[К
OOћЪYЉ\Р™[JX]ШZ]ШY™[J
NЩ[ЩH]ШZ]ШYЭ\ЭЫY\Љ
NШ]ШZ]™\ЭЬ™PЭЫTЭ]J
NЪYЉZ\Р™[JX\›PЭ\ЭЫY\“XZ[’\ЭЬћQЭX\™

_JJ
NВџJJ
NВ