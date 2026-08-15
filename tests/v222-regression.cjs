const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let pass=0,fail=0;
function check(name,ok){if(ok){console.log('PASS',name);pass++;}else{console.error('FAIL',name);fail++;}}
const html=read('frontend/breakdown-workflow/index.html');
const css=read('frontend/breakdown-workflow/workflow.css');
const sw=read('frontend/belm-sw.js');
check('Breakdown CSS cache key bumped',html.includes('workflow.css?v=222-button-contrast'));
check('Refresh button has explicit light background',/#refreshButton\{[\s\S]*background:#eaf4ff!important/.test(css));
check('Refresh button has explicit light text color',/#refreshButton\{[\s\S]*color:#0b4f87!important/.test(css));
check('Refresh button has dark-mode rule',css.includes('html[data-theme="dark"] #refreshButton'));
check('Dark refresh text is readable',css.includes('color:#f2f7ff!important'));
check('Dark blue action has explicit contrast',css.includes('html[data-theme="dark"] .actions .blue'));
check('Dark yellow action has explicit contrast',css.includes('html[data-theme="dark"] .actions .yellow'));
check('PWA cache bumped',sw.includes('belm-app-v222-button-contrast'));
console.log(`V222 regression: ${pass} passed, ${fail} failed`);
if(fail) process.exit(1);
