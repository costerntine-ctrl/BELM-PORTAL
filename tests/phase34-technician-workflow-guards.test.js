const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root,'backend/api/job_card_workflow_v814.php'),'utf8');
const breakdown = fs.readFileSync(path.join(root,'backend/api/breakdown_workflow.php'),'utf8');
test('Job Card receive rejects all statuses outside permitted active set, including completed', () => {
  assert.match(breakdown, /if\(!in_array\(\$status,\['OPEN','ASSIGNED','CREATED','RECEIVED','IN_PROGRESS','WAITING_FOR_PARTS'\],true\)\)/);
});
test('test initiation requires acknowledgement and actively approved repair', () => {
  const start=workflow.indexOf("$action==='start-test'");
  const end=workflow.indexOf("$action==='final-result'",start);
  const code=workflow.slice(start,end);
  assert.match(code, /empty\(\$job\['received_at'\]\)/);
  assert.match(code, /status'\] \?\? ''\)\)!=='IN_PROGRESS'/);
  assert.match(code, /jcv814_maintenance_approved\(\$job\)/);
});
