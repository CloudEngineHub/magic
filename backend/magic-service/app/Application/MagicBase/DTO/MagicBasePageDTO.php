<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

readonly class MagicBasePageDTO
{
    /**
     * @param MagicBaseRowDTO[] $list
     */
    public function __construct(
        public array $list,
        public int $page,
        public int $pageSize,
        public int $total,
        public bool $hasMore,
    ) {
    }

    /**
     * @return array{list: list<array<string, mixed>>, page: int, page_size: int, total: int, has_more: bool}
     */
    public function toArray(): array
    {
        return [
            'list' => array_map(static fn (MagicBaseRowDTO $row): array => $row->toArray(), $this->list),
            'page' => $this->page,
            'page_size' => $this->pageSize,
            'total' => $this->total,
            'has_more' => $this->hasMore,
        ];
    }
}
