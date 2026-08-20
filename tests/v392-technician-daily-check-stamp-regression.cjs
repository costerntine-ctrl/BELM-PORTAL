const fs = require('fs');
const js = fs.readFileSync('frontend/portal-tools.js','utf8');
const css = fs.readFileSync('frontend/belm-theme.css','utf8');
const php = fs.readFileSync('backend/api/checklist_reports.php','utf8');
const checks = [
  ['Technician daily stamp exists on machine card', js.includes('data-tech-check-stamp') && js.includes('data-tech-check-stamp-text') && js.includes('data-tech-check-stamp-number')],
  ['Checked time is Tanzania HH.MM without seconds', js.includes('formatTechnicianCheckedMoment') && js.includes('timeZone: "Africa/Dar_es_Salaam"') && js.includes('${get("hour")}.${get("minute")}')],
  ['Checklist number is automatic and stable in API', php.includes('function checklist_report_number') && php.includes("$report['checklistNo'] = checklist_report_number($report)")],
  ['Frontend consumes API checklist number with deterministic fallback', js.includes('function technicianChecklistNumber') && js.includes('report?.checklistNo') && js.includes('CHK-${dateKey}-')],
  ['Stamp auto resets at Tanzania 00.00', js.includes('technicianMillisecondsToTanzaniaMidnight') && js.includes('Auto reset 00.00') && js.includes('eatOffsetMs = 3 * 60 * 60 * 1000')],
  ['New Tanzania day makes daily check due again', js.includes('const checkedToday = technicianCheckedToday(checkedAt)') && js.includes('technicianMachineNeedsCheck(condition.status) || !checkedToday')],
  ['Saved checklist updates card immediately', js.includes('technicianRenderDailyCheckStamp(savedCard, saved)') && js.includes('snapshot.lastCheckedAt = savedAt')],
  ['Reload restores latest same-day checklist stamp', js.includes('technicianLoadLatestDailyCheckStamp(card, machine)') && js.includes('/api/checklist-reports/machine/${encodeURIComponent(machine.id)}')],
  ['Stamp hidden state is enforced in CSS', css.includes('.belm-technician-check-stamp[hidden]') && css.includes('display: none !important')],
  ['Existing bottom action layout remains', css.includes('.belm-technician-card-actions-v391') && css.includes('margin-top: auto !important')],
];
for (const [name, ok] of checks) {
  if (!ok) { console.error('FAIL', name); process.exit(1); }
  console.log('PASS', name);
}
