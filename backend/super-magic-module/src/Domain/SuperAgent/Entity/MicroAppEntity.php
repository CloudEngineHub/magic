<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Entity;

use App\Infrastructure\Core\AbstractEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;

class MicroAppEntity extends AbstractEntity
{
    protected int $id = 0;

    protected int $projectId = 0;

    protected string $resourceId = '';

    protected ?int $shareId = null;

    protected ?string $shareCode = null;

    protected string $organizationCode = '';

    protected string $userId = '';

    protected string $creatorId = '';

    protected ?string $coverFileKey = null;

    protected int $shareType = 0;

    protected ?string $shareRange = null;

    protected array $targetIds = [];

    protected string $publishStatus = MicroAppPublishStatus::Unpublished->value;

    protected string $accessUrl = '';

    protected ?string $publishedAt = null;

    protected ?string $unpublishedAt = null;

    protected ?string $createdAt = null;

    protected ?string $updatedAt = null;

    protected ?string $deletedAt = null;

    public function __construct(array $data = [])
    {
        $this->initProperty($data);
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->projectId,
            'resource_id' => $this->resourceId,
            'share_id' => $this->shareId,
            'share_code' => $this->shareCode,
            'organization_code' => $this->organizationCode,
            'user_id' => $this->userId,
            'creator_id' => $this->creatorId,
            'cover_file_key' => $this->coverFileKey,
            'share_type' => $this->shareType,
            'share_range' => $this->shareRange,
            'target_ids' => $this->targetIds,
            'publish_status' => $this->publishStatus,
            'access_url' => $this->accessUrl,
            'published_at' => $this->publishedAt,
            'unpublished_at' => $this->unpublishedAt,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
            'deleted_at' => $this->deletedAt,
        ];
    }

    public function getId(): int
    {
        return $this->id;
    }

    public function setId(int|string $id): self
    {
        $this->id = (int) $id;
        return $this;
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function setProjectId(int|string $projectId): self
    {
        $this->projectId = (int) $projectId;
        return $this;
    }

    public function getResourceId(): string
    {
        return $this->resourceId;
    }

    public function setResourceId(int|string $resourceId): self
    {
        $this->resourceId = (string) $resourceId;
        return $this;
    }

    public function getShareId(): ?int
    {
        return $this->shareId;
    }

    public function setShareId(null|int|string $shareId): self
    {
        $this->shareId = $shareId === null ? null : (int) $shareId;
        return $this;
    }

    public function getShareCode(): ?string
    {
        return $this->shareCode;
    }

    public function setShareCode(?string $shareCode): self
    {
        $this->shareCode = $shareCode;
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

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function setUserId(string $userId): self
    {
        $this->userId = $userId;
        return $this;
    }

    public function getCreatorId(): string
    {
        return $this->creatorId;
    }

    public function setCreatorId(?string $creatorId): self
    {
        $this->creatorId = $creatorId ?? '';
        return $this;
    }

    public function getCoverFileKey(): ?string
    {
        return $this->coverFileKey;
    }

    public function setCoverFileKey(?string $coverFileKey): self
    {
        $this->coverFileKey = $coverFileKey;
        return $this;
    }

    public function getShareType(): int
    {
        return $this->shareType;
    }

    public function setShareType(int|string $shareType): self
    {
        $this->shareType = (int) $shareType;
        return $this;
    }

    public function getShareRange(): ?string
    {
        return $this->shareRange;
    }

    public function setShareRange(?string $shareRange): self
    {
        $this->shareRange = $shareRange;
        return $this;
    }

    public function getTargetIds(): array
    {
        return $this->targetIds;
    }

    public function setTargetIds(?array $targetIds): self
    {
        $this->targetIds = $targetIds ?? [];
        return $this;
    }

    public function getPublishStatus(): string
    {
        return $this->publishStatus;
    }

    public function setPublishStatus(string $publishStatus): self
    {
        $this->publishStatus = $publishStatus;
        return $this;
    }

    public function getAccessUrl(): string
    {
        return $this->accessUrl;
    }

    public function setAccessUrl(?string $accessUrl): self
    {
        $this->accessUrl = $accessUrl ?? '';
        return $this;
    }

    public function getPublishedAt(): ?string
    {
        return $this->publishedAt;
    }

    public function setPublishedAt(?string $publishedAt): self
    {
        $this->publishedAt = $publishedAt;
        return $this;
    }

    public function getUnpublishedAt(): ?string
    {
        return $this->unpublishedAt;
    }

    public function setUnpublishedAt(?string $unpublishedAt): self
    {
        $this->unpublishedAt = $unpublishedAt;
        return $this;
    }

    public function getCreatedAt(): ?string
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?string $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?string
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?string $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }

    public function getDeletedAt(): ?string
    {
        return $this->deletedAt;
    }

    public function setDeletedAt(?string $deletedAt): self
    {
        $this->deletedAt = $deletedAt;
        return $this;
    }
}
