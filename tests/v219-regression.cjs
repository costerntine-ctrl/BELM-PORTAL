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
{
  const html = fs.readFileSync('frontend/customers-manager/index.html', 'utf8');
  const m = /customers-manager\/manager\.js\?v=(\d+)-/.exec(html);
  checks.push(['frontend/customers-manager/index.html: manager.js cache bumped >= v219', !!m && Number(m[1]) >= 219]);
}
{
  const sw = fs.readFileSync('frontend/belm-sw.js', 'utf8');
  const m = /CACHE='belm-app-v(\d+)-/.exec(sw);
  checks.push(['frontend/belm-sw.js: cache bumped >= v219', !!m && Number(m[1]) >= 219]);
}
const failed = checks.filter(([,ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
console.log(`TOTAL ${checks.length-failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);
