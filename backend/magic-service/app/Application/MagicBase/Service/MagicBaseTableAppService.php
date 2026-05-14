<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\Service;

use App\Application\MagicBase\DTO\CreateColumnRequestDTO;
use App\Application\MagicBase\DTO\CreateTableRequestDTO;
use App\Application\MagicBase\DTO\MagicBaseTableDetailDTO;
use App\Application\MagicBase\DTO\UpdateTableRequestDTO;
use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDynamicPermission;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Domain\MagicBase\Service\MagicBaseAccessControlDomainService;
use App\Domain\MagicBase\Service\MagicBaseColumnDomainService;
use App\Domain\MagicBase\Service\MagicBaseMigrationLogDomainService;
use App\Domain\MagicBase\Service\MagicBaseTableDomainService;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTime;
use Hyperf\DbConnection\Db;

readonly class MagicBaseTableAppService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicBaseTableDomainService $tableDomainService,
        private MagicBaseColumnDomainService $columnDomainService,
        private MagicBaseAccessControlDomainService $accessControlDomainService,
        private MagicBaseMigrationLogDomainService $migrationLogDomainService,
    ) {
    }

    public function createTable(MagicUserAuthorization $authorization, int $projectId, CreateTableRequestDTO $requestDTO): MagicBaseTableDetailDTO
    {
        $payload = $requestDTO->toArray();
        $this->tableDomainService->validateCreatePayload($payload);
        $this->columnDomainService->validateCreateList($requestDTO->columns);
        $this->tableDomainService->normalizeDynamicPermissions($requestDTO->dynamicPermissions);

        return Db::transaction(function () use ($authorization, $projectId, $payload): MagicBaseTableDetailDTO {
            $this->accessControlDomainService->requireWritableProject($authorization, $projectId);
            $organizationCode = $authorization->getOrganizationCode();

            if ($this->repository->getTableByKey($organizationCode, $projectId, trim((string) $payload['table_key'])) !== null) {
                $this->invalid('表标识已存在');
            }

            $now = $this->now();
            $dynamicPermissions = $this->tableDomainService->normalizeDynamicPermissions(MagicBaseDynamicPermissions::fromArray(
                is_array($payload['dynamic_permissions'] ?? null) ? $payload['dynamic_permissions'] : null
            ));
            $table = $this->repository->saveTable([
                'organization_code' => $organizationCode,
                'project_id' => $projectId,
                'table_key' => trim((string) $payload['table_key']),
                'table_name' => trim((string) $payload['table_name']),
                'description' => trim((string) ($payload['description'] ?? '')),
                'status' => MagicBaseConst::STATUS_ENABLED,
                'dynamic_permissions' => $dynamicPermissions->toArray(),
                'created_by' => $authorization->getId(),
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $columns = [];
            foreach ($payload['columns'] as $columnPayload) {
                $columnKey = trim((string) $columnPayload['column_key']);
                $columnDynamicPermission = is_array($columnPayload['dynamic_permission'] ?? null)
                    ? MagicBaseColumnDynamicPermission::fromArray($columnPayload['dynamic_permission'])
                    : $dynamicPermissions->getColumn($columnKey);

                $column = $this->repository->saveColumn([
                    'organization_code' => $organizationCode,
                    'table_id' => (int) $table->getId(),
                    'column_key' => $columnKey,
                    'column_name' => trim((string) $columnPayload['column_name']),
                    'data_type' => trim((string) $columnPayload['data_type']),
                    'is_required' => (bool) ($columnPayload['is_required'] ?? false),
                    'default_value' => $columnPayload['default_value'] ?? null,
                    'options' => isset($columnPayload['options']) && is_array($columnPayload['options']) ? $columnPayload['options'] : null,
                    'status' => MagicBaseConst::STATUS_ENABLED,
                    'dynamic_permission' => $this->columnDomainService->normalizeDynamicPermission($columnDynamicPermission)->toArray(),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $columns[] = $column;
            }

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                (int) $table->getId(),
                MagicBaseConst::CHANGE_CREATE,
                MagicBaseConst::TARGET_TABLE,
                (int) $table->getId(),
                null,
                array_merge($table->toArray(), ['columns' => array_map(static fn ($column) => $column->toArray(), iterator_to_array($columns))]),
            ));

            return new MagicBaseTableDetailDTO($table, new MagicBaseEntityCollection($columns));
        });
    }

    public function listTables(MagicUserAuthorization $authorization, int $projectId): MagicBaseEntityCollection
    {
        $this->accessControlDomainService->requireReadableProject($authorization, $projectId);
        return $this->repository->listTables($authorization->getOrganizationCode(), $projectId);
    }

    public function getTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): MagicBaseTableDetailDTO
    {
        $table = $this->accessControlDomainService->requireReadableTable($authorization, $projectId, $tableId)->getTable();
        $columns = $this->repository->listColumns($authorization->getOrganizationCode(), $tableId);
        return new MagicBaseTableDetailDTO($table, $columns);
    }

    public function updateTable(MagicUserAuthorization $authorization, int $projectId, int $tableId, UpdateTableRequestDTO $requestDTO): MagicBaseTableDetailDTO
    {
        $payload = $requestDTO->toArray();
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $payload): MagicBaseTableDetailDTO {
            $context = $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $table = $context->getTable();
            $before = $table;

            if (isset($payload['table_key'])) {
                $this->requireString($payload['table_key'], '表标识');
                $exists = $this->repository->getTableByKey($authorization->getOrganizationCode(), $projectId, trim((string) $payload['table_key']));
                if ($exists !== null && (int) $exists->getId() !== $tableId) {
                    $this->invalid('表标识已存在');
                }
                $table->setTableKey(trim((string) $payload['table_key']));
            }

            if (isset($payload['table_name'])) {
                $this->requireString($payload['table_name'], '表名称');
                $table->setTableName(trim((string) $payload['table_name']));
            }

            if (array_key_exists('description', $payload)) {
                $table->setDescription(trim((string) ($payload['description'] ?? '')));
            }

            if (array_key_exists('dynamic_permissions', $payload)) {
                $table->setDynamicPermissions($this->tableDomainService->normalizeDynamicPermissions(MagicBaseDynamicPermissions::fromArray(
                    is_array($payload['dynamic_permissions']) ? $payload['dynamic_permissions'] : null
                )));
            }

            $table->setUpdatedAt($this->now());
            $table = $this->repository->saveTable($table);
            $columns = $this->repository->listColumns($authorization->getOrganizationCode(), $tableId);

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_UPDATE,
                MagicBaseConst::TARGET_TABLE,
                $tableId,
                $before,
                $table,
            ));

            return new MagicBaseTableDetailDTO($table, $columns);
        });
    }

    public function deleteTable(MagicUserAuthorization $authorization, int $projectId, int $tableId): void
    {
        Db::transaction(function () use ($authorization, $projectId, $tableId): void {
            $context = $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $table = $context->getTable();
            $columns = $this->repository->listColumns($authorization->getOrganizationCode(), $tableId);
            foreach ($columns as $column) {
                if ($column instanceof MagicBaseColumnEntity) {
                    $this->repository->deleteColumn((int) $column->getId());
                }
            }
            $this->repository->deleteTable($tableId);

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_DELETE,
                MagicBaseConst::TARGET_TABLE,
                $tableId,
                array_merge($table->toArray(), ['columns' => array_map(static fn ($column) => $column->toArray(), iterator_to_array($columns))]),
                null,
            ));
        });
    }

    public function createColumn(MagicUserAuthorization $authorization, int $projectId, int $tableId, CreateColumnRequestDTO $requestDTO): MagicBaseColumnEntity
    {
        $payload = $requestDTO->toArray();
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $payload): MagicBaseColumnEntity {
            $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $this->columnDomainService->validatePayload($payload);

            if ($this->repository->getColumnByKey($authorization->getOrganizationCode(), $tableId, trim((string) $payload['column_key'])) !== null) {
                $this->invalid('字段标识已存在');
            }

            $column = $this->repository->saveColumn([
                'organization_code' => $authorization->getOrganizationCode(),
                'table_id' => $tableId,
                'column_key' => trim((string) $payload['column_key']),
                'column_name' => trim((string) $payload['column_name']),
                'data_type' => trim((string) $payload['data_type']),
                'is_required' => (bool) ($payload['is_required'] ?? false),
                'default_value' => $payload['default_value'] ?? null,
                'options' => isset($payload['options']) && is_array($payload['options']) ? $payload['options'] : null,
                'status' => MagicBaseConst::STATUS_ENABLED,
                'dynamic_permission' => $this->columnDomainService->normalizeDynamicPermission(
                    is_array($payload['dynamic_permission'] ?? null) ? $payload['dynamic_permission'] : null
                )->toArray(),
                'created_at' => $this->now(),
                'updated_at' => $this->now(),
            ]);

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_CREATE,
                MagicBaseConst::TARGET_COLUMN,
                (int) $column->getId(),
                null,
                $column,
            ));

            return $column;
        });
    }

    public function updateColumn(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $columnId, CreateColumnRequestDTO $requestDTO): MagicBaseColumnEntity
    {
        $payload = $requestDTO->toArray();
        return Db::transaction(function () use ($authorization, $projectId, $tableId, $columnId, $payload): MagicBaseColumnEntity {
            $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $column = $this->findColumn($authorization, $tableId, $columnId);
            $before = $column;

            $merged = array_merge($column->toArray(), $payload);
            $this->columnDomainService->validatePayload($merged);

            if (isset($payload['column_key'])) {
                $exists = $this->repository->getColumnByKey($authorization->getOrganizationCode(), $tableId, trim((string) $payload['column_key']));
                if ($exists !== null && (int) $exists->getId() !== $columnId) {
                    $this->invalid('字段标识已存在');
                }
            }

            $column->setColumnKey(trim((string) $merged['column_key']));
            $column->setColumnName(trim((string) $merged['column_name']));
            $column->setDataType(trim((string) $merged['data_type']));
            $column->setIsRequired((bool) ($merged['is_required'] ?? false));
            $column->setDefaultValue($merged['default_value'] ?? null);
            $column->setOptions(isset($merged['options']) && is_array($merged['options']) ? $merged['options'] : null);
            $column->setDynamicPermission($this->columnDomainService->normalizeDynamicPermission(
                is_array($merged['dynamic_permission'] ?? null) ? $merged['dynamic_permission'] : null
            ));
            $column->setUpdatedAt($this->now());
            $column = $this->repository->saveColumn($column);

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_UPDATE,
                MagicBaseConst::TARGET_COLUMN,
                $columnId,
                $before,
                $column,
            ));

            return $column;
        });
    }

    public function deleteColumn(MagicUserAuthorization $authorization, int $projectId, int $tableId, int $columnId): void
    {
        Db::transaction(function () use ($authorization, $projectId, $tableId, $columnId): void {
            $this->accessControlDomainService->requireWritableTable($authorization, $projectId, $tableId);
            $column = $this->findColumn($authorization, $tableId, $columnId);
            $this->repository->deleteColumn($columnId);

            $this->repository->createMigrationLog($this->migrationLogDomainService->buildPayload(
                $authorization,
                $projectId,
                $tableId,
                MagicBaseConst::CHANGE_DELETE,
                MagicBaseConst::TARGET_COLUMN,
                $columnId,
                $column,
                null,
            ));
        });
    }

    private function findColumn(MagicUserAuthorization $authorization, int $tableId, int $columnId): MagicBaseColumnEntity
    {
        $column = $this->repository->getColumn($authorization->getOrganizationCode(), $tableId, $columnId);
        if ($column === null) {
            $this->notFound('字段');
        }
        return $column;
    }

    private function now(): DateTime
    {
        return new DateTime();
    }

    private function requireString(mixed $value, string $label): void
    {
        if (! is_string($value) || trim($value) === '') {
            MagicBaseExceptionBuilder::parameterMissing($label);
        }
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::validateFailed($label);
    }

    private function notFound(string $label): void
    {
        MagicBaseExceptionBuilder::resourceNotFound($label);
    }
}
