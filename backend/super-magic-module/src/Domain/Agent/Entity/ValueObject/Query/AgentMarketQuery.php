<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\Agent\Entity\ValueObject\Query;

use App\Infrastructure\Core\AbstractQuery;

class AgentMarketQuery extends AbstractQuery
{
    protected ?string $keyword = null;

    protected ?string $languageCode = null;

    protected ?int $categoryId = null;

    /** @var int[] */
    protected array $categoryIds = [];

    public function getKeyword(): ?string
    {
        return $this->keyword;
    }

    public function setKeyword(?string $keyword): void
    {
        $this->keyword = $keyword;
    }

    public function getLanguageCode(): ?string
    {
        return $this->languageCode;
    }

    public function setLanguageCode(?string $languageCode): void
    {
        $this->languageCode = $languageCode;
    }

    public function getCategoryId(): ?int
    {
        return $this->categoryId;
    }

    public function setCategoryId(?int $categoryId): void
    {
        $this->categoryId = $categoryId;
    }

    /** @return int[] */
    public function getCategoryIds(): array
    {
        if ($this->categoryIds !== []) {
            return $this->categoryIds;
        }

        return $this->categoryId === null ? [] : [$this->categoryId];
    }

    /** @param int[] $categoryIds */
    public function setCategoryIds(array $categoryIds): void
    {
        $this->categoryIds = array_values(array_unique(array_filter($categoryIds)));
        $this->categoryId = $this->categoryIds[0] ?? $this->categoryId;
    }
}
