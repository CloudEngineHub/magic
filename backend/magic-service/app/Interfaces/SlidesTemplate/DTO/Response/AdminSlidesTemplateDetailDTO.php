<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

class AdminSlidesTemplateDetailDTO extends AdminSlidesTemplateItemDTO
{
    public ?string $templateFileUrl = null;

    public function getTemplateFileUrl(): ?string
    {
        return $this->templateFileUrl;
    }

    public function setTemplateFileUrl(?string $templateFileUrl): void
    {
        $this->templateFileUrl = $templateFileUrl;
    }
}
