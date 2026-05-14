<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\ColumnPermissionRequestDTO;
use App\Application\MagicBase\DTO\RowPermissionRequestDTO;
use App\Application\MagicBase\DTO\TablePermissionRequestDTO;
use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseColumnPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTablePermissionEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Domain\MagicBase\Service\MagicBaseAccessControlDomainService;
use App\Domain\MagicBase\Service\MagicBaseAdminDomainService;
use App\Domain\MagicBase\Service\MagicBaseMigrationLogDomainService;
use App\Domain\MagicBase\Service\MagicBaseQueryDomainService;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTime;

readonly class MagicBasePermissionAppService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseAdminDomainService $adminDomainService,
        private MagicBaseMigrationLogDomainService $migrationLogDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
    ) {
    }

    public function createTablePermission(MagicUserAuthorization $authorization, int $projectId, int $tableId, TablePermissionRequestDTO $requestDTO): MagicBaseTablePermissionEntity
    {
        $this->accessControlDomainService->requireTableManager($authorization, $projectId, $tableId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);
        $permissionLevel = trim((string) $requestDTO->getPermissionLevel());
        if (! in_array($permissionLevel, MagicBaseConst::PERMISSION_LEVELS, true)) {
            $this->invalid('permission_level');
        }

        $saved = $this->repository->upsertTablePermission([
            'organization_code' => $authorization->getOrganizationCode(),
            'table_id' => $tableId,
            'subject_type' => $subject->getSubjectType(),
            'subject_id' => $subject->getSubjectId(),
            'permission_level' => $permissionLevel,
            'created_at' => new DateTime(),
            'updated_at' => new DateTime(),
        ]);

        $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
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
        $this->accessControlDomainService->requireTableManager($authorization, $projectId, $tableId);
        $columnId = $this->parsePayloadId($requestDTO->getColumnId(), '字段ID');
        $column = $this->getColumnOrFail($authorization, $tableId, $columnId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);

        $saved = $this->repository->upsertColumnPermission([
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

        $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
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
        $this->accessControlDomainService->requireTableManager($authorization, $projectId, $tableId);
        $recordId = $this->parsePayloadId($requestDTO->getRecordId(), 'record_id');
        $this->queryDomainService->getRowOrFail($authorization, $tableId, $recordId);
        $subject = $this->adminDomainService->normalizeSubjectPayload($requestDTO->toArray(), true);

        $saved = $this->repository->upsertRowPermission([
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

        $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
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

    private function getColumnOrFail(MagicUserAuthorization $authorization, int $tableId, int $columnId): MagicBaseColumnEntity
    {
        $column = $this->repository->getColumn($authorization->getOrganizationCode(), $tableId, $columnId);
        if ($column === null) {
            $this->invalid('字段');
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
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }
}
