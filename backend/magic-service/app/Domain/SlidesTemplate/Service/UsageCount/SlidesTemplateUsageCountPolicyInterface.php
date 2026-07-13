<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service\UsageCount;

interface SlidesTemplateUsageCountPolicyInterface
{
    public function calculateTotalUsageCount(int $baseUsageCount, int $actualUsageCount): int;

    public function getActualUsageIncrement(): int;
}
