const fs = require('fs');
const checks = [];
function has(path, needles) {
  const s = fs.readFileSync(path, 'utf8');
  for (const n of needles) checks.push([`${path}: ${n}`, s.includes(n)]);
}
has('backend/schema.sql', ['customer_communication_reads', 'PRIMARY KEY (communication_id, user_id)']);
has('backend/index.php', ["'action' => 'communication-read'", "($segments[4] ?? '') === 'read'"]);
has('backend/api/customers.php', ['ccr.user_id = ?', "action === 'communication-read'", "'isRead' => !empty($row['is_read'])"]);
has('frontend/customers-manager/manager.js', [
  'const unreadItems = items.filter((item) => !item.isRead);',
  'No new communication. Use <strong>View all</strong> for history.',
  'markCustomerCommunicationsRead(customerId, items)',
  'data-view-communication=',
]);
has('frontend/customers-manager/index.html', ['v=219-read-hide']);
has('frontend/belm-sw.js', ['belm-app-v222-button-contrast']);
const failed = checks.filter(([,ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
console.log(`TOTAL ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
