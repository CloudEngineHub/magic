<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service\UsageCount;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;
use App\Domain\SlidesTemplate\Repository\Facade\SlidesTemplateRepositoryInterface;

class DefaultSlidesTemplateUsageCountPolicy implements SlidesTemplateUsageCountPolicyInterface
{
    public function __construct(
        private readonly ?SlidesTemplateRepositoryInterface $slidesTemplateRepository = null,
    ) {
    }

    public function getCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): array
    {
        if (! $this->slidesTemplateRepository) {
            return ['total' => 0, 'total_usage_count' => 0];
        }
        return [
            'total' => $this->slidesTemplateRepository->count($dataIsolation, $query),
            'total_usage_count' => $this->slidesTemplateRepository->sumTotalUsageCount($dataIsolation, $query),
        ];
    }

    public function calculateTotalUsageCount(int $baseUsageCount, int $actualUsageCount): int
    {
        return max(0, $baseUsageCount) + max(0, $actualUsageCount);
    }

    public function getActualUsageIncrement(): int
    {
        return 1;
    }
}
