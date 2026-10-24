const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../backend/api');
for (const filename of ['bank_manager.php', 'bank_vat_summary.php']) {
  const code = fs.readFileSync(path.join(root, filename), 'utf8');
  assert.match(code, /\$margin\s*=\s*belm_provisional_margin_bridge\(\$pdo,\s*\$invoiceLedger\)/, "use shared accounting calculation");
  assert.match(code, /\$netAfterVat\s*=\s*\$margin\['provisionalOperatingResult'\]/, "use operating result");
  assert.doesNotMatch(code, /\$netAfterVat\s*=[^;]*\$totalWithdrawals/);
  assert.match(code, /\$totalWithdrawals\s*=/);
}
console.log('OK: withdrawals affect cash-flow, not provisional operating result');
