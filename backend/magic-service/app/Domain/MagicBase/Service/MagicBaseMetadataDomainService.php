<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseMigrationLogEntity;
use App\Domain\MagicBase\Entity\MagicBaseProjectAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseRelationEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableAdminEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Repository\Facade\MagicBaseMigrationLogRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBasePermissionRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRelationRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseTableRepositoryInterface;

readonly class MagicBaseMetadataDomainService
{
    public function __construct(
        private MagicBaseTableRepositoryInterface $tableRepository,
        private MagicBaseRelationRepositoryInterface $relationRepository,
        private MagicBasePermissionRepositoryInterface $permissionRepository,
        private MagicBaseMigrationLogRepositoryInterface $migrationLogRepository,
    ) {
    }

    public function getTable(string $organizationCode, int $projectId, int $tableId): ?MagicBaseTableEntity
    {
        return $this->tableRepository->getTable($organizationCode, $projectId, $tableId);
    }

    public function getTableByKey(string $organizationCode, int $projectId, string $tableKey): ?MagicBaseTableEntity
    {
        return $this->tableRepository->getTableByKey($organizationCode, $projectId, $tableKey);
    }

    /** @return MagicBaseEntityCollection<MagicBaseTableEntity> */
    public function listTables(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->tableRepository->listTables($organizationCode, $projectId);
    }

    /** @param array<string, mixed>|MagicBaseTableEntity $entity */
    public function saveTable(array|MagicBaseTableEntity $entity): MagicBaseTableEntity
    {
        return $this->tableRepository->saveTable($entity instanceof MagicBaseTableEntity ? $entity : new MagicBaseTableEntity($entity));
    }

    public function deleteTable(int $tableId): void
    {
        $this->tableRepository->deleteTable($tableId);
    }

    public function getColumn(string $organizationCode, int $tableId, int $columnId): ?MagicBaseColumnEntity
    {
        return $this->tableRepository->getColumn($organizationCode, $tableId, $columnId);
    }

    public function getColumnByKey(string $organizationCode, int $tableId, string $columnKey): ?MagicBaseColumnEntity
    {
        return $this->tableRepository->getColumnByKey($organizationCode, $tableId, $columnKey);
    }

    /** @return MagicBaseEntityCollection<MagicBaseColumnEntity> */
    public function listColumns(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->tableRepository->listColumns($organizationCode, $tableId);
    }

    /** @param array<string, mixed>|MagicBaseColumnEntity $entity */
    public function saveColumn(array|MagicBaseColumnEntity $entity): MagicBaseColumnEntity
    {
        return $this->tableRepository->saveColumn($entity instanceof MagicBaseColumnEntity ? $entity : new MagicBaseColumnEntity($entity));
    }

    public function deleteColumn(int $columnId): void
    {
        $this->tableRepository->deleteColumn($columnId);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRelationEntity> */
    public function listRelations(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->relationRepository->listRelations($organizationCode, $projectId);
    }

    public function getRelation(string $organizationCode, int $projectId, int $relationId): ?MagicBaseRelationEntity
    {
        return $this->relationRepository->getRelation($organizationCode, $projectId, $relationId);
    }

    public function getRelationByName(string $organizationCode, int $sourceTableId, string $relationName): ?MagicBaseRelationEntity
    {
        return $this->relationRepository->getRelationByName($organizationCode, $sourceTableId, $relationName);
    }

    /** @param array<string, mixed>|MagicBaseRelationEntity $entity */
    public function saveRelation(array|MagicBaseRelationEntity $entity): MagicBaseRelationEntity
    {
        return $this->relationRepository->saveRelation($entity instanceof MagicBaseRelationEntity ? $entity : new MagicBaseRelationEntity($entity));
    }

    public function deleteRelation(int $relationId): void
    {
        $this->relationRepository->deleteRelation($relationId);
    }

    /** @return MagicBaseEntityCollection<MagicBaseProjectAdminEntity> */
    public function listProjectAdmins(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->permissionRepository->listProjectAdmins($organizationCode, $projectId);
    }

    /** @param array<string, mixed>|MagicBaseProjectAdminEntity $entity */
    public function createProjectAdmin(array|MagicBaseProjectAdminEntity $entity): MagicBaseProjectAdminEntity
    {
        return $this->permissionRepository->createProjectAdmin($entity instanceof MagicBaseProjectAdminEntity ? $entity : new MagicBaseProjectAdminEntity($entity));
    }

    /** @return MagicBaseEntityCollection<MagicBaseTableAdminEntity> */
    public function listTableAdmins(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->permissionRepository->listTableAdmins($organizationCode, $tableId);
    }

    /** @param array<string, mixed>|MagicBaseTableAdminEntity $entity */
    public function createTableAdmin(array|MagicBaseTableAdminEntity $entity): MagicBaseTableAdminEntity
    {
        return $this->permissionRepository->createTableAdmin($entity instanceof MagicBaseTableAdminEntity ? $entity : new MagicBaseTableAdminEntity($entity));
    }

    /** @return MagicBaseEntityCollection<MagicBaseTablePermissionEntity> */
    public function listTablePermissions(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->permissionRepository->listTablePermissions($organizationCode, $tableId);
    }

    /** @param array<string, mixed>|MagicBaseTablePermissionEntity $entity */
    public function upsertTablePermission(array|MagicBaseTablePermissionEntity $entity): MagicBaseTablePermissionEntity
    {
        return $this->permissionRepository->upsertTablePermission($entity instanceof MagicBaseTablePermissionEntity ? $entity : new MagicBaseTablePermissionEntity($entity));
    }

    public function deleteTablePermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        $this->permissionRepository->deleteTablePermission($organizationCode, $tableId, $permissionId);
    }

    /** @param list<string> $subjectTypes */
    public function deleteTablePermissionsBySubjectTypes(string $organizationCode, int $tableId, array $subjectTypes): void
    {
        $this->permissionRepository->deleteTablePermissionsBySubjectTypes($organizationCode, $tableId, $subjectTypes);
    }

    /** @return MagicBaseEntityCollection<MagicBaseColumnPermissionEntity> */
    public function listColumnPermissions(string $organizationCode, int $tableId, ?int $columnId = null): MagicBaseEntityCollection
    {
        return $this->permissionRepository->listColumnPermissions($organizationCode, $tableId, $columnId);
    }

    /** @param array<string, mixed>|MagicBaseColumnPermissionEntity $entity */
    public function upsertColumnPermission(array|MagicBaseColumnPermissionEntity $entity): MagicBaseColumnPermissionEntity
    {
        return $this->permissionRepository->upsertColumnPermission($entity instanceof MagicBaseColumnPermissionEntity ? $entity : new MagicBaseColumnPermissionEntity($entity));
    }

    public function deleteColumnPermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        $this->permissionRepository->deleteColumnPermission($organizationCode, $tableId, $permissionId);
    }

    /** @param list<int> $columnIds @param list<string> $subjectTypes */
    public function deleteColumnPermissionsByColumnIdsAndSubjectTypes(string $organizationCode, int $tableId, array $columnIds, array $subjectTypes): void
    {
        $this->permissionRepository->deleteColumnPermissionsByColumnIdsAndSubjectTypes($organizationCode, $tableId, $columnIds, $subjectTypes);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRowPermissionEntity> */
    public function listRowPermissions(string $organizationCode, int $tableId, ?int $recordId = null): MagicBaseEntityCollection
    {
        return $this->permissionRepository->listRowPermissions($organizationCode, $tableId, $recordId);
    }

    /** @param array<string, mixed>|MagicBaseRowPermissionEntity $entity */
    public function upsertRowPermission(array|MagicBaseRowPermissionEntity $entity): MagicBaseRowPermissionEntity
    {
        return $this->permissionRepository->upsertRowPermission($entity instanceof MagicBaseRowPermissionEntity ? $entity : new MagicBaseRowPermissionEntity($entity));
    }

    public function deleteRowPermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        $this->permissionRepository->deleteRowPermission($organizationCode, $tableId, $permissionId);
    }

    /** @param list<int> $recordIds @param list<string> $subjectTypes */
    public function deleteRowPermissionsByRecordIdsAndSubjectTypes(string $organizationCode, int $tableId, array $recordIds, array $subjectTypes): void
    {
        $this->permissionRepository->deleteRowPermissionsByRecordIdsAndSubjectTypes($organizationCode, $tableId, $recordIds, $subjectTypes);
    }

    public function createMigrationLog(MagicBaseMigrationLogEntity $entity): MagicBaseMigrationLogEntity
    {
        return $this->migrationLogRepository->createMigrationLog($entity);
    }
}
