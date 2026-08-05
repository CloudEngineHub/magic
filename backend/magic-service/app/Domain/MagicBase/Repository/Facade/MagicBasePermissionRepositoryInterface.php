<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Facade;

use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseProjectAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;

interface MagicBasePermissionRepositoryInterface
{
    /** @return MagicBaseEntityCollection<MagicBaseProjectAdminEntity> */
    public function listProjectAdmins(string $organizationCode, int $projectId): MagicBaseEntityCollection;

    public function createProjectAdmin(MagicBaseProjectAdminEntity $entity): MagicBaseProjectAdminEntity;

    /** @return MagicBaseEntityCollection<MagicBaseTableAdminEntity> */
    public function listTableAdmins(string $organizationCode, int $tableId): MagicBaseEntityCollection;

    public function createTableAdmin(MagicBaseTableAdminEntity $entity): MagicBaseTableAdminEntity;

    /** @return MagicBaseEntityCollection<MagicBaseTablePermissionEntity> */
    public function listTablePermissions(string $organizationCode, int $tableId): MagicBaseEntityCollection;

    public function upsertTablePermission(MagicBaseTablePermissionEntity $entity): MagicBaseTablePermissionEntity;

    public function deleteTablePermission(string $organizationCode, int $tableId, int $permissionId): void;

    /** @param list<string> $subjectTypes */
    public function deleteTablePermissionsBySubjectTypes(string $organizationCode, int $tableId, array $subjectTypes): void;

    /** @return MagicBaseEntityCollection<MagicBaseColumnPermissionEntity> */
    public function listColumnPermissions(string $organizationCode, int $tableId, ?int $columnId = null): MagicBaseEntityCollection;

    public function upsertColumnPermission(MagicBaseColumnPermissionEntity $entity): MagicBaseColumnPermissionEntity;

    public function deleteColumnPermission(string $organizationCode, int $tableId, int $permissionId): void;

    /** @param list<int> $columnIds @param list<string> $subjectTypes */
    public function deleteColumnPermissionsByColumnIdsAndSubjectTypes(string $organizationCode, int $tableId, array $columnIds, array $subjectTypes): void;

    /** @return MagicBaseEntityCollection<MagicBaseRowPermissionEntity> */
    public function listRowPermissions(string $organizationCode, int $tableId, ?int $recordId = null): MagicBaseEntityCollection;

    public function upsertRowPermission(MagicBaseRowPermissionEntity $entity): MagicBaseRowPermissionEntity;

    public function deleteRowPermission(string $organizationCode, int $tableId, int $permissionId): void;

    /** @param list<int> $recordIds @param list<string> $subjectTypes */
    public function deleteRowPermissionsByRecordIdsAndSubjectTypes(string $organizationCode, int $tableId, array $recordIds, array $subjectTypes): void;
}
