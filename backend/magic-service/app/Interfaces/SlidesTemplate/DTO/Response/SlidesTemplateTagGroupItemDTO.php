<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

class SlidesTemplateTagGroupItemDTO extends SlidesTemplateSimpleTagItemDTO
{
    /**
     * @var SlidesTemplateSimpleTagItemDTO[]
     */
    public array $tags = [];

    /**
     * @return SlidesTemplateSimpleTagItemDTO[]
     */
    public function getTags(): array
    {
        return $this->tags;
    }

    /**
     * @param SlidesTemplateSimpleTagItemDTO[] $tags
     */
    public function setTags(array $tags): void
    {
        $this->tags = $tags;
    }
}
