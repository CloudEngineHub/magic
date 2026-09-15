<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseRowQueryResult
{
    public function __construct(
        private MagicBaseEntityCollection $rows,
        private int $total,
        private bool $hasMore,
    ) {
    }

    public function getRows(): MagicBaseEntityCollection
    {
        return $this->rows;
    }

    public function getTotal(): int
    {
        return $this->total;
    }

    public function hasMore(): bool
    {
        return $this->hasMore;
    }
}
