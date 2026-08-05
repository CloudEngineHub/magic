<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\BatchPermissionRequestDTO;
use App\Application\MagicBase\DTO\ColumnPermissionRequestDTO;
use App\Application\MagicBase\DTO\RowPermissionRequestDTO;
use App\Application\MagicBase\DTO\TablePermissionRequestDTO;
use App\Application\MagicBase\Support\MagicBaseAccessControl;
use App\Application\MagicBase\Support\MagicBaseRowQuerySupport;
use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Service\MagicBaseAdminDomainService;
use App\Domain\MagicBase\Service\MagicBaseMetadataDomainService;
use App\Domain\MagicBase\Service\MagicBaseMigrationLogDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTime;
use Hyperf\DbConnection\Db;

readonly class MagicBasePermissionAppService
{
    public function __construct(
        private MagicBaseMetadataDomainService $metadataDomainService,
        private MagicBaseAccessControl $accessControl,
        private MagicBaseAdminDomainService $adminDomainService,
        private MagicBaseMigrationLogDomainService $migrationLogDomainService,
        private MagicBaseRowQuerySupport $rowQuerySupport,
    ) {
    }

    /**
     * @return array{table_permissions: array<int, mixed>, column_permissions: array<int, mixed>, row_permissions: array<int, mixed>}
     */
    public function listPermissions(MagicUserAuthorization $authorization, int $projectId, int $tableId): array
    {
        $this->accessControl->requireWritableTable($authorization, $projectId, $tableId);

        return [
            'table_permissions' => iterator_to_array($this->metadataDomainService->listTablePermissions($authorization->getOrganizationCode(), $tableId)),
            'column_permissions' => iterator_to_array($this->metadataDomainService->listColumnPermissions($authorization->getOrganizationCode(), $tableId)),
            'row_permissions' => iterator_to_array($this->metadataDomainService->listRowPermissions($authorization->getOrganizationCode(), $tableId)),
        ];
    }

    /**
     * @return array{table_permissions: list<MagicBaseTablePermissionEntity>, column_permissions: list<MagicBaseColumnPermissionEntity>, row_permissions: list<MagicBaseRowPermissionEntity>}
     */
    public function batchSavePermissions(MagicUserAuthorization $authorization, int $projectId, int $tableId, BatchPermissionRequestDTO $requestDTO): array
    {
        $this->accessControl->requireTableManager($authorization, $projectId, $tableId);
        $targetType = $this->resolveTargetType($requestDTO->getTargetType());
        $targetIds = $this->resolveTargetIds($authorization, $projectId, $tableId, $targetType, $requestDTO->getTargetIds());
        $permissionGroups = $this->resolvePermissionGroups($requestDTO, $targetType, $targetIds);

        return Db::transaction(function () use ($authorization, $projectId, $tableId, $targetType, $targetIds, $permissionGroups): array {
            $beforePermissions = $this->listTargetPermissions(
                $authorization,
                $tableId,
                $targetType,
                $targetIds,
            );
            $this->deleteTargetPermissions(
                $authorization->getOrganizationCode(),
                $tableId,
                $targetType,
                $targetIds,
            );

            $savedTablePermissions = [];
            $savedColumnPermissions = [];
            $savedRowPermissions = [];
            foreach ($permissionGroups as $permissionGroup) {
                $now = new DateTime();
                if ($targetType === MagicBaseConst::TARGET_TABLE) {
                    foreach ($permissionGroup['table_permissions'] as $permissionLevel) {
                        $savedTablePermissions[] = $this->metadataDomainService->upsertTablePermission([
                            'organization_code' => $authorization->getOrganizationCode(),
                            'table_id' => $tableId,
                            'subject_type' => $permissionGroup['subject_type'],
                            'subject_id' => $permissionGroup['subject_id'],
                            'permission_level' => $permissionLevel,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }
                    continue;
                }

                if ($targetType === MagicBaseConst::TARGET_COLUMN) {
                    foreach ($targetIds as $columnId) {
                        $savedColumnPermissions[] = $this->metadataDomainService->upsertColumnPermission([
                            'organization_code' => $authorization->getOrganizationCode(),
                            'table_id' => $tableId,
                            'column_id' => $columnId,
                            'subject_type' => $permissionGroup['subject_type'],
                            'subject_id' => $permissionGroup['subject_id'],
                            'can_read' => $permissionGroup['can_read'],
                            'can_edit' => $permissionGroup['can_edit'],
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                    }
                    continue;
                }

                foreach ($targetIds as $recordId) {
                    $savedRowPermissions[] = $this->metadataDomainService->upsertRowPermission([
                        'organization_code' => $authorization->getOrganizationCode(),
                        'table_id' => $tableId,
                        'record_id' => $recordId,
                        'subject_type' => $permissionGroup['subject_type'],
                        'subject_id' => $permissionGroup['subject_id'],
                        'can_read' => $permissionGroup['can_read'],
                        'can_edit' => $permissionGroup['can_edit'],
                        'can_delete' => $permissionGroup['can_delete'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }

            $this->metadataDomainService->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_UPDATE,
                MagicBaseConst::TARGET_PERMISSION,
                null,
                $this->serializePermissions($beforePermissions),
                $this->serializePermissions([...$savedTablePermissions, ...$savedColumnPermissions, ...$savedRowPermissions]),
            ));

            return [
                'table_permissions' => $savedTablePermissions,
                'column_permissions' => $savedColumnPermissions,
                'row_permissions' => $savedRowPermissions,
            ];
        });
    }

    public function deletePermission(MagicUserAuthorization $authorization, int $projectId, int $tableId, string $type, int $permissionId): void
    {
        $this->accessControl->requireTableManager($authorization, $projectId, $tableId);

        match ($type) {
            'table' => $this->metadataDomainService->deleteTablePermission($authorization->getOrganizationCode(), $tableId, $permissionId),
            'column' => $this->metadataDomainService->deleteColumnPermission($authorization->getOrganizationCode(), $tableId, $permissionId),
            'row' => $this->metadataDomainService->deleteRowPermission($authorization->getOrganizationCode(), $tableId, $permissionId),
            default => $this->invalid('permission_type'),
        };
    }

    public function createTablePermission(MagicUserAuthorization $authorization, int $projectId, int $tableId, TablePermissionRequestDTO $requestDTO): MagicBaseTablePermissionEntity
    {
        $this->accessControl->requireTableManager($authorization, $projectId, $tableId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);
        $permissionLevel = trim((string) $requestDTO->getPermissionLevel());
        if (! in_array($permissionLevel, MagicBaseConst::PERMISSION_LEVELS, true)) {
            $this->invalid('permission_level');
        }

        $saved = $this->metadataDomainService->upsertTablePermission([
            'organization_code' => $authorization->getOrganizationCode(),
            'table_id' => $tableId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'permission_level' => $permissionLevel,
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);

        $this->metadataDomainService->createMigrationLog($this->migrationLogDomainService->buildPayload(
            $authorization,
            $projectId,
            $tableId,
            MagicBaseConst::CHANGE_CREATE,
            MagicBaseConst::TARGET_PERMISSION,
            (int) $saved->getId(),
            null,
            $saved,
        ));

        return $saved;
    }

    public function createColumnPermission(MagicUserAuthorization $authorization, int $projectId, int $tableId, ColumnPermissionRequestDTO $requestDTO): MagicBaseColumnPermissionEntity
    {
        $this->accessControl->requireTableManager($authorization, $projectId, $tableId);
        $columnId = $this->parsePayloadId($requestDTO->getColumnId(), '字段ID');
        $column = $this->getColumnOrFail($authorization, $tableId, $columnId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);

        $saved = $this->metadataDomainService->upsertColumnPermission([
            'organization_code' => $authorization->getOrganizationCode(),
            'table_id' => $tableId,
            'column_id' => $columnId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'can_read' => $requestDTO->canRead(),
            'can_edit' => $requestDTO->canEdit(),
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);

        $this->metadataDomainService->createMigrationLog($this->migrationLogDomainService->buildPayload(
            $authorization,
            $projectId,
            $tableId,
            MagicBaseConst::CHANGE_CREATE,
            MagicBaseConst::TARGET_PERMISSION,
            (int) $saved->getId(),
            null,
            $saved,
        ));

        return $saved;
    }

    public function createRowPermission(MagicUserAuthorization $authorization, int $projectId, int $tableId, RowPermissionRequestDTO $requestDTO): MagicBaseRowPermissionEntity
    {
        $this->accessControl->requireTableManager($authorization, $projectId, $tableId);
        $recordId = $this->parsePayloadId($requestDTO->getRecordId(), 'record_id');
        $this->rowQuerySupport->getRowOrFail($authorization, $projectId, $tableId, $recordId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);

        $saved = $this->metadataDomainService->upsertRowPermission([
            'organization_code' => $authorization->getOrganizationCode(),
            'table_id' => $tableId,
            'record_id' => $recordId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'can_read' => $requestDTO->canRead(),
            'can_edit' => $requestDTO->canEdit(),
            'can_delete' => $requestDTO->canDelete(),
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);

        $this->metadataDomainService->createMigrationLog($this->migrationLogDomainService->buildPayload(
            $authorization,
            $projectId,
            $tableId,
            MagicBaseConst::CHANGE_CREATE,
            MagicBaseConst::TARGET_PERMISSION,
            (int) $saved->getId(),
            null,
            $saved,
        ));

        return $saved;
    }

    private function resolveTargetType(string $targetType): string
    {
        if (! in_array($targetType, [MagicBaseConst::TARGET_TABLE, MagicBaseConst::TARGET_COLUMN, 'row'], true)) {
            $this->invalid('target_type');
        }
        return $targetType;
    }

    /** @param list<string> $targetIdPayloads @return list<int> */
    private function resolveTargetIds(MagicUserAuthorization $authorization, int $projectId, int $tableId, string $targetType, array $targetIdPayloads): array
    {
        if ($targetType === MagicBaseConst::TARGET_TABLE) {
            if ($targetIdPayloads !== []) {
                $this->invalid('target_ids');
            }
            return [];
        }

        $targetIds = [];
        foreach ($targetIdPayloads as $targetIdPayload) {
            $targetId = $this->parsePayloadId($targetIdPayload, $targetType === MagicBaseConst::TARGET_COLUMN ? '字段ID' : 'record_id');
            if (! in_array($targetId, $targetIds, true)) {
                $targetIds[] = $targetId;
            }
        }
        if ($targetIds === []) {
            $this->invalid('target_ids');
        }

        foreach ($targetIds as $targetId) {
            if ($targetType === MagicBaseConst::TARGET_COLUMN) {
                $this->getColumnOrFail($authorization, $tableId, $targetId);
                continue;
            }
            $this->rowQuerySupport->getRowOrFail($authorization, $projectId, $tableId, $targetId);
        }
        return $targetIds;
    }

    /**
     * @param list<int> $targetIds
     * @return list<array{subject_type: string, subject_id: string, table_permissions: list<string>, can_read: bool, can_edit: bool, can_delete: bool}>
     */
    private function resolvePermissionGroups(BatchPermissionRequestDTO $requestDTO, string $targetType, array $targetIds): array
    {
        $groups = [];
        $subjectKeys = [];
        foreach ($requestDTO->getPermissions() as $permissionPayload) {
            if ($permissionPayload['target_type'] !== $targetType) {
                $this->invalid('target_type');
            }
            $subject = $this->adminDomainService->normalizeSubjectPayload([
                'subject_type' => $permissionPayload['subject_type'],
                'subject_id' => $permissionPayload['subject_id'],
            ], true);
            if (! in_array($subject->getSubjectType(), [MagicBaseConst::SUBJECT_USER, MagicBaseConst::SUBJECT_DEPARTMENT], true)) {
                $this->invalid('subject_type');
            }
            $subjectKey = $subject->getSubjectType() . ':' . $subject->getSubjectId();
            if (isset($subjectKeys[$subjectKey])) {
                $this->invalid('permissions');
            }
            $subjectKeys[$subjectKey] = true;

            $tablePermissions = [];
            $canRead = false;
            $canEdit = false;
            $canDelete = false;
            if ($targetType === MagicBaseConst::TARGET_TABLE) {
                if ($permissionPayload['column_permissions'] !== [] || $permissionPayload['row_permissions'] !== []) {
                    $this->invalid('permissions');
                }
                foreach ($permissionPayload['table_permissions'] as $permissionLevel) {
                    if (! in_array($permissionLevel, MagicBaseConst::PERMISSION_LEVELS, true)) {
                        $this->invalid('permission_level');
                    }
                    $tablePermissions[] = $permissionLevel;
                }
            } elseif ($targetType === MagicBaseConst::TARGET_COLUMN) {
                if ($permissionPayload['table_permissions'] !== [] || $permissionPayload['row_permissions'] !== []) {
                    $this->invalid('permissions');
                }
                [$canRead, $canEdit] = $this->resolveColumnPermission($permissionPayload['column_permissions'], $targetIds);
            } else {
                if ($permissionPayload['table_permissions'] !== [] || $permissionPayload['column_permissions'] !== []) {
                    $this->invalid('permissions');
                }
                [$canRead, $canEdit, $canDelete] = $this->resolveRowPermission($permissionPayload['row_permissions'], $targetIds);
            }

            $groups[] = [
                'subject_type' => $subject->getSubjectType(),
                'subject_id' => $subject->getSubjectId(),
                'table_permissions' => $tablePermissions,
                'can_read' => $canRead,
                'can_edit' => $canEdit,
                'can_delete' => $canDelete,
            ];
        }
        return $groups;
    }

    /** @param list<array{column_ids: list<string>, can_read: bool, can_edit: bool}> $permissions @param list<int> $targetIds @return array{bool, bool} */
    private function resolveColumnPermission(array $permissions, array $targetIds): array
    {
        if ($permissions === []) {
            return [false, false];
        }
        if (count($permissions) !== 1 || ! $this->hasSameTargetIds($permissions[0]['column_ids'], $targetIds)) {
            $this->invalid('column_permissions');
        }
        return [$permissions[0]['can_read'], $permissions[0]['can_edit']];
    }

    /** @param list<array{record_ids: list<string>, can_read: bool, can_edit: bool, can_delete: bool}> $permissions @param list<int> $targetIds @return array{bool, bool, bool} */
    private function resolveRowPermission(array $permissions, array $targetIds): array
    {
        if ($permissions === []) {
            return [false, false, false];
        }
        if (count($permissions) !== 1 || ! $this->hasSameTargetIds($permissions[0]['record_ids'], $targetIds)) {
            $this->invalid('row_permissions');
        }
        return [$permissions[0]['can_read'], $permissions[0]['can_edit'], $permissions[0]['can_delete']];
    }

    /** @param list<string> $payloadIds @param list<int> $targetIds */
    private function hasSameTargetIds(array $payloadIds, array $targetIds): bool
    {
        $parsedIds = [];
        foreach ($payloadIds as $payloadId) {
            $parsedId = $this->parsePayloadId($payloadId, 'target_id');
            if (! in_array($parsedId, $parsedIds, true)) {
                $parsedIds[] = $parsedId;
            }
        }
        sort($parsedIds);
        $expectedIds = $targetIds;
        sort($expectedIds);
        return $parsedIds === $expectedIds;
    }

    /** @param list<int> $targetIds @return list<MagicBaseTablePermissionEntity|MagicBaseColumnPermissionEntity|MagicBaseRowPermissionEntity> */
    private function listTargetPermissions(MagicUserAuthorization $authorization, int $tableId, string $targetType, array $targetIds): array
    {
        $subjectTypes = [MagicBaseConst::SUBJECT_USER, MagicBaseConst::SUBJECT_DEPARTMENT];
        if ($targetType === MagicBaseConst::TARGET_TABLE) {
            return array_values(array_filter(
                iterator_to_array($this->metadataDomainService->listTablePermissions($authorization->getOrganizationCode(), $tableId)),
                static fn (MagicBaseTablePermissionEntity $permission): bool => in_array($permission->getSubjectType(), $subjectTypes, true),
            ));
        }

        if ($targetType === MagicBaseConst::TARGET_COLUMN) {
            return array_values(array_filter(
                iterator_to_array($this->metadataDomainService->listColumnPermissions($authorization->getOrganizationCode(), $tableId)),
                static fn (MagicBaseColumnPermissionEntity $permission): bool => in_array($permission->getSubjectType(), $subjectTypes, true)
                    && in_array($permission->getColumnId(), $targetIds, true),
            ));
        }

        return array_values(array_filter(
            iterator_to_array($this->metadataDomainService->listRowPermissions($authorization->getOrganizationCode(), $tableId)),
            static fn (MagicBaseRowPermissionEntity $permission): bool => in_array($permission->getSubjectType(), $subjectTypes, true)
                && in_array($permission->getRecordId(), $targetIds, true),
        ));
    }

    /** @param list<int> $targetIds */
    private function deleteTargetPermissions(string $organizationCode, int $tableId, string $targetType, array $targetIds): void
    {
        $subjectTypes = [MagicBaseConst::SUBJECT_USER, MagicBaseConst::SUBJECT_DEPARTMENT];
        if ($targetType === MagicBaseConst::TARGET_TABLE) {
            $this->metadataDomainService->deleteTablePermissionsBySubjectTypes($organizationCode, $tableId, $subjectTypes);
            return;
        }
        if ($targetType === MagicBaseConst::TARGET_COLUMN) {
            $this->metadataDomainService->deleteColumnPermissionsByColumnIdsAndSubjectTypes($organizationCode, $tableId, $targetIds, $subjectTypes);
            return;
        }
        $this->metadataDomainService->deleteRowPermissionsByRecordIdsAndSubjectTypes($organizationCode, $tableId, $targetIds, $subjectTypes);
    }

    /** @param list<MagicBaseColumnPermissionEntity|MagicBaseRowPermissionEntity|MagicBaseTablePermissionEntity> $permissions */
    private function serializePermissions(array $permissions): array
    {
        return array_map(static fn (MagicBaseColumnPermissionEntity|MagicBaseRowPermissionEntity|MagicBaseTablePermissionEntity $permission): array => $permission->toArray(), $permissions);
    }

    private function getColumnOrFail(MagicUserAuthorization $authorization, int $tableId, int $columnId): MagicBaseColumnEntity
    {
        $column = $this->metadataDomainService->getColumn($authorization->getOrganizationCode(), $tableId, $columnId);
        if ($column === null) {
            $this->notFound('字段');
        }
        return $column;
    }

    private function parsePayloadId(mixed $value, string $label): int
    {
        if (is_int($value)) {
            return $value;
        }
        if (! is_string($value) || ! ctype_digit($value)) {
            $this->invalid($label);
        }
        return (int) $value;
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::permissionInvalid($label);
    }

    private function notFound(string $label): void
    {
        MagicBaseExceptionBuilder::resourceNotFound($label);
    }
}
