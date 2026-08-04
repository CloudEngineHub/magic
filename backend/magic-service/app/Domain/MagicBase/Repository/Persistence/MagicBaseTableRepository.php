<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence;

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
use App\Domain\MagicBase\Repository\Facade\MagicBaseMetadataCleanupRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseMigrationLogRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBasePermissionRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRelationRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseTableRepositoryInterface;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseColumnModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseColumnPermissionModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseMigrationLogModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseProjectAdminModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseRelationModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseRowPermissionModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseTableAdminModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseTableModel;
use App\Domain\MagicBase\Repository\Persistence\Model\MagicBaseTablePermissionModel;
use Hyperf\DbConnection\Db;

class MagicBaseTableRepository implements MagicBaseTableRepositoryInterface, MagicBaseRelationRepositoryInterface, MagicBasePermissionRepositoryInterface, MagicBaseMigrationLogRepositoryInterface, MagicBaseMetadataCleanupRepositoryInterface
{
    public function deleteProjectMetadata(string $organizationCode, int $projectId): void
    {
        Db::transaction(function () use ($organizationCode, $projectId): void {
            $tableIds = MagicBaseTableModel::query()
                ->withTrashed()
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->pluck('id')
                ->map(static fn (mixed $id): int => (int) $id)
                ->all();

            if ($tableIds !== []) {
                MagicBaseRowPermissionModel::query()
                    ->where('organization_code', $organizationCode)
                    ->whereIn('table_id', $tableIds)
                    ->delete();
                MagicBaseColumnPermissionModel::query()
                    ->where('organization_code', $organizationCode)
                    ->whereIn('table_id', $tableIds)
                    ->delete();
                MagicBaseTablePermissionModel::query()
                    ->where('organization_code', $organizationCode)
                    ->whereIn('table_id', $tableIds)
                    ->delete();
                MagicBaseTableAdminModel::query()
                    ->where('organization_code', $organizationCode)
                    ->whereIn('table_id', $tableIds)
                    ->delete();

                Db::table('magicbase_columns')
                    ->where('organization_code', $organizationCode)
                    ->whereIn('table_id', $tableIds)
                    ->delete();
            }

            MagicBaseRelationModel::query()
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->delete();
            MagicBaseMigrationLogModel::query()
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->delete();
            MagicBaseProjectAdminModel::query()
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->delete();

            Db::table('magicbase_tables')
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->delete();
            Db::table('magicbase_project_storage_routes')
                ->where('organization_code', $organizationCode)
                ->where('project_id', $projectId)
                ->delete();
        });
    }

