<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use DateTime;

class MagicBaseRowPermissionEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $tableId = null;

    protected ?int $recordId = null;

    protected string $subjectType = '';

    protected string $subjectId = '';

    protected bool $canRead = false;

    protected bool $canEdit = false;

    protected bool $canDelete = false;

    protected ?DateTime $createdAt = null;

    protected ?DateTime $updatedAt = null;

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

    public function getRecordId(): ?int
    {
        return $this->recordId;
    }

    public function setRecordId(null|int|string $value): void
    {
        $this->recordId = is_numeric($value) ? (int) $value : null;
    }

    public function getSubjectType(): string
    {
        return $this->subjectType;
    }

    public function setSubjectType(null|int|string $value): void
    {
        $this->subjectType = $value === null ? '' : (string) $value;
    }

    public function getSubjectId(): string
    {
        return $this->subjectId;
    }

    public function setSubjectId(null|int|string $value): void
    {
        $this->subjectId = $value === null ? '' : (string) $value;
    }

    public function getCanRead(): bool
    {
        return $this->canRead;
    }

    public function setCanRead(null|bool|int|string $value): void
    {
        $this->canRead = (bool) $value;
    }

    public function getCanEdit(): bool
    {
        return $this->canEdit;
    }

    public function setCanEdit(null|bool|int|string $value): void
    {
        $this->canEdit = (bool) $value;
    }

    public function getCanDelete(): bool
    {
        return $this->canDelete;
    }

    public function setCanDelete(null|bool|int|string $value): void
    {
        $this->canDelete = (bool) $value;
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
