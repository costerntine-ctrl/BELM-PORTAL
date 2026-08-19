const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const tools=fs.readFileSync(path.join(root,'frontend/portal-tools.js'),'utf8');
const css=fs.readFileSync(path.join(root,'frontend/belm-theme.css'),'utf8');
const index=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'frontend/belm-sw.js'),'utf8');
let n=0;
function t(name,ok){n++; if(!ok){console.error('FAIL',name); process.exitCode=1;} else console.log('PASS',name);}
t('Machine Job Cards has its own color class',tools.includes('belm-technician-checkup-button belm-technician-jobcards-button'));
t('Checked Reports is fixed yellow',css.includes('.belm-technician-report-link')&&css.includes('background: var(--belm-yellow) !important;'));
t('Check-up is fixed green',css.includes('.belm-technician-checkup-button:not(.belm-technician-jobcards-button)')&&css.includes('background: var(--belm-green) !important;'));
t('Machine Job Cards is fixed blue',css.includes('.belm-technician-jobcards-button')&&css.includes('background: var(--belm-blue, #1769c2) !important;'));
t('alert blink remains present',css.includes('.belm-tech-action-alert')&&css.includes('belmTechActionBlink'));
t('SPA cache-bust uses V325 portal tools',(/portal-tools\.js\?v=(325-technician-card-colors|326-jc-proforma-sync|351-dev-expense-access|352-public-url-port-guard)/.test(index)));
t('SPA cache-bust uses V325 theme',(/belm-theme\.css\?v=(325-technician-card-colors|326-jc-proforma-sync)/.test(index)));
t('service worker cache bumped',(/belm-app-v(325-technician-card-colors|326-jc-proforma-sync)/.test(sw)));
if(!process.exitCode) console.log(`V325 checks passed ${n}/${n}`);
