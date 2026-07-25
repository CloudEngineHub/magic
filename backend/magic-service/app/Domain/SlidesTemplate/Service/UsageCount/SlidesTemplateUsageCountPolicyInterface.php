<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Service\UsageCount;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateDataIsolation;
use App\Domain\SlidesTemplate\Entity\ValueObject\Query\SlidesTemplateQuery;

interface SlidesTemplateUsageCountPolicyInterface
{
    /** @return array{total: int, total_usage_count: int, template_count_today_growth: int} */
    public function getCount(SlidesTemplateDataIsolation $dataIsolation, SlidesTemplateQuery $query): array;
}
