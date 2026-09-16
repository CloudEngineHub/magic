<?php

declare(strict_types=1);

namespace App\Domain\Asset\Entity;

use App\Domain\Asset\Entity\ValueObject\AssetTagNodeType;
use App\Infrastructure\Core\AbstractEntity;

/** 素材标签组/标签。官方标签 owner_uid 为空，自定义标签归属当前用户。 */
class AssetTagEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected int $parentId = 0;

    protected AssetTagNodeType $nodeType = AssetTagNodeType::Tag;

    protected array $nameI18n = [];

    protected int $status = 1;

    protected int $sort = 0;

    protected ?string $ownerUid = null;

    protected ?string $createdUid = null;

    protected ?string $updatedUid = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $value): self
    {
        $this->id = $value === null ? null : (int) $value;
        return $this;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(string $value): self
    {
        $this->organizationCode = $value;
        return $this;
    }

    public function getParentId(): int
    {
        return $this->parentId;
    }

    public function setParentId(int|string|null $value): self
    {
        $this->parentId = max(0, (int) ($value ?? 0));
        return $this;
    }

    public function getNodeType(): AssetTagNodeType
    {
        return $this->nodeType;
    }

    public function setNodeType(AssetTagNodeType|string $value): self
    {
        $this->nodeType = $value instanceof AssetTagNodeType ? $value : AssetTagNodeType::from($value);
        return $this;
    }

    public function isGroup(): bool
    {
        return $this->nodeType === AssetTagNodeType::Group;
    }

    public function isTag(): bool
    {
        return $this->nodeType === AssetTagNodeType::Tag;
    }

    public function getNameI18n(): array
    {
        return $this->nameI18n;
    }

    public function setNameI18n(array $value): self
    {
        $this->nameI18n = $value;
        return $this;
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function setStatus(int|string $value): self
    {
        $this->status = (int) $value;
        return $this;
    }

    public function getSort(): int
    {
        return $this->sort;
    }

    public function setSort(int|string $value): self
    {
        $this->sort = (int) $value;
        return $this;
    }

    public function getOwnerUid(): ?string
    {
        return $this->ownerUid;
    }

    public function setOwnerUid(?string $value): self
    {
        $this->ownerUid = $value;
        return $this;
    }

    public function getCreatedUid(): ?string
    {
        return $this->createdUid;
    }

    public function setCreatedUid(?string $value): self
    {
        $this->createdUid = $value;
        return $this;
    }

    public function getUpdatedUid(): ?string
    {
        return $this->updatedUid;
    }

    public function setUpdatedUid(?string $value): self
    {
        $this->updatedUid = $value;
        return $this;
    }

    public function toArray(): array
    {
        return array_filter([
            'id' => $this->id,
            'organization_code' => $this->organizationCode,
            'parent_id' => $this->parentId,
            'node_type' => $this->nodeType->value,
            'name_i18n' => $this->nameI18n,
            'status' => $this->status,
            'sort' => $this->sort,
            'owner_uid' => $this->ownerUid,
            'created_uid' => $this->createdUid,
            'updated_uid' => $this->updatedUid,
        ], static fn (mixed $value): bool => $value !== null);
    }
}
