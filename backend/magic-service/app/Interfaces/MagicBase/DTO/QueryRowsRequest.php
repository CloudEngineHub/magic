<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\MagicBase\DTO;

class QueryRowsRequest extends AbstractMagicBaseDTO
{
    protected array $filter = [];

    protected array $sort = [];

    protected int $page = 1;

    protected int $pageSize = 20;

    protected string $select = '';

    protected bool $includeTotal = true;

    /** @return array<string, mixed> */
    public function getFilter(): array
    {
        return $this->filter;
    }

    public function setFilter(null|array|string $value): void
    {
        $this->filter = is_string($value) ? (json_decode($value, true) ?: []) : (is_array($value) ? $value : []);
    }

    /** @return list<array{field?: string, order?: 'asc'|'desc'|string}> */
    public function getSort(): array
    {
        return $this->sort;
    }

    public function setSort(null|array|string $value): void
    {
        $this->sort = is_string($value) ? (json_decode($value, true) ?: []) : (is_array($value) ? $value : []);
    }

    public function getPage(): int
    {
        return $this->page;
    }

    public function setPage(null|int|string $value): void
    {
        $this->page = is_numeric($value) ? max(1, (int) $value) : 1;
    }

    public function getPageSize(): int
    {
        return $this->pageSize;
    }

    public function setPageSize(null|int|string $value): void
    {
        $this->pageSize = is_numeric($value) ? max(1, (int) $value) : 20;
    }

    public function getSelect(): string
    {
        return $this->select;
    }

    public function setSelect(null|array|int|string $value): void
    {
        $this->select = $this->normalizeSelect($value);
    }

    public function getIncludeTotal(): bool
    {
        return $this->includeTotal;
    }

    public function setIncludeTotal(null|bool|int|string $value): void
    {
        if ($value === null) {
            $this->includeTotal = true;
            return;
        }
        $this->includeTotal = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? true;
    }

    private function normalizeSelect(null|array|int|string $value): string
    {
        if ($value === null) {
            return '';
        }
        if (! is_array($value)) {
            return trim((string) $value);
        }

        $fields = [];
        foreach ($value as $field) {
            if (! is_scalar($field)) {
                continue;
            }
            $field = trim((string) $field);
            if ($field !== '') {
                $fields[] = $field;
            }
        }
        return implode(',', $fields);
    }
}
