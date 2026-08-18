const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const checks = [];
function check(name, ok){checks.push([name,!!ok]); if(!ok) console.error('FAIL:',name);}
const index=read('frontend/index.html');
const sidebar=read('frontend/admin-sidebar.js');
const portal=read('frontend/portal-tools.js');
const workflow=read('frontend/breakdown-workflow/workflow.js');
const workflowHtml=read('frontend/breakdown-workflow/index.html');
const app=read('frontend/customer-app.js');
const sw=read('frontend/belm-sw.js');
const auth=read('backend/api/auth.php');
{
  const m = /admin-sidebar\.css\?v=(\d+)-/.exec(index);
  check('SPA sidebar CSS cache version bumped', !!m && Number(m[1]) >= 211);
}
check('Admin Breakdown link declares actor', sidebar.includes('/breakdown-workflow/?actor=admin'));
check('Mobile sidebar closes only on actual link', sidebar.includes('event.target.closest("a.belm-sidebar-link")'));
check('Shared Breakdown accepts explicit actor', workflow.includes("params.get('actor')||params.get('source')"));
check('Explicit actor without matching token redirects', workflow.includes("if(source && !actorToken[source])"));
{
  const m = /admin-sidebar\.js\?v=(\d+)-/.exec(workflowHtml);
  check('Shared Breakdown loads Admin sidebar safely', !!m && Number(m[1]) >= 211);
}
check('Customer machine Breakdown link declares actor', portal.includes('&actor=${encodeURIComponent(customerWorkflowActor())}'));
check('Technician Job Cards link routes to My Job Cards', portal.includes('/technician-job-cards/'));
check('Workshop login destination declares customer actor', auth.includes("'/breakdown-workflow/?actor=customer'"));
check('Machine actions decorated after async panel creation', /enforceCustomerFeaturePermissions\(panel\);\s*decorateMachineActionIcons\(panel\);\s*organizeMachineActions\(panel\);/.test(portal));
check('Workflow icon has explicit label', portal.includes('"workflow": "WF"'));
check('Operator can still use compact More Actions', !portal.includes('visible.length <= 4 || isCustomerOperatorRole()'));
check('Authoritative permission refresh re-applies More Tools', /loadCustomerPortalProfile\(\)\.then\(\(profile\) => \{\s*enforceCustomerFeaturePermissions\(toolsCard\)/.test(portal));
check('Permission enforcement can unhide newly-authorized actions', portal.includes('element.style.removeProperty("display")'));
check('Smart login clears stale role sessions', app.includes('clearRoleSessions();'));
check('Smart login tracks active account type', app.includes("belm_active_account_type"));
check('PWA shell cache bumped', sw.includes("belm-app-v211-bug-audit"));
check('No V210 stale cache marker in SPA entry', !index.includes('210-ux-cleanup') && !index.includes('195-brand-ui'));
const failed=checks.filter(x=>!x[1]);
console.log(`V211 targeted checks: ${checks.length-failed.length}/${checks.length} PASS`);
if(failed.length) process.exit(1);
