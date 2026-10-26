const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const php=process.env.BELM_TEST_PHP||'php';
function run(code){const p=cp.spawnSync(php,['-n'],{input:'<?php\n'+code,encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);return JSON.parse(p.stdout)}
function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0);let depth=0,end=source.indexOf('{',start);for(let i=end;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1)}}
const helpers=fs.readFileSync('backend/config/helpers.php','utf8');
test('built-in role bounds remove historic admin grants and preserve valid workspace grants',()=>{const result=run(fn(helpers,'belm_bound_role_pages')+`echo json_encode([
 belm_bound_role_pages('Workshop Manager',['customers','bank-manager','settings','roles','service-requests','reports']),
 belm_bound_role_pages('Bank Controller',['customers','bank-manager','settings','roles','reports']),
 belm_bound_role_pages('System Settings',['roles','settings']),
 belm_bound_role_pages('Finance / Accounts',['billing','reports'])]);`);assert.deepEqual(result,[['customers','service-requests','reports'],['bank-manager','reports'],[],['billing','reports']]);});
test('machine photo GET rejects cross-company technicians, paused customer technicians and bank accounts',()=>{
 const source=fs.readFileSync('backend/api/machine_card_photo.php','utf8'),start=source.indexOf("if ($type === 'customer')"),end=source.indexOf('$method = strtoupper',start),guard=source.slice(start,end);
 const result=run(`function json_error($m,$s=400){throw new Exception($m,$s);}function require_auth(){return $GLOBALS['user'];}function require_customer_auth(){return $GLOBALS['customer'];}function belm_user_has_named_role($u,$roles){return in_array($u['roleName'],$roles,true);}class Check{function execute($a){}function fetchColumn(){return $GLOBALS['managed'];}}class DB{function prepare($q){return new Check;}}$pdo=new DB;$machine=['customer_id'=>'A','is_machinery_admin'=>1];$payload=[];$actorName='Test';$out=[];
 foreach([
 ['staff','Technician','A',false],['staff','Technician','B',false],['staff','Bank Controller','',false],['staff','Workshop Manager','',false],['staff','Technician','A',true],['customer','owner','A',false],['customer','owner','B',false]
 ] as $i=>$c){[$type,$role,$assigned,$managed]=$c;$machine['is_machinery_admin']=$i===4?0:1;$user=['id'=>'u','roleName'=>$role,'assignedCustomerId'=>$assigned,'allowedPages'=>$role==='Technician'?['customers']:[]];$customer=['id'=>$assigned,'actorType'=>'owner'];$canView=$canUpload=false;try{`+guard+`$out[]=['view'=>$canView,'upload'=>$canUpload];}catch(Exception $e){$out[]=$e->getCode();}}echo json_encode($out);`);
 assert.deepEqual(result,[{view:true,upload:true},403,403,{view:true,upload:true},403,{view:true,upload:true},403]);
});
test('both machine editors validate facts, preserve omitted facts and uppercase identifiers',()=>{
 const result=run(`function json_error($m,$s=400){throw new Exception($m,$s);}`+fn(fs.readFileSync('backend/api/customers.php','utf8'),'normalized_machine_details')+fn(fs.readFileSync('backend/api/customer_portal.php','utf8'),'customer_machine_details_from_body')+`$out=[];foreach(['normalized_machine_details','customer_machine_details_from_body'] as $f){$b=['machineType'=>'Reach stacker','model'=>'SRS45','serialNumber'=>'sn-01','regNumber'=>'t123','fleetNumber'=>'rs-04','capacity'=>'45 tons','location'=>'Yard 3'];$x=$f($b);unset($b['capacity'],$b['location']);$old=$f($b);$b['location']=str_repeat('x',256);try{$f($b);$denied=false;}catch(Exception $e){$denied=true;}$out[]=[$x['serialNumber'],$x['regNumber'],$x['fleetNumber'],$x['capacity'],$x['location'],$old['capacity'],$old['location'],$denied];}echo json_encode($out);`);
 assert.deepEqual(result,Array(2).fill(['SN-01','T123','RS-04','45 tons','Yard 3',null,null,true]));
});

test('an existing JWT uses current staff activation and role grants rather than stale claims',()=>{
 const result=run(`function current_token_payload(){return ['type'=>'staff','id'=>'u','roleName'=>'Super Admin','allowedPages'=>null];}function belm_require_login_role($r){}function merged_allowed_pages_for_user($id,$role,$json){return json_decode($json,true);}function json_error($m,$s=400){throw new Exception($m,$s);}class S{function execute($a){}function fetch(){return $GLOBALS['active']?['id'=>'u','name'=>'Live','role_name'=>'Workshop Manager','allowed_pages'=>'["reports"]','assigned_customer_id'=>null,'is_customer_managed'=>0]:false;}}class DB{function prepare($q){return new S;}}function db(){return new DB;}`+fn(helpers,'require_auth')+`$active=true;$user=require_auth();$active=false;try{require_auth();$denied=0;}catch(Exception $e){$denied=$e->getCode();}echo json_encode([$user['roleName'],$user['allowedPages'],$denied]);`);assert.deepEqual(result,['Workshop Manager',['reports'],401]);
});
