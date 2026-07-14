<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use MongoDB\Client;
use MongoDB\Collection;

class MagicBaseMongoClient
{
    private const CONNECT_TIMEOUT_MS = 3000;

    private const SERVER_SELECTION_TIMEOUT_MS = 3000;

    private const QUERY_TIMEOUT_MS = 10000;

    private ?Client $client = null;

    /**
     * @var array<string, true>
     */
    private array $ensuredCollections = [];

    public function client(): Client
    {
        if ($this->client !== null) {
            return $this->client;
        }

        $options = [
            'connectTimeoutMS' => self::CONNECT_TIMEOUT_MS,
            'serverSelectionTimeoutMS' => self::SERVER_SELECTION_TIMEOUT_MS,
        ];

        return $this->client = new Client((string) config('magicbase.mongodb.uri', 'mongodb://127.0.0.1:27017'), $options);
    }

    public function databaseName(): string
    {
        $database = trim((string) config('magicbase.mongodb.database', 'magicbase'));
        return $database === '' ? 'magicbase' : $database;
    }

    public function collection(string $collectionName): Collection
    {
        $this->ensureIndexes($collectionName);
        return $this->client()->selectCollection($this->databaseName(), $collectionName);
    }

    public function queryTimeoutMs(): int
    {
        return self::QUERY_TIMEOUT_MS;
    }

    private function ensureIndexes(string $collectionName): void
    {
        if (isset($this->ensuredCollections[$collectionName])) {
            return;
        }

        $collection = $this->client()->selectCollection($this->databaseName(), $collectionName);
        $collection->createIndex([
            'data_organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'record_id' => 1,
        ], [
            'name' => 'uk_magicbase_row_data_identity',
            'unique' => true,
            'background' => true,
        ]);
        $collection->createIndex([
            'data_organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'created_at' => -1,
        ], [
            'name' => 'idx_magicbase_row_data_list',
            'background' => true,
        ]);
        $collection->createIndex([
            'data_organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'created_by' => 1,
        ], [
            'name' => 'idx_magicbase_row_data_private_user',
            'background' => true,
        ]);
        $collection->createIndex([
            'data_organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'owner_department_ids' => 1,
        ], [
            'name' => 'idx_magicbase_row_data_private_department',
            'background' => true,
        ]);
        $collection->createIndex([
            'data_organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'organization_code' => 1,
        ], [
            'name' => 'idx_magicbase_row_data_private_org',
            'background' => true,
        ]);

        $this->ensuredCollections[$collectionName] = true;
    }
}
