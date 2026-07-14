<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use DateTime;

class MagicBaseRowEntity extends AbstractEntity
{
    protected ?int $recordId = null;

    protected string $dataOrganizationCode = '';

    protected string $organizationCode = '';

    protected ?int $projectId = null;

    protected ?int $tableId = null;

    protected string $createdBy = '';

    protected array $ownerDepartmentIds = [];

    protected array $data = [];

    protected bool $deleted = false;

    protected ?DateTime $createdAt = null;

    protected ?DateTime $updatedAt = null;

    public function getRecordId(): ?int
    {
        return $this->recordId;
    }

    public function setRecordId(null|int|string $value): void
    {
        $this->recordId = is_numeric($value) ? (int) $value : null;
    }

    public function getDataOrganizationCode(): string
    {
        return $this->dataOrganizationCode;
    }

    public function setDataOrganizationCode(null|int|string $value): void
    {
        $this->dataOrganizationCode = $value === null ? '' : (string) $value;
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

    public function getTableId(): ?int
    {
        return $this->tableId;
    }

    public function setTableId(null|int|string $value): void
    {
        $this->tableId = is_numeric($value) ? (int) $value : null;
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

    /**
     * @return array<string, mixed> dynamic row values keyed by MagicBase column_key
     */
    public function getData(): array
    {
        return $this->data;
    }

    public function setData(null|array|string $value): void
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $this->data = is_array($decoded) ? $decoded : [];
            return;
        }
        $this->data = is_array($value) ? $value : [];
    }

    public function getDeleted(): bool
    {
        return $this->deleted;
    }

    public function setDeleted(null|bool|int|string $value): void
    {
        $this->deleted = (bool) $value;
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
}
