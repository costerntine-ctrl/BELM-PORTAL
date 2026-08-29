<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';

function belm_master_seed_uuid(int $n): string {
    return sprintf('b17a%04d-0000-4000-8000-%012d', 100 + $n, $n);
}

$pdo = db();
$pdo->beginTransaction();
try {
    // Keep Customer Check Up schema backward-compatible with databases created
    // before the V17 daily service fields and MASTER flag existed.
    $pdo->exec("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_master SMALLINT NOT NULL DEFAULT 1");
    $pdo->exec("ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS service_day_checked SMALLINT NOT NULL DEFAULT 0");
    $pdo->exec("ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS next_service_hours INTEGER NULL");
    $pdo->exec("ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS display_photo_url TEXT NULL");
    $pdo->exec("ALTER TABLE checklist_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL");
    $pdo->exec("ALTER TABLE checklist_answers ADD COLUMN IF NOT EXISTS note TEXT NULL");

    $machineType = 'Reach Stacker';
    $masterName = 'Reach Stacker Master Checklist';
    $masterId = 'b17a0000-0000-4000-8000-000000000045';

    $exists = $pdo->prepare("SELECT id FROM checklist_templates WHERE deleted_at IS NULL AND is_master=1 AND LOWER(name)=LOWER(?) LIMIT 1");
    $exists->execute([$masterName]);
    $existingId = (string)($exists->fetchColumn() ?: '');

    if ($existingId === '') {
        $pdo->prepare("UPDATE checklist_templates SET is_active=0 WHERE deleted_at IS NULL AND regexp_replace(lower(machine_type), '[^a-z0-9]+', '', 'g')='reachstacker'")->execute();
        $pdo->prepare("INSERT INTO checklist_templates (id,name,machine_type,service_type,is_active,is_master,created_at) VALUES (?,?,?,?,1,1,NOW())")
            ->execute([$masterId,$masterName,$machineType,'Daily / Pre-Operation Check']);

        $items = [
            ['Engine oil level',['Normal','Low','Critical'],['Normal'=>'GREEN','Low'=>'YELLOW','Critical'=>'RED']],
            ['Engine coolant level / temperature',['Normal','Attention','Critical'],['Normal'=>'GREEN','Attention'=>'YELLOW','Critical'=>'RED']],
            ['Engine running condition / abnormal noise or smoke',['Normal','Attention','Stop Machine'],['Normal'=>'GREEN','Attention'=>'YELLOW','Stop Machine'=>'RED']],
            ['Transmission oil level / condition',['Normal','Low / Attention','Critical'],['Normal'=>'GREEN','Low / Attention'=>'YELLOW','Critical'=>'RED']],
            ['Forward / reverse gear engagement',['Normal','Delayed','Not Engaging'],['Normal'=>'GREEN','Delayed'=>'YELLOW','Not Engaging'=>'RED']],
            ['Service brake operation',['Normal','Weak','Unsafe'],['Normal'=>'GREEN','Weak'=>'YELLOW','Unsafe'=>'RED']],
            ['Parking brake operation',['Normal','Weak','Not Holding'],['Normal'=>'GREEN','Weak'=>'YELLOW','Not Holding'=>'RED']],
            ['Hydraulic oil level',['Normal','Low','Critical'],['Normal'=>'GREEN','Low'=>'YELLOW','Critical'=>'RED']],
            ['Hydraulic leaks - hoses, pipes, cylinders and valves',['None','Minor','Serious'],['None'=>'GREEN','Minor'=>'YELLOW','Serious'=>'RED']],
            ['Boom lift / lower operation',['Normal','Slow / Jerky','Unsafe / Not Working'],['Normal'=>'GREEN','Slow / Jerky'=>'YELLOW','Unsafe / Not Working'=>'RED']],
            ['Boom extend / retract operation',['Normal','Slow / Jerky','Unsafe / Not Working'],['Normal'=>'GREEN','Slow / Jerky'=>'YELLOW','Unsafe / Not Working'=>'RED']],
            ['Spreader lock / unlock and twist-lock sensors',['Normal','Attention','Unsafe / Not Working'],['Normal'=>'GREEN','Attention'=>'YELLOW','Unsafe / Not Working'=>'RED']],
            ['Battery / charging system',['Normal','Attention','Critical'],['Normal'=>'GREEN','Attention'=>'YELLOW','Critical'=>'RED']],
            ['Electrical wiring / connectors / controllers',['Normal','Attention','Critical'],['Normal'=>'GREEN','Attention'=>'YELLOW','Critical'=>'RED']],
            ['Headlights, work lights, beacon and indicators',['All Working','Some Not Working','Safety Lights Failed'],['All Working'=>'GREEN','Some Not Working'=>'YELLOW','Safety Lights Failed'=>'RED']],
            ['Active fault / warning codes on display',['No Active Code','Warning Code','Critical / Stop Code'],['No Active Code'=>'GREEN','Warning Code'=>'YELLOW','Critical / Stop Code'=>'RED']],
            ['Tyres / wheels / wheel nuts',['Normal','Attention','Unsafe'],['Normal'=>'GREEN','Attention'=>'YELLOW','Unsafe'=>'RED']],
            ['Steering operation',['Normal','Attention','Unsafe'],['Normal'=>'GREEN','Attention'=>'YELLOW','Unsafe'=>'RED']],
            ['Horn, reverse alarm, seat belt and safety interlocks',['All Working','Attention','Unsafe / Failed'],['All Working'=>'GREEN','Attention'=>'YELLOW','Unsafe / Failed'=>'RED']],
            ['Working parameters - boom angle / length / load indication',['Normal','Attention','Abnormal / Unsafe'],['Normal'=>'GREEN','Attention'=>'YELLOW','Abnormal / Unsafe'=>'RED']],
            ['Service tracking status',['Within Service Interval','Service Due Soon','Service Overdue'],['Within Service Interval'=>'GREEN','Service Due Soon'=>'YELLOW','Service Overdue'=>'RED']],
        ];
        $insert = $pdo->prepare('INSERT INTO checklist_template_items (id,template_id,label,input_type,safety_level,options,option_safety,"order",is_required) VALUES (?,?,?,?,?,CAST(? AS JSONB),CAST(? AS JSONB),?,1)');
        foreach ($items as $i => $row) {
            $insert->execute([belm_master_seed_uuid($i+1),$masterId,$row[0],'DROPDOWN','GREEN',json_encode($row[1]),json_encode($row[2]),$i+1]);
        }
        $pdo->prepare('INSERT INTO checklist_template_items (id,template_id,label,input_type,safety_level,options,option_safety,"order",is_required) VALUES (?,?,?,?,?,NULL,NULL,22,0)')
            ->execute([belm_master_seed_uuid(22),$masterId,'Operator / Technician remarks','TEXT','NONE']);
    } else {
        $pdo->prepare('UPDATE checklist_templates SET is_master=1,is_active=1 WHERE id=?')->execute([$existingId]);
        $pdo->prepare("UPDATE checklist_templates SET is_active=0 WHERE id<>? AND deleted_at IS NULL AND regexp_replace(lower(machine_type), '[^a-z0-9]+', '', 'g')='reachstacker'")->execute([$existingId]);
    }

    $pdo->commit();
    fwrite(STDOUT, "BELM Reach Stacker master/checkup schema migration completed.\n");
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fwrite(STDERR, "Checklist master migration failed: {$e->getMessage()}\n");
    exit(1);
}
