<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;

class AdminSlidesTemplateItemDTO extends AbstractDTO
{
    public string $id = '';

    public string $organizationCode = '';

    public string $code = '';

    public string $sourceType = '';

    public ?string $categoryCode = null;

    public I18nTextDTO $label;

    public I18nTextDTO $description;

    public string $thumbnailFileKey = '';

    public ?string $thumbnailUrl = null;

    public ?string $collageFileKey = null;

    public ?string $collageUrl = null;

    public array $previewImageFileKeys = [];

    public array $previewImageUrls = [];

    public string $templateFileKey = '';

    public ?string $previewUrl = null;

    public int $status = 0;

    public int $sort = 0;

    public int $baseUsageCount = 0;

    public int $actualUsageCount = 0;

    public int $usageCount = 0;

    public ?string $createdUid = null;

    public ?string $updatedUid = null;

    public ?string $createdAt = null;

    public ?string $updatedAt = null;

    public function __construct(?array $data = null)
    {
        $this->setLabel(null);
        $this->setDescription(null);
        parent::__construct($data);
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function setId(null|int|string $id): void
    {
        $this->id = $id === null ? '' : (string) $id;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(?string $organizationCode): void
    {
        $this->organizationCode = $organizationCode ?? '';
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

    public function getCategoryCode(): ?string
    {
        return $this->categoryCode;
    }

    public function setCategoryCode(?string $categoryCode): void
    {
        $this->categoryCode = $categoryCode;
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

    public function getThumbnailFileKey(): string
    {
        return $this->thumbnailFileKey;
    }

    public function setThumbnailFileKey(?string $thumbnailFileKey): void
    {
        $this->thumbnailFileKey = $thumbnailFileKey ?? '';
    }

    public function getThumbnailUrl(): ?string
    {
        return $this->thumbnailUrl;
    }

    public function setThumbnailUrl(?string $thumbnailUrl): void
    {
        $this->thumbnailUrl = $thumbnailUrl;
    }

    public function getCollageFileKey(): ?string
    {
        return $this->collageFileKey;
    }

    public function setCollageFileKey(?string $collageFileKey): void
    {
        $this->collageFileKey = $collageFileKey;
    }

    public function getCollageUrl(): ?string
    {
        return $this->collageUrl;
    }

    public function setCollageUrl(?string $collageUrl): void
    {
        $this->collageUrl = $collageUrl;
    }

    public function getPreviewImageFileKeys(): array
    {
        return $this->previewImageFileKeys;
    }

    public function setPreviewImageFileKeys(?array $previewImageFileKeys): void
    {
        $this->previewImageFileKeys = $this->normalizeStringList($previewImageFileKeys ?? []);
    }

    public function getPreviewImageUrls(): array
    {
        return $this->previewImageUrls;
    }

    public function setPreviewImageUrls(?array $previewImageUrls): void
    {
        $this->previewImageUrls = $this->normalizeStringList($previewImageUrls ?? []);
    }

    public function getTemplateFileKey(): string
    {
        return $this->templateFileKey;
    }

    public function setTemplateFileKey(?string $templateFileKey): void
    {
        $this->templateFileKey = $templateFileKey ?? '';
    }

    public function getPreviewUrl(): ?string
    {
        return $this->previewUrl;
    }

    public function setPreviewUrl(?string $previewUrl): void
    {
        $this->previewUrl = $previewUrl;
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function setStatus(null|int|string $status): void
    {
        $this->status = $status === null ? 0 : (int) $status;
    }

    public function getSort(): int
    {
        return $this->sort;
    }

    public function setSort(null|int|string $sort): void
    {
        $this->sort = $sort === null ? 0 : (int) $sort;
    }

    public function getBaseUsageCount(): int
    {
        return $this->baseUsageCount;
    }

    public function setBaseUsageCount(null|int|string $baseUsageCount): void
    {
        $this->baseUsageCount = $baseUsageCount === null ? 0 : (int) $baseUsageCount;
    }

    public function getActualUsageCount(): int
    {
        return $this->actualUsageCount;
    }

    public function setActualUsageCount(null|int|string $actualUsageCount): void
    {
        $this->actualUsageCount = $actualUsageCount === null ? 0 : (int) $actualUsageCount;
    }

    public function getUsageCount(): int
    {
        return $this->usageCount;
    }

    public function setUsageCount(null|int|string $usageCount): void
    {
        $this->usageCount = $usageCount === null ? 0 : (int) $usageCount;
    }

    public function getCreatedUid(): ?string
    {
        return $this->createdUid;
    }

    public function setCreatedUid(?string $createdUid): void
    {
        $this->createdUid = $createdUid;
    }

    public function getUpdatedUid(): ?string
    {
        return $this->updatedUid;
    }

    public function setUpdatedUid(?string $updatedUid): void
    {
        $this->updatedUid = $updatedUid;
    }

    public function getCreatedAt(): ?string
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?string $createdAt): void
    {
        $this->createdAt = $createdAt;
    }

    public function getUpdatedAt(): ?string
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?string $updatedAt): void
    {
        $this->updatedAt = $updatedAt;
    }

    private function normalizeStringList(array $values): array
    {
        $list = [];
        foreach ($values as $value) {
            if (is_string($value) && $value !== '') {
                $list[] = $value;
            }
        }
        return $list;
    }
}
