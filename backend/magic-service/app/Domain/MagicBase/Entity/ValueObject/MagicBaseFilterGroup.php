<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

readonly class MagicBaseFilterGroup implements MagicBaseFilterNode
{
    /**
     * @param list<MagicBaseFilterNode> $items
     */
    public function __construct(
        private string $logic,
        private array $items,
    ) {
    }

    public function getLogic(): string
    {
        return $this->logic;
    }

    /**
     * @return list<MagicBaseFilterNode>
     */
    public function getItems(): array
    {
        return $this->items;
    }

    public function isEmpty(): bool
    {
        return $this->items === [];
    }
}
