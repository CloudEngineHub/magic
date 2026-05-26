<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQueryResult;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowQueryRepositoryInterface;
use LogicException;
use MongoDB\Model\BSONArray;
use MongoDB\Model\BSONDocument;
use Throwable;

readonly class MagicBaseMongoRowQueryRepository implements MagicBaseRowQueryRepositoryInterface
{
    public function __construct(
        private MagicBaseMongoClient $client,
        private MagicBaseMongoCollectionRouter $router,
    ) {
    }

    public function getRow(string $organizationCode, int $projectId, int $tableId, int $recordId): ?MagicBaseRowEntity
    {
        $route = $this->router->route($organizationCode, $projectId);
        try {
            $document = $this->client->collection($route->getMongoCollection())->findOne([
                'organization_code' => $organizationCode,
                'project_id' => $projectId,
                'table_id' => $tableId,
                'record_id' => $recordId,
            ], [
                'maxTimeMS' => $this->client->queryTimeoutMs(),
            ]);
        } catch (Throwable) {
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage read failed.');
            throw new LogicException('Unreachable');
        }

        return $document === null ? null : new MagicBaseRowEntity($this->fromDocument($document));
    }

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult
    {
        $route = $this->router->route($query->getOrganizationCode(), $query->getProjectId());
        $filter = $this->buildFilter($query);
        $options = [
            'sort' => $this->buildSort($query),
            'skip' => ($query->getPage() - 1) * $query->getPageSize(),
            'limit' => $query->getPageSize(),
            'maxTimeMS' => $this->client->queryTimeoutMs(),
        ];

        try {
            $collection = $this->client->collection($route->getMongoCollection());
            $total = $collection->countDocuments($filter, ['maxTimeMS' => $this->client->queryTimeoutMs()]);
            $cursor = $collection->find($filter, $options);
        } catch (Throwable) {
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage query failed.');
            throw new LogicException('Unreachable');
        }

        $entities = [];
        foreach ($cursor as $document) {
            $entities[] = new MagicBaseRowEntity($this->fromDocument($document));
        }

        return new MagicBaseRowQueryResult(new MagicBaseEntityCollection($entities), (int) $total);
    }

    public function listRows(string $organizationCode, int $projectId, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection
    {
        $route = $this->router->route($organizationCode, $projectId);
        $filter = [
            'organization_code' => $organizationCode,
            'project_id' => $projectId,
            'table_id' => $tableId,
        ];
        if (! $includeDeleted) {
            $filter['deleted'] = false;
        }

        try {
            $cursor = $this->client->collection($route->getMongoCollection())->find($filter, [
                'sort' => ['record_id' => 1],
                'limit' => max(1, (int) config('magicbase.row_storage.search_size', 10000)),
                'maxTimeMS' => $this->client->queryTimeoutMs(),
            ]);
        } catch (Throwable) {
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB row storage list failed.');
            throw new LogicException('Unreachable');
        }

        $entities = [];
        foreach ($cursor as $document) {
            $entities[] = new MagicBaseRowEntity($this->fromDocument($document));
        }

        return new MagicBaseEntityCollection($entities);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildFilter(MagicBaseRowQuery $query): array
    {
        $filter = [
            'organization_code' => $query->getOrganizationCode(),
            'project_id' => $query->getProjectId(),
            'table_id' => $query->getTableId(),
        ];
        if (! $query->includeDeleted()) {
            $filter['deleted'] = false;
        }

        $permissionFilter = $this->buildPermissionFilter($query);
        if ($permissionFilter !== null) {
            $filter = ['$and' => [$filter, $permissionFilter]];
        }

        foreach ($query->getFilters() as $field => $condition) {
            $fieldFilter = $this->buildFieldFilter((string) $field, $condition);
            if ($fieldFilter === null) {
                continue;
            }
            $filter = ['$and' => [$filter, $fieldFilter]];
        }

        return $filter;
    }

    /**
     * @return null|array<string, mixed>
     */
    private function buildPermissionFilter(MagicBaseRowQuery $query): ?array
    {
        if ($query->isManager()) {
            return null;
        }

        $or = [];
        $dynamicScope = $this->buildDynamicScopeFilter($query);
        if ($dynamicScope === []) {
            return null;
        }
        if ($dynamicScope !== null) {
            $or[] = $dynamicScope;
        }
        if ($query->getStaticReadableRecordIds() !== []) {
            $or[] = ['record_id' => ['$in' => $query->getStaticReadableRecordIds()]];
        }

        return $or === [] ? ['record_id' => ['$in' => []]] : ['$or' => $or];
    }

    /**
     * @return null|array<string, mixed>
     */
    private function buildDynamicScopeFilter(MagicBaseRowQuery $query): ?array
    {
        return match ($query->getRowReadScope()) {
            MagicBaseConst::SCOPE_PUBLIC => [],
            MagicBaseConst::SCOPE_PRIVATE_USER => $query->getActorUserId() === ''
                ? ['record_id' => ['$in' => []]]
                : ['created_by' => $query->getActorUserId()],
            MagicBaseConst::SCOPE_PRIVATE_DEPARTMENT => $query->getActorDepartmentIds() === []
                ? ['record_id' => ['$in' => []]]
                : ['owner_department_ids' => ['$in' => $query->getActorDepartmentIds()]],
            MagicBaseConst::SCOPE_PRIVATE_ORG => $query->getActorOrganizationCode() === ''
                ? ['record_id' => ['$in' => []]]
                : ['organization_code' => $query->getActorOrganizationCode()],
            default => null,
        };
    }

    /**
     * @param array<string, mixed> $condition
     * @return null|array<string, mixed>
     */
    private function buildFieldFilter(string $field, array $condition): ?array
    {
        $path = $this->fieldPath($field);
        if (array_key_exists('in', $condition)) {
            $values = is_array($condition['in']) ? array_values($condition['in']) : [];
            return [$path => ['$in' => $values]];
        }
        if (array_key_exists('eq', $condition)) {
            return [$path => $condition['eq']];
        }

        return null;
    }

    /**
     * @return array<string, int>
     */
    private function buildSort(MagicBaseRowQuery $query): array
    {
        $sort = [];
        foreach ($query->getSorts() as $item) {
            $field = (string) ($item['field'] ?? '');
            if ($field === '') {
                continue;
            }
            $sort[$this->fieldPath($field)] = strtolower((string) ($item['order'] ?? 'asc')) === 'desc' ? -1 : 1;
        }

        $sort['record_id'] ??= 1;
        return $sort;
    }

    private function fieldPath(string $field): string
    {
        return match ($field) {
            'id', 'record_id' => 'record_id',
            'created_at' => 'created_at',
            'updated_at' => 'updated_at',
            'created_by' => 'created_by',
            default => 'data.' . $field,
        };
    }

    /**
     * @param array<string, mixed>|BSONDocument $document
     * @return array<string, mixed>
     */
    private function fromDocument(array|BSONDocument $document): array
    {
        $payload = $document instanceof BSONDocument ? $document->getArrayCopy() : $document;
        unset($payload['_id']);

        return $this->normalizeValue($payload);
    }

    private function normalizeValue(mixed $value): mixed
    {
        if ($value instanceof BSONDocument || $value instanceof BSONArray) {
            $value = $value->getArrayCopy();
        }
        if (! is_array($value)) {
            return $value;
        }

        $normalized = [];
        foreach ($value as $key => $item) {
            $normalized[$key] = $this->normalizeValue($item);
        }

        return $normalized;
    }
}
