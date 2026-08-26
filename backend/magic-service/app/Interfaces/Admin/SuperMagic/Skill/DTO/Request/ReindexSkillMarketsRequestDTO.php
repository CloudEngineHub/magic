<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\SuperMagic\Skill\DTO\Request;

use App\Infrastructure\Core\AbstractRequestDTO;

final class ReindexSkillMarketsRequestDTO extends AbstractRequestDTO
{
    public string $afterId = '0';

    public int $batchSize = 100;

    /** @var array<int, int> */
    public array $categoryIds = [];

    /** @var array<int, string> */
    public array $codes = [];

    public ?string $publisherType = null;

    public function getAfterId(): string
    {
        return $this->afterId;
    }

    public function getBatchSize(): int
    {
        return min(100, max(1, $this->batchSize));
    }

    /** @return array<int, int> */
    public function getCategoryIds(): array
    {
        return array_values(array_unique(array_map('intval', $this->categoryIds)));
    }

    /** @return array<int, string> */
    public function getCodes(): array
    {
        return array_values(array_unique(array_filter($this->codes, static fn (string $code): bool => $code !== '')));
    }

    public function getPublisherType(): ?string
    {
        return $this->publisherType;
    }

    protected static function getHyperfValidationRules(): array
    {
        return [
            'after_id' => 'nullable|string',
            'batch_size' => 'nullable|integer|min:1|max:100',
            'category_ids' => 'nullable|array|max:100',
            'category_ids.*' => 'integer|min:1',
            'codes' => 'nullable|array|max:100',
            'codes.*' => 'string|max:128',
            'publisher_type' => 'nullable|string|max:64',
        ];
    }

    protected static function getHyperfValidationMessage(): array
    {
        return [];
    }
}
