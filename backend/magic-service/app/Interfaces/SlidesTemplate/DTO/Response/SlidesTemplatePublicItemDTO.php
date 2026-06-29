<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;

class SlidesTemplatePublicItemDTO extends AbstractDTO
{
    public string $code = '';

    public I18nTextDTO $label;

    public I18nTextDTO $description;

    public ?string $thumbnailUrl = null;

    public ?string $collageUrl = null;

    public ?string $previewUrl = null;

    public int $sort = 0;

    public bool $isOfficial = false;

    public function __construct(?array $data = null)
    {
        $this->setLabel(null);
        $this->setDescription(null);
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

    public function getLabel(): I18nTextDTO
    {
        return $this->label;
    }

    public function setLabel(null|array|I18nTextDTO $label): void
    {
        $this->label = $label instanceof I18nTextDTO ? $label : I18nTextDTO::fromArray($label ?? []);
    }

    public function getDescription(): I18nTextDTO
    {
        return $this->description;
    }

    public function setDescription(null|array|I18nTextDTO $description): void
    {
        $this->description = $description instanceof I18nTextDTO ? $description : I18nTextDTO::fromArray($description ?? []);
    }

    public function getThumbnailUrl(): ?string
    {
        return $this->thumbnailUrl;
    }

    public function setThumbnailUrl(?string $thumbnailUrl): void
    {
        $this->thumbnailUrl = $thumbnailUrl;
    }

    public function getCollageUrl(): ?string
    {
        return $this->collageUrl;
    }

    public function setCollageUrl(?string $collageUrl): void
    {
        $this->collageUrl = $collageUrl;
    }

    public function getPreviewUrl(): ?string
    {
        return $this->previewUrl;
    }

    public function setPreviewUrl(?string $previewUrl): void
    {
        $this->previewUrl = $previewUrl;
    }

    public function getSort(): int
    {
        return $this->sort;
    }

    public function setSort(null|int|string $sort): void
    {
        $this->sort = $sort === null ? 0 : (int) $sort;
    }

    public function isOfficial(): bool
    {
        return $this->isOfficial;
    }

    public function setIsOfficial(bool $isOfficial): void
    {
        $this->isOfficial = $isOfficial;
    }
}
