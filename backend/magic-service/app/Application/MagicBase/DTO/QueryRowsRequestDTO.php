<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

class QueryRowsRequestDTO
{
    /**
     * @param array<string, mixed> $filter public query DSL or legacy filter keyed by field name
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sort
     */
    public function __construct(
        public array $filter = [],
        public array $sort = [],
        public int $page = 1,
        public int $pageSize = 20,
        public string $select = '',
        public bool $includeTotal = true,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function getFilter(): array
    {
        return $this->filter;
    }

    /**
     * @return list<array{field?: string, order?: 'asc'|'desc'|string}>
     */
    public function getSort(): array
    {
        return $this->sort;
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }

    public function getSelect(): string
    {
        return $this->select;
    }

    public function includeTotal(): bool
    {
        return $this->includeTotal;
    }

    /**
     * @return array{
     *     filter: array<string, mixed>,
     *     sort: list<array{field?: string, order?: 'asc'|'desc'|string}>,
     *     page: int,
     *     page_size: int,
     *     select: string,
     *     include_total: bool
     * }
     */
    public function toArray(): array
    {
        return [
            'filter' => $this->filter,
            'sort' => $this->sort,
            'page' => $this->page,
            'page_size' => $this->pageSize,
            'select' => $this->select,
            'include_total' => $this->includeTotal,
        ];
    }
}
