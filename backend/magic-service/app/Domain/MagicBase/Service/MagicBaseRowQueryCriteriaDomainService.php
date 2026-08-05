<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseAccessContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;

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
        $fieldTypes = $this->getFieldTypes($access);
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
    private function getFieldTypes(MagicBaseAccessContext $access): array
    {
        $fieldTypes = [];
        foreach ($access->getColumns()->all() as $columnKey => $column) {
            if (
                ! $column instanceof MagicBaseColumnEntity
                || ! is_string($columnKey)
                || $column->getStatus() === MagicBaseConst::STATUS_DISABLED
            ) {
                continue;
            }
            $fieldTypes[$columnKey] = $column->getDataType();
        }

        return $fieldTypes;
    }
}
