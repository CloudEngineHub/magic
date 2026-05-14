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
use App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch\MagicBaseOpenSearchRowQueryRepository;
use App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch\MagicBaseOpenSearchRowStoreRepository;

readonly class MagicBaseRowStorageResolverDomainService implements MagicBaseRowStoreRepositoryInterface, MagicBaseRowQueryRepositoryInterface
{
    public function __construct(
        private MagicBaseOpenSearchRowStoreRepository $openSearchRowStoreRepository,
        private MagicBaseOpenSearchRowQueryRepository $openSearchRowQueryRepository,
    ) {
    }

    public function getStorageDriver(): string
    {
        return 'opensearch';
    }

    public function getRow(string $organizationCode, int $tableId, int $recordId): ?MagicBaseRowEntity
    {
        return $this->openSearchRowQueryRepository->getRow($organizationCode, $tableId, $recordId);
    }

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult
    {
        return $this->openSearchRowQueryRepository->queryRows($query);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $organizationCode, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection
    {
        return $this->openSearchRowQueryRepository->listRows($organizationCode, $tableId, $includeDeleted);
    }

    public function saveRow(MagicBaseRowEntity $payload): MagicBaseRowEntity
    {
        return $this->openSearchRowStoreRepository->saveRow($payload);
    }
}
