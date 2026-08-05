<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use DateTime;

class MagicBaseRelationEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $projectId = null;

    protected ?int $sourceTableId = null;

    protected string $sourceColumnKey = '';

    protected ?int $targetTableId = null;

    protected string $targetColumnKey = '';

    protected string $relationType = '';

    protected string $relationName = '';

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

    public function getProjectId(): ?int
    {
        return $this->projectId;
    }

    public function setProjectId(null|int|string $value): void
    {
        $this->projectId = is_numeric($value) ? (int) $value : null;
    }

    public function getSourceTableId(): ?int
    {
        return $this->sourceTableId;
    }

    public function setSourceTableId(null|int|string $value): void
    {
        $this->sourceTableId = is_numeric($value) ? (int) $value : null;
    }

    public function getSourceColumnKey(): string
    {
        return $this->sourceColumnKey;
    }

    public function setSourceColumnKey(null|int|string $value): void
    {
        $this->sourceColumnKey = $value === null ? '' : (string) $value;
    }

    public function getTargetTableId(): ?int
    {
        return $this->targetTableId;
    }

    public function setTargetTableId(null|int|string $value): void
    {
        $this->targetTableId = is_numeric($value) ? (int) $value : null;
    }

    public function getTargetColumnKey(): string
    {
        return $this->targetColumnKey;
    }

    public function setTargetColumnKey(null|int|string $value): void
    {
        $this->targetColumnKey = $value === null ? '' : (string) $value;
    }

    public function getRelationType(): string
    {
        return $this->relationType;
    }

    public function setRelationType(null|int|string $value): void
    {
        $this->relationType = $value === null ? '' : (string) $value;
    }

    public function getRelationName(): string
    {
        return $this->relationName;
    }

    public function setRelationName(null|int|string $value): void
    {
        $this->relationName = $value === null ? '' : (string) $value;
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
