<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Service;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseConst;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQueryResult;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowQueryRepositoryInterface;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowStoreRepositoryInterface;
use App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB\MagicBaseMongoRowQueryRepository;
use App\Domain\MagicBase\Repository\Persistence\Storage\MongoDB\MagicBaseMongoRowStoreRepository;

readonly class MagicBaseRowStorageResolverDomainService implements MagicBaseRowStoreRepositoryInterface, MagicBaseRowQueryRepositoryInterface
{
    public function __construct(
        private MagicBaseMongoRowStoreRepository $mongoRowStoreRepository,
        private MagicBaseMongoRowQueryRepository $mongoRowQueryRepository,
    ) {
    }

    public function getStorageDriver(): string
    {
        return MagicBaseConst::ROW_STORAGE_DRIVER_MONGODB;
    }

    public function getRow(string $dataOrganizationCode, int $projectId, int $tableId, int $recordId): ?MagicBaseRowEntity
    {
        return $this->queryRepository()->getRow($dataOrganizationCode, $projectId, $tableId, $recordId);
    }

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult
    {
        return $this->queryRepository()->queryRows($query);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $dataOrganizationCode, int $projectId, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection
    {
        return $this->queryRepository()->listRows($dataOrganizationCode, $projectId, $tableId, $includeDeleted);
    }

    public function saveRow(MagicBaseRowEntity $payload): MagicBaseRowEntity
    {
        return $this->storeRepository()->saveRow($payload);
    }

    /**
     * @param list<MagicBaseRowEntity> $payloads
     * @return list<MagicBaseRowEntity>
     */
    public function saveRows(array $payloads): array
    {
        return $this->storeRepository()->saveRows($payloads);
    }

    private function storeRepository(): MagicBaseRowStoreRepositoryInterface
    {
        return $this->mongoRowStoreRepository;
    }

    private function queryRepository(): MagicBaseRowQueryRepositoryInterface
    {
        return $this->mongoRowQueryRepository;
    }
}
