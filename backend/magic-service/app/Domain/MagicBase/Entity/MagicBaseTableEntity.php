<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseDynamicPermissions;
use DateTime;

class MagicBaseTableEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $projectId = null;

    protected string $tableKey = '';

    protected string $tableName = '';

    protected string $description = '';

    protected string $status = '';

    protected MagicBaseDynamicPermissions $dynamicPermissions;

    protected string $createdBy = '';

    protected array $ownerDepartmentIds = [];

    protected ?DateTime $createdAt = null;

    protected ?DateTime $updatedAt = null;

    protected ?DateTime $deletedAt = null;

    public function __construct(?array $data = null)
    {
        $this->dynamicPermissions = MagicBaseDynamicPermissions::fromArray(null);
        parent::__construct($data);
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $value): void
    {
        $this->id = is_numeric($value) ? (int) $value : null;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(null|int|string $value): void
    {
        $this->organizationCode = $value === null ? '' : (string) $value;
    }

    public function getProjectId(): ?int
    {
        return $this->projectId;
    }

    public function setProjectId(null|int|string $value): void
    {
        $this->projectId = is_numeric($value) ? (int) $value : null;
    }

    public function getTableKey(): string
    {
        return $this->tableKey;
    }

    public function setTableKey(null|int|string $value): void
    {
        $this->tableKey = $value === null ? '' : (string) $value;
    }

    public function getTableName(): string
    {
        return $this->tableName;
    }

    public function setTableName(null|int|string $value): void
    {
        $this->tableName = $value === null ? '' : (string) $value;
    }

    public function getDescription(): string
    {
        return $this->description;
    }

    public function setDescription(null|int|string $value): void
    {
        $this->description = $value === null ? '' : (string) $value;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(null|int|string $value): void
    {
        $this->status = $value === null ? '' : (string) $value;
    }

    public function getDynamicPermissions(): MagicBaseDynamicPermissions
    {
        return $this->dynamicPermissions;
    }

    public function setDynamicPermissions(null|array|MagicBaseDynamicPermissions|string $value): void
    {
        if ($value instanceof MagicBaseDynamicPermissions) {
            $this->dynamicPermissions = $value;
            return;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $this->dynamicPermissions = MagicBaseDynamicPermissions::fromArray(is_array($decoded) ? $decoded : null);
            return;
        }
        $this->dynamicPermissions = MagicBaseDynamicPermissions::fromArray(is_array($value) ? $value : null);
    }

    public function getCreatedBy(): string
    {
        return $this->createdBy;
    }

    public function setCreatedBy(null|int|string $value): void
    {
        $this->createdBy = $value === null ? '' : (string) $value;
    }

    /**
     * @return list<string>
     */
    public function getOwnerDepartmentIds(): array
    {
        return $this->ownerDepartmentIds;
    }

    public function setOwnerDepartmentIds(null|array|string $value): void
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $this->ownerDepartmentIds = is_array($decoded) ? $decoded : [];
            return;
        }
        $this->ownerDepartmentIds = is_array($value) ? $value : [];
    }

    public function getCreatedAt(): ?DateTime
    {
        return $this->createdAt;
    }

    public function setCreatedAt(null|array|DateTime|int|string $value): void
    {
        $this->createdAt = $value === null ? null : $this->createDatetime($value);
    }

    public function getUpdatedAt(): ?DateTime
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(null|array|DateTime|int|string $value): void
    {
        $this->updatedAt = $value === null ? null : $this->createDatetime($value);
    }

    public function getDeletedAt(): ?DateTime
    {
        return $this->deletedAt;
    }

    public function setDeletedAt(null|array|DateTime|int|string $value): void
    {
        $this->deletedAt = $value === null ? null : $this->createDatetime($value);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $payload = parent::toArray();
        $payload['dynamic_permissions'] = $this->getDynamicPermissions()->toArray();
        return $payload;
    }
}
