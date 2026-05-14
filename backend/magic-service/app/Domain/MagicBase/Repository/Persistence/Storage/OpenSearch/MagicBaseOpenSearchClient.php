<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch;

use App\Domain\MagicBase\Entity\ValueObject\ColumnType;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use OpenSearch\Client;
use OpenSearch\ClientBuilder;
use Throwable;

class MagicBaseOpenSearchClient
{
    private ?Client $client = null;

    public function client(): Client
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $builder = (new ClientBuilder())->setHosts($this->hosts());

        $username = (string) config('magicbase.opensearch.username', '');
        $password = (string) config('magicbase.opensearch.password', '');
        if ($username !== '') {
            $builder->setBasicAuthentication($username, $password);
        }

        $sslVerification = (bool) config('magicbase.opensearch.ssl_verification', false);
        $builder->setSSLVerification($sslVerification);
        $builder->setConnectionParams([
            'client' => [
                'curl' => [
                    CURLOPT_PROXY => '',
                    CURLOPT_NOPROXY => '*',
                ],
            ],
        ]);

        return $this->client = $builder->build();
    }

    public function indexName(string $organizationCode, int $tableId): string
    {
        $prefix = (string) config('magicbase.opensearch.index_prefix', 'magicbase_rows');
        $organization = strtolower((string) preg_replace('/[^a-zA-Z0-9_-]+/', '_', $organizationCode));
        $organization = trim($organization, '_-') ?: 'default';

        return strtolower(sprintf('%s_%s_%d', trim($prefix, '_'), $organization, $tableId));
    }

    /**
     * @param array<string, mixed> $source
     */
    public function indexRow(string $index, string $id, array $source): void
    {
        $params = [
            'index' => $index,
            'id' => $id,
            'body' => $source,
        ];

        $refresh = (string) config('magicbase.opensearch.refresh', 'wait_for');
        if ($refresh !== '') {
            $params['refresh'] = $refresh;
        }

        $this->ensureIndex($index);
        $this->client()->index($params);
    }

    /**
     * @return null|array<string, mixed>
     */
    public function getRow(string $index, string $id): ?array
    {
        try {
            $payload = $this->client()->get([
                'index' => $index,
                'id' => $id,
            ]);
        } catch (Throwable $exception) {
            if ((int) $exception->getCode() === 404) {
                return null;
            }
            throw $exception;
        }

        $source = is_array($payload) ? ($payload['_source'] ?? null) : null;

        return is_array($source) ? $source : null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function searchRows(string $index, string $organizationCode, int $tableId, bool $includeDeleted): array
    {
        if (! $this->indexExists($index)) {
            return [];
        }

        $filters = [
            ['term' => ['organization_code' => $organizationCode]],
            ['term' => ['table_id' => $tableId]],
        ];
        if (! $includeDeleted) {
            $filters[] = ['term' => ['deleted' => false]];
        }

        $payload = $this->client()->search([
            'index' => $index,
            'body' => [
                'size' => max(1, (int) config('magicbase.opensearch.search_size', 10000)),
                'query' => [
                    'bool' => [
                        'filter' => $filters,
                    ],
                ],
                'sort' => [
                    ['record_id' => ['order' => 'asc']],
                ],
            ],
        ]);

        $hits = is_array($payload) ? ($payload['hits']['hits'] ?? []) : [];
        if (! is_array($hits)) {
            return [];
        }

        $rows = [];
        foreach ($hits as $hit) {
            if (! is_array($hit)) {
                continue;
            }
            $source = $hit['_source'] ?? null;
            if (is_array($source)) {
                $rows[] = $source;
            }
        }

        return $rows;
    }

    /**
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function queryRows(string $index, MagicBaseRowQuery $query): array
    {
        if (! $this->indexExists($index)) {
            return ['rows' => [], 'total' => 0];
        }

        $payload = $this->client()->search([
            'index' => $index,
            'body' => [
                'from' => ($query->getPage() - 1) * $query->getPageSize(),
                'size' => $query->getPageSize(),
                'track_total_hits' => true,
                'query' => $this->buildQuery($query),
                'sort' => $this->buildSort($query),
            ],
        ]);

        $hitsPayload = is_array($payload) ? ($payload['hits'] ?? []) : [];
        $hits = is_array($hitsPayload) ? ($hitsPayload['hits'] ?? []) : [];
        $totalPayload = is_array($hitsPayload) ? ($hitsPayload['total'] ?? 0) : 0;
        $total = is_array($totalPayload) ? (int) ($totalPayload['value'] ?? 0) : (int) $totalPayload;
        if (! is_array($hits)) {
            return ['rows' => [], 'total' => $total];
        }

        $rows = [];
        foreach ($hits as $hit) {
            if (! is_array($hit)) {
                continue;
            }
            $source = $hit['_source'] ?? null;
            if (is_array($source)) {
                $rows[] = $source;
            }
        }

        return ['rows' => $rows, 'total' => $total];
    }

    private function ensureIndex(string $index): void
    {
        if ($this->indexExists($index)) {
            return;
        }

        try {
            $this->client()->indices()->create([
                'index' => $index,
                'body' => [
                    'mappings' => [
                        'properties' => [
                            'record_id' => ['type' => 'long'],
                            'organization_code' => ['type' => 'keyword'],
                            'project_id' => ['type' => 'long'],
                            'table_id' => ['type' => 'long'],
                            'created_by' => ['type' => 'keyword'],
                            'owner_department_ids' => ['type' => 'keyword'],
                            'data' => ['type' => 'object', 'enabled' => true],
                            'deleted' => ['type' => 'boolean'],
                            'created_at' => ['type' => 'date', 'format' => 'yyyy-MM-dd HH:mm:ss||strict_date_optional_time||epoch_millis'],
                            'updated_at' => ['type' => 'date', 'format' => 'yyyy-MM-dd HH:mm:ss||strict_date_optional_time||epoch_millis'],
                        ],
                    ],
                ],
            ]);
        } catch (Throwable $exception) {
            if ((int) $exception->getCode() !== 400) {
                throw $exception;
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function buildQuery(MagicBaseRowQuery $query): array
    {
        $filters = [
            ['term' => ['organization_code' => $query->getOrganizationCode()]],
            ['term' => ['table_id' => $query->getTableId()]],
        ];
        if (! $query->includeDeleted()) {
            $filters[] = ['term' => ['deleted' => false]];
        }

        $permissionFilter = $this->buildPermissionFilter($query);
        if ($permissionFilter !== null) {
            $filters[] = $permissionFilter;
        }

        foreach ($query->getFilters() as $field => $condition) {
            $fieldFilter = $this->buildFieldFilter((string) $field, $condition, $query);
            if ($fieldFilter !== null) {
                $filters[] = $fieldFilter;
            }
        }

        return [
            'bool' => [
                'filter' => $filters,
            ],
        ];
    }

    /**
     * @return null|array<string, mixed>
     */
    private function buildPermissionFilter(MagicBaseRowQuery $query): ?array
    {
        if ($query->isManager()) {
            return null;
        }

        $should = [];
        $dynamicScope = $this->buildDynamicScopeFilter($query);
        if ($dynamicScope !== null) {
            $should[] = $dynamicScope;
        }
        if ($query->getStaticReadableRecordIds() !== []) {
            $should[] = ['terms' => ['record_id' => $query->getStaticReadableRecordIds()]];
        }

        if ($should === []) {
            return ['match_none' => (object) []];
        }

        return [
            'bool' => [
                'should' => $should,
                'minimum_should_match' => 1,
            ],
        ];
    }

    /**
     * @return null|array<string, mixed>
     */
    private function buildDynamicScopeFilter(MagicBaseRowQuery $query): ?array
    {
        return match ($query->getRowReadScope()) {
            MagicBaseConst::SCOPE_PUBLIC => ['match_all' => (object) []],
            MagicBaseConst::SCOPE_PRIVATE_USER => $query->getActorUserId() === ''
                ? ['match_none' => (object) []]
                : ['term' => ['created_by' => $query->getActorUserId()]],
            MagicBaseConst::SCOPE_PRIVATE_DEPARTMENT => $query->getActorDepartmentIds() === []
                ? ['match_none' => (object) []]
                : ['terms' => ['owner_department_ids' => $query->getActorDepartmentIds()]],
            MagicBaseConst::SCOPE_PRIVATE_ORG => $query->getActorOrganizationCode() === ''
                ? ['match_none' => (object) []]
                : ['term' => ['organization_code' => $query->getActorOrganizationCode()]],
            default => null,
        };
    }

    /**
     * @param array<string, mixed> $condition
     * @return null|array<string, mixed>
     */
    private function buildFieldFilter(string $field, array $condition, MagicBaseRowQuery $query): ?array
    {
        $path = $this->fieldPath($field, $query);
        if (array_key_exists('in', $condition)) {
            $values = is_array($condition['in']) ? array_values($condition['in']) : [];
            return $values === [] ? ['match_none' => (object) []] : ['terms' => [$path => $values]];
        }
        if (array_key_exists('eq', $condition)) {
            return ['term' => [$path => $condition['eq']]];
        }

        return null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildSort(MagicBaseRowQuery $query): array
    {
        $sort = [];
        foreach ($query->getSorts() as $item) {
            $field = (string) ($item['field'] ?? '');
            if ($field === '') {
                continue;
            }
            $order = strtolower((string) ($item['order'] ?? 'asc')) === 'desc' ? 'desc' : 'asc';
            $sort[] = [$this->fieldPath($field, $query, true) => ['order' => $order, 'missing' => '_last']];
        }

        $sort[] = ['record_id' => ['order' => 'asc']];
        return $sort;
    }

    private function fieldPath(string $field, MagicBaseRowQuery $query, bool $forSort = false): string
    {
        $rootFields = [
            'id' => 'record_id',
            'record_id' => 'record_id',
            'created_at' => 'created_at',
            'updated_at' => 'updated_at',
            'created_by' => 'created_by',
        ];
        if (isset($rootFields[$field])) {
            return $rootFields[$field];
        }

        $dataType = $query->getFieldTypes()[$field] ?? '';
        $path = 'data.' . $field;
        if (in_array($dataType, [
            ColumnType::Text->value,
            ColumnType::SingleSelect->value,
            ColumnType::User->value,
            ColumnType::Department->value,
            ColumnType::Attachment->value,
            ColumnType::Reference->value,
            ColumnType::Datetime->value,
        ], true)) {
            return $path . '.keyword';
        }

        return $path;
    }

    private function indexExists(string $index): bool
    {
        try {
            $exists = $this->client()->indices()->exists(['index' => $index]);
        } catch (Throwable $exception) {
            if ((int) $exception->getCode() === 404) {
                return false;
            }
            throw $exception;
        }

        return $exists;
    }

    /**
     * @return list<string>
     */
    private function hosts(): array
    {
        $configured = config('magicbase.opensearch.hosts', ['http://127.0.0.1:9200']);
        if (! is_array($configured)) {
            return ['http://127.0.0.1:9200'];
        }

        $hosts = [];
        foreach ($configured as $host) {
            if (! is_string($host) || trim($host) === '') {
                continue;
            }
            $hosts[] = trim($host);
        }

        return $hosts === [] ? ['http://127.0.0.1:9200'] : $hosts;
    }
}
