<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseEntityCollection;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQuery;
use App\Domain\MagicBase\Entity\ValueObject\MagicBaseRowQueryResult;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowQueryRepositoryInterface;

readonly class MagicBaseOpenSearchRowQueryRepository implements MagicBaseRowQueryRepositoryInterface
{
    public function __construct(
        private MagicBaseOpenSearchClient $client,
    ) {
    }

    public function getRow(string $organizationCode, int $tableId, int $recordId): ?MagicBaseRowEntity
    {
        $index = $this->client->indexName($organizationCode, $tableId);
        $source = $this->client->getRow($index, (string) $recordId);

        return $source === null ? null : new MagicBaseRowEntity($source);
    }

    public function queryRows(MagicBaseRowQuery $query): MagicBaseRowQueryResult
    {
        $index = $this->client->indexName($query->getOrganizationCode(), $query->getTableId());
        $result = $this->client->queryRows($index, $query);
        $entities = [];
        foreach ($result['rows'] as $row) {
            $entities[] = new MagicBaseRowEntity($row);
        }

        return new MagicBaseRowQueryResult(new MagicBaseEntityCollection($entities), $result['total']);
    }

    /** @return MagicBaseEntityCollection<MagicBaseRowEntity> */
    public function listRows(string $organizationCode, int $tableId, bool $includeDeleted = false): MagicBaseEntityCollection
    {
        $index = $this->client->indexName($organizationCode, $tableId);
        $rows = $this->client->searchRows($index, $organizationCode, $tableId, $includeDeleted);
        $entities = [];
        foreach ($rows as $row) {
            $entities[] = new MagicBaseRowEntity($row);
        }

        return new MagicBaseEntityCollection($entities);
    }
}
