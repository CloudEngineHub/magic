<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseRowQuery
{
    /**
     * @param array<string, array<string, mixed>> $filters query filter keyed by root field or dynamic column_key
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sorts
     * @param list<string> $actorDepartmentIds
     * @param list<int> $staticReadableRecordIds
     * @param array<string, string> $fieldTypes data type keyed by dynamic column_key
     */
    public function __construct(
        private string $organizationCode,
        private int $projectId,
        private int $tableId,
        private array $filters,
        private array $sorts,
        private int $page,
        private int $pageSize,
        private bool $includeDeleted,
        private bool $manager,
        private string $rowReadScope,
        private string $actorUserId,
        private string $actorOrganizationCode,
        private array $actorDepartmentIds,
        private array $staticReadableRecordIds,
        private array $fieldTypes,
    ) {
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function getTableId(): int
    {
        return $this->tableId;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    public function getFilters(): array
    {
        return $this->filters;
    }

    /**
     * @return list<array{field?: string, order?: 'asc'|'desc'|string}>
     */
    public function getSorts(): array
    {
        return $this->sorts;
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }

    public function includeDeleted(): bool
    {
        return $this->includeDeleted;
    }

    public function isManager(): bool
    {
        return $this->manager;
    }

    public function getRowReadScope(): string
    {
        return $this->rowReadScope;
    }

    public function getActorUserId(): string
    {
        return $this->actorUserId;
    }

    public function getActorOrganizationCode(): string
    {
        return $this->actorOrganizationCode;
    }

    /**
     * @return list<string>
     */
    public function getActorDepartmentIds(): array
    {
        return $this->actorDepartmentIds;
    }

    /**
     * @return list<int>
     */
    public function getStaticReadableRecordIds(): array
    {
        return $this->staticReadableRecordIds;
    }

    /**
     * @return array<string, string>
     */
    public function getFieldTypes(): array
    {
        return $this->fieldTypes;
    }
}
