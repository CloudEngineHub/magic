<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity\ValueObject;

use ArrayIterator;
use Countable;
use IteratorAggregate;
use Traversable;

/**
 * @implements IteratorAggregate<int, MagicBaseColumnDefinition>
 */
readonly class MagicBaseColumnDefinitionCollection implements Countable, IteratorAggregate
{
    /**
     * @param list<MagicBaseColumnDefinition> $columns
     */
    public function __construct(
        private array $columns,
    ) {
    }

    /**
     * @param list<array<string, mixed>> $payload
     */
    public static function fromArray(array $payload): self
    {
        return new self(array_values(array_map(
            static fn (array $column): MagicBaseColumnDefinition => MagicBaseColumnDefinition::fromArray($column),
            array_filter($payload, 'is_array'),
        )));
    }

    public function count(): int
    {
        return count($this->columns);
    }

    /**
     * @return Traversable<int, MagicBaseColumnDefinition>
     */
    public function getIterator(): Traversable
    {
        return new ArrayIterator($this->columns);
    }

    public function isEmpty(): bool
    {
        return $this->columns === [];
    }

    /**
     * @return list<MagicBaseColumnDefinition>
     */
    public function all(): array
    {
        return $this->columns;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function toArray(): array
    {
        return array_map(static fn (MagicBaseColumnDefinition $column): array => $column->toArray(), $this->columns);
    }
}
