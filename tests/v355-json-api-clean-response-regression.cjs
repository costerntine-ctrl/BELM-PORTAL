const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('backend/index.php');
const helpers=read('backend/config/helpers.php');
const login=read('frontend/customer-app.js');
const loginHtml=read('frontend/customer-app.html');
const sw=read('frontend/belm-sw.js');
const migrate=read('backend/scripts/migrate.php');
const schema=read('backend/schema.sql');
let pass=0,fail=0;
function t(name,cond){try{const ok=typeof cond==='function'?cond():cond;if(!ok)throw new Error('failed');console.log('PASS',name);pass++;}catch(e){console.error('FAIL',name,e.message);fail++;}}
t('front controller begins with PHP tag',index.startsWith('<?php\n'));
t('no regression/debug text exists before PHP tag',!index.startsWith('//'));
t('front controller enables output buffering',index.includes('if (ob_get_level() === 0) ob_start();'));
t('JSON responses discard stray buffered output',helpers.includes('if (ob_get_level() > 0)')&&helpers.includes('ob_clean();'));
t('V355 health schema marker active',index.includes("'schemaVersion' => '355-json-api-clean-response'"));
t('V355 migration release active',migrate.includes("const BELM_RELEASE = '355-json-api-clean-response';"));
t('login parses response text safely',login.includes('readJsonResponse')&&login.includes('JSON.parse(text)'));
t('login gives friendly invalid API response message',login.includes('Portal API response was invalid'));
t('login HTML cache-busts V355 JS',loginHtml.includes('/customer-app.js?v=355-json-api'));
t('service worker cache is V355',sw.includes("const CACHE='belm-app-v355-json-api-clean-response';"));
t('service worker shell uses V355 login JS',sw.includes('/customer-app.js?v=355-json-api'));
t('API requests still bypass service worker cache',sw.includes("url.pathname.startsWith('/api/')"));
t('schema unchanged by V355',!schema.includes('V355'));
const phpFiles=[];
(function walk(d){for(const n of fs.readdirSync(d)){const p=path.join(d,n),st=fs.statSync(p);if(st.isDirectory())walk(p);else if(n.endsWith('.php'))phpFiles.push(p)}})(path.join(root,'backend'));
t('every backend PHP file starts with PHP tag',()=>phpFiles.every(f=>fs.readFileSync(f).subarray(0,5).toString()==='<?php'));
try{
  const out=cp.execFileSync('php',[path.join(root,'backend/index.php')],{env:{...process.env,REQUEST_URI:'/api/live',REQUEST_METHOD:'GET',HTTP_HOST:'portal.belmgeneraltech.co.tz'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
  t('live endpoint starts with JSON object',out.startsWith('{'));
  t('live endpoint contains no regression prefix',!out.startsWith('//'));
  t('live endpoint is valid JSON',()=>{JSON.parse(out);return true});
}catch(e){console.error('FAIL live endpoint execution',e.stderr?.toString()||e.message);fail++;}
console.log(`RESULT ${pass} passed, ${fail} failed`);process.exit(fail?1:0);
