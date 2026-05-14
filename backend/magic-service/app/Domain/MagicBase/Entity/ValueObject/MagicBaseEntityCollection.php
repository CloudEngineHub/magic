<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use App\Infrastructure\Core\AbstractEntity;
use ArrayIterator;
use Countable;
use IteratorAggregate;
use Traversable;

/**
 * @template T of AbstractEntity
 * @implements IteratorAggregate<int, T>
 */
class MagicBaseEntityCollection implements Countable, IteratorAggregate
{
    /**
     * @param T[] $items
     */
    public function __construct(
        private readonly array $items = [],
    ) {
    }

    /**
     * @return Traversable<int, T>
     */
    public function getIterator(): Traversable
    {
        return new ArrayIterator($this->items);
    }

    public function count(): int
    {
        return count($this->items);
    }

    public function isEmpty(): bool
    {
        return $this->items === [];
    }

    /**
     * @return T[]
     */
    public function all(): array
    {
        return $this->items;
    }

    public function first(): ?AbstractEntity
    {
        return $this->items[0] ?? null;
    }

    public function toArray(): array
    {
        return array_map(static fn (AbstractEntity $entity): array => $entity->toArray(), $this->items);
    }
}
