<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB;

use App\Domain\MagicBase\Entity\MagicBaseProjectStorageRouteEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Exception\MagicBaseExceptionBuilder;
use App\Domain\MagicBase\Repository\Facade\MagicBaseProjectStorageRouteRepositoryInterface;
use DateTime;
use LogicException;

readonly class MagicBaseMongoCollectionRouter
{
    private const ROUTE_STATUS_ACTIVE = 'active';

    public function __construct(
        private MagicBaseProjectStorageRouteRepositoryInterface $routeRepository,
        private MagicBaseMongoClient $mongoClient,
    ) {
    }

    public function route(string $organizationCode, int $projectId): MagicBaseProjectStorageRouteEntity
    {
        $route = $this->routeRepository->getRoute($organizationCode, $projectId);
        if ($route !== null) {
            return $route;
        }

        $collections = $this->collectionPool();
        if ($collections === []) {
            MagicBaseExceptionBuilder::storageUnavailable('MongoDB collection pool is empty.');
            throw new LogicException('Unreachable');
        }

        $database = $this->mongoClient->databaseName();
        $counts = $this->routeRepository->getProjectCountsByCollections(MagicBaseConst::ROW_STORAGE_DRIVER_MONGODB, $database, $collections);
        $selected = $this->selectLeastUsedCollection($collections, $counts);
        $now = new DateTime();

        return $this->routeRepository->createRoute(new MagicBaseProjectStorageRouteEntity([
            'organization_code' => $organizationCode,
            'project_id' => $projectId,
            'storage_driver' => MagicBaseConst::ROW_STORAGE_DRIVER_MONGODB,
            'mongo_database' => $database,
            'mongo_collection' => $selected,
            'shard_id' => $this->extractShardId($selected),
            'status' => self::ROUTE_STATUS_ACTIVE,
            'created_at' => $now,
            'updated_at' => $now,
        ]));
    }

    /**
     * @return list<string>
     */
    private function collectionPool(): array
    {
        $count = max(1, (int) config('magicbase.mongodb.collection_count', 256));

        $collections = [];
        for ($index = 0; $index < $count; ++$index) {
            $collections[] = sprintf('%s_%03d', MagicBaseConst::MONGODB_COLLECTION_PREFIX, $index);
        }

        return $collections;
    }

    /**
     * @param list<string> $collections
     * @param array<string, int> $counts
     */
    private function selectLeastUsedCollection(array $collections, array $counts): string
    {
        $selected = $collections[0];
        $selectedCount = $counts[$selected] ?? 0;
        foreach ($collections as $collection) {
            $count = $counts[$collection] ?? 0;
            if ($count < $selectedCount) {
                $selected = $collection;
                $selectedCount = $count;
            }
        }

        return $selected;
    }

    private function extractShardId(string $collection): int
    {
        if (preg_match('/_(\d+)$/', $collection, $matches) !== 1) {
            return 0;
        }

        return (int) $matches[1];
    }
}
