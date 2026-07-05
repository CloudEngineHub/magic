<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Entity;

use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateSourceType;
use App\Domain\SlidesTemplate\Entity\ValueObject\SlidesTemplateStatus;
use App\Infrastructure\Core\AbstractEntity;

class SlidesTemplateEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected string $code = '';

    protected SlidesTemplateSourceType $sourceType = SlidesTemplateSourceType::Custom;

    protected array $label = [];

    protected array $description = [];

    protected string $thumbnailFileKey = '';

    protected ?string $thumbnailUrl = null;

    protected ?string $collageFileKey = null;

    protected ?string $collageUrl = null;

    protected string $templateFileKey = '';

    protected ?string $templateFileUrl = null;

    protected ?string $previewUrl = null;

    protected SlidesTemplateStatus $status = SlidesTemplateStatus::Enabled;

    protected int $sort = 0;

    protected ?string $createdUid = null;

    protected ?string $updatedUid = null;

    protected ?string $createdAt = null;

    protected ?string $updatedAt = null;

    protected ?string $deletedAt = null;

    public function __construct(array $data = [])
    {
        parent::__construct($data);
    }

    public static function generateNewCode(): string
    {
        return 'PPT-' . str_replace('.', '-', uniqid('', true));
    }

    public function toArray(): array
    {
        $result = [
            'id' => $this->id,
            'organization_code' => $this->organizationCode,
            'code' => $this->code,
            'source_type' => $this->sourceType->value,
            'label' => $this->label,
            'description' => $this->description,
            'thumbnail_file_key' => $this->thumbnailFileKey,
            'collage_file_key' => $this->collageFileKey,
            'template_file_key' => $this->templateFileKey,
            'preview_url' => $this->previewUrl,
            'status' => $this->status->value,
            'sort' => $this->sort,
            'created_uid' => $this->createdUid,
            'updated_uid' => $this->updatedUid,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
            'deleted_at' => $this->deletedAt,
        ];

        return array_filter($result, static fn ($value) => $value !== null);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $id): self
    {
        $this->id = $id === null ? null : (int) $id;
        return $this;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(string $organizationCode): self
    {
        $this->organizationCode = $organizationCode;
        return $this;
    }

    public function getCode(): string
    {
        return $this->code;
    }

    public function setCode(string $code): self
    {
        $this->code = $code;
        return $this;
    }

    public function getSourceType(): SlidesTemplateSourceType
    {
        return $this->sourceType;
    }

    public function setSourceType(null|SlidesTemplateSourceType|string $sourceType): self
    {
        if ($sourceType === null || $sourceType === '') {
            $this->sourceType = SlidesTemplateSourceType::Custom;
            return $this;
        }

        $this->sourceType = $sourceType instanceof SlidesTemplateSourceType ? $sourceType : SlidesTemplateSourceType::from($sourceType);
        return $this;
    }

    public function getLabel(): array
    {
        return $this->label;
    }

    public function setLabel(array $label): self
    {
        $this->label = $label;
        return $this;
    }

    public function getDescription(): array
    {
        return $this->description;
    }

    public function setDescription(array $description): self
    {
        $this->description = $description;
        return $this;
    }

    public function getThumbnailFileKey(): string
    {
        return $this->thumbnailFileKey;
    }

    public function setThumbnailFileKey(string $thumbnailFileKey): self
    {
        $this->thumbnailFileKey = $thumbnailFileKey;
        return $this;
    }

    public function getThumbnailUrl(): ?string
    {
        return $this->thumbnailUrl;
    }

    public function setThumbnailUrl(?string $thumbnailUrl): self
    {
        $this->thumbnailUrl = $thumbnailUrl;
        return $this;
    }

    public function getCollageFileKey(): ?string
    {
        return $this->collageFileKey;
    }

    public function setCollageFileKey(?string $collageFileKey): self
    {
        $this->collageFileKey = $collageFileKey;
        return $this;
    }

    public function getCollageUrl(): ?string
    {
        return $this->collageUrl;
    }

    public function setCollageUrl(?string $collageUrl): self
    {
        $this->collageUrl = $collageUrl;
        return $this;
    }

    public function getTemplateFileKey(): string
    {
        return $this->templateFileKey;
    }

    public function setTemplateFileKey(string $templateFileKey): self
    {
        $this->templateFileKey = $templateFileKey;
        return $this;
    }

    public function getTemplateFileUrl(): ?string
    {
        return $this->templateFileUrl;
    }

    public function setTemplateFileUrl(?string $templateFileUrl): self
    {
        $this->templateFileUrl = $templateFileUrl;
        return $this;
    }

    public function getPreviewUrl(): ?string
    {
        return $this->previewUrl;
    }

    public function setPreviewUrl(?string $previewUrl): self
    {
        $this->previewUrl = $previewUrl;
        return $this;
    }

    public function getStatus(): SlidesTemplateStatus
    {
        return $this->status;
    }

    public function setStatus(int|SlidesTemplateStatus $status): self
    {
        $this->status = $status instanceof SlidesTemplateStatus ? $status : SlidesTemplateStatus::from($status);
        return $this;
    }

    public function getSort(): int
    {
        return $this->sort;
    }

    public function setSort(int|string $sort): self
    {
        $this->sort = (int) $sort;
        return $this;
    }

    public function getCreatedUid(): ?string
    {
        return $this->createdUid;
    }

    public function setCreatedUid(?string $createdUid): self
    {
        $this->createdUid = $createdUid;
        return $this;
    }

    public function getUpdatedUid(): ?string
    {
        return $this->updatedUid;
    }

    public function setUpdatedUid(?string $updatedUid): self
    {
        $this->updatedUid = $updatedUid;
        return $this;
    }

    public function getCreatedAt(): ?string
    {
        return $this->createdAt;
    }

    public function setCreatedAt(mixed $createdAt): self
    {
        $this->createdAt = $createdAt === null ? null : (string) $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?string
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(mixed $updatedAt): self
    {
        $this->updatedAt = $updatedAt === null ? null : (string) $updatedAt;
        return $this;
    }

    public function getDeletedAt(): ?string
    {
        return $this->deletedAt;
    }

    public function setDeletedAt(mixed $deletedAt): self
    {
        $this->deletedAt = $deletedAt === null ? null : (string) $deletedAt;
        return $this;
    }
}
