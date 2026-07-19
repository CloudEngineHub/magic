<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Audit\ResourceAccess\Entity;

use App\Infrastructure\Core\AbstractEntity;
use DateTime;

class ResourceAccessLogEntity extends AbstractEntity
{
    protected ?int $id = null;

    protected string $organizationCode = '';

    protected string $userId = '';

    protected string $userName = '';

    protected string $actorType = 'user';

    protected string $resourceType = '';

    protected string $resourceCode = '';

    protected ?string $resourceName = null;

    protected string $operation = '';

    protected string $source = '';

    protected ?string $requestId = null;

    protected array $context = [];

    protected ?DateTime $createdAt = null;

    protected ?DateTime $updatedAt = null;

    public function prepareForCreation(): void
    {
        $now = new DateTime();
        $this->id = null;
        $this->createdAt ??= $now;
        $this->updatedAt ??= $now;
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(null|int|string $id): self
    {
        $this->id = $id === null ? null : (int) $id;
        return $this;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function setOrganizationCode(?string $organizationCode): self
    {
        $this->organizationCode = trim((string) $organizationCode);
        return $this;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function setUserId(?string $userId): self
    {
        $this->userId = trim((string) $userId);
        return $this;
    }

    public function getUserName(): string
    {
        return $this->userName;
    }

    public function setUserName(?string $userName): self
    {
        $this->userName = trim((string) $userName);
        return $this;
    }

    public function getActorType(): string
    {
        return $this->actorType;
    }

    public function setActorType(?string $actorType): self
    {
        $actorType = trim((string) $actorType);
        $this->actorType = $actorType === '' ? 'user' : $actorType;
        return $this;
    }

    public function getResourceType(): string
    {
        return $this->resourceType;
    }

    public function setResourceType(?string $resourceType): self
    {
        $this->resourceType = trim((string) $resourceType);
        return $this;
    }

    public function getResourceCode(): string
    {
        return $this->resourceCode;
    }

    public function setResourceCode(?string $resourceCode): self
    {
        $this->resourceCode = trim((string) $resourceCode);
        return $this;
    }

    public function getResourceName(): ?string
    {
        return $this->resourceName;
    }

    public function setResourceName(?string $resourceName): self
    {
        $resourceName = trim((string) $resourceName);
        $this->resourceName = $resourceName === '' ? null : $resourceName;
        return $this;
    }

    public function getOperation(): string
    {
        return $this->operation;
    }

    public function setOperation(?string $operation): self
    {
        $this->operation = trim((string) $operation);
        return $this;
    }

    public function getSource(): string
    {
        return $this->source;
    }

    public function setSource(?string $source): self
    {
        $this->source = trim((string) $source);
        return $this;
    }

    public function getRequestId(): ?string
    {
        return $this->requestId;
    }

    public function setRequestId(?string $requestId): self
    {
        $requestId = trim((string) $requestId);
        $this->requestId = $requestId === '' ? null : $requestId;
        return $this;
    }

    public function getContext(): array
    {
        return $this->context;
    }

    public function setContext(array $context): self
    {
        $this->context = $context;
        return $this;
    }

    public function getCreatedAt(): ?DateTime
    {
        return $this->createdAt;
    }

    public function setCreatedAt(?DateTime $createdAt): self
    {
        $this->createdAt = $createdAt;
        return $this;
    }

    public function getUpdatedAt(): ?DateTime
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(?DateTime $updatedAt): self
    {
        $this->updatedAt = $updatedAt;
        return $this;
    }
}
