<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Entity;

use App\Infrastructure\Core\AbstractEntity;

class SandboxKeepAliveEntity extends AbstractEntity
{
    protected int $id = 0;

    protected string $userId = '';

    protected string $organizationCode = '';

    protected int $projectId = 0;

    protected int $topicId = 0;

    protected string $sandboxId = '';

    protected int $isEnabled = 1;

    protected ?string $lastCheckedAt = null;

    protected ?string $lastKeepaliveAt = null;

    protected ?string $lastRestartedAt = null;

    protected ?string $lastStatus = null;

    protected int $failureCount = 0;

    protected ?string $lastError = null;

    protected ?string $deletedAt = null;

    protected ?string $createdAt = null;

    protected ?string $updatedAt = null;

    public function getId(): int
    {
        return $this->id;
    }

    public function setId(int|string $id): self
    {
        $this->id = (int) $id;
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

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(string $organizationCode): self
    {
        $this->organizationCode = $organizationCode;
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

    public function getTopicId(): int
    {
        return $this->topicId;
    }

    public function setTopicId(int|string $topicId): self
    {
        $this->topicId = (int) $topicId;
        return $this;
    }

    public function getSandboxId(): string
    {
        return $this->sandboxId;
    }

    public function setSandboxId(string $sandboxId): self
    {
        $this->sandboxId = $sandboxId;
        return $this;
    }

    public function isEnabled(): bool
    {
        return $this->isEnabled === 1;
    }

    public function getIsEnabled(): int
    {
        return $this->isEnabled;
    }

    public function setIsEnabled(bool|int $isEnabled): self
    {
        $this->isEnabled = (int) (bool) $isEnabled;
        return $this;
    }

    public function getLastCheckedAt(): ?string
    {
        return $this->lastCheckedAt;
    }

    public function setLastCheckedAt(?string $lastCheckedAt): self
    {
        $this->lastCheckedAt = $lastCheckedAt;
        return $this;
    }

    public function getLastKeepaliveAt(): ?string
    {
        return $this->lastKeepaliveAt;
    }

    public function setLastKeepaliveAt(?string $lastKeepaliveAt): self
    {
        $this->lastKeepaliveAt = $lastKeepaliveAt;
        return $this;
    }

    public function getLastRestartedAt(): ?string
    {
        return $this->lastRestartedAt;
    }

    public function setLastRestartedAt(?string $lastRestartedAt): self
    {
        $this->lastRestartedAt = $lastRestartedAt;
        return $this;
    }

    public function getLastStatus(): ?string
    {
        return $this->lastStatus;
    }

    public function setLastStatus(?string $lastStatus): self
    {
        $this->lastStatus = $lastStatus;
        return $this;
    }

    public function getFailureCount(): int
    {
        return $this->failureCount;
    }

    public function setFailureCount(int $failureCount): self
    {
        $this->failureCount = $failureCount;
        return $this;
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    public function setLastError(?string $lastError): self
    {
        $this->lastError = $lastError;
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
}
