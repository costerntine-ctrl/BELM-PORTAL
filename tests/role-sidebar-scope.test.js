const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('frontend/persistent-role-sidebar.js','utf8');
function menu(payload,{pages,departments,mode}={}){
 if(pages)payload={...payload,allowedPages:pages};
 const values=new Map([['belm_admin_token','x.'+Buffer.from(JSON.stringify(payload)).toString('base64')+'.x']]);
 const window={};window.top=window;window.self=window;
 const context={window,localStorage:{getItem:k=>values.get(k)||''},location:{pathname:'/role-reports/',search:'',origin:'https://portal.belmgeneraltech.co.tz'},URL,URLSearchParams,Date,atob:v=>Buffer.from(v,'base64').toString('binary')};
 const cut=source.indexOf(' function hideOriginals()');assert(cut>0);
 const ending=`departmentStates=${JSON.stringify(departments||null)};modeState=${JSON.stringify(mode||null)};window.result={role,home,customer,rows:rowsForRole()};})();`;
 vm.runInNewContext(source.slice(0,cut)+ending,context);
 return window.result?JSON.parse(JSON.stringify(window.result)):null;
}
const staff=['Super Admin','Workshop Manager','Technician','Procurement','Store Keeper','Registration & Sales','Finance / Accounts','Bank Controller','System Coordinator','MACHINE OPERATOR'];
const company=['owner','workshop_manager','technician','operator','procurement','store_keeper','accounts'];
test('all ten BELM and seven company roles have distinct, local role menus',()=>{
 for(const payload of [...staff.map(roleName=>({type:'staff',roleName})),...company.map(customerRole=>({type:'customer',customerRole}))]){
  const result=menu(payload);assert(result);assert(result.rows.length>=3);
  const urls=result.rows.map(r=>new URL(r.href,'https://portal.belmgeneraltech.co.tz').href);assert.equal(new Set(urls).size,urls.length,JSON.stringify(payload));
  assert(result.rows.every(r=>r.href.startsWith('/')&&!r.href.includes('embed=1')));
  const reports=result.rows.filter(r=>/^(My Reports|General Report)$/.test(r.label));assert.equal(reports.length,1);
  assert.equal(reports[0].label,result.role==='admin'?'General Report':'My Reports');
  if(result.customer)assert(result.rows.every(r=>!/^\/(bank-controller|billing-manager|spare-parts-manager)\//.test(r.href)));
 }
});
test('customer-owned technician uses company menu; BELM technician keeps BELM workspace',()=>{
 const owned=menu({type:'staff',roleName:'Technician',isCustomerManaged:true,assignedCustomerId:'company-A'});assert(owned.customer);assert.equal(owned.home,'/customer-technician-dashboard/');assert(owned.rows.some(r=>r.href==='/portal/dashboard?view=machines'));
 const belm=menu({type:'staff',roleName:'Technician',assignedCustomerId:'company-A'});assert(!belm.customer);assert.equal(belm.home,'/concept-dashboards/02-technician/');
});
test('BELM role page grants limit work links; empty operator grants never imply admin access',()=>{
 const op=menu({type:'staff',roleName:'MACHINE OPERATOR'},{pages:[]});assert.equal(op.role,'operator');assert(!op.rows.some(r=>r.href.includes('customers-manager')));assert(!op.rows.some(r=>r.label==='General Report'));
 const finance=menu({type:'staff',roleName:'Finance / Accounts'},{pages:['billing']});assert.equal(finance.rows.filter(r=>r.href.startsWith('/billing-manager/')).length,5);assert(finance.rows.every(r=>!r.href.includes('bank-controller')));
});
test('customer departments and service mode hide disabled destinations',()=>{
 const result=menu({type:'customer',actorType:'owner'},{departments:{finance:'REMOVED',administration:'ENABLED',technical:'ENABLED',store:'ENABLED'},mode:{roles:[{key:'store_keeper',enabled:false}],customerSettings:{available:false}}});
 assert(!result.rows.some(r=>r.href==='/customer-finance/'));assert(!result.rows.some(r=>r.href==='/customer-store-dashboard/'));assert(!result.rows.some(r=>r.href==='/customer-settings-center/'));
});
test('employee operator follows explicit card permissions without invitation routes',()=>{
 const op=menu({type:'customer',customerRole:'operator',permissions:['fuel-usage']});assert(op.rows.some(r=>r.label==='Fuel Consumption'));assert(!op.rows.some(r=>r.label==='Daily Checklist'));assert(!op.rows.some(r=>r.href.startsWith('/operator/')));
});
test('unknown or expired accounts never inherit Admin menus',()=>{assert.equal(menu({type:'staff',roleName:'Unknown'}),null);assert.equal(menu({type:'staff',roleName:'Super Admin',exp:1}),null);});
