<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use DateTime;

class MagicBaseMigrationLogEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $projectId = null;

    protected ?int $tableId = null;

    protected string $changeType = '';

    protected string $targetType = '';

    protected ?int $targetId = null;

    protected string $sourceType = '';

    protected string $sourceRef = '';

    protected mixed $beforeJson = null;

    protected mixed $afterJson = null;

    protected string $operatorId = '';

    protected string $operatorName = '';

    protected string $requestId = '';

    protected ?string $remark = null;

    protected ?DateTime $createdAt = null;

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

    public function getTableId(): ?int
    {
        return $this->tableId;
    }

    public function setTableId(null|int|string $value): void
    {
        $this->tableId = is_numeric($value) ? (int) $value : null;
    }

    public function getChangeType(): string
    {
        return $this->changeType;
    }

    public function setChangeType(null|int|string $value): void
    {
        $this->changeType = $value === null ? '' : (string) $value;
    }

    public function getTargetType(): string
    {
        return $this->targetType;
    }

    public function setTargetType(null|int|string $value): void
    {
        $this->targetType = $value === null ? '' : (string) $value;
    }

    public function getTargetId(): ?int
    {
        return $this->targetId;
    }

    public function setTargetId(null|int|string $value): void
    {
        $this->targetId = is_numeric($value) ? (int) $value : null;
    }

    public function getSourceType(): string
    {
        return $this->sourceType;
    }

    public function setSourceType(null|int|string $value): void
    {
        $this->sourceType = $value === null ? '' : (string) $value;
    }

    public function getSourceRef(): string
    {
        return $this->sourceRef;
    }

    public function setSourceRef(null|int|string $value): void
    {
        $this->sourceRef = $value === null ? '' : (string) $value;
    }

    public function getBeforeJson(): mixed
    {
        return $this->beforeJson;
    }

    public function setBeforeJson(mixed $value): void
    {
        $this->beforeJson = $value;
    }

    public function getAfterJson(): mixed
    {
        return $this->afterJson;
    }

    public function setAfterJson(mixed $value): void
    {
        $this->afterJson = $value;
    }

    public function getOperatorId(): string
    {
        return $this->operatorId;
    }

    public function setOperatorId(null|int|string $value): void
    {
        $this->operatorId = $value === null ? '' : (string) $value;
    }

    public function getOperatorName(): string
    {
        return $this->operatorName;
    }

    public function setOperatorName(null|int|string $value): void
    {
        $this->operatorName = $value === null ? '' : (string) $value;
    }

    public function getRequestId(): string
    {
        return $this->requestId;
    }

    public function setRequestId(null|int|string $value): void
    {
        $this->requestId = $value === null ? '' : (string) $value;
    }

    public function getRemark(): ?string
    {
        return $this->remark;
    }

    public function setRemark(null|int|string $value): void
    {
        $this->remark = $value === null ? null : (string) $value;
    }

    public function getCreatedAt(): ?DateTime
    {
        return $this->createdAt;
    }

    public function setCreatedAt(null|array|DateTime|int|string $value): void
    {
        $this->createdAt = $value === null ? null : $this->createDatetime($value);
    }
}
