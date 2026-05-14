<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Domain\Contact\Service\MagicDepartmentUserDomainService;
use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;
use App\Domain\MagicBase\Entity\MagicBaseRelationEntity;
use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\MagicBaseTableEntity;
use App\Domain\MagicBase\Entity\ValueObject\ActorContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseAccessContext;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnIndex;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFormattedRow;
use App\Domain\MagicBase\Entity\ValueObject\MagicBasePermissionIndex;
use App\Domain\MagicBase\Entity\ValueObject\SelectQuery;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Exception\MagicBaseUnsupportedQueryException;
use App\Domain\MagicBase\Repository\Persistence\MagicBaseTableRepository;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use DateTimeInterface;
use LogicException;

readonly class MagicBaseQueryDomainService
{
    public function __construct(
        private MagicBaseTableRepository $repository,
        private MagicDepartmentUserDomainService $departmentUserDomainService,
        private MagicBasePermissionDomainService $permissionDomainService,
        private MagicBaseRowStorageResolverDomainService $rowStorageResolver,
        private MagicBaseRowQueryCriteriaDomainService $rowQueryCriteriaDomainService,
    ) {
    }

    public function loadAccessContext(MagicUserAuthorization $authorization, int $projectId, int $tableId, ActorContext $actor): MagicBaseAccessContext
    {
        $projectAdmins = $this->repository->listProjectAdmins($authorization->getOrganizationCode(), $projectId);
        $tableAdmins = $this->repository->listTableAdmins($authorization->getOrganizationCode(), $tableId);
        $tablePermissions = $this->repository->listTablePermissions($authorization->getOrganizationCode(), $tableId);
        $columnPermissions = $this->repository->listColumnPermissions($authorization->getOrganizationCode(), $tableId);
        $rowPermissions = $this->repository->listRowPermissions($authorization->getOrganizationCode(), $tableId);

        return new MagicBaseAccessContext(
            $this->getColumnsByKey($authorization, $tableId),
            $tablePermissions,
            $projectAdmins,
            $tableAdmins,
            MagicBasePermissionIndex::fromCollection($columnPermissions, 'column_id'),
            MagicBasePermissionIndex::fromCollection($rowPermissions, 'record_id'),
            $this->permissionDomainService->isManager($actor, $projectAdmins, $tableAdmins, $tablePermissions),
        );
    }

    public function enrichTableScope(MagicBaseTableEntity $table): MagicBaseTableEntity
    {
        if ($table->getCreatedBy() === '') {
            $table->setOwnerDepartmentIds([]);
            return $table;
        }

        $dataIsolation = DataIsolation::simpleMake($table->getOrganizationCode(), $table->getCreatedBy());
        $departmentIds = $this->departmentUserDomainService->getDepartmentIdsByUserId(
            $dataIsolation,
            $table->getCreatedBy(),
            true
        );
        $table->setOwnerDepartmentIds($departmentIds);
        return $table;
    }

    public function getColumnsByKey(MagicUserAuthorization $authorization, int $tableId): MagicBaseColumnIndex
    {
        $columns = [];
        foreach ($this->repository->listColumns($authorization->getOrganizationCode(), $tableId) as $column) {
            if (! $column instanceof MagicBaseColumnEntity) {
                continue;
            }
            $columns[$column->getColumnKey()] = $column;
        }
        return new MagicBaseColumnIndex($columns);
    }

    public function formatRow(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseTableEntity $table,
        MagicBaseRowEntity $row,
        MagicBaseAccessContext $access,
        SelectQuery $select,
        ActorContext $actor,
    ): MagicBaseFormattedRow {
        $fields = $select->getFields();
        if ($fields === []) {
            $fields = array_merge(['id'], $access->getColumns()->keys());
        }

        $result = [];
        foreach ($fields as $field) {
            if (! is_string($field)) {
                continue;
            }
            if (in_array($field, ['id', 'created_at', 'updated_at', 'created_by'], true)) {
                $result[$field] = $this->formatRootField($row, $field);
                continue;
            }
            $column = $access->getColumns()->get($field);
            if ($column === null) {
                continue;
            }

            if (! $this->permissionDomainService->canReadColumn(
                $actor,
                $row,
                $column,
                $access->getColumnPermissions((int) $column->getId()),
                $access->isManager()
            )) {
                continue;
            }

            $result[$field] = $row->getData()[$field] ?? null;
        }

        foreach (array_keys($select->getRelations()) as $alias) {
            if (! is_string($alias)) {
                continue;
            }
            $relation = $this->findRelation(
                $authorization,
                $projectId,
                (int) $table->getId(),
                $alias,
                $select->getRelationSourceColumn($alias)
            );
            $related = $this->resolveRelationRows(
                $authorization,
                $projectId,
                $relation,
                $row,
                $actor,
                $select->getRelationFields($alias)
            );

            $result[$alias] = match ($relation->getRelationType()) {
                MagicBaseConst::RELATION_HAS_MANY => array_map(static fn (MagicBaseFormattedRow $row): array => $row->toArray(), $related),
                default => ($related[0] ?? null)?->toArray(),
            };
        }

        return new MagicBaseFormattedRow($result);
    }

    /**
     * @param list<MagicBaseRowEntity> $rows
     * @return list<MagicBaseFormattedRow>
     */
    public function formatRows(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseTableEntity $table,
        array $rows,
        MagicBaseAccessContext $access,
        SelectQuery $select,
        ActorContext $actor,
    ): array {
        $baseSelect = $select->withoutRelations();
        $formattedRows = [];
        foreach ($rows as $row) {
            $formattedRows[(int) $row->getRecordId()] = $this->formatRow($authorization, $projectId, $table, $row, $access, $baseSelect, $actor)->toArray();
        }

        foreach (array_keys($select->getRelations()) as $alias) {
            if (! is_string($alias)) {
                continue;
            }
            $relation = $this->findRelation($authorization, $projectId, (int) $table->getId(), $alias, $select->getRelationSourceColumn($alias));
            $relatedRowsByRecord = $this->resolveRelationRowsForPage(
                $authorization,
                $projectId,
                $relation,
                $rows,
                $actor,
                $select->getRelationFields($alias)
            );
            foreach ($rows as $row) {
                $recordId = (int) $row->getRecordId();
                $relatedRows = $relatedRowsByRecord[$recordId] ?? [];
                $formattedRows[$recordId][$alias] = match ($relation->getRelationType()) {
                    MagicBaseConst::RELATION_HAS_MANY => array_map(static fn (MagicBaseFormattedRow $relatedRow): array => $relatedRow->toArray(), $relatedRows),
                    default => ($relatedRows[0] ?? null)?->toArray(),
                };
            }
        }

        return array_map(static fn (array $payload): MagicBaseFormattedRow => new MagicBaseFormattedRow($payload), array_values($formattedRows));
    }

    /**
     * @param array<string, array<string, mixed>> $filters
     * @return array<string, array<string, mixed>>
     */
    public function resolveFiltersForOpenSearch(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseTableEntity $table,
        MagicBaseAccessContext $access,
        ActorContext $actor,
        array $filters,
    ): array {
        $resolved = [];
        foreach ($filters as $field => $condition) {
            if (! is_string($field) || ! is_array($condition)) {
                continue;
            }
            if (! str_contains($field, '.')) {
                $resolved[$field] = $condition;
                continue;
            }

            [$relationName, $relationField] = explode('.', $field, 2);
            $relation = $this->findRelation($authorization, $projectId, (int) $table->getId(), $relationName);
            $sourceValues = $this->resolveRelationFilterValues($authorization, $projectId, $relation, $relationField, $condition, $actor);
            $resolved[$relation->getSourceColumnKey()] = [
                'in' => $sourceValues,
            ];
        }

        return $resolved;
    }

    /**
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sorts
     */
    public function assertSortableByOpenSearch(array $sorts): void
    {
        foreach ($sorts as $sort) {
            $field = (string) ($sort['field'] ?? '');
            if ($field === '' || ! str_contains($field, '.')) {
                continue;
            }
            $suggestion = 'denormalize relation field into source table, for example customer_name, then sort by customer_name';
            $message = sprintf(
                '暂不支持关联字段排序: %s。原因: 当前 OpenSearch 查询只在主表索引执行，无法直接按关联表字段排序。建议: 在主表冗余 customer_name 字段，并改用 customer_name 排序。',
                $field
            );
            throw new MagicBaseUnsupportedQueryException($message, [
                'field' => $field,
                'reason' => 'relation_sort_not_supported',
                'suggestion' => $suggestion,
            ]);
        }
    }

    public function applyFilters(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseTableEntity $table,
        MagicBaseEntityCollection $rows,
        mixed $filters,
        ActorContext $actor,
        MagicBaseAccessContext $access,
    ): MagicBaseEntityCollection {
        if (! is_array($filters) || $filters === []) {
            return $rows;
        }

        /** @var MagicBaseRowEntity[] $items */
        $items = $rows->all();
        return new MagicBaseEntityCollection(array_values(array_filter($items, function (MagicBaseRowEntity $row) use ($authorization, $projectId, $table, $filters, $actor): bool {
            foreach ($filters as $field => $condition) {
                if (! is_array($condition) || ! array_key_exists('eq', $condition)) {
                    continue;
                }

                $expected = $condition['eq'];
                if (is_string($field) && str_contains($field, '.')) {
                    [$relationName, $relationField] = explode('.', $field, 2);
                    $relation = $this->findRelation($authorization, $projectId, (int) $table->getId(), $relationName);
                    $relatedRows = $this->resolveRelationRows($authorization, $projectId, $relation, $row, $actor, []);
                    $matched = false;
                    foreach ($relatedRows as $relatedRow) {
                        $relatedPayload = $relatedRow->toArray();
                        if (($relatedPayload[$relationField] ?? null) == $expected) {
                            $matched = true;
                            break;
                        }
                    }
                    if (! $matched) {
                        return false;
                    }
                    continue;
                }

                if (! is_string($field) || $this->readFieldValue($row, $field) != $expected) {
                    return false;
                }
            }
            return true;
        })));
    }

    /**
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sorts
     */
    public function applySort(MagicBaseEntityCollection $rows, array $sorts): MagicBaseEntityCollection
    {
        if ($sorts === []) {
            return $rows;
        }

        /** @var MagicBaseRowEntity[] $items */
        $items = $rows->all();
        usort($items, function (MagicBaseRowEntity $left, MagicBaseRowEntity $right) use ($sorts): int {
            foreach ($sorts as $sort) {
                $field = (string) ($sort['field'] ?? '');
                if ($field === '') {
                    continue;
                }
                $order = strtolower((string) ($sort['order'] ?? 'asc')) === 'desc' ? -1 : 1;
                $leftValue = $this->readFieldValue($left, $field);
                $rightValue = $this->readFieldValue($right, $field);
                if ($leftValue == $rightValue) {
                    continue;
                }
                $comparison = $leftValue <=> $rightValue;
                return $comparison === 0 ? 0 : $comparison * $order;
            }
            return 0;
        });

        return new MagicBaseEntityCollection($items);
    }

    public function readFieldValue(MagicBaseRowEntity $row, string $field): mixed
    {
        return match ($field) {
            'id' => (string) $row->getRecordId(),
            'created_at' => $this->formatDatetime($row->getCreatedAt()),
            'updated_at' => $this->formatDatetime($row->getUpdatedAt()),
            'created_by' => $row->getCreatedBy(),
            default => $row->getData()[$field] ?? null,
        };
    }

    public function getRowOrFail(MagicUserAuthorization $authorization, int $tableId, int $recordId): MagicBaseRowEntity
    {
        $row = $this->rowStorageResolver->getRow($authorization->getOrganizationCode(), $tableId, $recordId);
        if ($row === null || $row->getDeleted()) {
            $this->invalid('记录');
        }
        return $row;
    }

    public function getReadableRowOrFail(
        MagicUserAuthorization $authorization,
        MagicBaseTableEntity $table,
        int $recordId,
        ActorContext $actor,
        MagicBaseAccessContext $access,
        string $message,
    ): MagicBaseRowEntity {
        $row = $this->getRowOrFail($authorization, (int) $table->getId(), $recordId);
        if (! $this->permissionDomainService->canReadRow(
            $actor,
            $row,
            $table,
            $access->getRowPermissions((int) $row->getRecordId()),
            $access->isManager()
        )) {
            $this->forbidden($message);
        }
        return $row;
    }

    private function resolveRelationRows(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseRelationEntity $relation,
        MagicBaseRowEntity $row,
        ActorContext $actor,
        array $selectedFields,
    ): array {
        $sourceValue = $this->readFieldValue($row, $relation->getSourceColumnKey());
        if ($sourceValue === null || $sourceValue === '') {
            return [];
        }

        $targetTableId = (int) $relation->getTargetTableId();
        $targetTable = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $targetTableId);
        if ($targetTable === null) {
            return [];
        }
        $targetTable = $this->enrichTableScope($targetTable);
        $targetAccess = $this->loadAccessContext($authorization, $projectId, $targetTableId, $actor);
        if (! $this->permissionDomainService->canReadTable($actor, $targetTable, $targetAccess->getTablePermissions(), $targetAccess->isManager())) {
            return [];
        }

        $matched = [];
        /** @var MagicBaseRowEntity $targetRow */
        foreach ($this->rowStorageResolver->listRows($authorization->getOrganizationCode(), $targetTableId) as $targetRow) {
            if (! $this->permissionDomainService->canReadRow(
                $actor,
                $targetRow,
                $targetTable,
                $targetAccess->getRowPermissions((int) $targetRow->getRecordId()),
                $targetAccess->isManager()
            )) {
                continue;
            }
            if ($this->readFieldValue($targetRow, $relation->getTargetColumnKey()) != $sourceValue) {
                continue;
            }
            $matched[] = $this->formatRow(
                $authorization,
                $projectId,
                $targetTable,
                $targetRow,
                $targetAccess,
                new SelectQuery(['fields' => $selectedFields, 'relations' => []]),
                $actor,
            );
        }

        return $matched;
    }

    /**
     * @param list<MagicBaseRowEntity> $rows
     * @param list<string> $selectedFields
     * @return array<int, list<MagicBaseFormattedRow>>
     */
    private function resolveRelationRowsForPage(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseRelationEntity $relation,
        array $rows,
        ActorContext $actor,
        array $selectedFields,
    ): array {
        $sourceValuesByRecord = [];
        $sourceValues = [];
        foreach ($rows as $row) {
            $sourceValue = $this->readFieldValue($row, $relation->getSourceColumnKey());
            if ($sourceValue === null || $sourceValue === '') {
                continue;
            }
            $sourceValuesByRecord[(int) $row->getRecordId()] = $sourceValue;
            $sourceValues[] = $sourceValue;
        }
        $sourceValues = array_values(array_unique($sourceValues, SORT_REGULAR));
        if ($sourceValues === []) {
            return [];
        }

        $targetTableId = (int) $relation->getTargetTableId();
        $targetTable = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $targetTableId);
        if ($targetTable === null) {
            return [];
        }
        $targetTable = $this->enrichTableScope($targetTable);
        $targetAccess = $this->loadAccessContext($authorization, $projectId, $targetTableId, $actor);
        if (! $this->permissionDomainService->canReadTable($actor, $targetTable, $targetAccess->getTablePermissions(), $targetAccess->isManager())) {
            return [];
        }

        $query = $this->rowQueryCriteriaDomainService->buildReadableQuery(
            $authorization->getOrganizationCode(),
            $targetTable,
            $targetAccess,
            $actor,
            [$relation->getTargetColumnKey() => ['in' => $sourceValues]],
            [],
            1,
            max(1, (int) config('magicbase.opensearch.search_size', 10000)),
        );
        $targetRows = $this->rowStorageResolver->queryRows($query)->getRows()->all();
        $targetRowsByValue = [];
        foreach ($targetRows as $targetRow) {
            if (! $targetRow instanceof MagicBaseRowEntity) {
                continue;
            }
            $targetValue = $this->readFieldValue($targetRow, $relation->getTargetColumnKey());
            if ($targetValue === null || $targetValue === '') {
                continue;
            }
            $targetRowsByValue[$this->normalizeRelationValueKey($targetValue)][] = $this->formatRow(
                $authorization,
                $projectId,
                $targetTable,
                $targetRow,
                $targetAccess,
                new SelectQuery(['fields' => $selectedFields, 'relations' => []]),
                $actor,
            );
        }

        $matched = [];
        foreach ($sourceValuesByRecord as $recordId => $sourceValue) {
            $matched[$recordId] = $targetRowsByValue[$this->normalizeRelationValueKey($sourceValue)] ?? [];
        }

        return $matched;
    }

    /**
     * @param array<string, mixed> $condition
     * @return list<mixed>
     */
    private function resolveRelationFilterValues(
        MagicUserAuthorization $authorization,
        int $projectId,
        MagicBaseRelationEntity $relation,
        string $relationField,
        array $condition,
        ActorContext $actor,
    ): array {
        if (! array_key_exists('eq', $condition)) {
            return [];
        }

        $targetTableId = (int) $relation->getTargetTableId();
        $targetTable = $this->repository->getTable($authorization->getOrganizationCode(), $projectId, $targetTableId);
        if ($targetTable === null) {
            return [];
        }
        $targetTable = $this->enrichTableScope($targetTable);
        $targetAccess = $this->loadAccessContext($authorization, $projectId, $targetTableId, $actor);
        if (! $this->permissionDomainService->canReadTable($actor, $targetTable, $targetAccess->getTablePermissions(), $targetAccess->isManager())) {
            return [];
        }

        $query = $this->rowQueryCriteriaDomainService->buildReadableQuery(
            $authorization->getOrganizationCode(),
            $targetTable,
            $targetAccess,
            $actor,
            [$relationField => ['eq' => $condition['eq']]],
            [],
            1,
            max(1, (int) config('magicbase.opensearch.search_size', 10000)),
        );

        $values = [];
        foreach ($this->rowStorageResolver->queryRows($query)->getRows() as $targetRow) {
            if (! $targetRow instanceof MagicBaseRowEntity) {
                continue;
            }
            $targetValue = $this->readFieldValue($targetRow, $relation->getTargetColumnKey());
            if ($targetValue === null || $targetValue === '') {
                continue;
            }
            $values[] = $targetValue;
        }

        return array_values(array_unique($values, SORT_REGULAR));
    }

    private function normalizeRelationValueKey(mixed $value): string
    {
        return is_scalar($value) || $value === null ? (string) $value : md5(json_encode($value) ?: '');
    }

    private function findRelation(
        MagicUserAuthorization $authorization,
        int $projectId,
        int $sourceTableId,
        string $relationName,
        ?string $sourceColumn = null,
    ): MagicBaseRelationEntity {
        foreach ($this->repository->listRelations($authorization->getOrganizationCode(), $projectId) as $relation) {
            if (! $relation instanceof MagicBaseRelationEntity || (int) $relation->getSourceTableId() !== $sourceTableId) {
                continue;
            }
            $nameMatched = $relation->getRelationName() === $relationName;
            $columnMatched = $sourceColumn === null || $sourceColumn === '' || $relation->getSourceColumnKey() === $sourceColumn;
            if ($nameMatched && $columnMatched) {
                return $relation;
            }
        }

        $this->invalid('关系');
        throw new LogicException('Unreachable');
    }

    private function formatRootField(MagicBaseRowEntity $row, string $field): mixed
    {
        return match ($field) {
            'id' => (string) $row->getRecordId(),
            'created_at' => $this->formatDatetime($row->getCreatedAt()),
            'updated_at' => $this->formatDatetime($row->getUpdatedAt()),
            'created_by' => $row->getCreatedBy(),
            default => null,
        };
    }

    private function formatDatetime(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }
        return is_string($value) ? $value : null;
    }

    private function invalid(string $label): void
    {
        MagicBaseExceptionBuilder::resourceNotFound($label);
    }

    private function forbidden(string $message): void
    {
        MagicBaseExceptionBuilder::accessDenied($message);
    }
}
