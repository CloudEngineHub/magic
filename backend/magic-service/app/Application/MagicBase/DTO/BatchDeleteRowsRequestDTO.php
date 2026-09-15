<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class BatchDeleteRowsRequestDTO
{
    /**
     * @param list<int> $recordIds
     */
    public function __construct(
        private array $recordIds = [],
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(self::normalizeRecordIds($payload['record_ids'] ?? []));
    }

    /**
     * @return list<int>
     */
    public function getRecordIds(): array
    {
        return $this->recordIds;
    }

    /**
     * @return list<int>
     */
    private static function normalizeRecordIds(mixed $value): array
    {
        $values = is_array($value) ? $value : [];
        $result = [];
        foreach ($values as $item) {
            if (! is_scalar($item) || ! is_numeric($item)) {
                continue;
            }
            $recordId = (int) $item;
            if ($recordId > 0 && ! in_array($recordId, $result, true)) {
                $result[] = $recordId;
            }
        }
        return $result;
    }
}
