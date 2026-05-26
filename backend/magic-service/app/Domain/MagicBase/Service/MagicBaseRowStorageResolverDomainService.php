<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQueryResult;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowQueryRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowStoreRepositoryInterface;
use App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB\MagicBaseMongoRowQueryRepository;
use App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB\MagicBaseMongoRowStoreRepository;
use App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch\MagicBaseOpenSearchRowQueryRepository;
use App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch\MagicBaseOpenSearchRowStoreRepository;

readonly class MagicBaseRowStorageResolverDomainService implements MagicBaseRowStoreRepositoryInterface, MagicBaseRowQueryRepositoryInterface
{
    public function __construct(
        private MagicBaseMongoRowStoreRepository $mongoRowStoreRepository,
        private MagicBaseMongoRowQueryRepository $mongoRowQueryRepository,
        private MagicBaseOpenSearchRowStoreRepository $openSearchRowStoreRepository,
        private MagicBaseOpenSearchRowQueryRepository $openSearchRowQueryRepository,
    ) {
    }

    public function getStorageDriver(): string
    {
        $driver = strtolower((string) config('magicbase.row_storage.driver', 'mongodb'));
        return in_array($driver, ['mongodb', 'opensearch'], true) ? $driver : 'mongodb';
    }

    public function getRow(string $organizationCode, int $projectId, int $tableId, int $recordId): ?MagicBaseRowEntity
    {
        return $this->queryRepository()->getRow($organizationCode, $projectId, $tableId, $recordId);
    }

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult
    {
        return $this->queryRepository()->queryRows($query);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $organizationCode, int $projectId, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection
    {
        return $this->queryRepository()->listRows($organizationCode, $projectId, $tableId, $includeDeleted);
    }

    public function saveRow(MagicBaseRowEntity $payload): MagicBaseRowEntity
    {
        return $this->storeRepository()->saveRow($payload);
    }

    private function storeRepository(): MagicBaseRowStoreRepositoryInterface
    {
        return $this->getStorageDriver() === 'opensearch'
            ? $this->openSearchRowStoreRepository
            : $this->mongoRowStoreRepository;
    }

    private function queryRepository(): MagicBaseRowQueryRepositoryInterface
    {
        return $this->getStorageDriver() === 'opensearch'
            ? $this->openSearchRowQueryRepository
            : $this->mongoRowQueryRepository;
    }
}
