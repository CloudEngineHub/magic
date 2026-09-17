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
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseAccessContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Exception\MagicBaseInvalidFilterException;

readonly class MagicBaseRowQueryCriteriaDomainService
{
    public function __construct(
        private MagicBaseRowFilterDomainService $rowFilterDomainService,
    ) {
    }

    /**
     * @param array<string, mixed> $filters public query DSL or legacy field-keyed filter
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sorts
     * @param list<int> $staticReadableRecordIds record ids readable through static row permissions
     * @param list<string> $unboundedInFields relation fields resolved by the trusted application layer
     */
    public function buildReadableQuery(
        string $dataOrganizationCode,
        MagicBaseTableEntity $table,
        MagicBaseAccessContext $access,
        ActorContext $actor,
        array $filters,
        array $sorts,
        int $page,
        int $pageSize,
        bool $includeDeleted = false,
        array $staticReadableRecordIds = [],
        bool $includeTotal = true,
        array $unboundedInFields = [],
    ): MagicBaseRowQuery {
        $fieldTypes = $this->getFieldTypes($access, $actor);
        if ($actor->getUserId() === '') {
            // Filtering and sorting are observable even when response fields are hidden.
            foreach ($sorts as $sort) {
                $field = (string) ($sort['field'] ?? '');
                if (! isset($fieldTypes[$field]) && ! in_array($field, ['id', 'record_id', 'organization_code', 'created_at', 'updated_at', 'created_by'], true)) {
                    throw new MagicBaseInvalidFilterException('排序字段不存在或当前用户无读取权限');
                }
            }
        }
        return new MagicBaseRowQuery(
            $dataOrganizationCode,
            (int) $table->getProjectId(),
            (int) $table->getId(),
            $this->rowFilterDomainService->parse($filters, $fieldTypes, $unboundedInFields),
            $sorts,
            max(1, $page),
            max(1, $pageSize),
            $includeDeleted,
            $access->isManager(),
            $this->getRowReadScope($table),
            $actor->getUserId(),
            $actor->getOrganizationCode(),
            $actor->getDepartmentIds(),
            $staticReadableRecordIds,
            $fieldTypes,
            $includeTotal,
        );
    }

    private function getRowReadScope(MagicBaseTableEntity $table): string
    {
        return $table->getDynamicPermissions()->getRow()->getReadScope();
    }

    /**
     * @return array<string, string>
     */
    private function getFieldTypes(MagicBaseAccessContext $access, ActorContext $actor): array
    {
        $fieldTypes = [];
        $permissions = new MagicBasePermissionDomainService();
        foreach ($access->getColumns()->all() as $columnKey => $column) {
            if (
                ! $column instanceof MagicBaseColumnEntity
                || ! is_string($columnKey)
                || $column->getStatus() === MagicBaseConst::STATUS_DISABLED
            ) {
                continue;
            }
            // Anonymous actors cannot satisfy owner/department/organization scopes.
            // Reuse column permissions before the shared filter parser sees any field.
            if ($actor->getUserId() === '' && ! $permissions->canReadColumn(
                $actor,
                new MagicBaseRowEntity(),
                $column,
                $access->getColumnPermissions((int) $column->getId()),
                $access->isManager(),
            )) {
                continue;
            }
            $fieldTypes[$columnKey] = $column->getDataType();
        }

        return $fieldTypes;
    }
}
