<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Entity;

use DateTime;

class MagicBaseProjectStorageRouteEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected ?int $projectId = null;

    protected string $storageDriver = '';

    protected string $mongoDatabase = '';

    protected string $mongoCollection = '';

    protected ?int $shardId = null;

    protected string $status = '';

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

    public function getStorageDriver(): string
    {
        return $this->storageDriver;
    }

    public function setStorageDriver(null|int|string $value): void
    {
        $this->storageDriver = $value === null ? '' : (string) $value;
    }

    public function getMongoDatabase(): string
    {
        return $this->mongoDatabase;
    }

    public function setMongoDatabase(null|int|string $value): void
    {
        $this->mongoDatabase = $value === null ? '' : (string) $value;
    }

    public function getMongoCollection(): string
    {
        return $this->mongoCollection;
    }

    public function setMongoCollection(null|int|string $value): void
    {
        $this->mongoCollection = $value === null ? '' : (string) $value;
    }

    public function getShardId(): ?int
    {
        return $this->shardId;
    }

    public function setShardId(null|int|string $value): void
    {
        $this->shardId = is_numeric($value) ? (int) $value : null;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    public function setStatus(null|int|string $value): void
    {
        $this->status = $value === null ? '' : (string) $value;
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
