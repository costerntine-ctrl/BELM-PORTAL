const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
test('real payment handler locks before reading balance, rejects excess, and replays one payment per request key',()=>{
 const source=fs.readFileSync('backend/api/customer_portal.php','utf8'),start=source.indexOf("        $documentId = trim((string)($b['documentId']"),end=source.indexOf("\n    }\n    json_error('Method not allowed.'",start),handler=source.slice(start,end);
 const code=`<?php
 class Result extends Exception {public $data;function __construct($d,$s){$this->data=$d;parent::__construct('', $s);}}
 function json_error($m,$s=400){throw new Result(['error'=>$m],$s);}function json_out($d,$s=200){throw new Result($d,$s);}function uuid(){static $i=0;return 'id-'.++$i;}function log_customer_activity($c,$m){}function db(){return $GLOBALS['pdo'];}
 class Statement{public $q;public $args;function __construct($q){$this->q=$q;}function execute($a){$this->args=$a;$p=db();if(str_contains($this->q,'FOR UPDATE')){if(!$p->tx)throw new Exception('lock outside transaction');$p->locked=true;}if(str_contains($this->q,'SUM(amount)')&&!$p->locked)throw new Exception('balance read before lock');if(str_starts_with($this->q,'INSERT INTO customer_sales_payments')){if(!$p->tx||!$p->locked)throw new Exception('insert without lock');$p->paid+=$a[3];$p->rows[]=$a;}}
 function fetch(){if(str_contains($this->q,'request_hash')){foreach(db()->rows as $row)if($row[1]===$this->args[0]&&$row[9]===$this->args[1])return ['id'=>$row[0],'request_hash'=>$row[10]];return false;}if(str_contains($this->q,'FOR UPDATE'))return $this->args[1]==='A'?['id'=>'invoice','document_type'=>'INVOICE','document_no'=>'INV1','amount'=>100,'vat_rate'=>0]:false;return false;}
 function fetchColumn(){return db()->paid;}}
 class DB{public $tx=false,$locked=false,$paid=0,$rows=[];function beginTransaction(){$this->tx=true;$this->locked=false;}function inTransaction(){return $this->tx;}function rollBack(){$this->tx=false;$this->locked=false;}function commit(){$this->tx=false;$this->locked=false;}function prepare($q){return new Statement($q);}}
 $pdo=new DB;$customer=['id'=>'A','actorName'=>'Finance'];$out=[];
 foreach([
 ['A',60,'request-0000000001'],['A',60,'request-0000000001'],['A',50,'request-0000000002'],['A',40,'request-0000000003'],['A',30,'request-0000000001'],['B',10,'request-0000000004']
 ] as $c){$customer['id']=$c[0];$b=['documentId'=>'invoice','amount'=>$c[1],'requestKey'=>$c[2]];try{${handler}}catch(Result $e){$out[]=['status'=>$e->getCode(),'data'=>$e->data];}}
 echo json_encode(['results'=>$out,'rows'=>count($pdo->rows),'paid'=>$pdo->paid,'transactionOpen'=>$pdo->tx]);`;
 const p=cp.spawnSync(process.env.BELM_TEST_PHP||'php',['-n'],{input:code,encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);const d=JSON.parse(p.stdout);assert.equal(d.rows,2);assert.equal(d.paid,100);assert.equal(d.transactionOpen,false);assert.equal(d.results[0].status,201);assert.equal(d.results[1].data.replayed,true);assert.equal(d.results[1].data.id,d.results[0].data.id);assert.equal(d.results[2].status,400);assert.equal(d.results[3].data.balance,0);assert.equal(d.results[4].status,409);assert.equal(d.results[5].status,404);
});
