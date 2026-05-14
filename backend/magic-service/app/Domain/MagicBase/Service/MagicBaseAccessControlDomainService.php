<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseTableAccessContext;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

readonly class MagicBaseAccessControlDomainService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseAdminDomainService $adminDomainService,
        private MagicBasePermissionDomainService $permissionDomainService,
        private MagicBaseQueryDomainService $queryDomainService,
    ) {
    }

    public function requireReadableTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $context = $this->loadTableContext($authorization, $projectId, $tableId);
        if (! $this->permissionDomainService->canReadTable(
            $context->getActor(),
            $context->getTable(),
            $context->getAccess()->getTablePermissions(),
            $context->getAccess()->isManager()
        )) {
            $this->forbidden('无查看权限');
        }

        return $context;
    }

    public function requireInsertableTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $context = $this->loadTableContext($authorization, $projectId, $tableId);
        if (! $this->permissionDomainService->canInsertTable(
            $context->getActor(),
            $context->getTable(),
            $context->getAccess()->getTablePermissions(),
            $context->getAccess()->isManager()
        )) {
            $this->forbidden('无新增权限');
        }

        return $context;
    }

    public function requireTableManager(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $context = $this->loadTableContext($authorization, $projectId, $tableId);
        if (! $context->getAccess()->isManager()) {
            $this->forbidden('无表管理权限');
        }

        return $context;
    }

    public function requireProjectManager(MagicUserAuthorization $authorization, int $projectId): ActorContext
    {
        $actor = $this->adminDomainService->buildActorContext($authorization);
        $this->adminDomainService->assertProjectManager($authorization, $projectId, $actor);
        return $actor;
    }

    public function requireReadableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        $row = $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
        if (! $this->permissionDomainService->canReadRow(
            $context->getActor(),
            $row,
            $context->getTable(),
            $context->getAccess()->getRowPermissions((int) $row->getRecordId()),
            $context->getAccess()->isManager()
        )) {
            $this->forbidden('无查看权限');
        }

        return $row;
    }

    public function requireEditableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        $row = $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
        if (! $this->permissionDomainService->canEditRow(
            $context->getActor(),
            $row,
            $context->getTable(),
            $context->getAccess()->getRowPermissions((int) $row->getRecordId()),
            $context->getAccess()->isManager()
        )) {
            $this->forbidden('无编辑权限');
        }

        return $row;
    }

    public function requireDeletableRow(MagicUserAuthorization $authorization, MagicBaseTableAccessContext $context, int $recordId): MagicBaseRowEntity
    {
        $row = $this->queryDomainService->getRowOrFail($authorization, $context->getTableId(), $recordId);
        if (! $this->permissionDomainService->canDeleteRow(
            $context->getActor(),
            $row,
            $context->getTable(),
            $context->getAccess()->getRowPermissions((int) $row->getRecordId()),
            $context->getAccess()->isManager()
        )) {
            $this->forbidden('无删除权限');
        }

        return $row;
    }

    /**
     * @param list<string> $fieldKeys dynamic row field keys to be edited
     */
    public function assertEditableColumns(MagicBaseTableAccessContext $context, MagicBaseRowEntity $row, array $fieldKeys): void
    {
        foreach ($fieldKeys as $fieldKey) {
            $column = $context->getAccess()->getColumns()->get($fieldKey);
            if (! $column instanceof MagicBaseColumnEntity) {
                $this->forbidden('字段无编辑权限');
            }
            if (! $this->permissionDomainService->canEditColumn(
                $context->getActor(),
                $row,
                $column,
                $context->getAccess()->getColumnPermissions((int) $column->getId()),
                $context->getAccess()->isManager()
            )) {
                $this->forbidden('字段无编辑权限');
            }
        }
    }

    public function filterReadableRows(MagicBaseTableAccessContext $context, MagicBaseEntityCollection $rows): MagicBaseEntityCollection
    {
        $readableRows = [];
        foreach ($rows as $row) {
            if (! $row instanceof MagicBaseRowEntity) {
                continue;
            }
            if (! $this->permissionDomainService->canReadRow(
                $context->getActor(),
                $row,
                $context->getTable(),
                $context->getAccess()->getRowPermissions((int) $row->getRecordId()),
                $context->getAccess()->isManager()
            )) {
                continue;
            }
            $readableRows[] = $row;
        }

        return new MagicBaseEntityCollection($readableRows);
    }

    public function loadTableContext(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableAccessContext
    {
        $actor = $this->adminDomainService->buildActorContext($authorization);
        $table = $this->getTableOrFail($authorization, $projectId, $tableId);
        $table = $this->queryDomainService->enrichTableScope($table);
        $access = $this->queryDomainService->loadAccessContext($authorization, $projectId, $tableId, $actor);

        return new MagicBaseTableAccessContext($projectId, $tableId, $actor, $table, $access);
    }

    private function getTableOrFail(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableEntity
    {
        $table = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $tableId);
        if ($table === null) {
            $this->invalid('数据表');
        }
        return $table;
    }

    private function invalid(string $label): void
    {
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }

    private function forbidden(string $label): void
    {
        ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'common.invalid', ['label' => $label]);
    }
}
