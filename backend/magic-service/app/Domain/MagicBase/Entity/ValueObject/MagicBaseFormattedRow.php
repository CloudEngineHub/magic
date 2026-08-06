<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseFormattedRow
{
    /**
     * @param array<string, mixed> $payload dynamic row response payload keyed by selected field or relation alias
     */
    public function __construct(
        private array $payload,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->payload;
    }
}
