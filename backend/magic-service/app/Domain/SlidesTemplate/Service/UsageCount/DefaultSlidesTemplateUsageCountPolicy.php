<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service\UsageCount;

class DefaultSlidesTemplateUsageCountPolicy implements SlidesTemplateUsageCountPolicyInterface
{
    public function calculateTotalUsageCount(int $baseUsageCount, int $actualUsageCount): int
    {
        return max(0, $baseUsageCount) + max(0, $actualUsageCount);
    }

    public function getActualUsageIncrement(): int
    {
        return 1;
    }
}
