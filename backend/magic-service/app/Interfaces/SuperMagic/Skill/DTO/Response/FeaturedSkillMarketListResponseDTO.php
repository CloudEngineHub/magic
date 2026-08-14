<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Skill\DTO\Response;

use JsonSerializable;

/**
 * 市场精选技能列表响应 DTO.
 */
class FeaturedSkillMarketListResponseDTO implements JsonSerializable
{
    /**
     * 精选技能列表项.
     *
     * @var SkillMarketListItemDTO[]
     */
    private array $list;

    private int $requestedCount;

    private int $returnedCount;

    private int $remainingCount;

    private bool $hasMore;

    /**
     * @param SkillMarketListItemDTO[] $list 精选技能列表
     */
    public function __construct(
        array $list,
        int $requestedCount,
        int $returnedCount,
        int $remainingCount,
        bool $hasMore
    ) {
        $this->list = $list;
        $this->requestedCount = $requestedCount;
        $this->returnedCount = $returnedCount;
        $this->remainingCount = $remainingCount;
        $this->hasMore = $hasMore;
    }

    public function jsonSerialize(): array
    {
        return [
            'list' => array_map(static fn (SkillMarketListItemDTO $item): array => $item->jsonSerialize(), $this->list),
            'requested_count' => $this->requestedCount,
            'returned_count' => $this->returnedCount,
            'remaining_count' => $this->remainingCount,
            'has_more' => $this->hasMore,
        ];
    }
}
