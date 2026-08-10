<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Project\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class PublishedMicroAppListRequestDTO extends AbstractRequestDTO
{
    public int $page = 1;

    public int $pageSize = 20;

    public string $keyword = '';

    public function getPage(): int
    {
        return max(1, $this->page);
    }

    public function setPage(int|string $page): void
    {
        $this->page = (int) $page;
    }

    public function getPageSize(): int
    {
        return min(100, max(1, $this->pageSize));
    }

    public function setPageSize(int|string $pageSize): void
    {
        $this->pageSize = (int) $pageSize;
    }

    public function getKeyword(): string
    {
        return trim($this->keyword);
    }

    public function setKeyword(?string $keyword): void
    {
        $this->keyword = $keyword ?? '';
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'page' => 'nullable|integer|min:1',
            'page_size' => 'nullable|integer|min:1|max:100',
            'keyword' => 'nullable|string|max:100',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [
            'page.min' => 'Page must be greater than 0',
            'page_size.max' => 'Page size cannot exceed 100',
            'keyword.max' => 'Keyword cannot exceed 100 characters',
        ];
    }
}
