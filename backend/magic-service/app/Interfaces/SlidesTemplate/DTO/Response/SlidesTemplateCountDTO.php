<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;

class SlidesTemplateCountDTO extends AbstractDTO
{
    public int $total = 0;

    public int $totalUsageCount = 0;

    public int $templateCountTodayGrowth = 0;

    public function __construct(int $total, int $totalUsageCount = 0, int $templateCountTodayGrowth = 0)
    {
        $this->setTotal($total);
        $this->setTotalUsageCount($totalUsageCount);
        $this->setTemplateCountTodayGrowth($templateCountTodayGrowth);
        parent::__construct();
    }

    public function getTotal(): int
    {
        return $this->total;
    }

    public function setTotal(null|int|string $total): void
    {
        $this->total = $total === null ? 0 : (int) $total;
    }

    public function getTotalUsageCount(): int
    {
        return $this->totalUsageCount;
    }

    public function setTotalUsageCount(null|int|string $totalUsageCount): void
    {
        $this->totalUsageCount = $totalUsageCount === null ? 0 : (int) $totalUsageCount;
    }

    public function getTemplateCountTodayGrowth(): int
    {
        return $this->templateCountTodayGrowth;
    }

    public function setTemplateCountTodayGrowth(null|int|string $templateCountTodayGrowth): void
    {
        $this->templateCountTodayGrowth = $templateCountTodayGrowth === null ? 0 : (int) $templateCountTodayGrowth;
    }
}
