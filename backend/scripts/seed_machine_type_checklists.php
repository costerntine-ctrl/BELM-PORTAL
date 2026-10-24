<?php
/**
 * Phase 39: additive, idempotent machine-type master checklists.
 * Run intentionally against a STAGING database after normal migrations.
 * Existing active templates are never overwritten, disabled, or deleted.
 */
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

function checklist_seed_id(string $key): string {
    $h = md5('belm-phase39-checklist:' . $key);
    return substr($h,0,8).'-'.substr($h,8,4).'-4'.substr($h,13,3).'-8'.substr($h,17,3).'-'.substr($h,20,12);
}
function checklist_specifications(): array {
    $common = ['Engine oil level','Coolant level and leaks','Fuel system leaks','Hydraulic oil level and leaks','Service brake','Parking brake','Steering','Tyres / tracks condition','Lights, horn and reversing alarm','Fire extinguisher and safety equipment','Seat belt and operator controls','Warning lights and fault codes'];
    return [
        'Forklift' => array_merge($common,['Forks and heel wear','Mast and lift chains','Fork carriage and locking pins','Tilt cylinders','Load chart and capacity plate']),
        'Excavator' => array_merge($common,['Boom and arm pins','Bucket teeth and retaining pins','Swing mechanism and slew ring','Track tension and rollers','Travel motors and final drives']),
        'Wheel Loader' => array_merge($common,['Loader boom linkage and bushes','Bucket cutting edge','Articulation joint','Lift and tilt cylinders','Axle and differential']),
        'Roller' => array_merge($common,['Drum and scraper bars','Vibration system engagement','Drum drive and bearing','Water spray system if fitted','ROPS and operator restraint']),
        'Grader' => array_merge($common,['Moldboard blade and cutting edges','Circle drive and rotation','Scarifier / ripper assembly','Articulation lock','Tandem drive']),
        'Bulldozer' => array_merge($common,['Blade cutting edge and push arms','Ripper teeth and pins','Undercarriage sprockets and idlers','Track tension','Final drive leaks']),
        'Dump Truck' => array_merge($common,['Tipper body hinge and pins','Hoist cylinder and body prop','Tailgate locks','Chassis and suspension','Tyre pressure and wheel nuts']),
        'Crane' => array_merge($common,['Boom sections and extensions','Wire rope and hook safety latch','Outriggers and load bearing pads','Load moment indicator','Limit switches and anti-two-block protection']),
        'Reach Stacker' => array_merge($common,['Boom lift and telescope','Spreader twistlocks and sensors','Container handling interlocks','Load moment indicator','Boom hydraulic cylinders']),
    ];
}
function seed_machine_type_checklists(PDO $pdo): array {
    $pdo->beginTransaction();
    $results = [];
    try {
        $pdo->exec('ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_master SMALLINT NOT NULL DEFAULT 1');
        $has = $pdo->prepare("SELECT id FROM checklist_templates WHERE deleted_at IS NULL AND is_active=1 AND regexp_replace(lower(machine_type),'[^a-z0-9]+','','g')=? AND EXISTS (SELECT 1 FROM checklist_template_items WHERE template_id=checklist_templates.id) LIMIT 1");
        $insertTemplate = $pdo->prepare('INSERT INTO checklist_templates (id,name,machine_type,service_type,is_active,is_master,created_at) VALUES (?,?,?,?,1,1,NOW()) ON CONFLICT (id) DO NOTHING');
        $insertItem = $pdo->prepare('INSERT INTO checklist_template_items (id,template_id,label,input_type,safety_level,options,option_safety,"order",is_required) VALUES (?,?,?,?,?,CAST(? AS JSONB),CAST(? AS JSONB),?,1) ON CONFLICT (id) DO NOTHING');
        foreach (checklist_specifications() as $type => $labels) {
            $has->execute([preg_replace('/[^a-z0-9]+/','',strtolower($type))]);
            if ($has->fetchColumn()) { $results[$type] = 'existing template preserved'; continue; }
            $id = checklist_seed_id('template-'.$type);
            $insertTemplate->execute([$id,$type.' Daily Safety Checklist',$type,'Daily / Pre-Operation Check']);
            $choices = ['Normal','Attention Required','Unsafe / Stop Machine'];
            $severity = ['Normal'=>'GREEN','Attention Required'=>'YELLOW','Unsafe / Stop Machine'=>'RED'];
            foreach ($labels as $i => $label) {
                $insertItem->execute([checklist_seed_id('item-'.$type.'-'.$i),$id,$label,'DROPDOWN','GREEN',json_encode($choices),json_encode($severity),$i+1]);
            }
            $results[$type] = 'template ready';
        }
        $pdo->commit();
        return $results;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try { foreach (seed_machine_type_checklists(db()) as $type => $result) echo "$type: $result\n"; }
    catch (Throwable $e) { fwrite(STDERR, $e->getMessage()."\n"); exit(1); }
}
