<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Agent\Entity;

use App\Domain\SuperMagic\Agent\Entity\ValueObject\AgentCategoryRelationType;
use App\Infrastructure\Core\AbstractEntity;

class AgentCategoryRelationEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode;

    protected AgentCategoryRelationType $relationType;

    protected int $relationId;

    protected int $categoryId;

    protected ?string $createdAt = null;

    protected ?string $updatedAt = null;

    protected ?string $deletedAt = null;

    public function toArray(): array
    {
        return array_filter([
            'id' => $this->id,
            'organization_code' => $this->organizationCode,
            'relation_type' => $this->relationType->value,
            'relation_id' => $this->relationId,
            'category_id' => $this->categoryId,
            'created_at' => $this->createdAt,
            'updated_at' => $this->updatedAt,
            'deleted_at' => $this->deletedAt,
        ], static fn ($value) => $value !== null);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $id): self
    {
        $this->id = is_string($id) ? (int) $id : $id;
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

    public function getRelationType(): AgentCategoryRelationType
    {
        return $this->relationType;
    }

    public function setRelationType(AgentCategoryRelationType|string $relationType): self
    {
        $this->relationType = $relationType instanceof AgentCategoryRelationType
            ? $relationType
            : AgentCategoryRelationType::from($relationType);
        return $this;
    }

    public function getRelationId(): int
    {
        return $this->relationId;
    }

    public function setRelationId(int|string $relationId): self
    {
        $this->relationId = is_string($relationId) ? (int) $relationId : $relationId;
        return $this;
    }

    public function getCategoryId(): int
    {
        return $this->categoryId;
    }

    public function setCategoryId(int|string $categoryId): self
    {
        $this->categoryId = is_string($categoryId) ? (int) $categoryId : $categoryId;
        return $this;
    }

    public function setCreatedAt(?string $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function setUpdatedAt(?string $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }

    public function setDeletedAt(?string $deletedAt): self
    {
        $this->deletedAt = $deletedAt;
        return $this;
    }
}
