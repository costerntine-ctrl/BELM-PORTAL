const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname,'../backend/scripts/seed_machine_type_checklists.php'),'utf8');
test('nine machine types have dedicated safety checklist specifications',()=>{
 for(const type of ['Forklift','Excavator','Wheel Loader','Roller','Grader','Bulldozer','Dump Truck','Crane','Reach Stacker']) assert.ok(source.includes("'"+type+"' =>"),type);
});
test('seeding is additive and idempotent',()=>{
 assert.match(source,/ON CONFLICT \(id\) DO NOTHING/);
 assert.match(source,/existing template preserved/);
 assert.doesNotMatch(source,/DELETE FROM checklist_templates|SET is_active=0/);
});
test('unsafe answers are RED and require stopping machine',()=>{
 assert.match(source,/Unsafe \/ Stop Machine/);
 assert.match(source,/'Unsafe \/ Stop Machine'=>'RED'/);
});
