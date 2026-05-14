<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowPermissionEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseAccessContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;

readonly class MagicBaseRowQueryCriteriaDomainService
{
    public function __construct(
        private MagicBasePermissionDomainService $permissionDomainService,
    ) {
    }

    /**
     * @param array<string, array<string, mixed>> $filters query filter keyed by root field or dynamic column_key
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sorts
     */
    public function buildReadableQuery(
        string $organizationCode,
        MagicBaseTableEntity $table,
        MagicBaseAccessContext $access,
        ActorContext $actor,
        array $filters,
        array $sorts,
        int $page,
        int $pageSize,
        bool $includeDeleted = false,
    ): MagicBaseRowQuery {
        return new MagicBaseRowQuery(
            $organizationCode,
            (int) $table->getId(),
            $filters,
            $sorts,
            max(1, $page),
            max(1, $pageSize),
            $includeDeleted,
            $access->isManager(),
            $this->getRowReadScope($table),
            $actor->getUserId(),
            $actor->getOrganizationCode(),
            $actor->getDepartmentIds(),
            $this->getStaticReadableRecordIds($access, $actor),
            $this->getFieldTypes($access),
        );
    }

    private function getRowReadScope(MagicBaseTableEntity $table): string
    {
        return $table->getDynamicPermissions()->getRow()->getReadScope();
    }

    /**
     * @return list<int>
     */
    private function getStaticReadableRecordIds(MagicBaseAccessContext $access, ActorContext $actor): array
    {
        $recordIds = [];
        foreach ($access->getRowPermissionsByRecord() as $recordId => $permissions) {
            foreach ($permissions as $permission) {
                if (! $permission instanceof MagicBaseRowPermissionEntity) {
                    continue;
                }
                if (! $permission->getCanRead() || ! $this->permissionDomainService->matchSubject($permission, $actor)) {
                    continue;
                }
                $recordIds[] = (int) $recordId;
                break;
            }
        }

        return array_values(array_unique(array_filter($recordIds, static fn (int $recordId): bool => $recordId > 0)));
    }

    /**
     * @return array<string, string>
     */
    private function getFieldTypes(MagicBaseAccessContext $access): array
    {
        $fieldTypes = [];
        foreach ($access->getColumns()->all() as $columnKey => $column) {
            if (! $column instanceof MagicBaseColumnEntity || ! is_string($columnKey)) {
                continue;
            }
            $fieldTypes[$columnKey] = $column->getDataType();
        }

        return $fieldTypes;
    }
}
