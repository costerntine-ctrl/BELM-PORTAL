const fs = require('fs');
const js = fs.readFileSync('frontend/portal-tools.js','utf8');
const css = fs.readFileSync('frontend/belm-theme.css','utf8');
const checks = [
  ['Technician card reuses compact customer machine card language', js.includes('"belm-technician-machine-card", "belm-customer-machine-card", "belm-technician-machine-card-v390"')],
  ['Fleet number badge is added to Technician card', js.includes('belm-customer-fleet-number') && js.includes('Fleet Number: ${fleetNumber}')],
  ['Technician alert copy is readable', js.includes('belm-technician-machine-alert-copy belm-customer-machine-alert-copy') && js.includes('Service range: checking')],
  ['Service range participates in full-card range', js.includes('card.dataset.belmServiceRange = String(status.level || "GREEN").toUpperCase()') && js.includes('applyCustomerMachineRange(card)')],
  ['Technician actions are exactly modern labels', js.includes('reportLink.textContent = "Report"') && js.includes('checkupButton.textContent = "Check Up"') && js.includes('servicePartsButton.textContent = "Service Parts"') && js.includes('workflowButton.textContent = "Job Card"')],
  ['Technician machine actions use four-column row', css.includes('.belm-technician-card-actions-v390') && css.includes('grid-template-columns: repeat(4, minmax(0, 1fr))')],
  ['Legacy Technician dock is hidden', css.includes('body[data-belm-area="tech"] #belm-tech-action-dock') && css.includes('display: none !important')],
  ['Technician machine card footprint is compact', css.includes('.belm-technician-machine-card-v390') && css.includes('width: 390px !important') && css.includes('min-height: 590px !important')],
  ['Machine management guard remains intact', js.includes('removeTechnicianMachineManagementControls(card);') && js.includes('"edit machine", "delete machine", "forget permanently"')],
  ['Activity Status sync remains intact', js.includes('data-belm-op-status') && js.includes('/api/customers/machines/${machine.id}/status')],
];
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL', name); process.exit(1); }
  console.log('PASS', name);
}
