<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\Agent\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

class UpdateAgentMarketCategoryRequestAdminDTO extends AbstractRequestDTO
{
    public ?int $categoryId = null;

    /** @var null|array<int, null|int|string> */
    public ?array $categoryIds = null;

    private array $provided = [];

    public function setCategoryId(null|int|string $value): void
    {
        $this->categoryId = $value === null ? null : (int) $value;
        $this->provided['category_id'] = true;
    }

    public function setCategoryIds(?array $value): void
    {
        $this->categoryIds = $value;
        $this->categoryId = $this->getPrimaryCategoryId();
        $this->provided['category_ids'] = true;
    }

    /** @return int[] */
    public function getCategoryIds(): array
    {
        if ($this->categoryIds !== null) {
            return $this->normalizeCategoryIds($this->categoryIds);
        }

        return $this->categoryId === null ? [] : [$this->categoryId];
    }

    public function getPrimaryCategoryId(): ?int
    {
        return $this->getCategoryIds()[0] ?? null;
    }

    public function hasCategoryInput(): bool
    {
        return isset($this->provided['category_id']) || isset($this->provided['category_ids']);
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'category_id' => 'nullable|integer',
            'category_ids' => 'nullable|array|max:100',
            'category_ids.*' => 'integer|min:1',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [];
    }

    /** @param array<int, null|int|string> $categoryIds */
    private function normalizeCategoryIds(array $categoryIds): array
    {
        $normalized = [];
        foreach ($categoryIds as $categoryId) {
            $categoryId = (int) $categoryId;
            if ($categoryId <= 0 || in_array($categoryId, $normalized, true)) {
                continue;
            }
            $normalized[] = $categoryId;
        }

        return $normalized;
    }
}