    public function createProjectAdmin(array|MagicBaseProjectAdminEntity $data): MagicBaseProjectAdminEntity
    {
        $entity = $this->ensureEntity(MagicBaseProjectAdminEntity::class, $data);
        $payload = $entity->toArray();
        $model = MagicBaseProjectAdminModel::query()->firstOrNew([
            'organization_code' => $payload['organization_code'],
            'project_id' => $payload['project_id'],
            'subject_type' => $payload['subject_type'],
            'subject_id' => $payload['subject_id'],
        ]);
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseProjectAdminEntity::class, $model->toArray());
    }

    public function listProjectAdmins(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseProjectAdminEntity::class, MagicBaseProjectAdminModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->get()
            ->toArray());
    }

    public function getTable(string $organizationCode, int $projectId, int $tableId): ?MagicBaseTableEntity
    {
        $model = MagicBaseTableModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->where('id', $tableId)
            ->whereNull('deleted_at')
            ->first();

        return $this->toEntity(MagicBaseTableEntity::class, $model?->toArray());
    }

    public function getTableByKey(string $organizationCode, int $projectId, string $tableKey): ?MagicBaseTableEntity
    {
        $model = MagicBaseTableModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->where('table_key', $tableKey)
            ->whereNull('deleted_at')
            ->first();

        return $this->toEntity(MagicBaseTableEntity::class, $model?->toArray());
    }

    public function listTables(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseTableEntity::class, MagicBaseTableModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->get()
            ->toArray());
    }

    public function saveTable(array|MagicBaseTableEntity $data): MagicBaseTableEntity
    {
        $entity = $this->ensureEntity(MagicBaseTableEntity::class, $data);
        $payload = $entity->toArray();
        $model = isset($payload['id'])
            ? MagicBaseTableModel::query()->where('id', (int) $payload['id'])->first()
            : null;
        $model ??= new MagicBaseTableModel();
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseTableEntity::class, $model->toArray());
    }

    public function deleteTable(int $tableId): void
    {
        MagicBaseTableModel::query()->where('id', $tableId)->delete();
    }

    public function getColumn(string $organizationCode, int $tableId, int $columnId): ?MagicBaseColumnEntity
    {
        $model = MagicBaseColumnModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->where('id', $columnId)
            ->whereNull('deleted_at')
            ->first();

        return $this->toEntity(MagicBaseColumnEntity::class, $model?->toArray());
    }

    public function getColumnByKey(string $organizationCode, int $tableId, string $columnKey): ?MagicBaseColumnEntity
    {
        $model = MagicBaseColumnModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->where('column_key', $columnKey)
            ->whereNull('deleted_at')
            ->first();

        return $this->toEntity(MagicBaseColumnEntity::class, $model?->toArray());
    }

    public function listColumns(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseColumnEntity::class, MagicBaseColumnModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->get()
            ->toArray());
    }

    public function saveColumn(array|MagicBaseColumnEntity $data): MagicBaseColumnEntity
    {
        $entity = $this->ensureEntity(MagicBaseColumnEntity::class, $data);
        $payload = $entity->toArray();
        $model = isset($payload['id'])
            ? MagicBaseColumnModel::query()->where('id', (int) $payload['id'])->first()
            : null;
        $model ??= new MagicBaseColumnModel();
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseColumnEntity::class, $model->toArray());
    }

    public function deleteColumn(int $columnId): void
    {
        MagicBaseColumnModel::query()->where('id', $columnId)->delete();
    }

    public function createMigrationLog(array|MagicBaseMigrationLogEntity $data): MagicBaseMigrationLogEntity
    {
        $entity = $this->ensureEntity(MagicBaseMigrationLogEntity::class, $data);
        $model = new MagicBaseMigrationLogModel();
        $model->fill($entity->toArray());
        $model->save();
        return $this->toEntity(MagicBaseMigrationLogEntity::class, $model->toArray());
    }

    public function listRelations(string $organizationCode, int $projectId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseRelationEntity::class, MagicBaseRelationModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->orderBy('id')
            ->get()
            ->toArray());
    }

    public function getRelation(string $organizationCode, int $projectId, int $relationId): ?MagicBaseRelationEntity
    {
        $model = MagicBaseRelationModel::query()
            ->where('organization_code', $organizationCode)
            ->where('project_id', $projectId)
            ->where('id', $relationId)
            ->first();

        return $this->toEntity(MagicBaseRelationEntity::class, $model?->toArray());
    }

    public function getRelationByName(string $organizationCode, int $sourceTableId, string $relationName): ?MagicBaseRelationEntity
    {
        $model = MagicBaseRelationModel::query()
            ->where('organization_code', $organizationCode)
            ->where('source_table_id', $sourceTableId)
            ->where('relation_name', $relationName)
            ->first();

        return $this->toEntity(MagicBaseRelationEntity::class, $model?->toArray());
    }

    public function saveRelation(array|MagicBaseRelationEntity $data): MagicBaseRelationEntity
    {
        $entity = $this->ensureEntity(MagicBaseRelationEntity::class, $data);
        $payload = $entity->toArray();
        $model = isset($payload['id'])
            ? MagicBaseRelationModel::query()->where('id', (int) $payload['id'])->first()
            : null;
        $model ??= new MagicBaseRelationModel();
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseRelationEntity::class, $model->toArray());
    }

    public function deleteRelation(int $relationId): void
    {
        MagicBaseRelationModel::query()->where('id', $relationId)->delete();
    }

    public function listTableAdmins(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseTableAdminEntity::class, MagicBaseTableAdminModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->get()
            ->toArray());
    }

    public function createTableAdmin(array|MagicBaseTableAdminEntity $data): MagicBaseTableAdminEntity
    {
        $entity = $this->ensureEntity(MagicBaseTableAdminEntity::class, $data);
        $payload = $entity->toArray();
        $model = MagicBaseTableAdminModel::query()->firstOrNew([
            'organization_code' => $payload['organization_code'],
            'table_id' => $payload['table_id'],
            'subject_type' => $payload['subject_type'],
            'subject_id' => $payload['subject_id'],
        ]);
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseTableAdminEntity::class, $model->toArray());
    }

    public function listTablePermissions(string $organizationCode, int $tableId): MagicBaseEntityCollection
    {
        return $this->toEntities(MagicBaseTablePermissionEntity::class, MagicBaseTablePermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->get()
            ->toArray());
    }

    public function upsertTablePermission(array|MagicBaseTablePermissionEntity $data): MagicBaseTablePermissionEntity
    {
        $entity = $this->ensureEntity(MagicBaseTablePermissionEntity::class, $data);
        $payload = $entity->toArray();
        $model = MagicBaseTablePermissionModel::query()->firstOrNew([
            'organization_code' => $payload['organization_code'],
            'table_id' => $payload['table_id'],
            'subject_type' => $payload['subject_type'],
            'subject_id' => $payload['subject_id'],
            'permission_level' => $payload['permission_level'],
        ]);
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseTablePermissionEntity::class, $model->toArray());
    }

    public function deleteTablePermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        MagicBaseTablePermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->where('id', $permissionId)
            ->delete();
    }

    public function deleteTablePermissionsBySubjectTypes(string $organizationCode, int $tableId, array $subjectTypes): void
    {
        if ($subjectTypes === []) {
            return;
        }

        MagicBaseTablePermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->whereIn('subject_type', $subjectTypes)
            ->delete();
    }

    public function listColumnPermissions(string $organizationCode, int $tableId, ?int $columnId = null): MagicBaseEntityCollection
    {
        $query = MagicBaseColumnPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId);
        if ($columnId !== null) {
            $query->where('column_id', $columnId);
        }

        return $this->toEntities(MagicBaseColumnPermissionEntity::class, $query->get()->toArray());
    }

    public function upsertColumnPermission(array|MagicBaseColumnPermissionEntity $data): MagicBaseColumnPermissionEntity
    {
        $entity = $this->ensureEntity(MagicBaseColumnPermissionEntity::class, $data);
        $payload = $entity->toArray();
        $model = MagicBaseColumnPermissionModel::query()->firstOrNew([
            'organization_code' => $payload['organization_code'],
            'table_id' => $payload['table_id'],
            'column_id' => $payload['column_id'],
            'subject_type' => $payload['subject_type'],
            'subject_id' => $payload['subject_id'],
        ]);
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseColumnPermissionEntity::class, $model->toArray());
    }

    public function deleteColumnPermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        MagicBaseColumnPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->where('id', $permissionId)
            ->delete();
    }

    public function deleteColumnPermissionsByColumnIdsAndSubjectTypes(string $organizationCode, int $tableId, array $columnIds, array $subjectTypes): void
    {
        if ($columnIds === [] || $subjectTypes === []) {
            return;
        }

        MagicBaseColumnPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->whereIn('column_id', $columnIds)
            ->whereIn('subject_type', $subjectTypes)
            ->delete();
    }

    public function listRowPermissions(string $organizationCode, int $tableId, ?int $recordId = null): MagicBaseEntityCollection
    {
        $query = MagicBaseRowPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId);
        if ($recordId !== null) {
            $query->where('record_id', $recordId);
        }

        return $this->toEntities(MagicBaseRowPermissionEntity::class, $query->get()->toArray());
    }

    public function upsertRowPermission(array|MagicBaseRowPermissionEntity $data): MagicBaseRowPermissionEntity
    {
        $entity = $this->ensureEntity(MagicBaseRowPermissionEntity::class, $data);
        $payload = $entity->toArray();
        $model = MagicBaseRowPermissionModel::query()->firstOrNew([
            'organization_code' => $payload['organization_code'],
            'table_id' => $payload['table_id'],
            'record_id' => $payload['record_id'],
            'subject_type' => $payload['subject_type'],
            'subject_id' => $payload['subject_id'],
        ]);
        $model->fill($payload);
        $model->save();
        return $this->toEntity(MagicBaseRowPermissionEntity::class, $model->toArray());
    }

    public function deleteRowPermission(string $organizationCode, int $tableId, int $permissionId): void
    {
        MagicBaseRowPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->where('id', $permissionId)
            ->delete();
    }

    public function deleteRowPermissionsByRecordIdsAndSubjectTypes(string $organizationCode, int $tableId, array $recordIds, array $subjectTypes): void
    {
        if ($recordIds === [] || $subjectTypes === []) {
            return;
        }

        MagicBaseRowPermissionModel::query()
            ->where('organization_code', $organizationCode)
            ->where('table_id', $tableId)
            ->whereIn('record_id', $recordIds)
            ->whereIn('subject_type', $subjectTypes)
            ->delete();
    }

    /**
     * @template T of \App\Infrastructure\Core\AbstractEntity
     * @param class-string<T> $class
     * @return ?T
     */
    private function toEntity(string $class, ?array $data): ?object
    {
        if ($data === null) {
            return null;
        }
        return new $class($data);
    }

    /**
     * @template T of \App\Infrastructure\Core\AbstractEntity
     * @param class-string<T> $class
     * @return MagicBaseEntityCollection<T>
     */
    private function toEntities(string $class, array $rows): MagicBaseEntityCollection
    {
        $entities = [];
        foreach ($rows as $row) {
            $entities[] = new $class((array) $row);
        }
        return new MagicBaseEntityCollection($entities);
    }

    /**
     * @template T of object
     * @param class-string<T> $class
     * @return T
     */
    private function ensureEntity(string $class, array|object $data): object
    {
        if ($data instanceof $class) {
            return $data;
        }
        return new $class($data);
    }
}
