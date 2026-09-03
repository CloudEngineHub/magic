<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class MagicBaseResolvedFilter
{
    /**
     * @param array<string, mixed> $filter
     * @param list<string> $unboundedInFields relation fields resolved by the trusted application layer
     */
    public function __construct(
        private array $filter,
        private array $unboundedInFields = [],
    ) {
    }

    /** @return array<string, mixed> */
    public function getFilter(): array
    {
        return $this->filter;
    }

    /** @return list<string> */
    public function getUnboundedInFields(): array
    {
        return $this->unboundedInFields;
    }
}
