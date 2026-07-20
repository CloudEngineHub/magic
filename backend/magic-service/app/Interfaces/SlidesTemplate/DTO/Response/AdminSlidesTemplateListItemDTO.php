<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

class AdminSlidesTemplateListItemDTO extends AdminSlidesTemplateItemDTO
{
    public ?AdminSlidesTemplateCategorySummaryDTO $category = null;

    public function getCategory(): ?AdminSlidesTemplateCategorySummaryDTO
    {
        return $this->category;
    }

    public function setCategory(null|AdminSlidesTemplateCategorySummaryDTO|array $category): void
    {
        $this->category = $category instanceof AdminSlidesTemplateCategorySummaryDTO
            ? $category
            : ($category === null ? null : new AdminSlidesTemplateCategorySummaryDTO($category));
    }
}
