<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

interface MagicBasePermissionRepositoryInterface
{
    /** @return MagicBaseEntityCollection<MagicBaseTableAdminEntity> */
    public function listTableAdmins(string $organizationCode, int $tableId): MagicBaseEntityCollection;

    public function createTableAdmin(MagicBaseTableAdminEntity $entity): MagicBaseTableAdminEntity;

    /** @return MagicBaseEntityCollection<MagicBaseTablePermissionEntity> */
    public function listTablePermissions(string $organizationCode, int $tableId): MagicBaseEntityCollection;

    public function upsertTablePermission(MagicBaseTablePermissionEntity $entity): MagicBaseTablePermissionEntity;

    /** @return MagicBaseEntityCollection<MagicBaseColumnPermissionEntity> */
    public function listColumnPermissions(string $organizationCode, int $tableId, ?int $columnId = null): MagicBaseEntityCollection;

    public function upsertColumnPermission(MagicBaseColumnPermissionEntity $entity): MagicBaseColumnPermissionEntity;

    /** @return MagicBaseEntityCollection<MagicBaseRowPermissionEntity> */
    public function listRowPermissions(string $organizationCode, int $tableId, ?int $recordId = null): MagicBaseEntityCollection;

    public function upsertRowPermission(MagicBaseRowPermissionEntity $entity): MagicBaseRowPermissionEntity;
}
