<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

function role_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    $hex = bin2hex($data);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function role_row(PDO $pdo, string $name, bool $activeOnly = true): ?array {
    $sql = 'SELECT id,name,allowed_pages,permissions,deleted_at FROM roles WHERE LOWER(name)=LOWER(?)';
    if ($activeOnly) $sql .= ' AND deleted_at IS NULL';
    $sql .= ' ORDER BY created_at ASC LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$name]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function page_list($value): array {
    if (is_string($value)) $value = json_decode($value, true);
    if (!is_array($value)) return [];
    if (!array_is_list($value)) return array_values(array_map('strval', array_keys($value)));
    return array_values(array_unique(array_map('strval', $value)));
}

function rename_role(PDO $pdo, string $legacy, string $canonical): void {
    $legacyRow = role_row($pdo, $legacy);
    if (!$legacyRow) return;
    $canonicalRow = role_row($pdo, $canonical);
    if ($canonicalRow && $canonicalRow['id'] !== $legacyRow['id']) {
        throw new RuntimeException("Cannot normalize role {$legacy}: canonical role {$canonical} already exists with another ID.");
    }
    $stmt = $pdo->prepare('UPDATE roles SET name=? WHERE id=?');
    $stmt->execute([$canonical, $legacyRow['id']]);
}

function ensure_role(PDO $pdo, string $name, array $allowedPages): array {
    $row = role_row($pdo, $name, false);
    if ($row) {
        if ($row['deleted_at'] !== null) {
            $pdo->prepare('UPDATE roles SET deleted_at=NULL WHERE id=?')->execute([$row['id']]);
        }
        $current = page_list($row['allowed_pages']);
        if (!$current && $allowedPages) {
            $pdo->prepare('UPDATE roles SET allowed_pages=?::jsonb WHERE id=?')
                ->execute([json_encode($allowedPages, JSON_UNESCAPED_SLASHES), $row['id']]);
        }
        return role_row($pdo, $name) ?? $row;
    }

    $id = role_uuid();
    $stmt = $pdo->prepare(
        'INSERT INTO roles(id,name,permissions,allowed_pages,created_at,deleted_at) VALUES(?,?,?::jsonb,?::jsonb,NOW(),NULL)'
    );
    $stmt->execute([
        $id,
        $name,
        json_encode(new stdClass()),
        json_encode($allowedPages, JSON_UNESCAPED_SLASHES),
    ]);
    return role_row($pdo, $name) ?? ['id' => $id, 'name' => $name];
}

function effective_pages_without_role(PDO $pdo, string $userId, string $excludedRoleId): array {
    $stmt = $pdo->prepare(
        'SELECT r.allowed_pages
           FROM users u
           JOIN roles r ON r.id=u.role_id
          WHERE u.id=? AND u.deleted_at IS NULL AND r.deleted_at IS NULL
        UNION ALL
         SELECT r.allowed_pages
           FROM user_roles ur
           JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=? AND ur.role_id<>? AND r.deleted_at IS NULL'
    );
    $stmt->execute([$userId, $userId, $excludedRoleId]);
    $pages = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $pages = array_merge($pages, page_list($row['allowed_pages']));
    }
    return array_values(array_unique($pages));
}

