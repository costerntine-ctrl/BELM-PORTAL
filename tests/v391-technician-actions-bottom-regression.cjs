const fs = require('fs');
const js = fs.readFileSync('frontend/portal-tools.js','utf8');
const css = fs.readFileSync('frontend/belm-theme.css','utf8');
const checks = [
  ['Technician machine card gets V391 layout class', js.includes('"belm-technician-machine-card-v390", "belm-technician-machine-card-v391"')],
  ['Technician action row gets V391 bottom class', js.includes('belm-technician-card-actions-v390 belm-technician-card-actions-v391')],
  ['Technician card uses vertical flex layout', css.includes('.belm-technician-machine-card-v391') && css.includes('flex-direction: column !important')],
  ['Four action buttons are anchored to card bottom', css.includes('.belm-technician-card-actions-v391') && css.includes('margin-top: auto !important')],
  ['Alert message gets protected readable space', css.includes('.belm-technician-machine-alert-copy') && css.includes('min-height: 58px') && css.includes('line-height: 1.4 !important')],
  ['Existing four actions remain intact', js.includes('reportLink.textContent = "Report"') && js.includes('checkupButton.textContent = "Check Up"') && js.includes('servicePartsButton.textContent = "Service Parts"') && js.includes('workflowButton.textContent = "Job Card"')],
  ['Technician machine management remains removed', js.includes('removeTechnicianMachineManagementControls(card);')],
];
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL', name); process.exit(1); }
  console.log('PASS', name);
}
