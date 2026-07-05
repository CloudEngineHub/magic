<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;

class SlidesTemplateFileUrlDTO extends AbstractDTO
{
    public string $code = '';

    public string $sourceType = '';

    public I18nTextDTO $label;

    public ?string $templateFileUrl = null;

    public function __construct(?array $data = null)
    {
        $this->setLabel(null);
        parent::__construct($data);
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function setCode(?string $code): void
    {
        $this->code = $code ?? '';
    }

    public function getSourceType(): string
    {
        return $this->sourceType;
    }

    public function setSourceType(?string $sourceType): void
    {
        $this->sourceType = $sourceType ?? '';
    }

    public function getLabel(): I18nTextDTO
    {
        return $this->label;
    }

    public function setLabel(null|array|I18nTextDTO $label): void
    {
        $this->label = $label instanceof I18nTextDTO ? $label : I18nTextDTO::fromArray($label ?? []);
    }

    public function getTemplateFileUrl(): ?string
    {
        return $this->templateFileUrl;
    }

    public function setTemplateFileUrl(?string $templateFileUrl): void
    {
        $this->templateFileUrl = $templateFileUrl;
    }
}
