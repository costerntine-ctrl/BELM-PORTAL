const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('review-report validates repair ownership before approval', () => {
  const src = fs.readFileSync(path.join(__dirname, '../backend/api/job_card_workflow_v814.php'), 'utf8');
  const start = src.indexOf("$action==='review-report'");
  const end = src.indexOf("$action==='start-test'", start);
  assert.ok(start > 0 && end > start);
  const block = src.slice(start, end);
  assert.match(block, /\$customerWorkshop\s*=/);
  assert.match(block, /\$ctx\['kind'\] === 'customer'/);
  assert.match(block, /\$customerWorkshop\)\s*\{/);
  assert.match(block, /json_error\([^\n]*403\)/);
  assert.ok(block.indexOf('$customerWorkshop') < block.indexOf("$status!=='REPORT_REVIEW'"));
});
