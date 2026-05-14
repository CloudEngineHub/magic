<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Storage\OpenSearch;

use App\Domain\MagicBase\Entity\MagicBaseRowEntity;
use App\Domain\MagicBase\Repository\Facade\MagicBaseRowStoreRepositoryInterface;
use DateTimeInterface;
use InvalidArgumentException;

readonly class MagicBaseOpenSearchRowStoreRepository implements MagicBaseRowStoreRepositoryInterface
{
    public function __construct(
        private MagicBaseOpenSearchClient $client,
    ) {
    }

    public function saveRow(MagicBaseRowEntity $entity): MagicBaseRowEntity
    {
        $recordId = $entity->getRecordId();
        $tableId = $entity->getTableId();
        if ($recordId === null || $tableId === null) {
            throw new InvalidArgumentException('MagicBase row record_id and table_id are required for OpenSearch storage.');
        }

        $source = $this->normalizeSource($entity->toArray());
        $index = $this->client->indexName($entity->getOrganizationCode(), $tableId);
        $this->client->indexRow($index, (string) $recordId, $source);

        return new MagicBaseRowEntity($source);
    }

    /**
     * @param array<string, mixed> $source
     * @return array<string, mixed>
     */
    private function normalizeSource(array $source): array
    {
        $normalized = [];
        foreach ($source as $key => $value) {
            $normalized[$key] = $this->normalizeValue($value);
        }

        return $normalized;
    }

    private function normalizeValue(mixed $value): mixed
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
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
