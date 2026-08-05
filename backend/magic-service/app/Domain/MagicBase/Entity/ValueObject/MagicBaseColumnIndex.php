<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use App\Domain\MagicBase\Entity\MagicBaseColumnEntity;

readonly class MagicBaseColumnIndex
{
    /**
     * @param array<string, MagicBaseColumnEntity> $columnsByKey columns keyed by column_key
     */
    public function __construct(
        private array $columnsByKey,
    ) {
    }

    public function has(string $columnKey): bool
    {
        return isset($this->columnsByKey[$columnKey]);
    }

    public function get(string $columnKey): ?MagicBaseColumnEntity
    {
        return $this->columnsByKey[$columnKey] ?? null;
    }

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        return array_keys($this->columnsByKey);
    }

    /**
     * @return array<string, MagicBaseColumnEntity>
     */
    public function all(): array
    {
        return $this->columnsByKey;
    }
}
