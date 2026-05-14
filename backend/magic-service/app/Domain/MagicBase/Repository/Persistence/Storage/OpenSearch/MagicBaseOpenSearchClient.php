<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch;

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
