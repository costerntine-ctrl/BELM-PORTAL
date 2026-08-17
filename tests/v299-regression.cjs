const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const auth=read('backend/api/auth.php');
const jwt=read('backend/config/jwt.php');
const op=read('backend/api/operator.php');
const theme=read('frontend/theme-manager.js');
const tools=read('frontend/portal-tools.js');
const sw=read('frontend/belm-sw.js');
const checks=[
 ['jwt default is 30 days',/30 \* 24 \* 3600/.test(jwt)],
 ['auth refresh endpoint exists',/\$action === 'refresh'/.test(auth)],
 ['refresh validates staff account',/This staff account is no longer active/.test(auth)],
 ['refresh validates customer account',/Customer account is no longer active/.test(auth)],
 ['refresh validates operator session',/This Operator session is no longer active/.test(auth)],
 ['refresh issues 30 day token',/jwt_encode\(\$freshPayload, 30 \* 24 \* 3600\)/.test(auth)],
 ['operator login is 30 days',/\], 30 \* 24 \* 3600\);/.test(op)],
 ['global fetch wrapper installed',/window\.fetch = fetchWithStableSession/.test(theme)],
 ['401 refresh retry exists',/response\.status !== 401/.test(theme)&&/refreshSessionToken\(tokenKey, true\)/.test(theme)],
 ['stale const token replaced',/latestToken/.test(theme)&&/headers\.set\("Authorization"/.test(theme)],
 ['proactive session maintenance exists',/maintainSessions/.test(theme)&&/5 \* 60 \* 1000/.test(theme)],
 ['valid-session route 401 becomes forbidden',/status: 403/.test(theme)&&/perfectly valid session token/.test(theme)],
 ['technician detector keeps login active',/Your login has been kept active/.test(tools)],
 ['technician detector no auto redirect phrase',!tools.includes('Redirecting to login…')],
 ['service worker cache bumped',/belm-app-v299-session-stability/.test(sw)],
];
let pass=0;
for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(ok)pass++;}
console.log(`\n${pass}/${checks.length} V299 checks passed`);
if(pass!==checks.length)process.exit(1);
