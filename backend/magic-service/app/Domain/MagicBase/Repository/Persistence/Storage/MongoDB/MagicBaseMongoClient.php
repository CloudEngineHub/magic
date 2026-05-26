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
            'connectTimeoutMS' => max(1, (int) config('magicbase.mongodb.connect_timeout_ms', 3000)),
            'serverSelectionTimeoutMS' => max(1, (int) config('magicbase.mongodb.server_selection_timeout_ms', 3000)),
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
        return max(1, (int) config('magicbase.mongodb.query_timeout_ms', 10000));
    }

    private function ensureIndexes(string $collectionName): void
    {
        if (isset($this->ensuredCollections[$collectionName])) {
            return;
        }

        $collection = $this->client()->selectCollection($this->databaseName(), $collectionName);
        $collection->createIndex([
            'organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'record_id' => 1,
        ], [
            'name' => 'uk_magicbase_row_identity',
            'unique' => true,
            'background' => true,
        ]);
        $collection->createIndex([
            'organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'created_at' => -1,
        ], [
            'name' => 'idx_magicbase_row_list',
            'background' => true,
        ]);
        $collection->createIndex([
            'organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'created_by' => 1,
        ], [
            'name' => 'idx_magicbase_row_private_user',
            'background' => true,
        ]);
        $collection->createIndex([
            'organization_code' => 1,
            'project_id' => 1,
            'table_id' => 1,
            'deleted' => 1,
            'owner_department_ids' => 1,
        ], [
            'name' => 'idx_magicbase_row_private_department',
            'background' => true,
        ]);

        $this->ensuredCollections[$collectionName] = true;
    }
}