try {
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->query("SELECT pg_advisory_xact_lock(hashtext('belm-role-normalization-v1'))");

    // Keep Super Admin and Technician literal names unchanged because several
    // authorization checks intentionally treat them as built-in identities.
    $renameMap = [
        'Account' => 'Finance / Accounts',
        'BANK CONTROLER' => 'Bank Controller',
        'ENGINEER' => 'Workshop Manager',
        'MARKETING' => 'Registration & Sales',
        'PROCUREMENT' => 'Procurement',
    ];
    foreach ($renameMap as $legacy => $canonical) rename_role($pdo, $legacy, $canonical);

    // The unused duplicate TECHNICIANS row becomes the canonical Store Keeper
    // role. If a Store Keeper role already exists, leave it untouched and retire
    // only the empty duplicate.
    $legacyTechs = role_row($pdo, 'TECHNICIANS');
    $storeKeeper = role_row($pdo, 'Store Keeper');
    if ($legacyTechs && !$storeKeeper) {
        $pdo->prepare('UPDATE roles SET name=?,allowed_pages=?::jsonb WHERE id=?')->execute([
            'Store Keeper',
            json_encode(['spare-parts','reports'], JSON_UNESCAPED_SLASHES),
            $legacyTechs['id'],
        ]);
    } elseif ($legacyTechs && $storeKeeper && $legacyTechs['id'] !== $storeKeeper['id']) {
        $countStmt = $pdo->prepare(
            'SELECT (SELECT COUNT(*) FROM users WHERE role_id=? AND deleted_at IS NULL) +
                    (SELECT COUNT(*) FROM user_roles WHERE role_id=?)'
        );
        $countStmt->execute([$legacyTechs['id'], $legacyTechs['id']]);
        if ((int)$countStmt->fetchColumn() !== 0) {
            throw new RuntimeException('Legacy TECHNICIANS role still has assignments; refusing to retire it automatically.');
        }
        $pdo->prepare('UPDATE roles SET deleted_at=COALESCE(deleted_at,NOW()) WHERE id=?')->execute([$legacyTechs['id']]);
    }

    ensure_role($pdo, 'Store Keeper', ['spare-parts','reports']);
    ensure_role($pdo, 'System Coordinator', ['customers','roles','settings','checklist-templates','activity-log']);

    // Procurement existed with an empty page list. Give it only its operational
    // procurement/report scope; do not expand any other existing role here.
    $procurement = role_row($pdo, 'Procurement');
    if ($procurement && !page_list($procurement['allowed_pages'])) {
        $pdo->prepare('UPDATE roles SET allowed_pages=?::jsonb WHERE id=?')->execute([
            json_encode(['service-requests','spare-parts','suppliers','reports'], JSON_UNESCAPED_SLASHES),
            $procurement['id'],
        ]);
    }

    // OPERATION is a legacy extra role. Retire it only when every linked user
    // already receives all of its pages from another active role. This avoids
    // silently removing real access while still cleaning the known duplicate.
    $operation = role_row($pdo, 'OPERATION');
    if ($operation) {
        $operationPages = page_list($operation['allowed_pages']);
        $usersStmt = $pdo->prepare('SELECT user_id FROM user_roles WHERE role_id=?');
        $usersStmt->execute([$operation['id']]);
        $linkedUsers = array_column($usersStmt->fetchAll(PDO::FETCH_ASSOC), 'user_id');
        foreach ($linkedUsers as $userId) {
            $otherPages = effective_pages_without_role($pdo, (string)$userId, (string)$operation['id']);
            if (array_diff($operationPages, $otherPages)) {
                throw new RuntimeException('Legacy OPERATION role still grants unique access; refusing to retire it automatically.');
            }
        }
        if ($linkedUsers) {
            $pdo->prepare('DELETE FROM user_roles WHERE role_id=?')->execute([$operation['id']]);
        }
        $pdo->prepare('UPDATE roles SET deleted_at=COALESCE(deleted_at,NOW()) WHERE id=?')->execute([$operation['id']]);
    }

    $canonical = [
        'Super Admin',
        'Workshop Manager',
        'Technician',
        'Procurement',
        'Store Keeper',
        'Registration & Sales',
        'Finance / Accounts',
        'Bank Controller',
        'System Coordinator',
    ];

    $placeholders = implode(',', array_fill(0, count($canonical), '?'));
    $stmt = $pdo->prepare("SELECT name FROM roles WHERE deleted_at IS NULL AND name IN ($placeholders) ORDER BY name");
    $stmt->execute($canonical);
    $present = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'name');
    $missing = array_values(array_diff($canonical, $present));
    if ($missing) {
        throw new RuntimeException('Role normalization incomplete; missing: ' . implode(', ', $missing));
    }

    $pdo->commit();
    fwrite(STDOUT, "BELM role normalization complete: 9 canonical staff roles are available.\n");
} catch (Throwable $error) {
    try {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    } catch (Throwable $ignored) {}
    fwrite(STDERR, 'BELM role normalization failed: ' . $error->getMessage() . "\n");
    exit(1);
}
