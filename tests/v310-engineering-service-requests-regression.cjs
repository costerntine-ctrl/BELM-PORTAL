const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'..');let pass=0,fail=0;function ok(v,m){if(v){console.log('PASS',m);pass++}else{console.error('FAIL',m);fail++}}function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
const engHtml=read('frontend/engineering-manager/index.html');const engJs=read('frontend/engineering-manager/manager.js');const engCss=read('frontend/engineering-manager/manager.css');const serviceHtml=read('frontend/service-request-manager/index.html');const serviceJs=read('frontend/service-request-manager/manager.js');const side=read('frontend/admin-sidebar.js');const access=read('frontend/admin-access.js');const workflow=read('frontend/breakdown-workflow/workflow.js');const tools=read('frontend/portal-tools.js');const health=read('backend/index.php');
ok(engHtml.includes('id="service-requests"')&&engHtml.includes('data-src="/service-request-manager/?embed=1"'),'Engineering hosts Service Requests');
ok(engJs.includes('initEngineeringWorkspace')&&engJs.includes('belm-service-requests-height'),'Engineering loads and resizes embedded Service Requests');
ok(engCss.includes('V310 - Service Requests live inside Engineering.'),'Engineering embed styling exists');
ok(serviceHtml.includes('window.location.replace("/engineering-manager/#service-requests")'),'Direct Service Requests page redirects to Engineering');
ok(serviceHtml.includes('embed-mode'),'Service Requests supports embed mode');
ok(serviceJs.includes('ResizeObserver')&&serviceJs.includes('belm-service-requests-height'),'Embedded Service Requests reports dynamic height');
ok(!side.includes('label: "Service Requests"'),'Service Requests removed from sidebar');
ok(side.includes('get("embed") === "1"'),'Admin sidebar suppressed inside embed');
ok(access.includes('"service-requests": "/engineering-manager/#service-requests"'),'Permission fallback targets Engineering Service Requests');
ok(workflow.includes("'/engineering-manager/#service-requests'"),'Admin Maintenance Process back link targets Engineering');
ok(tools.includes('window.location.replace("/engineering-manager/#service-requests")'),'Legacy admin Service Requests alias redirects to Engineering');

ok(side.includes('anyKeys: ["roles", "service-requests"]'),'Engineering sidebar is visible to service-request roles');
ok(access.includes('allowedPages.includes("roles") || allowedPages.includes("service-requests")'),'Engineering route accepts either Engineering/roles or Service Requests permission');
ok(engJs.includes('engineeringOverviewGrid')&&engJs.includes('rolesAccess'),'Service-only users do not receive Engineering management panels');
ok((() => { const m = /'schemaVersion' => '(\d+)-/.exec(health); return m && Number(m[1]) >= 310; })(),'Health advertises V310 build');
console.log(`V310: ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
