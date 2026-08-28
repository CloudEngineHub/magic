<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseFormattedRow;

readonly class MagicBaseRowDTO
{
    private array $payload;

    /**
     * @param array<string, mixed>|MagicBaseFormattedRow $payload
     */
    public function __construct(
        array|MagicBaseFormattedRow $payload,
    ) {
        $this->payload = $payload instanceof MagicBaseFormattedRow ? $payload->toArray() : $payload;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->payload;
    }
}
