<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use App\Domain\MagicBase\Entity\ValueObject\MagicBaseColumnDynamicPermission;
use DateTime;

class MagicBaseColumnEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $tableId = null;

    protected string $columnKey = '';

    protected string $columnName = '';

    protected string $dataType = '';

    protected bool $isRequired = false;

    protected mixed $defaultValue = null;

    protected ?array $options = null;

    protected string $status = '';

    protected MagicBaseColumnDynamicPermission $dynamicPermission;

    protected ?DateTime $createdAt = null;

    protected ?DateTime $updatedAt = null;

    protected ?DateTime $deletedAt = null;

    public function __construct(?array $data = null)
    {
        $this->dynamicPermission = MagicBaseColumnDynamicPermission::fromArray(null);
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

    public function getTableId(): ?int
    {
        return $this->tableId;
    }

    public function setTableId(null|int|string $value): void
    {
        $this->tableId = is_numeric($value) ? (int) $value : null;
    }

    public function getColumnKey(): string
    {
        return $this->columnKey;
    }

    public function setColumnKey(null|int|string $value): void
    {
        $this->columnKey = $value === null ? '' : (string) $value;
    }

    public function getColumnName(): string
    {
        return $this->columnName;
    }

    public function setColumnName(null|int|string $value): void
    {
        $this->columnName = $value === null ? '' : (string) $value;
    }

    public function getDataType(): string
    {
        return $this->dataType;
    }

    public function setDataType(null|int|string $value): void
    {
        $this->dataType = $value === null ? '' : (string) $value;
    }

    public function getIsRequired(): bool
    {
        return $this->isRequired;
    }

    public function setIsRequired(null|bool|int|string $value): void
    {
        $this->isRequired = (bool) $value;
    }

    public function getDefaultValue(): mixed
    {
        return $this->defaultValue;
    }

    public function setDefaultValue(mixed $value): void
    {
        $this->defaultValue = $value;
    }

    public function getOptions(): ?array
    {
        return $this->options;
    }

    public function setOptions(null|array|string $value): void
    {
        if ($value === null) {
            $this->options = null;
            return;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $this->options = is_array($decoded) ? $decoded : null;
            return;
        }
        $this->options = $value;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(null|int|string $value): void
    {
        $this->status = $value === null ? '' : (string) $value;
    }

    public function getDynamicPermission(): MagicBaseColumnDynamicPermission
    {
        return $this->dynamicPermission;
    }

    public function setDynamicPermission(null|array|MagicBaseColumnDynamicPermission|string $value): void
    {
        if ($value instanceof MagicBaseColumnDynamicPermission) {
            $this->dynamicPermission = $value;
            return;
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $this->dynamicPermission = MagicBaseColumnDynamicPermission::fromArray(is_array($decoded) ? $decoded : null);
            return;
        }
        $this->dynamicPermission = MagicBaseColumnDynamicPermission::fromArray(is_array($value) ? $value : null);
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
        $payload['dynamic_permission'] = $this->getDynamicPermission()->toArray();
        return $payload;
    }
}
