<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\MagicBase\DTO;

class QueryRowsRequestDTO
{
    /**
     * @param array<string, array<string, mixed>> $filter Query filter keyed by field name or relation.field.
     * @param list<array{field?: string, order?: 'asc'|'desc'|string}> $sort
     */
    public function __construct(
        public array $filter = [],
        public array $sort = [],
        public int $page = 1,
        public int $pageSize = 20,
        public string $select = '',
    ) {
    }

    /**
     * @return array{
     *     filter: array<string, array<string, mixed>>,
     *     sort: list<array{field?: string, order?: 'asc'|'desc'|string}>,
     *     page: int,
     *     page_size: int,
     *     select: string
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
        ];
    }
}
